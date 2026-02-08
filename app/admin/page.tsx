"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  servicesActive: number;
  absenceLabel?: { kind: "ausencia" | "ferias"; text: string };
  avatarUrl?: string;
  active: boolean;

  // novos (para leitura do banco)
  workingDays?: number[]; // 0=Dom ... 6=Sáb
  absenceStartAt?: Timestamp | null;
  absenceEndAt?: Timestamp | null;
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

function formatAbsenceLabel(kind: "ausencia" | "ferias", startAt: Timestamp | null, endAt: Timestamp | null) {
  const start = startAt ? toExpiresLabel(startAt) : "—";
  const end = endAt ? toExpiresLabel(endAt) : "—";
  if (kind === "ausencia") return `Folga: ${start}`;
  return `${start} a ${end}`;
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

function bookingStatusLabel(status?: string) {
  if (status === "cancelled") return "Cancelado";
  if (status === "completed") return "Finalizado";
  return "Confirmado";
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
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* overlay */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Fechar modal"
      />
      {/* panel */}
      <div className="relative w-full sm:max-w-[520px] bg-white rounded-t-3xl sm:rounded-3xl border border-slate-100 shadow-2xl p-5 sm:p-6 m-0 sm:m-4">
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

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  /**
   * ✅ IMPORTANTE (por enquanto):
   * Defina aqui qual tenant este admin controla.
   * Depois a gente troca para buscar do usuário logado:
   * ex: users_admin/{uid}.tenantId
   */
  const searchParams = useSearchParams();
  const tenantFromUrl = searchParams.get("tenant") || "bella-studio";
  const [tenantId, setTenantId] = useState<string>(tenantFromUrl);

  useEffect(() => {
    setTenantId(tenantFromUrl);
  }, [tenantFromUrl]);

  // ===== Tenant (salão) =====
  const [salonName, setSalonName] = useState<string>("Carregando...");
  const [tenantSlug, setTenantSlug] = useState<string>(tenantId);

  const bookingLink = useMemo(() => `agendix.me/${tenantSlug}`, [tenantSlug]);

  // ===== Dados Firestore =====
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [dashboardRange, setDashboardRange] = useState<"week" | "month">("week");

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
    role: "",
    avatarUrl: "",
    active: true,

    // escala (dias da semana)
    workingDays: [1, 2, 3, 4, 5] as number[], // default Seg-Sex (0=Dom ... 6=Sáb)

    // ausência/férias (calendário)
    absenceKind: "" as "" | "ausencia" | "ferias",
    absenceDate: "", // para "ausencia" (1 dia)
    vacationStart: "", // para "ferias"
    vacationEnd: "", // para "ferias"

    // mantido (compat/label no card)
    absenceText: "",

    selectedServiceIds: [] as string[], // multi
  });

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

  // ===== Firestore: subscriptions =====
  useEffect(() => {
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
          role: String(data?.role ?? ""),
          servicesActive: 0, // calculamos com services
          absenceLabel,
          avatarUrl: String(data?.avatarUrl ?? ""),
          active: Boolean(data?.active ?? true),

          workingDays: normalizeWorkingDays(data?.workingDays),
          absenceStartAt: startAt,
          absenceEndAt: endAt,
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
      role: "",
      avatarUrl: "",
      active: true,

      workingDays: [1, 2, 3, 4, 5],

      absenceKind: "",
      absenceDate: "",
      vacationStart: "",
      vacationEnd: "",
      absenceText: "",

      selectedServiceIds: [],
    });
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
      role: p.role,
      avatarUrl: p.avatarUrl ?? "",
      active: Boolean(p.active),

      workingDays: normalizeWorkingDays(p.workingDays),

      absenceKind: kind,
      absenceDate: kind === "ausencia" ? startVal : "",
      vacationStart: kind === "ferias" ? startVal : "",
      vacationEnd: kind === "ferias" ? endVal : "",
      absenceText: p.absenceLabel?.text ?? "",

      selectedServiceIds,
    });
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

    const role = proForm.role.trim();
    const avatarUrl = proForm.avatarUrl.trim();

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

    const basePayload: any = {
      name,
      role,
      avatarUrl,
      active: Boolean(proForm.active),

      // NOVO: agenda (dias da semana)
      workingDays,

      // NOVO: bloqueio por período (para não permitir seleção/reserva)
      absenceKind,
      absenceStartAt,
      absenceEndAt,

      // Mantido para exibir no card e compat (preenchido automaticamente)
      absenceText,

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
  }

  const selectedBooking = useMemo(() => {
    if (!bookingSelectedId) return null;
    return (weekBookings || []).find((b: any) => b?.id === bookingSelectedId) ?? null;
  }, [bookingSelectedId, weekBookings]);
  const selectedBookingStatus = String(selectedBooking?.status ?? "confirmed");

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

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen">
      <div className="relative flex min-h-screen w-full flex-col bg-slate-50 pb-8">
        {/* Header */}
        <header className="sticky top-0 z-50 flex items-center bg-white/90 backdrop-blur-md px-4 py-4 justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-2xl size-11 border border-slate-100 shadow-sm"
              style={{
                backgroundImage:
                  'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAFf0PZcFpMoTn0xw3OkUBejkEi_eErwwSmtgV6IgIFxk3ZOHxOS4PA69L52fCGDAnBqlV2QCXP6EBBU1VDOfEkvUdshDnwngpAfbfVM_KH9THoGrtTziSpalkVQ5BJHjXcW6VUhnMcRdfiqGAeYJF7JPwoNugo0CRNkll569WO4oYgDpwccidt_TG2vz5GqFxgdN_BV4QWVA4eyHYMfvF5GvLwtHmlPwWxFJ00mC3fsxTKrnP5dSY-4IoLayR0DnbPNzjuRnEKS0g")',
              }}
            />
            <div className="flex flex-col">
              <h2 className="text-slate-900 text-base font-extrabold leading-tight tracking-tight">{salonName}</h2>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Painel Admin</span>
              {loading && <span className="text-[10px] font-semibold text-slate-400">Carregando dados...</span>}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="flex items-center justify-center rounded-xl h-10 w-10 bg-slate-50 text-slate-600 border border-slate-100">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </button>
            <button className="flex items-center justify-center rounded-xl h-10 w-10 bg-slate-50 text-slate-600 border border-slate-100">
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
          </div>
        </header>

        {/* Link de agendamento */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Link de Agendamento</p>
              <p className="text-slate-900 text-sm font-semibold">{bookingLink}</p>
            </div>
            <button
              onClick={copyLink}
              className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all active:scale-90"
            >
              <span className="material-symbols-outlined text-[20px]">content_copy</span>
            </button>
          </div>
        </div>

        {/* Configurações */}
        <section className="px-4 py-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-slate-800">Configurações</h3>
            <span className="text-xs font-bold text-slate-400">Ver todas</span>
          </div>

          {/* ✅ NOVA SEÇÃO: Funções/Serviços */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">content_cut</span>
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Funções / Serviços</h4>
              </div>
              <button
                onClick={openCreateService}
                className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
              >
                + Novo Serviço
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {services.map((s) => (
                <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-50">
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

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
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
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Nenhum serviço cadastrado ainda. Clique em <span className="text-primary font-bold">+ Novo Serviço</span>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Equipe */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">diversity_3</span>
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Equipe</h4>
              </div>
              <button
                onClick={openCreateProfessional}
                className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
              >
                + Profissional
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {team.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-50">
                        <span className="material-symbols-outlined text-slate-400">person</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{m.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{m.role}</p>
                      </div>
                    </div>
                    <button className="text-slate-300" onClick={() => openEditProfessional(m)}>
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
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
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Nenhum profissional cadastrado ainda. Clique em <span className="text-primary font-bold">+ Profissional</span>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cupons */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">confirmation_number</span>
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cupons</h4>
              </div>
              <button
                onClick={openCreateCoupon}
                className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full"
              >
                + Novo Cupom
              </button>
            </div>

            {coupons.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">{c.code}</span>
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

                <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
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
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[11px] font-semibold text-slate-400">
                  Nenhum cupom cadastrado ainda. Clique em <span className="text-primary font-bold">+ Novo Cupom</span>.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Agenda semanal */}
        <section className="mt-6 border-t border-slate-100 pt-6">
          <div className="px-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-800">Agenda Semanal</h3>
              <div className="flex items-center gap-2">
                <button
                  className="size-8 flex items-center justify-center rounded-lg bg-white border border-slate-100 shadow-sm"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() - 7);
                    setWeekStart(startOfWeekMonday(d));
                    setSelectedDayIndex(1); // mantém terça como padrão (visual)
                  }}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="text-xs font-bold text-slate-700">{weekLabel}</span>
                <button
                  className="size-8 flex items-center justify-center rounded-lg bg-white border border-slate-100 shadow-sm"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() + 7);
                    setWeekStart(startOfWeekMonday(d));
                    setSelectedDayIndex(1); // mantém terça como padrão (visual)
                  }}
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
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
              {viewMode === "month" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const day = selectedDate.getDate();
                      const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
                      const daysInNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                      const safeDay = Math.min(day, daysInNewMonth);
                      const nextDate = new Date(d.getFullYear(), d.getMonth(), safeDay);
                      const newWeekStart = startOfWeekMonday(nextDate);
                      setWeekStart(newWeekStart);
                      const diff = Math.round((nextDate.getTime() - newWeekStart.getTime()) / (24 * 60 * 60 * 1000));
                      setSelectedDayIndex(diff);
                    }}
                    className="size-7 flex items-center justify-center rounded-lg bg-white border border-slate-100 shadow-sm"
                    aria-label="Mês anterior"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const day = selectedDate.getDate();
                      const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
                      const daysInNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                      const safeDay = Math.min(day, daysInNewMonth);
                      const nextDate = new Date(d.getFullYear(), d.getMonth(), safeDay);
                      const newWeekStart = startOfWeekMonday(nextDate);
                      setWeekStart(newWeekStart);
                      const diff = Math.round((nextDate.getTime() - newWeekStart.getTime()) / (24 * 60 * 60 * 1000));
                      setSelectedDayIndex(diff);
                    }}
                    className="size-7 flex items-center justify-center rounded-lg bg-white border border-slate-100 shadow-sm"
                    aria-label="Próximo mês"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{weekLabel}</span>
              )}
            </div>

            <div className="flex overflow-x-auto no-scrollbar gap-2 pb-4">
              {filterButtons.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedFilter(b.id)}
                  className={[
                    "shrink-0 h-9 px-4 rounded-full text-[11px] font-bold flex items-center gap-2 transition-all",
                    selectedFilter === b.id
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  {b.id === "all" ? (
                    "Todos"
                  ) : (
                    <>
                      <div className="size-4 rounded-full bg-slate-200" />
                      {b.label}
                    </>
                  )}
                </button>
              ))}
            </div>

            {viewMode === "week" ? (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-50 text-center">
                  {WEEK_HEADER_LABELS.map((d) => (
                    <div key={d} className="p-2 text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 border-b border-slate-50">
                  {weekDays.map((d) => (
                    <button
                      key={d.ymd}
                      type="button"
                      onClick={() => setSelectedDayIndex(d.index)}
                      className={[
                        "p-3 text-center border-r border-slate-50 transition-all active:scale-[0.99]",
                      d.active ? "bg-primary/5" : "",
                      d.index === 6 ? "border-r-0" : "",
                      ].join(" ")}
                    >
                      <p
                        className={[
                          "text-xs font-bold",
                          d.active ? "text-primary" : d.index === 6 ? "text-slate-400" : "text-slate-800",
                        ].join(" ")}
                      >
                        {d.day}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-4">
                  {/* ✅ (texto discreto) mostra qual dia está selecionado */}
                  <div className="flex items-center justify-between -mt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Dia selecionado
                    </span>
                    <span className="text-[10px] font-extrabold text-slate-700">{selectedDateLabel}</span>
                  </div>

                  {filteredWeeklyItems.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      <span className="text-[10px] font-bold text-slate-400 w-8 pt-1">{item.time}</span>
                      <div className="flex-1 space-y-2">
                        {item.status === "busy" ? (
                          <button
                            type="button"
                            onClick={() => openBookingModal(item.id)}
                            className={[
                              "p-2.5 rounded-xl border-l-4 text-left w-full transition-all active:scale-[0.99]",
                              item.color === "blue" ? "bg-blue-50 border-blue-400" : "bg-emerald-50 border-emerald-400",
                            ].join(" ")}
                            aria-label="Abrir opções do agendamento"
                          >
                            <div className="flex justify-between items-start">
                              <p
                                className={[
                                  "text-[11px] font-bold",
                                  item.color === "blue" ? "text-blue-900" : "text-emerald-900",
                                ].join(" ")}
                              >
                                {item.service}
                              </p>
                              <span
                                className={[
                                  "text-[9px] font-bold uppercase",
                                  item.color === "blue" ? "text-blue-400" : "text-emerald-400",
                                ].join(" ")}
                              >
                                {item.professionalShort}
                              </span>
                            </div>
                            <p
                              className={[
                                "text-[10px] font-medium",
                                item.color === "blue" ? "text-blue-700/80" : "text-emerald-700/80",
                              ].join(" ")}
                            >
                              {item.customer}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <span
                                className={[
                                  "text-[9px] font-bold uppercase",
                                  item.color === "blue" ? "text-blue-400/80" : "text-emerald-400/80",
                                ].join(" ")}
                              >
                                {bookingStatusLabel(item.bookingStatus)}
                              </span>
                              <span
                                className={[
                                  "material-symbols-outlined text-[16px]",
                                  item.color === "blue" ? "text-blue-400" : "text-emerald-400",
                                ].join(" ")}
                              >
                                more_horiz
                              </span>
                            </div>
                          </button>
                        ) : (
                          <div className="flex-1 border-b border-dashed border-slate-100 h-10 flex items-center">
                            <span className="text-[10px] text-slate-300 italic">Disponível</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-50 text-center">
                  {WEEK_HEADER_LABELS.map((d) => (
                    <div key={d} className="p-2 text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 p-3">
                  {(() => {
                    const firstDow = monthStart.getDay(); // 0=Dom
                    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
                    const leading = (firstDow + 6) % 7; // ajusta para começar na segunda
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
                            isSelected ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50",
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
          </div>
        </section>

        {/* Dashboards */}
        <section className="mt-8 border-t border-slate-100 pt-6">
          <div className="px-4 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-800">Dashboards</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDashboardRange("week")}
                  className={[
                    "h-8 px-3 rounded-full text-[10px] font-extrabold transition-all",
                    dashboardRange === "week"
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardRange("month")}
                  className={[
                    "h-8 px-3 rounded-full text-[10px] font-extrabold transition-all",
                    dashboardRange === "month"
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  Mensal
                </button>
              </div>
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {dashboardRange === "week" ? "Semana" : "Mês"}
                </span>
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {dashboardRange === "week" ? "Semana" : "Mês"}
                </span>
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

        {/* FAB e Bottom nav removidos (tudo já na tela inicial) */}

        {/* ========================= MODAIS ========================= */}

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
                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-100 bg-white shadow-xl p-3">
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

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Função / Especialidade</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={proForm.role}
                onChange={(e) => setProForm((p) => ({ ...p, role: e.target.value }))}
                placeholder="Ex: Corte & Barba"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avatar URL (opcional)</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={proForm.avatarUrl}
                onChange={(e) => setProForm((p) => ({ ...p, avatarUrl: e.target.value }))}
                placeholder="https://..."
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
    </div>
  );
}
