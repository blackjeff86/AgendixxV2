"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  collectionGroup,
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

/**
 * app/admin/users/page.tsx
 *
 * Objetivo:
 * - Profissional logado acessa SOMENTE sua agenda (Agendamentos)
 * - Pode: ver, reagendar, cancelar, finalizar, abrir WhatsApp do cliente
 * - Pode: criar reserva em nome de um cliente
 * - Pode: criar "pausa" (bloqueio) na agenda (closedRanges do profissional)
 *
 * Pré-requisito de segurança / segregação:
 * - (Legacy) users_professionals/{uid} com { tenantId, professionalId }
 *
 * NOVO:
 * - Quando o login for de profissional, usamos localStorage("agx_professional_session")
 *   para resolver tenantId/professionalId automaticamente.
 *
 * NOVO (este ajuste):
 * - Botão "Nova reserva" abre a mesma tela do CLIENTE (app/s/[slug]/ui/BookingClientPage.tsx)
 *   via rota /s/[slug] em um modal (iframe), forçando o profissional via querystring.
 *
 * NOVO (este ajuste):
 * - Exibir pausas ativas (closedRanges) antes da seção "Agendamentos"
 * - Permitir cancelar/remover uma pausa.
 */

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

type OpeningHour = {
  dayIndex: number; // 0=Dom ... 6=Sáb
  label: string;
  active: boolean;
  start: string; // "09:00"
  end: string; // "18:00"
};

type ProfessionalDoc = {
  name: string;
  active: boolean;
  workingDays?: number[]; // 0..6
  absenceKind?: "ausencia" | "ferias" | null;
  absenceStartAt?: Timestamp | null;
  absenceEndAt?: Timestamp | null;
  closedRanges?: ClosedRange[];
};

type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  icon?: string;
  active: boolean;
  professionalIds: string[];
};

type WeeklyItem = {
  id: string;
  time: string;
  status: "busy" | "free";
  service?: string;
  customer?: string;
  customerPhone?: string;
  color: "blue" | "emerald";
  bookingStatus?: "confirmed" | "cancelled" | "completed";
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
function formatMonthLabel(d: Date) {
  return d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
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
function normalizeWorkingDays(value: any): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5]; // default Seg-Sex
  return value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}
function bookingStatusLabel(status?: string) {
  if (status === "cancelled") return "Cancelado";
  if (status === "completed") return "Finalizado";
  return "Confirmado";
}
function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] || full;
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

function formatDMYFromYMD(ymd: string) {
  const s = String(ymd || "").trim();
  if (!s) return "";
  const [yyyy, mm, dd] = s.split("-");
  if (!yyyy || !mm || !dd) return s;
  return `${dd}/${mm}/${yyyy}`;
}

function getTenantIdFromProfessionalDocRef(ref: any): string {
  // ref.path: tenants/{tenantId}/professionals/{professionaln2V...}
  const parts = String(ref?.path || "").split("/");
  const tenantsIdx = parts.indexOf("tenants");
  if (tenantsIdx >= 0 && parts.length > tenantsIdx + 1) return String(parts[tenantsIdx + 1] || "");
  return "";
}

function readProfessionalSession(): null | {
  role?: string;
  tenantId?: string;
  professionalId?: string;
  email?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
} {
  try {
    const raw = localStorage.getItem("agx_professional_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function ModalShell({
  open,
  title,
  subtitle,
  children,
  onClose,
  bodyClassName,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  bodyClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Fechar modal"
      />
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

        <div className={bodyClassName ? bodyClassName : "mt-5 overflow-y-auto pr-1"}>{children}</div>
      </div>
    </div>
  );
}

export default function ProfessionalUsersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ProfessionalUsersInner />
    </Suspense>
  );
}

function ProfessionalUsersInner() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // resolução do "escopo" (tenant e professional)
  const [tenantId, setTenantId] = useState<string>("");
  const [professionalId, setProfessionalId] = useState<string>("");

  // infos
  const [salonName, setSalonName] = useState("Carregando...");
  const [professionalName, setProfessionalName] = useState("Profissional");
  const [tenantEmail, setTenantEmail] = useState("—");

  // slug do tenant para abrir tela do CLIENTE
  const [tenantSlug, setTenantSlug] = useState<string>("");

  // modal: abrir tela do CLIENTE para reservar
  const [clientBookingOpen, setClientBookingOpen] = useState(false);

  const clientBookingUrl = useMemo(() => {
    const slug = String(tenantSlug || "").trim();
    if (!slug) return "";
    // rota correta do cliente: /s/[slug] (usa BookingClientPage.tsx)
    const params = new URLSearchParams();
    // compat: alguns pontos do seu projeto usavam staff_id; mandamos ambos
    params.set("staff_id", professionalId || "");
    params.set("staffId", professionalId || "");
    params.set("professionalId", professionalId || "");
    params.set("embed", "1");
    const qs = params.toString();
    return `/s/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
  }, [tenantSlug, professionalId]);

  // agenda
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [proDoc, setProDoc] = useState<ProfessionalDoc | null>(null);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const servicesForPro = useMemo(
    () => services.filter((s) => s.active && (s.professionalIds || []).includes(professionalId)),
    [services, professionalId]
  );

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const weekEnd = useMemo(() => endOfWeekExclusive(weekStart), [weekStart]);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(1); // Terça como default visual (igual template)
  const selectedDate = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + selectedDayIndex);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekStart, selectedDayIndex]);
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
      const active = i === selectedDayIndex;
      days.push({ day, active, index: i, ymd });
    }
    return days;
  }, [weekStart, selectedDayIndex]);

  // bookings somente do profissional
  const [weekBookings, setWeekBookings] = useState<any[]>([]);
  const [monthBookings, setMonthBookings] = useState<any[]>([]);

  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([]);

  // modais: booking actions
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingSelectedId, setBookingSelectedId] = useState<string | null>(null);
  const selectedBooking = useMemo(() => {
    if (!bookingSelectedId) return null;
    return (weekBookings || []).find((b: any) => b?.id === bookingSelectedId) ?? null;
  }, [bookingSelectedId, weekBookings]);
  const selectedBookingStatus = String(selectedBooking?.status ?? "confirmed");

  // reagendar
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  // criar reserva (legacy - mantém, mas o botão agora abre a tela do cliente)
  const [createBookingOpen, setCreateBookingOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [createTime, setCreateTime] = useState("");
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerPhone, setCreateCustomerPhone] = useState("");
  const [createServiceId, setCreateServiceId] = useState("");

  // pausa (closed range)
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseDate, setPauseDate] = useState("");
  const [pauseAllDay, setPauseAllDay] = useState(false);
  const [pauseStart, setPauseStart] = useState("09:00");
  const [pauseEnd, setPauseEnd] = useState("12:00");
  const [pauseLabel, setPauseLabel] = useState("Pausa");

  // ===== Auth =====
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // ===== Resolve escopo (tenantId/professionalId) =====
  useEffect(() => {
    if (!authReady) return;

    if (!currentUid) {
      router.replace("/admin/login");
      return;
    }

    (async () => {
      // 1) PRIORIDADE: session do login do profissional (localStorage)
      const session = readProfessionalSession();
      if (
        session &&
        String(session?.role || "") === "professional" &&
        String(session?.tenantId || "") &&
        String(session?.professionalId || "")
      ) {
        setTenantId(String(session.tenantId));
        setProfessionalId(String(session.professionalId));
        // nome vem do doc do professional via onSnapshot (não precisa setar aqui)
        return;
      }

      // 2) Se tiver e-mail no session (mas sem ids), tenta resolver por query
      if (session && String(session?.email || "")) {
        try {
          const emailInput = String(session.email).trim().toLowerCase();
          const q = query(collectionGroup(db, "professionals"), where("email", "==", emailInput), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const tid = getTenantIdFromProfessionalDocRef(d.ref);
            const pid = d.id;
            if (tid && pid) {
              setTenantId(String(tid));
              setProfessionalId(String(pid));

              // atualiza session para próximas vezes
              try {
                localStorage.setItem(
                  "agx_professional_session",
                  JSON.stringify({
                    ...session,
                    role: "professional",
                    tenantId: tid,
                    professionalId: pid,
                    updatedAt: Date.now(),
                  })
                );
              } catch {}
              return;
            }
          }
        } catch {
          // segue pro fallback legacy
        }
      }

      // 3) FALLBACK LEGACY: users_professionals/{uid} => { tenantId, professionalId }
      const ref = doc(db, "users_professionals", currentUid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // Sem esse mapeamento não dá pra garantir segregação por profissional.
        setTenantId("");
        setProfessionalId("");
        setSalonName("Acesso não configurado");
        setProfessionalName("Profissional");
        return;
      }

      const data = snap.data() as any;
      const tid = String(data?.tenantId ?? "");
      const pid = String(data?.professionalId ?? "");
      setTenantId(tid);
      setProfessionalId(pid);
    })();
  }, [authReady, currentUid, router]);

  // ===== Firestore subscriptions (tenant + professional + services + bookings) =====
  useEffect(() => {
    if (!tenantId || !professionalId) return;

    let alive = true;

    // Tenant
    const tenantRef = doc(db, "tenants", tenantId);
    const unsubTenant = onSnapshot(
      tenantRef,
      (snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          setSalonName("Salão não encontrado");
          return;
        }
        const data = snap.data() as any;
        setSalonName(String(data?.name ?? "Salão"));
        setTenantEmail(String(data?.adminEmail ?? data?.email ?? "—"));

        // tenta resolver slug (você pode ter salvo como slug, publicSlug, etc)
        const slugCandidate =
          String(data?.slug ?? "").trim() ||
          String(data?.publicSlug ?? "").trim() ||
          String(data?.tenantSlug ?? "").trim() ||
          "";
        setTenantSlug(slugCandidate);

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
            : []
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

    // Professional doc (para pausas/ausência)
    const proRef = doc(db, "tenants", tenantId, "professionals", professionalId);
    const unsubPro = onSnapshot(
      proRef,
      (snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          setProDoc(null);
          setProfessionalName("Profissional não encontrado");
          return;
        }
        const data = snap.data() as any;
        const pro: ProfessionalDoc = {
          name: String(data?.name ?? "Profissional"),
          active: Boolean(data?.active ?? true),
          workingDays: normalizeWorkingDays(data?.workingDays),
          absenceKind: (data?.absenceKind as any) ?? null,
          absenceStartAt: (data?.absenceStartAt as Timestamp | null | undefined) ?? null,
          absenceEndAt: (data?.absenceEndAt as Timestamp | null | undefined) ?? null,
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
        };
        setProDoc(pro);
        setProfessionalName(pro.name || "Profissional");
      },
      () => {
        if (!alive) return;
        setProDoc(null);
      }
    );

    // Services (para criar reserva)
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
    });

    // Bookings da semana (somente do profissional)
    const bookingsRef = collection(db, "tenants", tenantId, "bookings");
    const startTs = Timestamp.fromDate(weekStart);
    const endTs = Timestamp.fromDate(weekEnd);

    const bookingsWeekQ = query(
      bookingsRef,
      where("professionalId", "==", professionalId),
      where("startAt", ">=", startTs),
      where("startAt", "<", endTs),
      orderBy("startAt", "asc")
    );

    const unsubWeek = onSnapshot(bookingsWeekQ, (snap) => {
      if (!alive) return;
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setWeekBookings(docs);
    });

    // Bookings do mês (somente do profissional)
    const monthStartTs = Timestamp.fromDate(monthStart);
    const monthEndTs = Timestamp.fromDate(monthEnd);

    const bookingsMonthQ = query(
      bookingsRef,
      where("professionalId", "==", professionalId),
      where("startAt", ">=", monthStartTs),
      where("startAt", "<", monthEndTs),
      orderBy("startAt", "asc")
    );

    const unsubMonth = onSnapshot(bookingsMonthQ, (snap) => {
      if (!alive) return;
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMonthBookings(docs);
    });

    return () => {
      alive = false;
      unsubTenant();
      unsubPro();
      unsubServices();
      unsubWeek();
      unsubMonth();
    };
  }, [tenantId, professionalId, weekStart, weekEnd, monthStart, monthEnd]);

  // ===== helpers de disponibilidade (mesma lógica do admin, porém fixo no profissional) =====
  function getOpeningForDate(ymd: string) {
    if (!ymd) return null;
    const dayIndex = new Date(`${ymd}T00:00:00`).getDay();
    const hour = openingHours.find((h) => h.dayIndex === dayIndex) ?? null;
    if (!hour || !hour.active || !hour.start || !hour.end) return null;
    return hour;
  }

  function getDayBlockReason(ymd: string) {
    if (!ymd) return "Selecione uma data.";
    if (closedDates.some((c) => c.date === ymd)) return "Salão fechado nesta data.";
    const opening = getOpeningForDate(ymd);
    if (!opening) return "Salão fechado neste dia.";
    if (!proDoc) return "Profissional não encontrado.";

    const dayIndex = new Date(`${ymd}T00:00:00`).getDay();
    const workingDays = normalizeWorkingDays(proDoc.workingDays);
    if (!workingDays.includes(dayIndex)) return "Você não atende neste dia.";

    if (proDoc.absenceStartAt && proDoc.absenceEndAt) {
      const day = new Date(`${ymd}T00:00:00`).getTime();
      const start = new Date(`${toYMD(proDoc.absenceStartAt.toDate())}T00:00:00`).getTime();
      const end = new Date(`${toYMD(proDoc.absenceEndAt.toDate())}T00:00:00`).getTime();
      if (day >= start && day <= end) return "Você está em folga/férias.";
    }

    const hasAllDayClosed = (proDoc.closedRanges || []).some((r) => r.date === ymd && r.allDay);
    if (hasAllDayClosed) return "Você está com a agenda fechada neste dia.";

    return null;
  }

  function getClosedRangesForDay(ymd: string) {
    if (!proDoc || !ymd) return [];
    return (proDoc.closedRanges || []).filter((r) => r.date === ymd);
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

  function buildAvailableSlotsForDay(ymd: string, dayBookings: any[], durationMin: number) {
    const blockReason = getDayBlockReason(ymd);
    if (blockReason) return [];
    const opening = getOpeningForDate(ymd);
    if (!opening) return [];

    const dayStartMin = parseTimeToMinutes(opening.start);
    const dayEndMin = parseTimeToMinutes(opening.end);
    if (!Number.isFinite(dayStartMin) || !Number.isFinite(dayEndMin)) return [];

    const slotStep = 30;
    const closedRanges = getClosedRangesForDay(ymd);

    const items = (dayBookings || []).filter((b) => {
      if (String(b?.status ?? "") === "cancelled") return false;
      // se estiver editando uma reserva (reagendar), ignora ela mesma
      if (bookingSelectedId && b?.id === bookingSelectedId) return false;
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

  // ===== pausas ativas (para mostrar antes de "Agendamentos") =====
  const activePauses = useMemo(() => {
    const list = (proDoc?.closedRanges || []) as ClosedRange[];
    if (!list.length) return [];
    const now = new Date();
    const todayYmd = toYMD(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const isActive = (r: ClosedRange) => {
      const d = String(r?.date || "");
      if (!d) return false;
      if (d > todayYmd) return true;
      if (d < todayYmd) return false;
      // hoje:
      if (r.allDay) return true;
      const endMin = parseTimeToMinutes(String(r.end || ""));
      if (!Number.isFinite(endMin)) return true; // sem fim => considera ativo hoje
      return endMin > nowMin;
    };

    return [...list]
      .filter(isActive)
      .sort((a, b) => {
        const ad = String(a.date || "");
        const bd = String(b.date || "");
        if (ad !== bd) return ad.localeCompare(bd);
        const as = parseTimeToMinutes(String(a.start || "00:00"));
        const bs = parseTimeToMinutes(String(b.start || "00:00"));
        if (!Number.isFinite(as) && !Number.isFinite(bs)) return 0;
        if (!Number.isFinite(as)) return 1;
        if (!Number.isFinite(bs)) return -1;
        return as - bs;
      });
  }, [proDoc]);

  function pauseRangeLabel(r: ClosedRange) {
    const dateYmd = String(r?.date || "");
    const date = formatDMYFromYMD(dateYmd);
    const label = String(r?.label || "Pausa");
    if (r.allDay) return `${label} — ${date} (dia inteiro)`;
    const s = String(r?.start || "").trim();
    const e = String(r?.end || "").trim();
    if (s && e) return `${label} — ${date} (${s}–${e})`;
    if (s) return `${label} — ${date} (a partir de ${s})`;
    return `${label} — ${date}`;
  }

  async function cancelPause(rangeId: string) {
    if (!tenantId || !professionalId) return;
    const id = String(rangeId || "");
    if (!id) return;

    try {
      const proRef = doc(db, "tenants", tenantId, "professionals", professionalId);
      const current = (proDoc?.closedRanges || []) as ClosedRange[];
      const next = current.filter((r) => String(r?.id || "") !== id);
      await updateDoc(proRef, {
        closedRanges: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      alert(e?.message ?? "Erro ao cancelar a pausa.");
    }
  }

  // ===== montar lista do DIA selecionado (cards) =====
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

      const serviceName = String(b?.serviceName ?? b?.service ?? "Serviço");
      const customerName = String(b?.customerName ?? b?.customer ?? "Cliente");
      const customerPhone = String(b?.customerPhone ?? "");
      const serviceWithRange = endStr ? `${serviceName} (${startStr}–${endStr})` : serviceName;

      return {
        id: b.id,
        time: startStr,
        status: "busy",
        service: serviceWithRange,
        customer: customerName,
        customerPhone,
        color: idx % 2 === 0 ? "blue" : "emerald",
        bookingStatus: (String(b?.status ?? "confirmed") as any) ?? "confirmed",
      };
    });

    if (items.length === 0) {
      setWeeklyItems([
        { id: "free-09", time: "09:00", status: "free", color: "blue" },
        { id: "free-10", time: "10:00", status: "free", color: "emerald" },
        { id: "free-11", time: "11:00", status: "free", color: "blue" },
      ]);
    } else {
      const sorted = [...items].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setWeeklyItems(sorted);
    }
  }, [weekBookings, selectedDate]);

  // ===== booking modal open =====
  function openBookingModal(bookingId: string) {
    setBookingSelectedId(bookingId);
    setBookingModalOpen(true);
    setRescheduleOpen(false);
  }

  useEffect(() => {
    if (!bookingModalOpen) return;
    const startAt = selectedBooking?.startAt?.toDate ? selectedBooking.startAt.toDate() : null;
    if (!startAt) return;
    setRescheduleDate(toYMD(startAt));
    setRescheduleTime(formatHHMM(startAt));
  }, [bookingModalOpen, selectedBooking]);

  const rescheduleDurationMin = useMemo(() => {
    // tenta inferir do booking; senão, 30
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

  const rescheduleSlots = useMemo(() => {
    if (!rescheduleOpen || !rescheduleDate) return [];
    const dayBookings = getBookingsForDay(monthBookings, rescheduleDate);
    return buildAvailableSlotsForDay(rescheduleDate, dayBookings, rescheduleDurationMin);
  }, [rescheduleOpen, rescheduleDate, monthBookings, rescheduleDurationMin, bookingSelectedId, openingHours, closedDates, proDoc]);

  useEffect(() => {
    if (!rescheduleOpen || !rescheduleDate) return;
    if (rescheduleSlots.length === 0) return;
    if (!rescheduleSlots.includes(rescheduleTime)) {
      setRescheduleTime(rescheduleSlots[0]);
    }
  }, [rescheduleOpen, rescheduleDate, rescheduleSlots, rescheduleTime]);

  async function updateBookingStatus(nextStatus: "cancelled" | "completed") {
    if (!bookingSelectedId) return;
    try {
      const bookingRef = doc(db, "tenants", tenantId, "bookings", bookingSelectedId);
      await updateDoc(bookingRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(nextStatus === "completed" ? { completedAt: serverTimestamp() } : { cancelledAt: serverTimestamp() }),
      });
      setBookingModalOpen(false);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao atualizar o status do agendamento.");
    }
  }

  async function rescheduleBooking() {
    if (!bookingSelectedId) return;
    if (!rescheduleDate || !rescheduleTime) return alert("Informe a nova data e horário.");
    if (!selectedBooking) return;

    try {
      const blockReason = getDayBlockReason(rescheduleDate);
      if (blockReason) return alert(blockReason);

      if (rescheduleSlots.length > 0 && !rescheduleSlots.includes(rescheduleTime)) {
        return alert("Horário indisponível. Selecione um horário disponível.");
      }

      const bookingRef = doc(db, "tenants", tenantId, "bookings", bookingSelectedId);
      const newStart = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + (rescheduleDurationMin || 30));

      // double-check conflito (no mês)
      const dayBookings = getBookingsForDay(monthBookings, rescheduleDate).filter(
        (b) => b?.id !== bookingSelectedId && String(b?.status ?? "") !== "cancelled"
      );
      const conflict = dayBookings.some((b) => {
        const r = getBookingRange(b, rescheduleDurationMin);
        if (!r) return false;
        return overlaps(newStart, newEnd, r.start, r.end);
      });
      if (conflict) return alert("Conflito de agenda encontrado. Escolha outro horário.");

      await updateDoc(bookingRef, {
        startAt: Timestamp.fromDate(newStart),
        endAt: Timestamp.fromDate(newEnd),
        professionalId, // trava no profissional logado
        professionalName: professionalName,
        status: "confirmed",
        updatedAt: serverTimestamp(),
        rescheduledAt: serverTimestamp(),
      });

      setBookingModalOpen(false);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao reagendar a reserva.");
    }
  }

  // ===== criar reserva (mantido, mas não é mais o fluxo principal do botão) =====
  const selectedCreateService = useMemo(() => servicesForPro.find((s) => s.id === createServiceId) ?? null, [servicesForPro, createServiceId]);

  const createSlots = useMemo(() => {
    if (!createBookingOpen || !createDate || !selectedCreateService) return [];
    const duration = Number(selectedCreateService.durationMin ?? 30) || 30;
    const dayBookings = getBookingsForDay(monthBookings, createDate);
    return buildAvailableSlotsForDay(createDate, dayBookings, duration);
  }, [createBookingOpen, createDate, selectedCreateService, monthBookings, openingHours, closedDates, proDoc]);

  useEffect(() => {
    if (!createBookingOpen) return;
    if (!createDate) return;
    if (!selectedCreateService) return;
    if (createSlots.length === 0) return;
    if (!createSlots.includes(createTime)) setCreateTime(createSlots[0]);
  }, [createBookingOpen, createDate, selectedCreateService, createSlots, createTime]);

  async function createBookingNow() {
    if (!tenantId || !professionalId) return;
    if (!createDate) return alert("Selecione a data.");
    if (!createTime) return alert("Selecione o horário.");
    if (!selectedCreateService) return alert("Selecione o serviço.");
    const customerName = createCustomerName.trim();
    const customerPhone = String(createCustomerPhone || "").replace(/\D/g, "");

    if (!customerName) return alert("Informe o nome do cliente.");
    if (!customerPhone) return alert("Informe o WhatsApp do cliente (com DDD).");

    const blockReason = getDayBlockReason(createDate);
    if (blockReason) return alert(blockReason);

    const durationMin = Number(selectedCreateService.durationMin ?? 30) || 30;
    const slots = createSlots;
    if (slots.length > 0 && !slots.includes(createTime)) {
      return alert("Horário indisponível. Selecione um horário disponível.");
    }

    const start = new Date(`${createDate}T${createTime}:00`);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + durationMin);

    // conflito extra
    const dayBookings = getBookingsForDay(monthBookings, createDate).filter((b) => String(b?.status ?? "") !== "cancelled");
    const conflict = dayBookings.some((b) => {
      const r = getBookingRange(b, durationMin);
      if (!r) return false;
      return overlaps(start, end, r.start, r.end);
    });
    if (conflict) return alert("Conflito de agenda encontrado. Escolha outro horário.");

    try {
      await addDoc(collection(db, "tenants", tenantId, "bookings"), {
        startAt: Timestamp.fromDate(start),
        endAt: Timestamp.fromDate(end),
        durationMin,
        status: "confirmed",
        professionalId,
        professionalName: professionalName,
        serviceId: selectedCreateService.id,
        serviceName: selectedCreateService.name,
        servicePrice: Number(selectedCreateService.price ?? 0) || 0,
        customerName,
        customerPhone: customerPhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "professional",
        createdByUid: currentUid,
      });

      setCreateBookingOpen(false);
      setCreateDate("");
      setCreateTime("");
      setCreateCustomerName("");
      setCreateCustomerPhone("");
      setCreateServiceId("");
    } catch (e: any) {
      alert(e?.message ?? "Erro ao criar reserva.");
    }
  }

  // ===== pausa =====
  async function addPause() {
    if (!tenantId || !professionalId) return;
    if (!pauseDate) return alert("Selecione a data da pausa.");
    if (!pauseAllDay) {
      if (!pauseStart || !pauseEnd) return alert("Informe o horário de início e fim da pausa.");
      const s = parseTimeToMinutes(pauseStart);
      const e = parseTimeToMinutes(pauseEnd);
      if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return alert("Intervalo de pausa inválido.");
    }

    try {
      const proRef = doc(db, "tenants", tenantId, "professionals", professionalId);
      const current = (proDoc?.closedRanges || []) as ClosedRange[];

      const newRange: ClosedRange = {
        id: `${pauseDate}-${Date.now()}`,
        date: pauseDate,
        start: pauseAllDay ? "" : pauseStart,
        end: pauseAllDay ? "" : pauseEnd,
        label: (pauseLabel || "Pausa").trim(),
        allDay: pauseAllDay,
      };

      const next = [...current, newRange];

      await updateDoc(proRef, {
        closedRanges: next,
        updatedAt: serverTimestamp(),
      });

      setPauseOpen(false);
      setPauseDate("");
      setPauseAllDay(false);
      setPauseStart("09:00");
      setPauseEnd("12:00");
      setPauseLabel("Pausa");
    } catch (e: any) {
      alert(e?.message ?? "Erro ao salvar pausa.");
    }
  }

  async function handleSignOut() {
    try {
      // remove sessão do profissional (para não reaproveitar indevidamente)
      try {
        localStorage.removeItem("agx_professional_session");
      } catch {}
      await signOut(auth);
    } finally {
      router.replace("/admin/login");
    }
  }

  // ===== Guards =====
  if (!authReady) return <div className="bg-slate-50 text-slate-900 min-h-screen" />;

  if (!currentUid) {
    return <div className="bg-slate-50 text-slate-900 min-h-screen" />;
  }

  if (!tenantId || !professionalId) {
    return (
      <div className="bg-background-light text-slate-900 min-h-screen">
        <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md border-b border-slate-200">
          <div className="relative flex items-center justify-between p-4">
            <div className="flex flex-col">
              <h2 className="text-[#0d141b] text-lg font-bold leading-tight tracking-tight">Agendixx</h2>
              <p className="text-xs text-slate-500">Acesso do profissional não configurado</p>
            </div>

            <img src="/logo-axk.png" alt="Agendixx" className="absolute left-1/2 -translate-x-1/2 h-8 w-auto object-contain" />

            <button
              type="button"
              onClick={handleSignOut}
              className="text-red-500 text-sm font-semibold flex items-center gap-1 active:opacity-60 transition-opacity"
            >
              Sair
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        </header>

        <main className="max-w-md mx-auto pb-24 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5">
            <p className="text-sm font-extrabold text-slate-900">Seu usuário ainda não está vinculado a um profissional.</p>
            <p className="text-xs text-slate-500 mt-2">
              Crie o doc <span className="font-mono">users_professionals/{currentUid}</span> com{" "}
              <span className="font-mono">tenantId</span> e <span className="font-mono">professionalId</span>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ===== Render =====
  return (
    <div className="bg-background-light text-slate-900 min-h-screen">
      <header className="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md border-b border-slate-200">
        <div className="relative flex items-center justify-between p-4">
          <div className="flex flex-col">
            <h2 className="text-[#0d141b] text-lg font-bold leading-tight tracking-tight">{salonName}</h2>
            <p className="text-xs text-slate-500">{tenantEmail}</p>
          </div>

          <img src="/logo-axk.png" alt="Agendixx" className="absolute left-1/2 -translate-x-1/2 h-8 w-auto object-contain" />

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
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex flex-col">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profissional</p>
              <p className="text-sm font-extrabold text-slate-900">{professionalName}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // abre a tela do CLIENTE (mesma UI/regras) dentro de um modal
                  if (!tenantSlug) {
                    alert("Este salão ainda não possui slug configurado no tenant para abrir a tela do cliente.");
                    return;
                  }
                  setClientBookingOpen(true);
                }}
                className="h-10 px-3 rounded-xl bg-primary text-white text-xs font-extrabold flex items-center gap-2 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Nova reserva
              </button>

              <button
                type="button"
                onClick={() => {
                  setPauseOpen(true);
                  setPauseDate(toYMD(selectedDate));
                }}
                className="h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-extrabold flex items-center gap-2 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-base">pause_circle</span>
                Pausa
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto pb-24">
        {/* Pausas ativas (antes de Agendamentos) */}
        {activePauses.length > 0 ? (
          <section className="p-4">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pausas ativas</p>
                  <p className="text-sm font-extrabold text-slate-900">Agenda bloqueada</p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                  <span className="material-symbols-outlined">pause_circle</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {activePauses.map((r) => (
                  <div
                    key={String(r.id)}
                    className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex flex-col">
                      <p className="text-xs font-extrabold text-slate-900">{pauseRangeLabel(r)}</p>
                      <p className="text-[11px] font-semibold text-slate-500 mt-1">
                        {r.allDay ? "Bloqueio do dia inteiro." : "Bloqueio de horário na agenda."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("Deseja cancelar esta pausa?");
                        if (!ok) return;
                        cancelPause(String(r.id));
                      }}
                      className="shrink-0 h-9 px-3 rounded-xl bg-rose-600 text-white text-[11px] font-extrabold flex items-center gap-1 active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="h-8 bg-slate-100/50 my-6 border-y border-slate-200 flex items-center justify-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Agendamentos</span>
        </div>

        {/* Header mês + navegação */}
        <section className="p-4 space-y-4" id="appointments-view">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-900 text-lg font-bold">{monthLabel}</h3>

            <div className="flex gap-2">
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

              <button
                type="button"
                onClick={() => setViewMode((v) => (v === "week" ? "month" : "week"))}
                className="h-8 px-3 rounded-full bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">{viewMode === "week" ? "calendar_month" : "view_week"}</span>
                {viewMode === "week" ? "Mês" : "Semana"}
              </button>
            </div>
          </div>

          {/* Barra de dias da semana (selecionável) */}
          {viewMode === "week" ? (
            <div className="flex items-center justify-between gap-2">
              {weekDays.map((d) => (
                <button
                  key={d.ymd}
                  type="button"
                  onClick={() => setSelectedDayIndex(d.index)}
                  className={[
                    "flex-1 h-12 rounded-2xl border flex flex-col items-center justify-center transition-all active:scale-[0.98]",
                    d.active ? "border-primary bg-primary/5" : "border-slate-200 bg-white",
                  ].join(" ")}
                >
                  <span className={["text-sm font-extrabold", d.active ? "text-primary" : "text-slate-700"].join(" ")}>{d.day}</span>
                  <span className={["text-[9px] font-bold uppercase", d.active ? "text-primary/70" : "text-slate-400"].join(" ")}>
                    {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][d.index]}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-100 text-center">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
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

          {/* Lista do dia selecionado */}
          <div className="space-y-3">
            {weeklyItems.map((item) => (
              <div key={item.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                {item.status === "busy" ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={[
                            "h-10 w-10 rounded-2xl flex items-center justify-center",
                            item.color === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600",
                          ].join(" ")}
                        >
                          <span className="material-symbols-outlined">event</span>
                        </div>

                        <div className="flex flex-col">
                          <p className="text-sm font-extrabold text-slate-900">{item.customer}</p>
                          {item.customerPhone ? <p className="text-[11px] text-slate-400">WhatsApp: {formatPhoneBR(item.customerPhone)}</p> : null}
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
                        <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-500">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          <span>{firstName(professionalName)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-3 mt-3 border-t border-slate-50">
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
        </section>

        {/* Modal: Tela do CLIENTE (BookingClientPage.tsx via rota /s/[slug]) */}
        <ModalShell open={clientBookingOpen} title="Nova reserva" onClose={() => setClientBookingOpen(false)} bodyClassName="mt-5 overflow-y-hidden pr-0">
          {!tenantSlug ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-extrabold text-slate-900">Slug do salão não encontrado.</p>
              <p className="text-xs text-slate-500 mt-2">
                Configure um campo <span className="font-mono">slug</span> (ou <span className="font-mono">publicSlug</span>) no doc{" "}
                <span className="font-mono">tenants/{tenantId}</span>.
              </p>
            </div>
          ) : (
            <div className="w-full flex-1">
              <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white">
                <iframe
                  title="Tela do cliente - Nova reserva"
                  src={clientBookingUrl}
                  className="w-full"
                  style={{ height: "72vh", border: "0" }}
                />
              </div>
            </div>
          )}
        </ModalShell>

        {/* Modal Atualizar Reserva */}
        <ModalShell open={bookingModalOpen} title="Atualizar Reserva" subtitle="Selecione a ação para esta reserva." onClose={() => setBookingModalOpen(false)}>
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo</p>
              <p className="text-sm font-extrabold text-slate-900 mt-1">{String(selectedBooking?.serviceName ?? selectedBooking?.service ?? "Serviço")}</p>
              <p className="text-[11px] font-semibold text-slate-500">{String(selectedBooking?.customerName ?? selectedBooking?.customer ?? "Cliente")}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-[16px] text-slate-400">person</span>
                <span className="text-[10px] font-bold text-slate-500">{firstName(professionalName)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                <span className="text-[10px] font-bold text-slate-500">
                  {selectedBooking?.startAt?.toDate ? formatHHMM(selectedBooking.startAt.toDate()) : "Horário não disponível"}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[9px] font-bold uppercase text-slate-400">Status atual</span>
                <p className="text-[11px] font-extrabold text-slate-700">{bookingStatusLabel(selectedBookingStatus)}</p>
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
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</label>
                    <input
                      type="date"
                      className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horário</label>
                    {rescheduleSlots.length > 0 ? (
                      <select
                        className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                      >
                        {rescheduleSlots.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400 outline-none"
                        value="Sem horários disponíveis"
                        readOnly
                      />
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={rescheduleBooking}
                  disabled={rescheduleSlots.length === 0}
                  className={[
                    "w-full h-12 rounded-2xl font-extrabold text-sm shadow-xl active:scale-[0.99] transition-all",
                    rescheduleSlots.length === 0 ? "bg-slate-100 text-slate-300" : "bg-primary text-white shadow-primary/20",
                  ].join(" ")}
                >
                  Confirmar reagendamento
                </button>

                {(() => {
                  const reason = getDayBlockReason(rescheduleDate);
                  if (!reason) return null;
                  return <p className="text-[11px] font-semibold text-rose-500">{reason}</p>;
                })()}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateBookingStatus("completed")}
                disabled={selectedBookingStatus !== "confirmed"}
                className={[
                  "h-12 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all",
                  selectedBookingStatus !== "confirmed" ? "bg-slate-100 text-slate-300" : "bg-emerald-600 text-white shadow-xl shadow-emerald-200",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-[20px]">done_all</span>
                Finalizar
              </button>

              <button
                type="button"
                onClick={() => updateBookingStatus("cancelled")}
                disabled={selectedBookingStatus !== "confirmed"}
                className={[
                  "h-12 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all",
                  selectedBookingStatus !== "confirmed" ? "bg-slate-100 text-slate-300" : "bg-rose-600 text-white shadow-xl shadow-rose-200",
                ].join(" ")}
              >
                <span className="material-symbols-outlined text-[20px]">cancel</span>
                Cancelar
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const phone = String(selectedBooking?.customerPhone ?? "").replace(/\D/g, "");
                if (!phone) return alert("WhatsApp do cliente não informado.");
                window.open(`https://wa.me/55${phone}`, "_blank");
              }}
              className="w-full h-12 rounded-2xl bg-primary text-white font-extrabold text-sm shadow-xl shadow-primary/20 active:scale-[0.99]"
            >
              Abrir WhatsApp do cliente
            </button>
          </div>
        </ModalShell>

        {/* Modal Criar Reserva (mantido) */}
        <ModalShell open={createBookingOpen} title="Nova reserva" subtitle="Criar reserva em nome do cliente." onClose={() => setCreateBookingOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</label>
                <input
                  type="date"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Serviço</label>
                <select
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={createServiceId}
                  onChange={(e) => setCreateServiceId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {servicesForPro.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMin}min)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horário</label>
                {selectedCreateService && createSlots.length > 0 ? (
                  <select
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                  >
                    {createSlots.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400 outline-none"
                    value={selectedCreateService ? "Sem horários" : "Selecione um serviço"}
                    readOnly
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WhatsApp</label>
                <input
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                  value={createCustomerPhone}
                  onChange={(e) => setCreateCustomerPhone(formatPhoneBR(e.target.value))}
                  placeholder="(21) 99999-9999"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome do cliente</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={createCustomerName}
                onChange={(e) => setCreateCustomerName(e.target.value)}
                placeholder="Ex: Maria Silva"
              />
            </div>

            {(() => {
              const reason = getDayBlockReason(createDate);
              if (!reason) return null;
              return <p className="text-[11px] font-semibold text-rose-500">{reason}</p>;
            })()}

            <button
              type="button"
              onClick={createBookingNow}
              className="w-full h-12 rounded-2xl bg-primary text-white font-extrabold text-sm shadow-xl shadow-primary/20 active:scale-[0.99]"
            >
              Confirmar reserva
            </button>
          </div>
        </ModalShell>

        {/* Modal Pausa */}
        <ModalShell open={pauseOpen} title="Pausa na agenda" subtitle="Bloqueie um período para não receber reservas." onClose={() => setPauseOpen(false)}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</label>
              <input
                type="date"
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={pauseDate}
                onChange={(e) => setPauseDate(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => setPauseAllDay((v) => !v)}
              className={[
                "w-full h-12 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-between transition-all active:scale-[0.99]",
                pauseAllDay ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700",
              ].join(" ")}
            >
              {pauseAllDay ? "Dia inteiro" : "Horário definido"}
              <span className="material-symbols-outlined text-[20px]">{pauseAllDay ? "toggle_on" : "toggle_off"}</span>
            </button>

            {!pauseAllDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Início</label>
                  <input
                    type="time"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={pauseStart}
                    onChange={(e) => setPauseStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fim</label>
                  <input
                    type="time"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    value={pauseEnd}
                    onChange={(e) => setPauseEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Motivo (opcional)</label>
              <input
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                value={pauseLabel}
                onChange={(e) => setPauseLabel(e.target.value)}
                placeholder="Ex: Almoço / Atendimento externo"
              />
            </div>

            <button
              type="button"
              onClick={addPause}
              className="w-full h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
            >
              Salvar pausa
            </button>
          </div>
        </ModalShell>
      </main>
    </div>
  );
}
