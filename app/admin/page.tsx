"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

type TeamMember = {
  id: string;
  name: string;
  servicesActive: number;
  absenceLabel?: { kind: "ausencia" | "ferias"; text: string };
  avatarUrl?: string;
  active: boolean;

  // novos (para leitura do banco)
  workingDays?: number[]; // 0=Dom ... 6=Sáb
  absenceStartAt?: Timestamp | null;
  absenceEndAt?: Timestamp | null;
  closedRanges?: ClosedRange[];
};

type Coupon = {
  id: string;
  code: string;
  status: "Ativo" | "Inativo";
  percentOff: number;
  linkedTo: string;
  used: number;
  maxUses: number;
  expiresLabel: string;
  progressPct: number; // 0..100
  // extras internos
  active: boolean;
  expiresAt?: Timestamp | null;
};

type WeeklyItem = {
  id: string;
  time: string;
  status: "busy" | "free";
  service?: string;
  professionalShort?: string;
  customer?: string;
  customerPhone?: string;
  color: "blue" | "emerald";
  professionalId?: string;
  bookingStatus?: "confirmed" | "cancelled" | "completed";
};

type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  icon?: string; // opcional (material symbols)
  active: boolean;
  professionalIds: string[]; // relacionamento
};

type OpeningHour = {
  dayIndex: number; // 0=Dom ... 6=Sáb
  label: string;
  active: boolean;
  start: string; // "09:00"
  end: string; // "18:00"
};

type ClosedDate = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
};

type ClosedRange = {
  id: string;
  date: string; // YYYY-MM-DD
  start?: string; // "09:00"
  end?: string; // "12:00"
  label?: string;
  allDay?: boolean;
};

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Dom
  const diff = (day === 0 ? -6 : 1) - day; // ajusta pra segunda
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeekExclusive(startMonday: Date) {
  const end = new Date(startMonday);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  return end;
}

function startOfMonth(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfMonthExclusive(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDay2(n: number) {
  return String(n).padStart(2, "0");
}

function formatWeekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDay2(start.getDate())} - ${formatDay2(end.getDate())} ${start.toLocaleString("pt-BR", {
    month: "short",
  })}`;
}

function formatMonthLabel(d: Date) {
  return d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

const WEEK_HEADER_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function toExpiresLabel(ts?: Timestamp | null) {
  if (!ts) return "—";
  const d = ts.toDate();
  const day = formatDay2(d.getDate());
  const mon = d.toLocaleString("pt-BR", { month: "short" });
  return `${day} ${mon}`;
}

function pct(used: number, max: number) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
}

function tsToInputDate(ts?: Timestamp | null) {
  if (!ts) return "";
  const d = ts.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputDateToTimestamp(val: string) {
  if (!val) return null;
  const d = new Date(val + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] || full;
}

function initialsFromName(full: string) {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatAbsenceLabel(kind: "ausencia" | "ferias", startAt: Timestamp | null, endAt: Timestamp | null) {
  const start = startAt ? toExpiresLabel(startAt) : "—";
  const end = endAt ? toExpiresLabel(endAt) : "—";
  if (kind === "ausencia") return `Folga: ${start}`;
  return `${start} a ${end}`;
}

function buildDefaultOpeningHours(): OpeningHour[] {
  const labels = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return labels.map((label, dayIndex) => ({
    dayIndex,
    label,
    active: dayIndex !== 0,
    start: "09:00",
    end: "18:00",
  }));
}

function normalizeWorkingDays(value: any): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5]; // default Seg-Sex
  return value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatHHMM(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function parseTimeToMinutes(t: string) {
  const [hh, mm] = String(t || "")
    .split(":")
    .map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

function combineYMDTimeToDate(ymd: string, time: string) {
  return new Date(`${ymd}T${time}:00`);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function isHoldExpired(ts?: Timestamp | null) {
  if (!ts) return false;
  return ts.toMillis() < Date.now();
}

function bookingStatusLabel(status?: string) {
  if (status === "cancelled") return "Cancelado";
  if (status === "completed") return "Finalizado";
  return "Confirmado";
}

function formatPhoneBR(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 9) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

function ModalShell({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* overlay */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Fechar modal"
      />
      {/* panel */}
      <div className="relative w-full sm:max-w-[520px] bg-white rounded-3xl border border-slate-100 shadow-2xl p-5 sm:p-6 m-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">{title}</h3>
            {subtitle ? <p className="text-[11px] font-semibold text-slate-400 mt-1">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="mt-5 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AdminDashboardInner />
    </Suspense>
  );
}

function AdminDashboardInner() {
  const router = useRouter();
  /**
   * ✅ IMPORTANTE (por enquanto):
   * Defina aqui qual tenant este admin controla.
   * Depois a gente troca para buscar do usuário logado:
   * ex: users_admin/{uid}.tenantId
   */
  const searchParams = useSearchParams();
  const tenantFromUrl = searchParams.get("tenant");
  const [tenantId, setTenantId] = useState<string>("");
  const [authReady, setAuthReady] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!currentUid) {
      router.replace("/admin/login");
      return;
    }

    (async () => {
      // 1) prioridade: users_admin/{uid}
      const adminRef = doc(db, "users_admin", currentUid);
      const adminSnap = await getDoc(adminRef);
      if (adminSnap.exists()) {
        const data = adminSnap.data() as any;
        const tid = String(data?.tenantId ?? "");
        if (tid) {
          setTenantId(tid);
          return;
        }
      }

      // 2) fallback: tenant com adminUid == uid
      const tenantsRef = collection(db, "tenants");
      const q = query(tenantsRef, where("adminUid", "==", currentUid), limit(1));
      const snap = await getDocs(q);
      const first = snap.docs[0];
      if (first) {
        setTenantId(first.id);
        return;
      }

      // 3) fallback opcional via query string (caso venha do cadastro)
      if (tenantFromUrl) {
        setTenantId(tenantFromUrl);
      }
    })();
  }, [authReady, currentUid, router, tenantFromUrl]);

  // ===== Tenant (salão) =====
  const [salonName, setSalonName] = useState<string>("Carregando...");
  const [tenantSlug, setTenantSlug] = useState<string>(tenantId);
  const [tenantForm, setTenantForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [tenantDetailsOpen, setTenantDetailsOpen] = useState<boolean>(false);
  const [openingHoursOpen, setOpeningHoursOpen] = useState<boolean>(false);
  const [closedDatesOpen, setClosedDatesOpen] = useState<boolean>(false);
  const [servicesOpen, setServicesOpen] = useState<boolean>(false);
  const [teamOpen, setTeamOpen] = useState<boolean>(false);
  const [couponsOpen, setCouponsOpen] = useState<boolean>(false);
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>(() => buildDefaultOpeningHours());
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [closedDateInput, setClosedDateInput] = useState<string>("");
  const [closedLabelInput, setClosedLabelInput] = useState<string>("");

  const bookingLink = useMemo(() => `https://repoagendixx.pages.dev/s/${tenantSlug}`, [tenantSlug]);

  // ===== Dados Firestore =====
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [dashboardRange] = useState<"week" | "month">("month");
  const [activeView, setActiveView] = useState<"settings" | "appointments">("settings");

  // ===== UI state (mantém funcionalidades) =====
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  // Semana atual (mantendo o visual do template)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const weekEnd = useMemo(() => endOfWeekExclusive(weekStart), [weekStart]);
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  // ✅ NOVO: dia selecionado (para filtrar agenda do dia) — mantém “Terça ativa” por padrão
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(1);

  // ✅ NOVO: mantém bookings da semana em memória para filtrar por dia sem refazer query
  const [weekBookings, setWeekBookings] = useState<any[]>([]);
  const [monthBookings, setMonthBookings] = useState<any[]>([]);

  const selectedDate = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + selectedDayIndex);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekStart, selectedDayIndex]);

  const selectedDateLabel = useMemo(() => {
    const d = selectedDate;
    return `${formatDay2(d.getDate())} ${d.toLocaleString("pt-BR", { month: "short" })}`;
  }, [selectedDate]);

  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => endOfMonthExclusive(selectedDate), [selectedDate]);
  const monthLabel = useMemo(() => formatMonthLabel(selectedDate), [selectedDate]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const day = formatDay2(d.getDate());
      const ymd = toYMD(d);
      const active = i === selectedDayIndex; // ✅ agora é selecionável
      days.push({ day, active, index: i, ymd });
    }
    return days;
  }, [weekStart, selectedDayIndex]);

  const filterButtons = useMemo(() => {
    return [{ id: "all", label: "Todos" }, ...team.map((p) => ({ id: p.id, label: p.name }))];
  }, [team]);

  const filteredWeeklyItems = useMemo(() => {
    if (selectedFilter === "all") return weeklyItems;
    const proId = selectedFilter;
    return weeklyItems.filter((i) => i.status === "free" || i.professionalId === proId);
  }, [selectedFilter, weeklyItems]);

  const dashboardBookings = useMemo(
    () => (dashboardRange === "week" ? weekBookings : monthBookings),
    [dashboardRange, weekBookings, monthBookings]
  );

  const professionalStatusStats = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; confirmed: number; completed: number; cancelled: number; total: number }
    >();

    (dashboardBookings || []).forEach((b: any) => {
      const id = String(b?.professionalId ?? "unknown");
      const name = String(b?.professionalName ?? "Sem profissional");
      const status = String(b?.status ?? "confirmed");

      if (!map.has(id)) {
        map.set(id, { id, name, confirmed: 0, completed: 0, cancelled: 0, total: 0 });
      }
      const item = map.get(id)!;
      if (status === "completed") item.completed += 1;
      else if (status === "cancelled") item.cancelled += 1;
      else item.confirmed += 1;
      item.total += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboardBookings]);

  const customerStats = useMemo(() => {
    const counts = new Map<string, number>();
    (dashboardBookings || []).forEach((b: any) => {
      const phone = String(b?.customerPhone ?? "").trim();
      const name = String(b?.customerName ?? "").trim();
      const key = (phone || name || "cliente").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    let newCount = 0;
    let recurringCount = 0;
    counts.forEach((count) => {
      if (count >= 2) recurringCount += 1;
      else newCount += 1;
    });

    return {
      total: counts.size,
      newCount,
      recurringCount,
    };
  }, [dashboardBookings]);

  // ===== MODAIS (novo) =====
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceEditingId, setServiceEditingId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    durationMin: "45",
    price: "65",
    icon: "content_cut",
    active: true,
  });
  const [serviceIconPickerOpen, setServiceIconPickerOpen] = useState(false);

  const [proModalOpen, setProModalOpen] = useState(false);
  const [proEditingId, setProEditingId] = useState<string | null>(null);
  const [proForm, setProForm] = useState({
    name: "",
    active: true,

    // escala (dias da semana)
    workingDays: [1, 2, 3, 4, 5] as number[], // default Seg-Sex (0=Dom ... 6=Sáb)
    shift: "morning" as "morning" | "afternoon" | "evening",

    // ausência/férias (calendário)
    absenceKind: "" as "" | "ausencia" | "ferias",
    absenceDate: "", // para "ausencia" (1 dia)
    vacationStart: "", // para "ferias"
    vacationEnd: "", // para "ferias"

    // mantido (compat/label no card)
    absenceText: "",

    selectedServiceIds: [] as string[], // multi
    closedRanges: [] as ClosedRange[],
  });
  const [proClosedRangeDateInput, setProClosedRangeDateInput] = useState<string>("");
  const [proClosedRangeStartInput, setProClosedRangeStartInput] = useState<string>("09:00");
  const [proClosedRangeEndInput, setProClosedRangeEndInput] = useState<string>("12:00");
  const [proClosedRangeAllDay, setProClosedRangeAllDay] = useState<boolean>(false);
  const [proClosedRangeLabelInput, setProClosedRangeLabelInput] = useState<string>("");

  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponEditingId, setCouponEditingId] = useState<string | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: "",
    active: true,
    percentOff: "10",
    linkedTo: "Todos",
    maxUses: "50",
    expiresDate: "",
  });

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingSelectedId, setBookingSelectedId] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleProfessionalId, setRescheduleProfessionalId] = useState("");
  const [rescheduleMonthView, setRescheduleMonthView] = useState<Date | null>(null);
  const [rescheduleMonthBookings, setRescheduleMonthBookings] = useState<any[]>([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [adminBookingOpen, setAdminBookingOpen] = useState(false);

  // ===== Firestore: subscriptions =====
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    setLoading(true);

    // 1) Tenant doc
    const tenantRef = doc(db, "tenants", tenantId);
    const unsubTenant = onSnapshot(
      tenantRef,
      (snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          setSalonName("Salão não encontrado");
          setTenantSlug(tenantId);
          return;
        }
        const data = snap.data() as any;
        setSalonName(String(data?.name ?? "Salão"));
        setTenantSlug(String(data?.slug ?? tenantId));
        setTenantForm({
          name: String(data?.name ?? ""),
          phone: String(data?.phone ?? ""),
          email: String(data?.adminEmail ?? ""),
          address: String(data?.address ?? ""),
        });
        const storedHours = Array.isArray(data?.openingHours) ? (data.openingHours as any[]) : null;
        setOpeningHours(
          storedHours
            ? storedHours
                .map((h) => ({
                  dayIndex: Number(h?.dayIndex ?? 0),
                  label: String(h?.label ?? ""),
                  active: Boolean(h?.active ?? true),
                  start: String(h?.start ?? "09:00"),
                  end: String(h?.end ?? "18:00"),
                }))
                .sort((a, b) => a.dayIndex - b.dayIndex)
            : buildDefaultOpeningHours()
        );
        const storedClosed = Array.isArray(data?.closedDates) ? (data.closedDates as any[]) : [];
        setClosedDates(
          storedClosed.map((c, idx) => ({
            id: String(c?.id ?? `${c?.date ?? idx}-${idx}`),
            date: String(c?.date ?? ""),
            label: String(c?.label ?? ""),
          }))
        );
      },
      () => {
        if (!alive) return;
        setSalonName("Erro ao carregar salão");
      }
    );

    // 2) Professionals
    const prosRef = collection(db, "tenants", tenantId, "professionals");
    const prosQ = query(prosRef, orderBy("name", "asc"));
    const unsubPros = onSnapshot(prosQ, (snap) => {
      if (!alive) return;

      const pros = snap.docs.map((d) => {
        const data = d.data() as any;

        const kind = (data?.absenceKind as "ausencia" | "ferias" | undefined) ?? undefined;
        const startAt = (data?.absenceStartAt as Timestamp | null | undefined) ?? null;
        const endAt = (data?.absenceEndAt as Timestamp | null | undefined) ?? null;

        // fallback antigo (se existir)
        const legacyText = String(data?.absenceText ?? "");
        const computedText = kind ? formatAbsenceLabel(kind, startAt, endAt) : "";
        const text = computedText || legacyText;

        const absenceLabel = kind && text ? { kind, text } : undefined;

        return {
          id: d.id,
          name: String(data?.name ?? ""),
          servicesActive: 0, // calculamos com services
          absenceLabel,
          active: Boolean(data?.active ?? true),

          workingDays: normalizeWorkingDays(data?.workingDays),
          absenceStartAt: startAt,
          absenceEndAt: endAt,
          closedRanges: Array.isArray(data?.closedRanges)
            ? data.closedRanges.map((r: any, idx: number) => ({
                id: String(r?.id ?? `${r?.date ?? idx}-${idx}`),
                date: String(r?.date ?? ""),
                start: r?.start ? String(r.start) : "",
                end: r?.end ? String(r.end) : "",
                label: String(r?.label ?? ""),
                allDay: Boolean(r?.allDay ?? false),
              }))
            : [],
        } as TeamMember;
      });

      setTeam(pros);
    });

    // 3) Services (nova seção + contagem de services por profissional)
    const servicesRef = collection(db, "tenants", tenantId, "services");
    const servicesQ = query(servicesRef, orderBy("name", "asc"));
    const unsubServices = onSnapshot(servicesQ, (snap) => {
      if (!alive) return;

      const list: ServiceItem[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: String(data?.name ?? ""),
          durationMin: Number(data?.durationMin ?? 0),
          price: Number(data?.price ?? 0),
          icon: String(data?.icon ?? "content_cut"),
          active: Boolean(data?.active ?? true),
          professionalIds: Array.isArray(data?.professionalIds) ? (data.professionalIds as string[]) : [],
        };
      });

      setServices(list);

      // atualiza contagem "serviços ativos" por profissional com base nos services ativos
      const activeServices = list.filter((s) => s.active);
      setTeam((prev) =>
        prev.map((p) => {
          const count = activeServices.filter((s) => (s.professionalIds || []).includes(p.id)).length;
          return { ...p, servicesActive: count };
        })
      );
    });

    // 4) Coupons
    const couponsRef = collection(db, "tenants", tenantId, "coupons");
    const couponsQ = query(couponsRef, orderBy("createdAt", "desc"));
    const unsubCoupons = onSnapshot(couponsQ, (snap) => {
      if (!alive) return;

      const list: Coupon[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const code = String(data?.code ?? d.id).toUpperCase();
        const active = Boolean(data?.active ?? true);
        const used = Number(data?.used ?? 0);
        const maxUses = Number(data?.maxUses ?? 0);
        const percentOff = Number(data?.percentOff ?? 0);
        const expiresAt = (data?.expiresAt as Timestamp | null | undefined) ?? null;

        return {
          id: d.id,
          code,
          status: active ? "Ativo" : "Inativo",
          percentOff,
          linkedTo: String(data?.linkedTo ?? "Todos"),
          used,
          maxUses,
          expiresLabel: toExpiresLabel(expiresAt),
          progressPct: pct(used, maxUses),
          active,
          expiresAt,
        };
      });

      setCoupons(list);
    });

    // 5) Bookings da semana (agenda semanal) — usando startAt e endAt
    const bookingsRef = collection(db, "tenants", tenantId, "bookings");
    const startTs = Timestamp.fromDate(weekStart);
    const endTs = Timestamp.fromDate(weekEnd);

    const bookingsQ = query(
      bookingsRef,
      where("startAt", ">=", startTs),
      where("startAt", "<", endTs),
      orderBy("startAt", "asc")
    );

    const unsubBookings = onSnapshot(bookingsQ, (snap) => {
      if (!alive) return;

      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setWeekBookings(docs);
    });

    // 6) Bookings do mês (visão mensal)
    const monthStartTs = Timestamp.fromDate(monthStart);
    const monthEndTs = Timestamp.fromDate(monthEnd);
    const monthQ = query(
      bookingsRef,
      where("startAt", ">=", monthStartTs),
      where("startAt", "<", monthEndTs),
      orderBy("startAt", "asc")
    );
    const unsubMonth = onSnapshot(monthQ, (snap) => {
      if (!alive) return;
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMonthBookings(docs);
    });

    const t = setTimeout(() => {
      if (!alive) return;
      setLoading(false);
    }, 300);

    return () => {
      alive = false;
      clearTimeout(t);
      unsubTenant();
      unsubPros();
      unsubServices();
      unsubCoupons();
      unsubBookings();
      unsubMonth();
    };
  }, [tenantId, weekStart, weekEnd, monthStart, monthEnd]);

  // ✅ Atualiza o quadro (lista) conforme o DIA selecionado, usando startAt e endAt dos bookings
  useEffect(() => {
    const selectedYmd = toYMD(selectedDate);

    const dayDocs = (weekBookings || []).filter((b: any) => {
      const startAt: Timestamp | null = b?.startAt ?? null;
      if (!startAt) return false;
      const dt = startAt.toDate();
      return toYMD(dt) === selectedYmd;
    });

    const items: WeeklyItem[] = dayDocs.map((b: any, idx: number) => {
      const startAt: Timestamp | null = b?.startAt ?? null;
      const endAt: Timestamp | null = b?.endAt ?? null;

      const startDt = startAt ? startAt.toDate() : null;
      const endDt = endAt ? endAt.toDate() : null;

      const startStr = startDt ? formatHHMM(startDt) : "—";
      const endStr = endDt ? formatHHMM(endDt) : "";

      const time = startStr;

      const serviceName = String(b?.serviceName ?? b?.service ?? "Serviço");
      const customerName = String(b?.customerName ?? b?.customer ?? "Cliente");
      const customerPhone = String(b?.customerPhone ?? "");
      const proName = String(b?.professionalName ?? b?.professionalShort ?? "Prof.");
      const proShort = firstName(proName);

      // mantém layout igual, mas já mostra o intervalo com base em startAt/endAt
      const serviceWithRange = endStr ? `${serviceName} (${startStr}–${endStr})` : serviceName;

      return {
        id: b.id,
        time,
        status: "busy",
        service: serviceWithRange,
        customer: customerName,
        customerPhone,
        professionalShort: proShort,
        professionalId: String(b?.professionalId ?? ""),
        color: idx % 2 === 0 ? "blue" : "emerald",
        bookingStatus: (String(b?.status ?? "confirmed") as WeeklyItem["bookingStatus"]) ?? "confirmed",
      };
    });

    if (items.length === 0) {
      setWeeklyItems([
        { id: "free-09", time: "09:00", status: "free", color: "blue" },
        { id: "free-10", time: "10:00", status: "free", color: "emerald" },
        { id: "free-11", time: "11:00", status: "free", color: "blue" },
      ]);
    } else {
      // ordena por horário (startAt)
      const sorted = [...items].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setWeeklyItems(sorted);
    }
  }, [weekBookings, selectedDate]);

  // ===== Actions =====
  async function copyLink() {
    await navigator.clipboard.writeText(bookingLink);
    alert("Link copiado!");
  }

  async function saveTenantData() {
    if (!tenantId) return;
    const name = tenantForm.name.trim();
    if (!name) return alert("Informe o nome do salão.");
    try {
      const normalizedClosedDates = closedDates
        .filter((c) => c.date)
        .map((c, idx) => ({
          id: c.id || `${c.date}-${idx}`,
          date: c.date,
          label: c.label,
        }));
      await updateDoc(doc(db, "tenants", tenantId), {
        name,
        phone: tenantForm.phone.trim(),
        adminEmail: tenantForm.email.trim(),
        address: tenantForm.address.trim(),
        openingHours,
        closedDates: normalizedClosedDates,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      alert(e?.message ?? "Erro ao salvar dados do salão.");
    }
  }

  // ===== SERVICES (CRUD via modal) =====
  function openCreateService() {
    setServiceEditingId(null);
    setServiceForm({ name: "", durationMin: "45", price: "65", icon: "content_cut", active: true });
    setServiceIconPickerOpen(false);
    setServiceModalOpen(true);
  }

  function openEditService(s: ServiceItem) {
    setServiceEditingId(s.id);
    setServiceForm({
      name: s.name,
      durationMin: String(s.durationMin ?? 0),
      price: String(s.price ?? 0),
      icon: s.icon ?? "content_cut",
      active: Boolean(s.active),
    });
    setServiceIconPickerOpen(false);
    setServiceModalOpen(true);
  }

  async function saveService() {
    const name = serviceForm.name.trim();
    const durationMin = Number(serviceForm.durationMin);
    const price = Number(serviceForm.price);

    if (!name) return alert("Informe o nome do serviço.");
    if (!Number.isFinite(durationMin) || durationMin <= 0) return alert("Duração inválida.");
    if (!Number.isFinite(price) || price < 0) return alert("Preço inválido.");

    const payload = {
      name,
      durationMin,
      price,
      icon: String(serviceForm.icon || "content_cut"),
      active: Boolean(serviceForm.active),
      updatedAt: serverTimestamp(),
    };

    if (!serviceEditingId) {
      await addDoc(collection(db, "tenants", tenantId, "services"), {
        ...payload,
        professionalIds: [],
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, "tenants", tenantId, "services", serviceEditingId), payload);
    }

    setServiceModalOpen(false);
  }

  // ===== PROFESSIONAL (CRUD via modal + associação com serviços) =====
  function openCreateProfessional() {
    setProEditingId(null);
    setProForm({
      name: "",
      active: true,

      workingDays: [1, 2, 3, 4, 5],
      shift: "morning",

      absenceKind: "",
      absenceDate: "",
      vacationStart: "",
      vacationEnd: "",
      absenceText: "",

      selectedServiceIds: [],
      closedRanges: [],
    });
    setProClosedRangeDateInput("");
    setProClosedRangeLabelInput("");
    setProClosedRangeAllDay(false);
    setProClosedRangeStartInput("09:00");
    setProClosedRangeEndInput("12:00");
    setProModalOpen(true);
  }

  function openEditProfessional(p: TeamMember) {
    const selectedServiceIds = services
      .filter((s) => (s.professionalIds || []).includes(p.id))
      .map((s) => s.id);

    // tenta deduzir tipo pelo label, mas prioriza campos novos do banco
    const storedKind = (p.absenceLabel?.kind ?? "") as "" | "ausencia" | "ferias";
    const kind = storedKind;

    const startVal = tsToInputDate(p.absenceStartAt ?? null);
    const endVal = tsToInputDate(p.absenceEndAt ?? null);

    setProEditingId(p.id);
    setProForm({
      name: p.name,
      active: Boolean(p.active),

      workingDays: normalizeWorkingDays(p.workingDays),
      shift: (p as any)?.shift ?? "morning",

      absenceKind: kind,
      absenceDate: kind === "ausencia" ? startVal : "",
      vacationStart: kind === "ferias" ? startVal : "",
      vacationEnd: kind === "ferias" ? endVal : "",
      absenceText: p.absenceLabel?.text ?? "",

      selectedServiceIds,
      closedRanges: Array.isArray((p as any).closedRanges) ? ((p as any).closedRanges as ClosedRange[]) : [],
    });
    setProClosedRangeDateInput("");
    setProClosedRangeLabelInput("");
    setProClosedRangeAllDay(false);
    setProClosedRangeStartInput("09:00");
    setProClosedRangeEndInput("12:00");
    setProModalOpen(true);
  }

  async function applyProfessionalToServices(proId: string, newServiceIds: string[]) {
    const currentServiceIds = services.filter((s) => (s.professionalIds || []).includes(proId)).map((s) => s.id);

    const toAdd = newServiceIds.filter((id) => !currentServiceIds.includes(id));
    const toRemove = currentServiceIds.filter((id) => !newServiceIds.includes(id));

    // Atualiza serviços adicionando/removendo o uid do profissional no campo professionalIds
    await Promise.all([
      ...toAdd.map((sid) =>
        updateDoc(doc(db, "tenants", tenantId, "services", sid), {
          professionalIds: arrayUnion(proId),
          updatedAt: serverTimestamp(),
        })
      ),
      ...toRemove.map((sid) =>
        updateDoc(doc(db, "tenants", tenantId, "services", sid), {
          professionalIds: arrayRemove(proId),
          updatedAt: serverTimestamp(),
        })
      ),
    ]);
  }

  async function saveProfessional() {
    const name = proForm.name.trim();
    if (!name) return alert("Informe o nome do profissional.");


    // working days
    const workingDays = normalizeWorkingDays(proForm.workingDays);
    if (workingDays.length === 0) return alert("Selecione ao menos 1 dia da semana em que o profissional atua.");

    // ausência/férias (via calendário)
    const absenceKind = proForm.absenceKind || null;

    let absenceStartAt: Timestamp | null = null;
    let absenceEndAt: Timestamp | null = null;
    let absenceText = "";

    if (absenceKind === "ausencia") {
      const ts = inputDateToTimestamp(proForm.absenceDate);
      if (!ts) return alert("Selecione o dia da folga.");
      absenceStartAt = ts;
      absenceEndAt = ts;
      absenceText = formatAbsenceLabel("ausencia", absenceStartAt, absenceEndAt);
    }

    if (absenceKind === "ferias") {
      const startTs = inputDateToTimestamp(proForm.vacationStart);
      const endTs = inputDateToTimestamp(proForm.vacationEnd);
      if (!startTs || !endTs) return alert("Selecione o período de férias (início e fim).");
      if (startTs.toMillis() > endTs.toMillis()) return alert("A data de início das férias não pode ser maior que a data final.");
      absenceStartAt = startTs;
      absenceEndAt = endTs;
      absenceText = formatAbsenceLabel("ferias", absenceStartAt, absenceEndAt);
    }

    const normalizedClosedRanges = (proForm.closedRanges || [])
      .filter((r) => r.date)
      .map((r, idx) => ({
        id: r.id || `${r.date}-${idx}`,
        date: r.date,
        start: r.allDay ? "" : String(r.start ?? ""),
        end: r.allDay ? "" : String(r.end ?? ""),
        label: r.label ?? "",
        allDay: Boolean(r.allDay),
      }));

    const basePayload: any = {
      name,
      active: Boolean(proForm.active),

      // NOVO: agenda (dias da semana)
      workingDays,
      shift: proForm.shift,

      // NOVO: bloqueio por período (para não permitir seleção/reserva)
      absenceKind,
      absenceStartAt,
      absenceEndAt,

      // Mantido para exibir no card e compat (preenchido automaticamente)
      absenceText,

      closedRanges: normalizedClosedRanges,

      updatedAt: serverTimestamp(),
    };

    if (!proEditingId) {
      const ref = await addDoc(collection(db, "tenants", tenantId, "professionals"), {
        ...basePayload,
        createdAt: serverTimestamp(),
      });

      await applyProfessionalToServices(ref.id, proForm.selectedServiceIds);
    } else {
      await updateDoc(doc(db, "tenants", tenantId, "professionals", proEditingId), basePayload);
      await applyProfessionalToServices(proEditingId, proForm.selectedServiceIds);
    }

    setProModalOpen(false);
  }

  // ===== COUPON (CRUD via modal) =====
  function openCreateCoupon() {
    setCouponEditingId(null);
    setCouponForm({
      code: "",
      active: true,
      percentOff: "10",
      linkedTo: "Todos",
      maxUses: "50",
      expiresDate: "",
    });
    setCouponModalOpen(true);
  }

  function openEditCoupon(c: Coupon) {
    setCouponEditingId(c.id);
    setCouponForm({
      code: c.code,
      active: Boolean(c.active),
      percentOff: String(c.percentOff ?? 0),
      linkedTo: c.linkedTo ?? "Todos",
      maxUses: String(c.maxUses ?? 0),
      expiresDate: tsToInputDate(c.expiresAt ?? null),
    });
    setCouponModalOpen(true);
  }

  async function saveCoupon() {
    const code = couponForm.code.trim().toUpperCase();
    if (!code) return alert("Informe o código do cupom.");

    const percentOff = Number(couponForm.percentOff);
    if (!Number.isFinite(percentOff) || percentOff <= 0) return alert("Percentual inválido.");

    const maxUses = Number(couponForm.maxUses);
    if (!Number.isFinite(maxUses) || maxUses < 0) return alert("Qtd de usos inválida.");

    const linkedTo = (couponForm.linkedTo || "Todos").trim();
    const expiresAt = inputDateToTimestamp(couponForm.expiresDate);

    const payload = {
      code,
      active: Boolean(couponForm.active),
      percentOff,
      linkedTo,
      maxUses,
      expiresAt,
      updatedAt: serverTimestamp(),
    };

    if (!couponEditingId) {
      await addDoc(collection(db, "tenants", tenantId, "coupons"), {
        ...payload,
        used: 0,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, "tenants", tenantId, "coupons", couponEditingId), payload);
    }

    setCouponModalOpen(false);
  }

  function openBookingModal(bookingId: string) {
    setBookingSelectedId(bookingId);
    setBookingModalOpen(true);
    setRescheduleOpen(false);
  }

  const selectedBooking = useMemo(() => {
    if (!bookingSelectedId) return null;
    return (weekBookings || []).find((b: any) => b?.id === bookingSelectedId) ?? null;
  }, [bookingSelectedId, weekBookings]);
  const selectedBookingStatus = String(selectedBooking?.status ?? "confirmed");
  const rescheduleProfessional = useMemo(() => {
    const pid = String(rescheduleProfessionalId ?? "");
    if (!pid) return null;
    return team.find((p) => p.id === pid) ?? null;
  }, [rescheduleProfessionalId, team]);
  const rescheduleDurationMin = useMemo(() => {
    let durationMin = Number(selectedBooking?.durationMin ?? 0) || 0;
    if (selectedBooking?.startAt?.toDate && selectedBooking?.endAt?.toDate) {
      const s = selectedBooking.startAt.toDate();
      const e = selectedBooking.endAt.toDate();
      const diff = Math.round((e.getTime() - s.getTime()) / 60000);
      if (diff > 0) durationMin = diff;
    }
    if (!durationMin || durationMin < 1) durationMin = 30;
    return durationMin;
  }, [selectedBooking]);

  const rescheduleMonthStart = useMemo(() => {
    if (!rescheduleMonthView) return null;
    return new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth(), 1);
  }, [rescheduleMonthView]);
  const rescheduleMonthEnd = useMemo(() => {
    if (!rescheduleMonthStart) return null;
    return new Date(rescheduleMonthStart.getFullYear(), rescheduleMonthStart.getMonth() + 1, 1);
  }, [rescheduleMonthStart]);

  function getOpeningForDate(ymd: string) {
    if (!ymd) return null;
    const dayIndex = new Date(`${ymd}T00:00:00`).getDay();
    const hour = openingHours.find((h) => h.dayIndex === dayIndex) ?? null;
    if (!hour || !hour.active || !hour.start || !hour.end) return null;
    return hour;
  }

  function getDayBlockReason(ymd: string, pro: TeamMember | null) {
    if (!ymd) return "Selecione uma data.";
    if (closedDates.some((c) => c.date === ymd)) return "Salão fechado nesta data.";
    const opening = getOpeningForDate(ymd);
    if (!opening) return "Salão fechado neste dia.";
    if (!pro) return "Profissional não encontrado.";
    const dayIndex = new Date(`${ymd}T00:00:00`).getDay();
    const workingDays = normalizeWorkingDays(pro.workingDays);
    if (!workingDays.includes(dayIndex)) return "Profissional não atende neste dia.";
    if (pro.absenceStartAt && pro.absenceEndAt) {
      const day = new Date(`${ymd}T00:00:00`).getTime();
      const start = new Date(`${toYMD(pro.absenceStartAt.toDate())}T00:00:00`).getTime();
      const end = new Date(`${toYMD(pro.absenceEndAt.toDate())}T00:00:00`).getTime();
      if (day >= start && day <= end) return "Profissional em folga/férias.";
    }
    const hasAllDayClosed = (pro.closedRanges || []).some((r) => r.date === ymd && r.allDay);
    if (hasAllDayClosed) return "Profissional com agenda fechada neste dia.";
    return null;
  }

  function getClosedRangesForDay(pro: TeamMember | null, ymd: string) {
    if (!pro || !ymd) return [];
    return (pro.closedRanges || []).filter((r) => r.date === ymd);
  }

  function getBookingRange(b: any, fallbackDurationMin = 30) {
    const startTs: Timestamp | null = b?.startAt ?? null;
    if (!startTs) return null;
    const start = startTs.toDate();
    const endTs: Timestamp | null = b?.endAt ?? null;
    if (endTs) return { start, end: endTs.toDate() };
    const durationMin = Number(b?.durationMin ?? fallbackDurationMin) || fallbackDurationMin;
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + durationMin);
    return { start, end };
  }

  function getBookingsForDay(items: any[], ymd: string) {
    return items.filter((b) => {
      const startAt: Timestamp | null = b?.startAt ?? null;
      if (!startAt) return false;
      const dt = startAt.toDate();
      return toYMD(dt) === ymd;
    });
  }

  function buildAvailableSlotsForDay(ymd: string, dayBookings: any[], pro: TeamMember | null) {
    if (!pro) return [];
    const blockReason = getDayBlockReason(ymd, pro);
    if (blockReason) return [];
    const opening = getOpeningForDate(ymd);
    if (!opening) return [];
    const dayStartMin = parseTimeToMinutes(opening.start);
    const dayEndMin = parseTimeToMinutes(opening.end);
    if (!Number.isFinite(dayStartMin) || !Number.isFinite(dayEndMin)) return [];
    const slotStep = 30;
    const durationMin = rescheduleDurationMin || 30;
    const closedRanges = getClosedRangesForDay(pro, ymd);
    const items = dayBookings
      .filter((b) => String(b?.professionalId ?? "") === String(rescheduleProfessionalId ?? ""))
      .filter((b) => b?.id !== bookingSelectedId)
      .filter((b) => {
        if (b?.__kind === "hold" && isHoldExpired(b?.holdExpiresAt ?? null)) return false;
        if (String(b?.status ?? "") === "cancelled") return false;
        return true;
      });

    const slots: string[] = [];
    for (let startMin = dayStartMin; startMin + durationMin <= dayEndMin; startMin += slotStep) {
      const endMin = startMin + durationMin;
      const timeStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
      const rangeStart = combineYMDTimeToDate(ymd, timeStr);
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setMinutes(rangeEnd.getMinutes() + durationMin);

      const blockedByClosed = closedRanges.some((r) => {
        if (r.allDay) return true;
        const rStart = parseTimeToMinutes(String(r.start || ""));
        const rEnd = parseTimeToMinutes(String(r.end || ""));
        if (!Number.isFinite(rStart) || !Number.isFinite(rEnd)) return false;
        return startMin < rEnd && endMin > rStart;
      });
      if (blockedByClosed) continue;

      const hasConflict = items.some((b) => {
        const range = getBookingRange(b, durationMin);
        if (!range) return false;
        return overlaps(rangeStart, rangeEnd, range.start, range.end);
      });
      if (hasConflict) continue;

      slots.push(timeStr);
    }
    return slots;
  }

  useEffect(() => {
    if (!bookingModalOpen) return;
    const startAt = selectedBooking?.startAt?.toDate ? selectedBooking.startAt.toDate() : null;
    if (!startAt) return;
    setRescheduleDate(toYMD(startAt));
    setRescheduleTime(formatHHMM(startAt));
    setRescheduleProfessionalId(String(selectedBooking?.professionalId ?? ""));
    setRescheduleMonthView(new Date(startAt.getFullYear(), startAt.getMonth(), 1));
  }, [bookingModalOpen, selectedBooking]);

  useEffect(() => {
    if (!rescheduleOpen || !rescheduleMonthStart || !rescheduleMonthEnd) {
      setRescheduleMonthBookings([]);
      return;
    }
    let alive = true;
    async function loadMonthBookings() {
      if (!tenantId) return;
      setRescheduleLoading(true);
      try {
        const monthStart = rescheduleMonthStart;
        const monthEnd = rescheduleMonthEnd;
        if (!monthStart || !monthEnd) return;
        const startTs = Timestamp.fromDate(monthStart);
        const endTs = Timestamp.fromDate(monthEnd);
        const bookingsRef = collection(db, "tenants", tenantId, "bookings");
        const holdsRef = collection(db, "tenants", tenantId, "holds");

        const [bookingsSnap, holdsSnap] = await Promise.all([
          getDocs(query(bookingsRef, where("startAt", ">=", startTs), where("startAt", "<", endTs), orderBy("startAt", "asc"))),
          getDocs(query(holdsRef, where("startAt", ">=", startTs), where("startAt", "<", endTs), orderBy("startAt", "asc"))),
        ]);

        const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any), __kind: "booking" }));
        const holds = holdsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any), __kind: "hold" }));

        if (!alive) return;
        setRescheduleMonthBookings([...bookings, ...holds]);
      } catch (e) {
        if (!alive) return;
        setRescheduleMonthBookings([]);
      } finally {
        if (alive) setRescheduleLoading(false);
      }
    }
    loadMonthBookings();
    return () => {
      alive = false;
    };
  }, [rescheduleOpen, rescheduleMonthStart, rescheduleMonthEnd, tenantId]);

  const rescheduleSlots = useMemo(() => {
    if (!rescheduleOpen || !rescheduleDate || !rescheduleProfessional) return [];
    const dayBookings = getBookingsForDay(rescheduleMonthBookings, rescheduleDate);
    return buildAvailableSlotsForDay(rescheduleDate, dayBookings, rescheduleProfessional);
  }, [
    rescheduleOpen,
    rescheduleDate,
    rescheduleProfessional,
    rescheduleMonthBookings,
    bookingSelectedId,
    rescheduleDurationMin,
    rescheduleProfessionalId,
    openingHours,
    closedDates,
  ]);

  useEffect(() => {
    if (!rescheduleOpen || !rescheduleDate) return;
    if (rescheduleSlots.length === 0) return;
    if (!rescheduleSlots.includes(rescheduleTime)) {
      setRescheduleTime(rescheduleSlots[0]);
    }
  }, [rescheduleOpen, rescheduleDate, rescheduleSlots, rescheduleTime]);

  useEffect(() => {
    if (!rescheduleOpen) return;
    if (!rescheduleDate) return;
    const d = new Date(`${rescheduleDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const next = new Date(d.getFullYear(), d.getMonth(), 1);
    if (!rescheduleMonthView || rescheduleMonthView.getTime() !== next.getTime()) {
      setRescheduleMonthView(next);
    }
  }, [rescheduleOpen, rescheduleDate, rescheduleMonthView]);

  const rescheduleAvailabilityMap = useMemo(() => {
    if (!rescheduleMonthStart || !rescheduleMonthView || !rescheduleProfessional) return new Map<string, boolean>();
    const daysInMonth = new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth() + 1, 0).getDate();
    const map = new Map<string, boolean>();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth(), day);
      const ymd = toYMD(date);
      const dayBookings = getBookingsForDay(rescheduleMonthBookings, ymd);
      const slots = buildAvailableSlotsForDay(ymd, dayBookings, rescheduleProfessional);
      map.set(ymd, slots.length > 0);
    }
    return map;
  }, [rescheduleMonthStart, rescheduleMonthView, rescheduleProfessional, rescheduleMonthBookings]);

  async function updateBookingStatus(nextStatus: "cancelled" | "completed") {
    if (!bookingSelectedId) return;
    try {
      const bookingRef = doc(db, "tenants", tenantId, "bookings", bookingSelectedId);
      await updateDoc(bookingRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(nextStatus === "completed"
          ? { completedAt: serverTimestamp() }
          : { cancelledAt: serverTimestamp() }),
      });
      setBookingModalOpen(false);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao atualizar o status do agendamento.");
    }
  }

  async function hasConflictForRange(pid: string, rangeStart: Date, rangeEnd: Date, occYmd: string) {
    const start = new Date(`${occYmd}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);
    const bookingsRef = collection(db, "tenants", tenantId, "bookings");
    const holdsRef = collection(db, "tenants", tenantId, "holds");

    const [bookingsSnap, holdsSnap] = await Promise.all([
      getDocs(query(bookingsRef, where("startAt", ">=", startTs), where("startAt", "<", endTs), orderBy("startAt", "asc"))),
      getDocs(query(holdsRef, where("startAt", ">=", startTs), where("startAt", "<", endTs), orderBy("startAt", "asc"))),
    ]);

    const items = [
      ...bookingsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any), __kind: "booking" })),
      ...holdsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any), __kind: "hold" })),
    ];

    return items.some((b) => {
      if (String(b?.professionalId ?? "") !== String(pid)) return false;
      if (b?.id === bookingSelectedId) return false;
      if (b?.__kind === "hold" && isHoldExpired(b?.holdExpiresAt ?? null)) return false;
      if (String(b?.status ?? "") === "cancelled") return false;
      const range = getBookingRange(b, rescheduleDurationMin);
      if (!range) return false;
      return overlaps(rangeStart, rangeEnd, range.start, range.end);
    });
  }

  async function rescheduleBooking() {
    if (!bookingSelectedId) return;
    if (!rescheduleDate || !rescheduleTime) {
      return alert("Informe a nova data e horário.");
    }
    if (!selectedBooking) return;
    try {
      const blockReason = getDayBlockReason(rescheduleDate, rescheduleProfessional);
      if (blockReason) {
        return alert(blockReason);
      }
      if (rescheduleSlots.length > 0 && !rescheduleSlots.includes(rescheduleTime)) {
        return alert("Horário indisponível. Selecione um horário disponível.");
      }
      const bookingRef = doc(db, "tenants", tenantId, "bookings", bookingSelectedId);
      const newStart = new Date(`${rescheduleDate}T${rescheduleTime}:00`);

      let durationMin = rescheduleDurationMin || 30;

      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + durationMin);

      const pid = String(rescheduleProfessionalId ?? selectedBooking?.professionalId ?? "");
      if (pid) {
        const conflict = await hasConflictForRange(pid, newStart, newEnd, rescheduleDate);
        if (conflict) {
          return alert("Conflito de agenda encontrado. Escolha outro horário.");
        }
      }

      const proName =
        team.find((p) => p.id === String(rescheduleProfessionalId ?? ""))?.name ??
        String(selectedBooking?.professionalName ?? "");

      await updateDoc(bookingRef, {
        startAt: Timestamp.fromDate(newStart),
        endAt: Timestamp.fromDate(newEnd),
        professionalId: rescheduleProfessionalId || selectedBooking?.professionalId || "",
        professionalName: proName,
        status: "confirmed",
        updatedAt: serverTimestamp(),
        rescheduledAt: serverTimestamp(),
      });
      setBookingModalOpen(false);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao reagendar a reserva.");
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/admin/login");
    }
  }

  function openAdminBooking() {
    if (!bookingLink) return;
    setAdminBookingOpen(true);
  }

  // default do filtro quando team muda
  useEffect(() => {
    if (selectedFilter === "all") return;
    if (!team.some((p) => p.id === selectedFilter)) setSelectedFilter("all");
  }, [team, selectedFilter]);

  useEffect(() => {
    const normalized = startOfWeekMonday(weekStart);
    if (normalized.getTime() !== weekStart.getTime()) {
      setWeekStart(normalized);
    }
  }, [weekStart]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = adminBookingOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [adminBookingOpen]);

  // ===== UI helpers (modal) =====
  const activeServicesList = useMemo(() => services.filter((s) => s.active), [services]);

  const weekDayOptions = useMemo(
    () => [
      { id: 0, label: "Dom", full: "Domingo" },
      { id: 1, label: "Seg", full: "Segunda" },
      { id: 2, label: "Ter", full: "Terça" },
      { id: 3, label: "Qua", full: "Quarta" },
      { id: 4, label: "Qui", full: "Quinta" },
      { id: 5, label: "Sex", full: "Sexta" },
      { id: 6, label: "Sáb", full: "Sábado" },
    ],
    []
  );

  if (!authReady || !currentUid || !tenantId) {
    return <div className="bg-slate-50 text-slate-900 min-h-screen" />;
  }

  return (
    <div className="bg-background-light text-slate-900 min-h-screen">
      <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md border-b border-slate-200">
        <div className="relative flex items-center justify-between p-4">
          <div className="flex flex-col">
            <h2 className="text-[#0d141b] text-lg font-bold leading-tight tracking-tight">{salonName}</h2>
            <p className="text-xs text-slate-500">{tenantForm.email || "admin@agendixx.com"}</p>
          </div>

          <img
            src="/logo-axk.png"
            alt="Agendixx"
            className="absolute left-1/2 -translate-x-1/2 h-8 w-auto object-contain"
          />

          <button
            type="button"
            onClick={handleSignOut}
            className="text-red-500 text-sm font-semibold flex items-center gap-1 active:opacity-60 transition-opacity"
          >
            Sair
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex h-11 items-center justify-center rounded-xl bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => setActiveView("settings")}
              className={[
                "flex h-full grow items-center justify-center rounded-lg px-2 text-sm font-semibold transition-all",
                activeView === "settings"
                  ? "bg-white shadow-sm text-primary"
                  : "text-slate-500 text-sm font-medium",
              ].join(" ")}
            >
              Configurações
            </button>
            <button
              type="button"
              onClick={() => setActiveView("appointments")}
              className={[
                "flex h-full grow items-center justify-center rounded-lg px-2 text-sm font-medium transition-all",
                activeView === "appointments"
                  ? "bg-white shadow-sm text-primary"
                  : "text-slate-500",
              ].join(" ")}
            >
              Agendamentos
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto pb-24">
        {activeView === "settings" ? (
          <section className="p-4 space-y-6" id="settings-view">
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setTenantDetailsOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider">Dados do Salão</h3>
                  <span className="text-[11px] text-slate-500">
                    {tenantDetailsOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {tenantDetailsOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {tenantDetailsOpen ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700 ml-1">Nome do Salão</label>
                    <input
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="text"
                      value={tenantForm.name}
                      onChange={(e) => setTenantForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700 ml-1">Endereço do Salão</label>
                    <input
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="text"
                      value={tenantForm.address}
                      onChange={(e) => setTenantForm((p) => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700 ml-1">WhatsApp de Contato</label>
                    <input
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="tel"
                      value={tenantForm.phone}
                      onChange={(e) => setTenantForm((p) => ({ ...p, phone: formatPhoneBR(e.target.value) }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700 ml-1">Email do Admin</label>
                    <input
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      type="email"
                      value={tenantForm.email}
                      onChange={(e) => setTenantForm((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-lg">link</span>
                <h4 className="font-bold text-sm uppercase tracking-wide">Link Público</h4>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-600 outline-none"
                  readOnly
                  value={bookingLink}
                />
                <button
                  onClick={copyLink}
                  className="bg-primary text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  Copiar
                </button>
              </div>
              <p className="text-[11px] text-slate-500">Divulgue este link no seu Instagram.</p>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setOpeningHoursOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider">Horários de Funcionamento</h3>
                  <span className="text-[11px] text-slate-500">
                    {openingHoursOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {openingHoursOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {openingHoursOpen ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {openingHours.map((h) => (
                    <div
                      key={h.dayIndex}
                      className={["p-4 flex items-center justify-between", h.active ? "" : "opacity-60"].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          checked={h.active}
                          onChange={(e) =>
                            setOpeningHours((prev) =>
                              prev.map((x) => (x.dayIndex === h.dayIndex ? { ...x, active: e.target.checked } : x))
                            )
                          }
                          className="w-5 h-5 rounded text-primary border-slate-300 focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-sm font-medium">{h.label}</span>
                      </div>
                      {h.active ? (
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                          <input
                            type="time"
                            className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200"
                            value={h.start}
                            onChange={(e) =>
                              setOpeningHours((prev) =>
                                prev.map((x) => (x.dayIndex === h.dayIndex ? { ...x, start: e.target.value } : x))
                              )
                            }
                          />
                          <span>às</span>
                          <input
                            type="time"
                            className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200"
                            value={h.end}
                            onChange={(e) =>
                              setOpeningHours((prev) =>
                                prev.map((x) => (x.dayIndex === h.dayIndex ? { ...x, end: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-400 italic">Fechado</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setClosedDatesOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider">Datas Exceção (Fechado)</h3>
                  <span className="text-[11px] text-slate-500">
                    {closedDatesOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {closedDatesOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {closedDatesOpen ? (
                <>
                  <div className="flex items-center justify-between">
                    <div />
                    <button
                      type="button"
                      onClick={() => {
                        if (!closedDateInput) return;
                        const id = `${closedDateInput}-${Date.now()}`;
                        setClosedDates((prev) => [
                          ...prev,
                          { id, date: closedDateInput, label: closedLabelInput.trim() },
                        ]);
                        setClosedDateInput("");
                        setClosedLabelInput("");
                      }}
                      className="text-primary text-xs font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-base">add_circle</span>
                      Adicionar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={closedDateInput}
                      onChange={(e) => setClosedDateInput(e.target.value)}
                    />
                    <input
                      type="text"
                      className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      placeholder="Motivo (ex: Natal)"
                      value={closedLabelInput}
                      onChange={(e) => setClosedLabelInput(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    {closedDates.length === 0 ? (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-400 font-semibold">
                        Nenhuma data de exceção cadastrada.
                      </div>
                    ) : (
                      closedDates.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center">
                              <span className="text-[10px] leading-none text-slate-500 uppercase font-bold">
                                {c.date ? new Date(c.date + "T00:00:00").toLocaleString("pt-BR", { month: "short" }) : "—"}
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {c.date ? String(new Date(c.date + "T00:00:00").getDate()).padStart(2, "0") : "--"}
                              </span>
                            </div>
                            <span className="text-sm font-medium">{c.label || "Fechado"}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setClosedDates((prev) => prev.filter((x) => x.id !== c.id))}
                            className="text-slate-300 hover:text-red-500 transition-colors"
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setServicesOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">content_cut</span>
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Funções / Serviços</h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {servicesOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {servicesOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {servicesOpen ? (
                <>
                  <div className="flex items-center justify-between">
                    <div />
                    <button
                      onClick={openCreateService}
                      className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
                    >
                      + Novo Serviço
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {services.map((s) => (
                      <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden">
                              <span className="material-symbols-outlined text-slate-400">{s.icon ?? "content_cut"}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{s.name}</p>
                              <p className="text-[10px] text-slate-500 font-medium">
                                {s.durationMin} min • R$ {Number(s.price).toFixed(2).replace(".", ",")}
                              </p>
                            </div>
                          </div>

                          <button className="text-slate-300" onClick={() => openEditService(s)}>
                            <span className="material-symbols-outlined">edit</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          <div className="bg-slate-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Status</p>
                            <p className="text-[10px] font-semibold text-slate-700">{s.active ? "Ativo" : "Inativo"}</p>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Profissionais</p>
                            <p className="text-[10px] font-semibold text-slate-700">
                              {String((s.professionalIds || []).length).padStart(2, "0")} vinculados
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {services.length === 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <p className="text-[11px] font-semibold text-slate-400">
                          Nenhum serviço cadastrado ainda. Clique em{" "}
                          <span className="text-primary font-bold">+ Novo Serviço</span>.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setTeamOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">diversity_3</span>
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Equipe</h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {teamOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {teamOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {teamOpen ? (
                <>
                  <div className="flex items-center justify-between">
                    <div />
                    <button
                      onClick={openCreateProfessional}
                      className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
                    >
                      + Profissional
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {team.map((m) => (
                      <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden">
                              <span className="text-sm font-black text-slate-600">{initialsFromName(m.name)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{m.name}</p>
                            </div>
                          </div>
                          <button className="text-slate-300" onClick={() => openEditProfessional(m)}>
                            <span className="material-symbols-outlined">edit</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          <div className="bg-slate-50 p-2 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Serviços</p>
                            <p className="text-[10px] font-semibold text-slate-700">
                              {String(m.servicesActive).padStart(2, "0")} Ativos
                            </p>
                          </div>

                          {m.absenceLabel?.kind === "ausencia" ? (
                            <div className="bg-amber-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-amber-600 uppercase mb-1">Ausências</p>
                              <p className="text-[10px] font-semibold text-amber-700">{m.absenceLabel.text}</p>
                            </div>
                          ) : m.absenceLabel?.kind === "ferias" ? (
                            <div className="bg-blue-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-blue-600 uppercase mb-1">Férias</p>
                              <p className="text-[10px] font-semibold text-blue-700">{m.absenceLabel.text}</p>
                            </div>
                          ) : (
                            <div className="bg-slate-50 p-2 rounded-xl">
                              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Status</p>
                              <p className="text-[10px] font-semibold text-slate-700">{m.active ? "Ativo" : "Inativo"}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {team.length === 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <p className="text-[11px] font-semibold text-slate-400">
                          Nenhum profissional cadastrado ainda. Clique em{" "}
                          <span className="text-primary font-bold">+ Profissional</span>.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setCouponsOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-left"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">confirmation_number</span>
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cupons</h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {couponsOpen ? "Toque para ocultar" : "Toque para expandir"}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {couponsOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {couponsOpen ? (
                <>
                  <div className="flex items-center justify-between">
                    <div />
                    <button
                      onClick={openCreateCoupon}
                      className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
                    >
                      + Novo Cupom
                    </button>
                  </div>

                  {coupons.map((c) => (
                    <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                            {c.code}
                          </span>
                          <span
                            className={[
                              "ml-2 text-[10px] font-bold",
                              c.status === "Ativo" ? "text-emerald-600" : "text-slate-400",
                            ].join(" ")}
                          >
                            {c.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-primary">{c.percentOff}% OFF</span>
                          <button className="text-slate-300" onClick={() => openEditCoupon(c)}>
                            <span className="material-symbols-outlined">edit</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-xs text-slate-400">person_search</span>
                        <span className="text-[10px] text-slate-500 font-medium italic">Vinculado a: {c.linkedTo}</span>
                      </div>

                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="bg-primary h-full" style={{ width: `${c.progressPct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[9px] font-bold text-slate-400">
                          {c.used}/{c.maxUses} USADOS
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Expira: {c.expiresLabel}</span>
                      </div>
                    </div>
                  ))}

                  {coupons.length === 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <p className="text-[11px] font-semibold text-slate-400">
                        Nenhum cupom cadastrado ainda. Clique em{" "}
                        <span className="text-primary font-bold">+ Novo Cupom</span>.
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={saveTenantData}
                className="w-full h-14 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                Salvar Alterações
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="h-8 bg-slate-100/50 my-6 border-y border-slate-200 flex items-center justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                Visualização de Agendamentos
              </span>
            </div>

            {/* Agenda semanal */}
            <section className="p-4 space-y-6" id="appointments-view">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900 text-lg font-bold">{monthLabel}</h3>
                <div className="flex gap-1">
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200"
                    onClick={() => {
                      if (viewMode === "week") {
                        const d = new Date(weekStart);
                        d.setDate(d.getDate() - 7);
                        setWeekStart(startOfWeekMonday(d));
                        setSelectedDayIndex(1);
                      } else {
                        const day = selectedDate.getDate();
                        const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
                        const daysInNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                        const safeDay = Math.min(day, daysInNewMonth);
                        const nextDate = new Date(d.getFullYear(), d.getMonth(), safeDay);
                        const newWeekStart = startOfWeekMonday(nextDate);
                        setWeekStart(newWeekStart);
                        const diff = Math.round((nextDate.getTime() - newWeekStart.getTime()) / (24 * 60 * 60 * 1000));
                        setSelectedDayIndex(diff);
                      }
                    }}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200"
                    onClick={() => {
                      if (viewMode === "week") {
                        const d = new Date(weekStart);
                        d.setDate(d.getDate() + 7);
                        setWeekStart(startOfWeekMonday(d));
                        setSelectedDayIndex(1);
                      } else {
                        const day = selectedDate.getDate();
                        const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
                        const daysInNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                        const safeDay = Math.min(day, daysInNewMonth);
                        const nextDate = new Date(d.getFullYear(), d.getMonth(), safeDay);
                        const newWeekStart = startOfWeekMonday(nextDate);
                        setWeekStart(newWeekStart);
                        const diff = Math.round((nextDate.getTime() - newWeekStart.getTime()) / (24 * 60 * 60 * 1000));
                        setSelectedDayIndex(diff);
                      }
                    }}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={[
                    "h-8 px-3 rounded-full text-[10px] font-extrabold transition-all",
                    viewMode === "week"
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  className={[
                    "h-8 px-3 rounded-full text-[10px] font-extrabold transition-all",
                    viewMode === "month"
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  Mês
                </button>
              </div>

              <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2">
                {weekDays.map((d, idx) => {
                  const hasBookings = (weekBookings || []).some((b: any) => {
                    const startAt: Timestamp | null = b?.startAt ?? null;
                    if (!startAt) return false;
                    return toYMD(startAt.toDate()) === d.ymd;
                  });
                  return (
                  <button
                    key={`${d.ymd}-${idx}`}
                    type="button"
                    onClick={() => setSelectedDayIndex(d.index)}
                    className={[
                      "flex flex-col items-center justify-center min-w-[56px] h-20 rounded-2xl border shadow-sm transition-all",
                      d.active ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-white border-slate-200",
                    ].join(" ")}
                  >
                    <span className={["text-[10px] font-medium uppercase", d.active ? "text-white/70" : "text-slate-400"].join(" ")}>
                      {WEEK_HEADER_LABELS[d.index]}
                    </span>
                    <span className="text-lg font-bold">{d.day}</span>
                    {d.active ? <div className="w-1 h-1 bg-white rounded-full mt-1" /> : null}
                    {hasBookings ? <span className="text-[10px] text-amber-400 mt-0.5">★</span> : null}
                  </button>
                );
              })}
              </div>

              {viewMode === "week" ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">Próximos Horários</h4>
                  {filteredWeeklyItems.map((item) => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                      {item.status === "busy" ? (
                        <>
                          <div className="flex justify-between items-start">
                            <div className="flex gap-3">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl text-slate-400">person</span>
                              </div>
                              <div>
                                <h5 className="text-sm font-bold text-slate-900">{item.customer}</h5>
                                {item.customerPhone ? (
                                  <p className="text-[11px] text-slate-400">
                                    WhatsApp: {formatPhoneBR(item.customerPhone)}
                                  </p>
                                ) : null}
                                <p className="text-xs text-slate-500 mt-1">{item.service}</p>
                                <div className="flex items-center gap-1 mt-2 text-primary">
                                  <span className="material-symbols-outlined text-sm">schedule</span>
                                  <span className="text-xs font-bold uppercase tracking-wide">{item.time}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="px-2 py-1 rounded-md bg-green-100 text-green-600 text-[10px] font-bold uppercase tracking-wider">
                                {bookingStatusLabel(item.bookingStatus)}
                              </span>
                              {item.professionalShort ? (
                                <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-500">
                                  <span className="material-symbols-outlined text-[14px]">person</span>
                                  <span>{item.professionalShort}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1 border-t border-slate-50">
                            <button
                              type="button"
                              onClick={() => openBookingModal(item.id)}
                              className="flex-1 h-9 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <span className="material-symbols-outlined text-base">more_horiz</span>
                              Opções
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const phone = String(item.customerPhone ?? "").replace(/\D/g, "");
                                if (!phone) return alert("WhatsApp do cliente não informado.");
                                window.open(`https://wa.me/55${phone}`, "_blank");
                              }}
                              className="flex-1 h-9 rounded-lg bg-primary text-white text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <span className="material-symbols-outlined text-base">chat</span>
                              WhatsApp
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-3 text-center text-slate-400 text-[11px] font-semibold">Horário disponível</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-slate-100 text-center">
                    {WEEK_HEADER_LABELS.map((d) => (
                      <div key={d} className="p-2 text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 p-3">
                    {(() => {
                      const firstDow = monthStart.getDay();
                      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
                      const leading = (firstDow + 6) % 7;
                      const cells = [];
                      for (let i = 0; i < leading; i++) {
                        cells.push(<div key={`empty-${i}`} className="h-14 rounded-xl" />);
                      }
                      for (let day = 1; day <= daysInMonth; day++) {
                        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
                        const ymd = toYMD(date);
                        const count = (monthBookings || []).filter((b: any) => {
                          const startAt: Timestamp | null = b?.startAt ?? null;
                          if (!startAt) return false;
                          return toYMD(startAt.toDate()) === ymd;
                        }).length;
                        const isSelected = toYMD(selectedDate) === ymd;
                        cells.push(
                          <button
                            key={ymd}
                            type="button"
                            onClick={() => {
                              const newWeekStart = startOfWeekMonday(date);
                              setWeekStart(newWeekStart);
                              const diff = Math.round((date.getTime() - newWeekStart.getTime()) / (24 * 60 * 60 * 1000));
                              setSelectedDayIndex(diff);
                              setViewMode("week");
                            }}
                            className={[
                              "h-14 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98]",
                              isSelected ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50",
                            ].join(" ")}
                          >
                            <span className={["text-[11px] font-extrabold", isSelected ? "text-primary" : "text-slate-700"].join(" ")}>
                              {day}
                            </span>
                            <span
                              className={[
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                count > 0 ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-300",
                              ].join(" ")}
                            >
                              {count > 0 ? `${count} ag.` : "—"}
                            </span>
                          </button>
                        );
                      }
                      return cells;
                    })()}
                  </div>
                </div>
              )}
            </section>

            {/* Dashboards */}
            <section className="mt-8 border-t border-slate-200 pt-6">
              <div className="px-4 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-slate-800">Dashboards</h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mensal</span>
                </div>

            {/* Status por profissional */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">event_note</span>
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Status de Reservas por Profissional
                  </h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"></span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {professionalStatusStats.map((p) => (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-50">
                          <span className="material-symbols-outlined text-slate-400">person</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{p.total} reservas</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="bg-blue-50 p-2 rounded-xl">
                        <p className="text-[9px] font-bold text-blue-500 uppercase mb-1">Confirmadas</p>
                        <p className="text-[12px] font-extrabold text-blue-700">{String(p.confirmed).padStart(2, "0")}</p>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Finalizadas</p>
                        <p className="text-[12px] font-extrabold text-emerald-700">{String(p.completed).padStart(2, "0")}</p>
                      </div>
                      <div className="bg-rose-50 p-2 rounded-xl">
                        <p className="text-[9px] font-bold text-rose-600 uppercase mb-1">Canceladas</p>
                        <p className="text-[12px] font-extrabold text-rose-700">{String(p.cancelled).padStart(2, "0")}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {professionalStatusStats.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[11px] font-semibold text-slate-400">Nenhuma reserva no período.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Clientes novos vs recorrentes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">group</span>
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Novos x Recorrentes
                  </h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"></span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Total</p>
                  <p className="text-xl font-extrabold text-slate-800">{String(customerStats.total).padStart(2, "0")}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Novos</p>
                  <p className="text-xl font-extrabold text-emerald-700">{String(customerStats.newCount).padStart(2, "0")}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[9px] font-bold text-blue-600 uppercase mb-1">Recorrentes</p>
                  <p className="text-xl font-extrabold text-blue-700">{String(customerStats.recurringCount).padStart(2, "0")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
          </>
        )}

      </main>

        {/* FAB - Novo agendamento */}
        <button
          type="button"
          onClick={openAdminBooking}
          className="fixed right-5 bottom-6 z-[150] h-12 px-4 rounded-full bg-primary text-white font-bold shadow-lg shadow-primary/30 flex items-center gap-2 active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Novo agendamento
        </button>

        {/* ========================= MODAIS ========================= */}
        {adminBookingOpen ? (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <button
              type="button"
              onClick={() => setAdminBookingOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
              aria-label="Fechar modal"
            />
            <div className="relative w-full max-w-[980px] h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
              <div className="h-12 px-4 border-b border-slate-100 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Novo agendamento</span>
                <button
                  type="button"
                  onClick={() => setAdminBookingOpen(false)}
                  className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <iframe title="Agendamento" src={bookingLink} className="w-full h-[calc(85vh-3rem)] border-0" />
            </div>
          </div>
        ) : null}

        {/* Modal Serviço */}
        <ModalShell
          open={serviceModalOpen}
          title={serviceEditingId ? "Editar Serviço" : "Novo Serviço"}
          subtitle="Cadastre e gerencie os serviços do salão."
          onClose={() => {
            setServiceModalOpen(false);
            setServiceIconPickerOpen(false);
          }}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome do serviço</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={serviceForm.name}
                onChange={(e) => setServiceForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Corte Masculino Premium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duração (min)</label>
                <input
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={serviceForm.durationMin}
                  onChange={(e) => setServiceForm((p) => ({ ...p, durationMin: e.target.value }))}
                  inputMode="numeric"
                  placeholder="45"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preço (R$)</label>
                <input
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm((p) => ({ ...p, price: e.target.value }))}
                  inputMode="decimal"
                  placeholder="65"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ícone (opcional)</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setServiceIconPickerOpen((v) => !v)}
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold flex items-center justify-between gap-2 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400">{serviceForm.icon || "content_cut"}</span>
                      <span className="text-slate-700">{serviceForm.icon || "content_cut"}</span>
                    </span>
                    <span className="material-symbols-outlined text-[20px] text-slate-400">expand_more</span>
                  </button>

                  {serviceIconPickerOpen ? (
                    <div className="absolute z-[250] mt-2 w-full rounded-2xl border border-slate-100 bg-white shadow-xl p-3">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        Escolha um ícone
                      </p>
                      <div className="grid grid-cols-6 gap-2">
                        {[
                          "content_cut",
                          "spa",
                          "self_care",
                          "face",
                          "brush",
                          "styler",
                          "fingerprint",
                          "local_fire_department",
                          "palette",
                          "clean_hands",
                          "health_and_beauty",
                          "person",
                          "potted_plant",
                          "water_drop",
                          "favorite",
                          "electric_bolt",
                          "syringe",
                          "front_hand",
                        ].map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => {
                              setServiceForm((p) => ({ ...p, icon: ic }));
                              setServiceIconPickerOpen(false);
                            }}
                            className={[
                              "h-10 w-10 rounded-xl border flex items-center justify-center transition-all active:scale-[0.98]",
                              serviceForm.icon === ic ? "border-primary bg-primary/10" : "border-slate-100 bg-slate-50",
                            ].join(" ")}
                            title={ic}
                          >
                            <span
                              className={[
                                "material-symbols-outlined text-[20px]",
                                serviceForm.icon === ic ? "text-primary" : "text-slate-400",
                              ].join(" ")}
                            >
                              {ic}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-3">
                        <input
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                          value={serviceForm.icon}
                          onChange={(e) => setServiceForm((p) => ({ ...p, icon: e.target.value }))}
                          placeholder="Digite outro ícone (ex: content_cut)"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <button
                  type="button"
                  onClick={() => setServiceForm((p) => ({ ...p, active: !p.active }))}
                  className={[
                    "w-full h-12 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-between transition-all active:scale-[0.99]",
                    serviceForm.active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500",
                  ].join(" ")}
                >
                  {serviceForm.active ? "Ativo" : "Inativo"}
                  <span className="material-symbols-outlined text-[20px]">{serviceForm.active ? "toggle_on" : "toggle_off"}</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="flex-1 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveService}
                className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
              >
                Salvar
              </button>
            </div>
          </div>
        </ModalShell>

        {/* Modal Profissional */}
        <ModalShell
          open={proModalOpen}
          title={proEditingId ? "Editar Profissional" : "Novo Profissional"}
          subtitle="Cadastre o profissional e associe os serviços que ele realiza."
          onClose={() => setProModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={proForm.name}
                onChange={(e) => setProForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: João Paulo"
              />
            </div>

            {/* NOVO: calendário do profissional (dias da semana) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias de atuação</label>
                <span className="text-[10px] font-bold text-slate-300">{proForm.workingDays.length} selecionado(s)</span>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <div className="flex flex-wrap gap-2">
                  {weekDayOptions.map((d) => {
                    const checked = proForm.workingDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setProForm((p) => {
                            const next = checked ? p.workingDays.filter((x) => x !== d.id) : [...p.workingDays, d.id];
                            return { ...p, workingDays: next.sort((a, b) => a - b) };
                          });
                        }}
                        className={[
                          "h-10 px-3 rounded-full border text-[11px] font-extrabold transition-all active:scale-[0.99]",
                          checked ? "bg-primary text-white border-primary shadow-md shadow-primary/20" : "bg-white border-slate-200 text-slate-600",
                        ].join(" ")}
                        title={d.full}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-slate-400">
                  Esses dias serão usados para permitir/impedir seleção do profissional no agendamento.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Turno</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "morning", label: "Manhã" },
                  { id: "afternoon", label: "Tarde" },
                  { id: "evening", label: "Noite" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProForm((p) => ({ ...p, shift: opt.id as any }))}
                    className={[
                      "h-10 px-4 rounded-full border text-[11px] font-extrabold transition-all active:scale-[0.99]",
                      proForm.shift === opt.id
                        ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                        : "bg-white border-slate-200 text-slate-600",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <button
                  type="button"
                  onClick={() => setProForm((p) => ({ ...p, active: !p.active }))}
                  className={[
                    "w-full h-12 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-between transition-all active:scale-[0.99]",
                    proForm.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
                  ].join(" ")}
                >
                  {proForm.active ? "Ativo" : "Inativo"}
                  <span className="material-symbols-outlined text-[20px]">{proForm.active ? "toggle_on" : "toggle_off"}</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ausência/Férias</label>
                <select
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={proForm.absenceKind}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setProForm((p) => ({
                      ...p,
                      absenceKind: v,
                      absenceDate: "",
                      vacationStart: "",
                      vacationEnd: "",
                      absenceText: "",
                    }));
                  }}
                >
                  <option value="">Nenhum</option>
                  <option value="ausencia">Ausência</option>
                  <option value="ferias">Férias</option>
                </select>
              </div>
            </div>

            {/* NOVO: calendário para ausência/férias */}
            {proForm.absenceKind === "ausencia" ? (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dia da folga</label>
                <input
                  type="date"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={proForm.absenceDate}
                  onChange={(e) => setProForm((p) => ({ ...p, absenceDate: e.target.value }))}
                />
                <p className="text-[10px] font-semibold text-slate-400">
                  Nesse dia, o profissional não poderá ser selecionado nem ter agenda reservada.
                </p>
              </div>
            ) : null}

            {proForm.absenceKind === "ferias" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Início</label>
                  <input
                    type="date"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={proForm.vacationStart}
                    onChange={(e) => setProForm((p) => ({ ...p, vacationStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fim</label>
                  <input
                    type="date"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={proForm.vacationEnd}
                    onChange={(e) => setProForm((p) => ({ ...p, vacationEnd: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400">
                    Durante todo o período, o profissional não poderá ser selecionado nem ter agenda reservada.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Fechar agenda (imprevisto)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!proClosedRangeDateInput) return;
                    if (!proClosedRangeAllDay) {
                      if (!proClosedRangeStartInput || !proClosedRangeEndInput) {
                        return alert("Informe o horário de início e fim.");
                      }
                      if (proClosedRangeStartInput >= proClosedRangeEndInput) {
                        return alert("O horário final precisa ser maior que o inicial.");
                      }
                    }
                    const id = `${proClosedRangeDateInput}-${Date.now()}`;
                    const newRange: ClosedRange = {
                      id,
                      date: proClosedRangeDateInput,
                      start: proClosedRangeAllDay ? "" : proClosedRangeStartInput,
                      end: proClosedRangeAllDay ? "" : proClosedRangeEndInput,
                      label: proClosedRangeLabelInput.trim(),
                      allDay: proClosedRangeAllDay,
                    };
                    setProForm((p) => ({ ...p, closedRanges: [...(p.closedRanges || []), newRange] }));
                    setProClosedRangeDateInput("");
                    setProClosedRangeLabelInput("");
                    setProClosedRangeAllDay(false);
                  }}
                  className="text-primary text-[10px] font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  Adicionar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={proClosedRangeDateInput}
                  onChange={(e) => setProClosedRangeDateInput(e.target.value)}
                />
                <input
                  type="text"
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  placeholder="Motivo (opcional)"
                  value={proClosedRangeLabelInput}
                  onChange={(e) => setProClosedRangeLabelInput(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={proClosedRangeAllDay}
                    onChange={(e) => setProClosedRangeAllDay(e.target.checked)}
                    className="w-4 h-4 rounded text-primary border-slate-300 focus:ring-primary"
                  />
                  Dia inteiro
                </label>
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                  <input
                    type="time"
                    className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200 disabled:opacity-50"
                    value={proClosedRangeStartInput}
                    onChange={(e) => setProClosedRangeStartInput(e.target.value)}
                    disabled={proClosedRangeAllDay}
                  />
                  <span>às</span>
                  <input
                    type="time"
                    className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200 disabled:opacity-50"
                    value={proClosedRangeEndInput}
                    onChange={(e) => setProClosedRangeEndInput(e.target.value)}
                    disabled={proClosedRangeAllDay}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {(proForm.closedRanges || []).length === 0 ? (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-400 font-semibold">
                    Nenhum fechamento rápido cadastrado.
                  </div>
                ) : (
                  (proForm.closedRanges || []).map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center">
                          <span className="text-[10px] leading-none text-slate-500 uppercase font-bold">
                            {r.date ? new Date(r.date + "T00:00:00").toLocaleString("pt-BR", { month: "short" }) : "—"}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {r.date ? String(new Date(r.date + "T00:00:00").getDate()).padStart(2, "0") : "--"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{r.label || "Fechamento"}</span>
                          <span className="text-[11px] text-slate-500">
                            {r.allDay ? "Dia inteiro" : `${r.start || "--:--"} às ${r.end || "--:--"}`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setProForm((p) => ({
                            ...p,
                            closedRanges: (p.closedRanges || []).filter((x) => x.id !== r.id),
                          }))
                        }
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* serviços (droplist/multi) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Serviços do profissional</label>
                <span className="text-[10px] font-bold text-slate-300">
                  {proForm.selectedServiceIds.length} selecionado(s)
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 max-h-48 overflow-auto">
                {activeServicesList.length === 0 ? (
                  <p className="text-[11px] font-semibold text-slate-400">
                    Nenhum serviço ativo encontrado. Cadastre em <span className="text-primary font-bold">Funções/Serviços</span>.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeServicesList.map((s) => {
                      const checked = proForm.selectedServiceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setProForm((p) => {
                              const next = checked
                                ? p.selectedServiceIds.filter((id) => id !== s.id)
                                : [...p.selectedServiceIds, s.id];
                              return { ...p, selectedServiceIds: next };
                            });
                          }}
                          className={[
                            "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl border transition-all",
                            checked ? "border-primary bg-white" : "border-slate-100 bg-white",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-slate-400">{s.icon ?? "content_cut"}</span>
                            <div className="text-left">
                              <p className="text-[12px] font-extrabold text-slate-800 leading-tight">{s.name}</p>
                              <p className="text-[10px] font-semibold text-slate-400">
                                {s.durationMin} min • R$ {Number(s.price).toFixed(2).replace(".", ",")}
                              </p>
                            </div>
                          </div>
                          <span
                            className={[
                              "material-symbols-outlined text-[20px]",
                              checked ? "text-primary" : "text-slate-300",
                            ].join(" ")}
                          >
                            {checked ? "check_circle" : "radio_button_unchecked"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setProModalOpen(false)}
                className="flex-1 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveProfessional}
                className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
              >
                Salvar
              </button>
            </div>
          </div>
        </ModalShell>

        {/* Modal Cupom */}
        <ModalShell
          open={couponModalOpen}
          title={couponEditingId ? "Editar Cupom" : "Novo Cupom"}
          subtitle="Defina percentual, período e limite de usos."
          onClose={() => setCouponModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-extrabold tracking-wider uppercase focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={couponForm.code}
                onChange={(e) => setCouponForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="EX: VERAO24"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Percentual (%)</label>
                <input
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={couponForm.percentOff}
                  onChange={(e) => setCouponForm((p) => ({ ...p, percentOff: e.target.value }))}
                  inputMode="numeric"
                  placeholder="15"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <button
                  type="button"
                  onClick={() => setCouponForm((p) => ({ ...p, active: !p.active }))}
                  className={[
                    "w-full h-12 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-between transition-all active:scale-[0.99]",
                    couponForm.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
                  ].join(" ")}
                >
                  {couponForm.active ? "Ativo" : "Inativo"}
                  <span className="material-symbols-outlined text-[20px]">{couponForm.active ? "toggle_on" : "toggle_off"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Limite de usos</label>
                <input
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={couponForm.maxUses}
                  onChange={(e) => setCouponForm((p) => ({ ...p, maxUses: e.target.value }))}
                  inputMode="numeric"
                  placeholder="50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expira em</label>
                <input
                  type="date"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={couponForm.expiresDate}
                  onChange={(e) => setCouponForm((p) => ({ ...p, expiresDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vinculado a</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={couponForm.linkedTo}
                onChange={(e) => setCouponForm((p) => ({ ...p, linkedTo: e.target.value }))}
                placeholder="Ex: Todos / João Paulo"
              />
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setCouponModalOpen(false)}
                className="flex-1 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveCoupon}
                className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
              >
                Salvar
              </button>
            </div>
          </div>
        </ModalShell>

        {/* Modal Agendamento */}
        <ModalShell
          open={bookingModalOpen}
          title="Atualizar Reserva"
          subtitle="Selecione a ação para esta reserva."
          onClose={() => setBookingModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo</p>
              <p className="text-sm font-extrabold text-slate-900 mt-1">
                {String(selectedBooking?.serviceName ?? selectedBooking?.service ?? "Serviço")}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">
                {String(selectedBooking?.customerName ?? selectedBooking?.customer ?? "Cliente")}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-[16px] text-slate-400">person</span>
                <span className="text-[10px] font-bold text-slate-500">
                  {firstName(String(selectedBooking?.professionalName ?? selectedBooking?.professionalShort ?? "Profissional"))}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                <span className="text-[10px] font-bold text-slate-500">
                  {selectedBooking?.startAt?.toDate
                    ? formatHHMM(selectedBooking.startAt.toDate())
                    : "Horário não disponível"}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[9px] font-bold uppercase text-slate-400">Status atual</span>
                <p className="text-[11px] font-extrabold text-slate-700">
                  {bookingStatusLabel(selectedBookingStatus)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRescheduleOpen((v) => !v)}
              disabled={selectedBookingStatus !== "confirmed"}
              className={[
                "h-12 rounded-2xl border font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]",
                selectedBookingStatus !== "confirmed"
                  ? "bg-slate-50 border-slate-200 text-slate-300"
                  : rescheduleOpen
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-white border-primary/20 text-primary",
              ].join(" ")}
            >
              <span className="material-symbols-outlined text-[20px]">edit_calendar</span>
              Reagendar
            </button>

            {rescheduleOpen ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profissional</label>
                  <select
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={rescheduleProfessionalId}
                    onChange={(e) => setRescheduleProfessionalId(e.target.value)}
                  >
                    {team.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nova data</label>
                    <input
                      type="date"
                      className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Novo horário</label>
                    <input
                      type="time"
                      className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias disponíveis</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!rescheduleMonthView) return;
                          const prev = new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth() - 1, 1);
                          setRescheduleMonthView(prev);
                        }}
                        className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 flex items-center justify-center hover:border-primary/40"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                      </button>
                      <span className="text-xs font-bold text-slate-600">
                        {rescheduleMonthView ? rescheduleMonthView.toLocaleString("pt-BR", { month: "long", year: "numeric" }) : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!rescheduleMonthView) return;
                          const next = new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth() + 1, 1);
                          setRescheduleMonthView(next);
                        }}
                        className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 flex items-center justify-center hover:border-primary/40"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </button>
                    </div>
                  </div>
                  {rescheduleMonthView ? (
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map((d, idx) => (
                        <span key={`${d}-${idx}`} className="text-[10px] font-bold text-slate-400">
                          {d}
                        </span>
                      ))}
                      {Array.from({ length: new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth(), 1).getDay() }).map(
                        (_, idx) => (
                          <span key={`empty-${idx}`} />
                        )
                      )}
                      {Array.from({
                        length: new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth() + 1, 0).getDate(),
                      }).map((_, idx) => {
                        const day = idx + 1;
                        const date = new Date(rescheduleMonthView.getFullYear(), rescheduleMonthView.getMonth(), day);
                        const ymd = toYMD(date);
                        const isSelected = rescheduleDate === ymd;
                        const available = rescheduleAvailabilityMap.get(ymd) === true;
                        return (
                          <button
                            key={ymd}
                            type="button"
                            onClick={() => setRescheduleDate(ymd)}
                            className={[
                              "h-9 rounded-lg text-xs font-extrabold border transition-all",
                              available ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-400",
                              isSelected ? "bg-primary text-white border-primary" : "bg-white",
                            ].join(" ")}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horários disponíveis</p>
                  {getDayBlockReason(rescheduleDate, rescheduleProfessional) ? (
                    <p className="text-xs font-semibold text-rose-600">
                      {getDayBlockReason(rescheduleDate, rescheduleProfessional)}
                    </p>
                  ) : rescheduleLoading ? (
                    <p className="text-xs font-semibold text-slate-500">Carregando horários...</p>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-xs font-semibold text-slate-500">Sem horários disponíveis para esta data.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {rescheduleSlots.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setRescheduleTime(time)}
                          className={[
                            "h-9 px-3 rounded-xl border text-xs font-extrabold transition-all active:scale-[0.98]",
                            rescheduleTime === time
                              ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
                              : "bg-white text-slate-700 border-slate-200 hover:border-primary/40",
                          ].join(" ")}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={rescheduleBooking}
                  className="w-full h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
                >
                  Salvar reagendamento
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateBookingStatus("cancelled")}
                disabled={selectedBookingStatus !== "confirmed"}
                className={[
                  "h-12 rounded-2xl border font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]",
                  selectedBookingStatus !== "confirmed"
                    ? "bg-slate-50 border-slate-200 text-slate-300"
                    : "bg-rose-50 border-rose-200 text-rose-700",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-[20px]">event_busy</span>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => updateBookingStatus("completed")}
                disabled={selectedBookingStatus !== "confirmed"}
                className={[
                  "h-12 rounded-2xl border font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]",
                  selectedBookingStatus !== "confirmed"
                    ? "bg-slate-50 border-slate-200 text-slate-300"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-[20px]">task_alt</span>
                Finalizado
              </button>
            </div>

            <button
              type="button"
              onClick={() => setBookingModalOpen(false)}
              className="w-full h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
            >
              Fechar
            </button>
          </div>
        </ModalShell>
    </div>
  );
}
