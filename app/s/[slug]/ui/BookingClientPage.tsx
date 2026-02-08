"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  serverTimestamp,
  orderBy,
  limit,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  icon: string; // material symbols
};

type Professional = {
  id: string;
  name: string;
  avatarUrl: string;
};

type TimeSlot = {
  time: string;
  available: boolean;
};

type ProCalendar = {
  // 0=Dom..6=Sáb (compatível com Date.getDay())
  workingDays: number[];
  // datas específicas de folga (YYYY-MM-DD)
  offDates: string[];
  // períodos de férias (YYYY-MM-DD)
  vacations: { start: string; end: string }[];
  // (opcional) horário/slot
  dayStart: string; // "09:00"
  dayEnd: string; // "18:00"
  slotMin: number; // 30

  // ausências (datetime) vindas do Firestore (absenceStartAt/absenceEndAt)
  absences: { startAt: Date; endAt: Date }[];

  // (opcional) slots explícitos vindos do banco (sem mock)
  availableSlots?: string[];
};

type ModalVariant = "info" | "error" | "success";
type ModalPosition = "bottom" | "center";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseTimeToMinutes(t: string) {
  // "HH:MM"
  const [hh, mm] = (t || "").split(":").map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function minutesToTime(min: number) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function combineYMDTimeToDate(ymd: string, time: string) {
  // local time
  const d = new Date(`${ymd}T${time}:00`);
  return d;
}

function inRangeInclusive(ymd: string, start: string, end: string) {
  // YYYY-MM-DD lexicographic works for date comparisons in same format
  return ymd >= start && ymd <= end;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function dateValueAtStartOfDay(ymd: string) {
  return new Date(`${ymd}T00:00:00`);
}

/**
 * ✅ Normaliza ausência quando o Firestore salva start/end iguais (ex.: 04/02/2026 00:00 -> 04/02/2026 00:00)
 * Isso é interpretado como "o dia todo" e precisa bloquear a data.
 */
function normalizeAbsenceRange(startAt: Date, endAt: Date) {
  const s = new Date(startAt);
  const e = new Date(endAt);

  // se end <= start, assume ausência do DIA TODO (até 23:59:59.999)
  if (e.getTime() <= s.getTime()) {
    const endOfDay = new Date(s);
    endOfDay.setHours(23, 59, 59, 999);
    return { startAt: s, endAt: endOfDay };
  }

  return { startAt: s, endAt: e };
}

function isDayWithinAbsences(cal: ProCalendar | null, ymd: string) {
  if (!cal) return false;
  if (!Array.isArray(cal.absences) || cal.absences.length === 0) return false;

  const dayStart = new Date(`${ymd}T00:00:00`);
  const dayEnd = new Date(`${ymd}T23:59:59.999`);

  // ✅ se qualquer ausência tocar o dia, bloqueia
  return cal.absences.some((a) => overlaps(dayStart, dayEnd, a.startAt, a.endAt));
}

function isDayAllowedGivenCal(cal: ProCalendar | null, ymd: string) {
  if (!cal) return false; // enquanto não carrega, bloqueia seleção
  const dt = dateValueAtStartOfDay(ymd);
  const dow = dt.getDay(); // 0..6

  if (Array.isArray(cal.workingDays) && cal.workingDays.length > 0) {
    if (!cal.workingDays.includes(dow)) return false;
  }

  if (Array.isArray(cal.offDates) && cal.offDates.includes(ymd)) return false;

  if (Array.isArray(cal.vacations) && cal.vacations.length > 0) {
    for (const v of cal.vacations) {
      if (v?.start && v?.end && inRangeInclusive(ymd, v.start, v.end)) return false;
    }
  }

  // ✅ ausências por intervalo (absenceStartAt/absenceEndAt)
  if (isDayWithinAbsences(cal, ymd)) return false;

  return true;
}

function coerceToDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate(); // Timestamp
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function monthStart(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextMonthStart(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysInMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function salonInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ✅ iniciais do profissional (fallback do avatar)
function professionalInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function BookingClientPage({ slug }: { slug?: string }) {
  // ✅ fallback: se prop slug vier vazio, pega da URL (useParams)
  const params = useParams<{ slug?: string | string[] }>();
  const slugFromUrl = Array.isArray(params?.slug) ? params?.slug?.[0] : params?.slug;

  const rawSlug = (slug ?? slugFromUrl ?? "").toString();
  const safeSlug = rawSlug.trim().toLowerCase();

  // ===== Dados reais (Firestore) =====
  const [salonName, setSalonName] = useState<string>("Carregando...");
  const publicLink = `agendix.me/${safeSlug}`;

  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ===== Calendário real =====
  const [proCalendar, setProCalendar] = useState<ProCalendar | null>(null);
  const [proBookings, setProBookings] = useState<
    { startAt: Timestamp; endAt?: Timestamp | null; durationMin?: number; professionalId?: string }[]
  >([]);
  const [loadingCalendar, setLoadingCalendar] = useState<boolean>(false);

  // ===== Modal (popup próprio) =====
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>("Aviso");
  const [modalMessage, setModalMessage] = useState<string>("");
  const [modalVariant, setModalVariant] = useState<ModalVariant>("info");
  const [modalPosition, setModalPosition] = useState<ModalPosition>("bottom");

  function openModal(
    title: string,
    message: string,
    variant: ModalVariant = "info",
    position: ModalPosition = "bottom"
  ) {
    setModalTitle(title);
    setModalMessage(message);
    setModalVariant(variant);
    setModalPosition(position);
    setModalOpen(true);
  }

  // ===== Modal seleção de mês/dia =====
  const [datePickerOpen, setDatePickerOpen] = useState<boolean>(false);
  const [datePickerStep, setDatePickerStep] = useState<"month" | "day">("month");
  const [datePickerMonth, setDatePickerMonth] = useState<number>(() => new Date().getMonth()); // 0..11
  const [datePickerYear] = useState<number>(() => new Date().getFullYear());

  // ===== Estado (mantém funcionalidades do template) =====
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");

  // Agora o "dia" é uma data real (YYYY-MM-DD)
  const [selectedDay, setSelectedDay] = useState<string>(() => toYMD(new Date()));
  // ✅ remove "mock" do horário inicial: só define quando vier do cálculo do banco (calendário+bookings)
  const [selectedTime, setSelectedTime] = useState<string>("");

  // ✅ recorrência começa DESLIGADA
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringOption, setRecurringOption] = useState<"weekly" | "biweekly" | "monthly">("weekly");

  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  // Cupom: começa vazio e NÃO aplicado
  const [couponCode, setCouponCode] = useState<string>("");
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [couponPercent, setCouponPercent] = useState<number>(0);
  const [appliedCouponDocId, setAppliedCouponDocId] = useState<string | null>(null);

  // força reload de agenda/slots após reservar
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const selectedDayDate = useMemo(() => new Date(`${selectedDay}T00:00:00`), [selectedDay]);

  // ===== Label do mês (vira botão) =====
  const monthLabel = useMemo(() => {
    return selectedDayDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  }, [selectedDayDate]);

  function openDatePicker() {
    const d = selectedDayDate;
    setDatePickerMonth(d.getMonth());
    setDatePickerStep("month");
    setDatePickerOpen(true);
  }

  // ===== Dias scrolláveis (acesso aos demais dias) =====
  // gera 120 dias a partir de HOJE (permite "correr para o lado")
  const days = useMemo(() => {
    const base = startOfDay(new Date());
    const list: { dow: string; day: string; ymd: string }[] = [];
    const dowNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    for (let i = 0; i < 120; i++) {
      const d = addDays(base, i);
      list.push({
        dow: dowNames[d.getDay()],
        day: pad2(d.getDate()),
        ymd: toYMD(d),
      });
    }
    return list;
  }, []);

  // ===== Helpers de bloqueio (folga/férias/dias de trabalho) =====
  const isDayAllowedForPro = useMemo(() => {
    return (ymd: string) => isDayAllowedGivenCal(proCalendar, ymd);
  }, [proCalendar]);

  // ===== Slots reais do dia selecionado (lidos do banco via regras: calendário + bookings) =====
  const slotsByDay: Record<string, TimeSlot[]> = useMemo(() => {
    const ymd = selectedDay;
    if (!ymd) return {};
    if (!proCalendar) return { [ymd]: [] };
    if (!isDayAllowedForPro(ymd)) return { [ymd]: [] };

    const cal = proCalendar;

    const service = services.find((s) => s.id === selectedServiceId);
    const durationMin = Number(service?.durationMin ?? 30) || 30;

    const bookingsForDay = proBookings
      .map((b) => {
        // (defesa) garante que só pega bookings do profissional selecionado
        if (b?.professionalId && b.professionalId !== selectedProfessionalId) return null;

        const s = b.startAt?.toDate ? b.startAt.toDate() : null;
        if (!s) return null;

        let e: Date | null = null;
        if (b.endAt && (b.endAt as any).toDate) {
          e = (b.endAt as any).toDate();
        } else {
          const dur = Number(b.durationMin ?? durationMin) || durationMin;
          e = new Date(s);
          e.setMinutes(e.getMinutes() + dur);
        }

        const y = toYMD(s);
        if (y !== ymd) return null;
        return { start: s, end: e };
      })
      .filter(Boolean) as { start: Date; end: Date }[];

    // ✅ Se o banco tiver slots explícitos, usa eles (sem mock)
    const explicitSlots =
      Array.isArray(cal.availableSlots) && cal.availableSlots.length > 0
        ? cal.availableSlots.map((t) => String(t)).filter(Boolean)
        : null;

    const slots: TimeSlot[] = [];

    if (explicitSlots) {
      for (const t of explicitSlots) {
        const slotStart = combineYMDTimeToDate(ymd, t);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + durationMin);

        const conflict = bookingsForDay.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        slots.push({ time: t, available: !conflict });
      }
      return { [ymd]: slots };
    }

    // ✅ Caso contrário, deriva dos campos dayStart/dayEnd/slotMin do banco (professionals doc)
    const dayStart = cal?.dayStart ?? "09:00";
    const dayEnd = cal?.dayEnd ?? "18:00";
    const slotMin = Number(cal?.slotMin ?? 30) || 30;

    const startMin = parseTimeToMinutes(dayStart);
    const endMin = parseTimeToMinutes(dayEnd);

    for (let m = startMin; m + durationMin <= endMin; m += slotMin) {
      const t = minutesToTime(m);
      const slotStart = combineYMDTimeToDate(ymd, t);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMin);

      const conflict = bookingsForDay.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
      slots.push({ time: t, available: !conflict });
    }

    return { [ymd]: slots };
  }, [
    selectedDay,
    proCalendar,
    proBookings,
    services,
    selectedServiceId,
    isDayAllowedForPro,
    selectedProfessionalId,
  ]);

  // ===== Carregar Firestore =====
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!safeSlug) {
        setSalonName("Carregando...");
        setServices([]);
        setProfessionals([]);
        setLoadError("Slug inválido.");
        setLoadingData(false);
        return;
      }

      try {
        setLoadingData(true);
        setLoadError(null);

        // 1) Tenant (doc principal)
        const tenantRef = doc(db, "tenants", safeSlug);
        const tenantSnap = await getDoc(tenantRef);

        if (!tenantSnap.exists()) {
          throw new Error(`Não encontrei o tenant "${safeSlug}" em /tenants.`);
        }

        const tenantData = tenantSnap.data() as any;
        const tenantName = String(tenantData?.name ?? "Salão");

        // 2) Services (subcoleção)
        const servicesRef = collection(db, "tenants", safeSlug, "services");
        const servicesQ = query(servicesRef, where("active", "==", true));
        const servicesSnap = await getDocs(servicesQ);

        const loadedServices: Service[] = servicesSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data?.name ?? ""),
            durationMin: Number(data?.durationMin ?? 0),
            price: Number(data?.price ?? 0),
            icon: String(data?.icon ?? "content_cut"),
          };
        });

        // 3) Professionals (subcoleção)
        const prosRef = collection(db, "tenants", safeSlug, "professionals");
        const prosQ = query(prosRef, where("active", "==", true));
        const prosSnap = await getDocs(prosQ);

        const loadedPros: Professional[] = prosSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data?.name ?? ""),
            avatarUrl: String(data?.avatarUrl ?? ""),
          };
        });

        if (!alive) return;

        setSalonName(tenantName);
        setServices(loadedServices);
        setProfessionals(loadedPros);

        // Defaults
        setSelectedServiceId((prev) => {
          if (prev && loadedServices.some((s) => s.id === prev)) return prev;
          return loadedServices[0]?.id ?? "";
        });

        setSelectedProfessionalId((prev) => {
          if (prev && loadedPros.some((p) => p.id === prev)) return prev;
          return loadedPros[0]?.id ?? "";
        });

        setSelectedDay((prev) => (prev ? prev : toYMD(new Date())));
      } catch (err: any) {
        if (!alive) return;
        setLoadError(err?.message ?? "Erro ao carregar dados do Firestore.");
      } finally {
        if (!alive) return;
        setLoadingData(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [safeSlug]);

  // ===== Carregar calendário do profissional + bookings no RANGE DO MÊS do selectedDay =====
  useEffect(() => {
    let alive = true;

    async function loadCalendarAndBookings() {
      if (!safeSlug || !selectedProfessionalId) {
        setProCalendar(null);
        setProBookings([]);
        return;
      }

      try {
        setLoadingCalendar(true);

        const proRef = doc(db, "tenants", safeSlug, "professionals", selectedProfessionalId);
        const proSnap = await getDoc(proRef);
        const data = proSnap.exists() ? (proSnap.data() as any) : {};

        const workingDaysRaw =
          (Array.isArray(data?.workingDays) ? data.workingDays : null) ??
          (Array.isArray(data?.calendarWorkingDays) ? data.calendarWorkingDays : null) ??
          [];

        const offDatesRaw =
          (Array.isArray(data?.offDates) ? data.offDates : null) ??
          (Array.isArray(data?.calendarOffDates) ? data.calendarOffDates : null) ??
          [];

        const vacationsRaw =
          (Array.isArray(data?.vacations) ? data.vacations : null) ??
          (data?.vacationStart && data?.vacationEnd
            ? [{ start: String(data.vacationStart), end: String(data.vacationEnd) }]
            : []);

        // ✅ ausências com fields absenceStartAt/absenceEndAt
        const absencesRaw: any[] = Array.isArray(data?.absences) ? data.absences : [];
        const oneAbsenceStart = data?.absenceStartAt ?? null;
        const oneAbsenceEnd = data?.absenceEndAt ?? null;

        const absencesFromArray = absencesRaw
          .map((a) => {
            const s = coerceToDate(a?.absenceStartAt ?? a?.startAt ?? a?.start ?? a?.from);
            const e = coerceToDate(a?.absenceEndAt ?? a?.endAt ?? a?.end ?? a?.to);
            if (!s || !e) return null;
            return normalizeAbsenceRange(s, e);
          })
          .filter(Boolean) as { startAt: Date; endAt: Date }[];

        const absencesFromSingle =
          oneAbsenceStart && oneAbsenceEnd
            ? (() => {
                const s = coerceToDate(oneAbsenceStart);
                const e = coerceToDate(oneAbsenceEnd);
                if (!s || !e) return [];
                return [normalizeAbsenceRange(s, e)];
              })()
            : [];

        // ✅ slots explícitos (opcional) vindos do banco
        const availableSlotsRaw = Array.isArray(data?.availableSlots) ? data.availableSlots : null;

        const cal: ProCalendar = {
          workingDays: (workingDaysRaw as any[]).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
          offDates: (offDatesRaw as any[]).map((s) => String(s)).filter(Boolean),
          vacations: (vacationsRaw as any[])
            .map((v) => ({ start: String(v?.start ?? ""), end: String(v?.end ?? "") }))
            .filter((v) => v.start && v.end),
          dayStart: String(data?.dayStart ?? data?.calendarDayStart ?? "09:00"),
          dayEnd: String(data?.dayEnd ?? data?.calendarDayEnd ?? "18:00"),
          slotMin: Number(data?.slotMin ?? data?.calendarSlotMin ?? 30) || 30,
          absences: [...absencesFromArray, ...absencesFromSingle],
          availableSlots: availableSlotsRaw ? availableSlotsRaw.map((t: any) => String(t)) : undefined,
        };

        // ✅ range = mês do selectedDay (permite meses futuros via modal)
        const base = startOfDay(new Date(`${selectedDay}T00:00:00`));
        const rangeStart = monthStart(base);
        const rangeEnd = nextMonthStart(base);

        // ✅ para evitar índice composto (professionalId + startAt):
        // busca por período (startAt) e filtra no client por professionalId
        const bookingsRef = collection(db, "tenants", safeSlug, "bookings");
        const bookingsQ = query(
          bookingsRef,
          where("startAt", ">=", Timestamp.fromDate(rangeStart)),
          where("startAt", "<", Timestamp.fromDate(rangeEnd)),
          orderBy("startAt", "asc")
        );

        const bSnap = await getDocs(bookingsQ);
        const loadedBookings = bSnap.docs
          .map((d) => {
            const b = d.data() as any;
            return {
              startAt: b?.startAt as Timestamp,
              endAt: (b?.endAt as Timestamp | null | undefined) ?? null,
              durationMin: Number(b?.durationMin ?? 0) || undefined,
              professionalId: String(b?.professionalId ?? ""),
            };
          })
          .filter((b) => b?.startAt && b?.professionalId === selectedProfessionalId);

        if (!alive) return;

        setProCalendar(cal);
        setProBookings(loadedBookings);

        // ✅ Garantir que um dia de folga/férias/ausência NUNCA fique selecionado
        setSelectedDay((prev) => {
          const current = prev || toYMD(new Date());
          if (isDayAllowedGivenCal(cal, current)) return current;

          // procura dentro do mês atual do selectedDay
          const cur = new Date(`${current}T00:00:00`);
          const y = cur.getFullYear();
          const m = cur.getMonth();
          const max = daysInMonth(y, m);

          for (let day = 1; day <= max; day++) {
            const candidate = toYMD(new Date(y, m, day));
            if (isDayAllowedGivenCal(cal, candidate)) return candidate;
          }

          return current;
        });
      } catch {
        if (!alive) return;
        setProCalendar(null);
        setProBookings([]);
      } finally {
        if (!alive) return;
        setLoadingCalendar(false);
      }
    }

    loadCalendarAndBookings();
    return () => {
      alive = false;
    };
  }, [safeSlug, selectedProfessionalId, selectedDay, refreshKey]);

  // ✅ Se selectedDay ficar inválido após carregar agenda, ajusta para o próximo válido (dentro do mês atual)
  useEffect(() => {
    if (!proCalendar) return;
    if (isDayAllowedGivenCal(proCalendar, selectedDay)) return;

    const cur = new Date(`${selectedDay}T00:00:00`);
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const max = daysInMonth(y, m);

    for (let day = 1; day <= max; day++) {
      const candidate = toYMD(new Date(y, m, day));
      if (isDayAllowedGivenCal(proCalendar, candidate)) {
        setSelectedDay(candidate);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proCalendar]);

  // ✅ Ao carregar slots (do banco via cal+bookings), seta o primeiro horário disponível (sem mock)
  useEffect(() => {
    if (!proCalendar) return;
    const ymd = selectedDay;
    const slots = (slotsByDay[ymd] ?? []).filter((s) => s.available);
    if (!slots.length) return;

    const stillOk = selectedTime ? slots.some((s) => s.time === selectedTime) : false;
    if (!selectedTime || !stillOk) setSelectedTime(slots[0].time);
  }, [proCalendar, selectedDay, slotsByDay, selectedTime]);

  const service = useMemo(() => services.find((s) => s.id === selectedServiceId), [services, selectedServiceId]);
  const subtotal = service?.price ?? 0;

  const discountValue = couponApplied ? (subtotal * couponPercent) / 100 : 0;
  const total = Math.max(0, subtotal - discountValue);

  const selectedDowLabel = useMemo(() => {
    const dt = new Date(`${selectedDay}T00:00:00`);
    const dowNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return dowNames[dt.getDay()] ?? "Ter";
  }, [selectedDay]);

  const monthsPT = useMemo(
    () => ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"],
    []
  );

  async function onApplyCoupon() {
    const code = couponCode.trim().toUpperCase();

    setCouponApplied(false);
    setCouponPercent(0);
    setAppliedCouponDocId(null);

    if (!code) return;

    try {
      if (!safeSlug) return;

      const couponsRef = collection(db, "tenants", safeSlug, "coupons");
      const qCupom = query(couponsRef, where("code", "==", code), where("active", "==", true), limit(1));
      const snap = await getDocs(qCupom);

      if (snap.empty) {
        openModal("Cupom inválido", "Esse cupom não existe ou não está ativo.", "error");
        return;
      }

      const docSnap = snap.docs[0];
      const cupom = docSnap.data() as any;

      // ✅ campo correto: percentOff
      const percent = Number(cupom?.percentOff ?? 0) || 0;

      if (percent <= 0) {
        openModal("Cupom inválido", "Cupom encontrado, mas sem percentual válido (percentOff).", "error");
        return;
      }

      setCouponApplied(true);
      setCouponPercent(percent);
      setAppliedCouponDocId(docSnap.id);

      openModal("Cupom aplicado", `Desconto de ${percent}% aplicado com sucesso.`, "success");
    } catch {
      openModal("Erro", "Não foi possível validar o cupom agora. Tente novamente.", "error");
    }
  }

  async function finalizeBooking() {
    if (!customerName.trim() || !customerPhone.trim()) {
      openModal("Faltou um dado", "Preencha seu nome e WhatsApp para finalizar.", "error");
      return;
    }
    if (!selectedServiceId || !selectedProfessionalId || !selectedDay || !selectedTime) {
      openModal("Seleção incompleta", "Selecione serviço, profissional, data e horário.", "error");
      return;
    }
    if (!safeSlug) {
      openModal("Erro", "Slug inválido.", "error");
      return;
    }

    // Regra: respeitar folga/férias/dias de atuação/ausência
    if (!proCalendar || !isDayAllowedGivenCal(proCalendar, selectedDay)) {
      openModal("Data indisponível", "Esse profissional não atende nessa data (folga/férias/ausência/calendário).", "error");
      return;
    }

    const pro = professionals.find((p) => p.id === selectedProfessionalId);
    const svc = services.find((s) => s.id === selectedServiceId);
    if (!pro || !svc) {
      openModal("Erro", "Seleção inválida. Recarregue a página.", "error");
      return;
    }

    const start = combineYMDTimeToDate(selectedDay, selectedTime);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + (Number(svc.durationMin ?? 30) || 30));

    // ✅ se o dia estiver dentro de ausência, bloqueia (defesa extra)
    if (isDayWithinAbsences(proCalendar, selectedDay)) {
      openModal("Data indisponível", "O profissional está de folga/férias nesse período. Selecione outra data.", "error");
      return;
    }

    const dayStart = Timestamp.fromDate(combineYMDTimeToDate(selectedDay, "00:00"));
    const dayEnd = Timestamp.fromDate(
      combineYMDTimeToDate(toYMD(addDays(new Date(`${selectedDay}T00:00:00`), 1)), "00:00")
    );

    try {
      const bookingsRef = collection(db, "tenants", safeSlug, "bookings");

      // ✅ evita índice composto (professionalId + startAt):
      // busca por startAt no dia e filtra no client pelo professionalId
      const qDay = query(
        bookingsRef,
        where("startAt", ">=", dayStart),
        where("startAt", "<", dayEnd),
        orderBy("startAt", "asc")
      );

      const snap = await getDocs(qDay);

      const existing = snap.docs
        .map((d) => d.data() as any)
        .filter((b) => String(b?.professionalId ?? "") === selectedProfessionalId)
        .map((b) => {
          const s = (b?.startAt as Timestamp)?.toDate?.() ?? null;
          if (!s) return null;

          let e: Date | null = null;
          const endAtTs = (b?.endAt as Timestamp | null | undefined) ?? null;
          if (endAtTs && (endAtTs as any).toDate) e = (endAtTs as any).toDate();
          else {
            const dur = Number(b?.durationMin ?? 30) || 30;
            e = new Date(s);
            e.setMinutes(e.getMinutes() + dur);
          }
          return { start: s, end: e };
        })
        .filter(Boolean) as { start: Date; end: Date }[];

      const conflict = existing.some((b) => overlaps(start, end, b.start, b.end));
      if (conflict) {
        openModal("Horário indisponível", "Esse horário acabou de ser reservado. Escolha outro.", "error");
        return;
      }

      await addDoc(collection(db, "tenants", safeSlug, "bookings"), {
        tenantId: safeSlug,
        serviceId: svc.id,
        serviceName: svc.name,
        durationMin: Number(svc.durationMin ?? 30) || 30,
        price: Number(svc.price ?? 0) || 0,

        professionalId: pro.id,
        professionalName: pro.name,

        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),

        startAt: Timestamp.fromDate(start),
        endAt: Timestamp.fromDate(end),

        recurring: Boolean(isRecurring),
        recurringOption: isRecurring ? recurringOption : null,

        couponCode: couponApplied ? couponCode.trim().toUpperCase() : null,
        couponPercent: couponApplied ? Number(couponPercent ?? 0) : 0,
        total: Number(total ?? 0),

        status: "confirmed",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // ✅ atualiza corretamente o campo used do cupom utilizado
      if (couponApplied && appliedCouponDocId) {
        try {
          const couponRef = doc(db, "tenants", safeSlug, "coupons", appliedCouponDocId);
          await updateDoc(couponRef, {
            used: increment(1),
            updatedAt: serverTimestamp(),
            lastUsedAt: serverTimestamp(),
          });
        } catch {
          // não bloqueia a confirmação do agendamento
        }
      }

      setProBookings((prev) => [
        ...prev,
        {
          startAt: Timestamp.fromDate(start),
          endAt: Timestamp.fromDate(end),
          durationMin: Number(svc.durationMin ?? 30) || 30,
          professionalId: selectedProfessionalId,
        },
      ]);

      // ✅ "atualiza a página" (estado) e mostra modal central de confirmação/agradecimento
      setCustomerName("");
      setCustomerPhone("");
      setIsRecurring(false);
      setRecurringOption("weekly");
      setCouponCode("");
      setCouponApplied(false);
      setCouponPercent(0);
      setAppliedCouponDocId(null);

      setSelectedTime(""); // força recalcular o primeiro slot disponível
      setRefreshKey((k) => k + 1);

      openModal(
        "Reserva confirmada ✅",
        `Obrigado, ${customerName.trim()}!\n\nSeu agendamento foi confirmado.\n\nServiço: ${svc.name}\nProfissional: ${pro.name}\nData: ${selectedDay}\nHora: ${selectedTime}\nTotal: R$ ${total.toFixed(2).replace(".", ",")}`,
        "success",
        "center"
      );
    } catch (e: any) {
      openModal("Erro", e?.message ?? "Erro ao criar agendamento.", "error");
    }
  }

  return (
    <div className="flex flex-col items-center bg-background-offwhite text-slate-900">
      <div className="relative w-full max-w-[480px] min-h-screen flex flex-col bg-background-offwhite pb-48">
        {/* Modal próprio */}
        {modalOpen && (
          <div
            className={[
              "fixed inset-0 z-[999] flex justify-center p-4",
              modalPosition === "center" ? "items-center" : "items-end",
            ].join(" ")}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <div className="relative w-full max-w-[480px] bg-white rounded-3xl border border-slate-100 card-shadow p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      "w-10 h-10 rounded-2xl flex items-center justify-center",
                      modalVariant === "error"
                        ? "bg-red-50 text-red-600"
                        : modalVariant === "success"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-50 text-slate-600",
                    ].join(" ")}
                  >
                    <span className="material-symbols-outlined">
                      {modalVariant === "error" ? "error" : modalVariant === "success" ? "check_circle" : "info"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm font-black text-slate-900">{modalTitle}</h3>
                    <p className="text-[12px] font-medium text-slate-500 whitespace-pre-line mt-1">{modalMessage}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full h-12 bg-slate-900 text-white font-black text-sm rounded-2xl shadow-2xl shadow-slate-200 active:scale-[0.98] transition-all"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de seleção de mês/dia */}
        {datePickerOpen && (
          <div className="fixed inset-0 z-[998] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDatePickerOpen(false)} />
            <div className="relative w-full max-w-[480px] bg-white rounded-3xl border border-slate-100 card-shadow p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-600">
                    <span className="material-symbols-outlined">event</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm font-black text-slate-900">
                      {datePickerStep === "month" ? "Escolha o mês" : "Escolha o dia"}
                    </h3>
                    <p className="text-[12px] font-medium text-slate-500 whitespace-pre-line mt-1">
                      {datePickerStep === "month"
                        ? `Selecione um mês de ${datePickerYear}.`
                        : `${monthsPT[datePickerMonth]} de ${datePickerYear}.`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDatePickerOpen(false)}
                  className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {datePickerStep === "month" ? (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {monthsPT.map((mName, idx) => {
                    const active = idx === datePickerMonth;
                    return (
                      <button
                        key={mName}
                        type="button"
                        onClick={() => {
                          setDatePickerMonth(idx);
                          setDatePickerStep("day");
                        }}
                        className={[
                          "py-3 rounded-xl border text-[11px] font-bold transition-all",
                          active
                            ? "border-client-primary bg-[color:rgb(217_119_6/0.10)] text-client-primary"
                            : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {mName}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setDatePickerStep("month")}
                      className="text-[11px] font-black text-slate-500 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      Voltar
                    </button>
                    <span className="text-[11px] font-bold text-slate-900">
                      {monthsPT[datePickerMonth]} • {datePickerYear}
                    </span>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: daysInMonth(datePickerYear, datePickerMonth) }, (_, i) => i + 1).map((day) => {
                      const ymd = toYMD(new Date(datePickerYear, datePickerMonth, day));
                      const blocked = !proCalendar ? true : !isDayAllowedGivenCal(proCalendar, ymd);

                      return (
                        <button
                          key={ymd}
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            if (blocked) return;
                            setSelectedDay(ymd);
                            setSelectedTime("");
                            setDatePickerOpen(false);
                          }}
                          className={[
                            "h-10 rounded-xl border text-[11px] font-black transition-all",
                            blocked
                              ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setDatePickerOpen(false)}
                  className="w-full h-12 bg-slate-900 text-white font-black text-sm rounded-2xl shadow-2xl shadow-slate-200 active:scale-[0.98] transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="glass-header px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{salonName}</h1>
              <div className="flex items-center gap-1 text-slate-500">
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                <span className="text-[11px] font-semibold tracking-wide uppercase">{publicLink}</span>
              </div>

              {loadingData && <span className="mt-1 text-[10px] text-slate-400 font-semibold">Carregando dados...</span>}
              {!loadingData && loadError && (
                <span className="mt-1 text-[10px] text-red-500 font-semibold">Erro: {loadError}</span>
              )}
              {!loadingData && !loadError && loadingCalendar && (
                <span className="mt-1 text-[10px] text-slate-400 font-semibold">Carregando agenda do profissional...</span>
              )}
            </div>

            {/* ✅ maior e com iniciais do salão */}
            <div className="w-12 h-12 rounded-full border border-slate-200 overflow-hidden bg-slate-900 flex items-center justify-center">
              <span className="text-white font-black text-[12px] tracking-wider">{salonInitials(salonName)}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-8 py-6">
          {/* 1. Serviço */}
          <section className="space-y-4">
            <div className="px-6 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">1. Selecione o Serviço</h2>
              <span className="text-[10px] font-bold text-client-primary">Ver todos</span>
            </div>

            <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar">
              {services.map((s) => {
                const active = s.id === selectedServiceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedServiceId(s.id)}
                    className={[
                      "min-w-[160px] bg-white p-4 rounded-ios border border-slate-100 card-shadow text-left transition-all",
                      active ? "selection-active" : "hover:border-slate-200",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                        active ? "bg-[color:rgb(217_119_6/0.10)] text-client-primary" : "bg-slate-50 text-slate-400",
                      ].join(" ")}
                    >
                      <span className="material-symbols-outlined">{s.icon}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">{s.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {s.durationMin} min • R$ {s.price}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Profissional */}
          <section className="space-y-4">
            <div className="px-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">2. Escolha o Profissional</h2>
            </div>

            <div className="flex gap-6 overflow-x-auto px-6 no-scrollbar pb-2">
              {professionals.map((p) => {
                const active = p.id === selectedProfessionalId;
                const avatar = (p.avatarUrl || "").trim(); // ✅ evita src vazio
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProfessionalId(p.id);
                      setSelectedTime("");
                    }}
                    className={["flex flex-col items-center gap-2", active ? "" : "opacity-60 hover:opacity-80"].join(" ")}
                  >
                    <div className="relative">
                      {/* ✅ FIX: se avatarUrl estiver vazio, NÃO renderiza <img src=""> */}
                      {avatar ? (
                        <img
                          alt={p.name}
                          className={[
                            "w-16 h-16 rounded-full border-2 p-0.5 transition-all",
                            active ? "border-client-primary" : "border-transparent",
                          ].join(" ")}
                          src={avatar}
                        />
                      ) : (
                        <div
                          className={[
                            "w-16 h-16 rounded-full border-2 p-0.5 transition-all flex items-center justify-center",
                            active ? "border-client-primary" : "border-transparent",
                          ].join(" ")}
                        >
                          <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                            <span className="text-white font-black text-[12px] tracking-wider">
                              {professionalInitials(p.name)}
                            </span>
                          </div>
                        </div>
                      )}

                      {active && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-client-primary rounded-full flex items-center justify-center text-white border-2 border-white">
                          <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-900">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Data e Horário */}
          <section className="space-y-4">
            <div className="px-6 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">3. Data e Horário</h2>

              {/* ✅ vira botão -> abre modal de mês/dia */}
              <button type="button" onClick={openDatePicker} className="text-[11px] font-bold text-slate-900">
                {monthLabel}
              </button>
            </div>

            {/* ✅ lista horizontal que pode correr para o lado */}
            <div className="flex gap-3 overflow-x-auto px-6 no-scrollbar">
              {days.map((d) => {
                const active = d.ymd === selectedDay;

                // ✅ enquanto não carregou a agenda, não permite selecionar datas
                // ✅ bloqueia SOMENTE dias de folga/férias/ausência; o resto fica disponível
                const blocked = !proCalendar ? true : !isDayAllowedGivenCal(proCalendar, d.ymd);

                return (
                  <button
                    key={d.ymd}
                    type="button"
                    onClick={() => {
                      if (blocked) return;
                      setSelectedDay(d.ymd);
                      setSelectedTime("");
                    }}
                    disabled={blocked}
                    className={[
                      "flex flex-col items-center justify-center min-w-[56px] h-20 rounded-2xl border transition-all",
                      blocked
                        ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                        : active
                        ? "border-client-primary bg-client-primary text-white shadow-lg shadow-[color:rgb(217_119_6/0.20)]"
                        : "border-slate-100 bg-white hover:border-slate-200",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-[10px] font-bold uppercase",
                        blocked ? "text-slate-300" : active ? "text-white/70" : "text-slate-400",
                      ].join(" ")}
                    >
                      {d.dow}
                    </span>
                    <span
                      className={[
                        "text-base font-black",
                        blocked ? "text-slate-300" : active ? "text-white" : "text-slate-900",
                      ].join(" ")}
                    >
                      {d.day}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-6 grid grid-cols-4 gap-3">
              {loadingCalendar ? (
                <div className="col-span-4">
                  <div className="py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 text-[11px] font-semibold text-center">
                    Carregando agenda...
                  </div>
                </div>
              ) : !proCalendar ? (
                <div className="col-span-4">
                  <div className="py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 text-[11px] font-semibold text-center">
                    Não foi possível carregar a agenda do profissional.
                  </div>
                </div>
              ) : (slotsByDay[selectedDay] ?? []).length === 0 && isDayAllowedForPro(selectedDay) ? (
                <div className="col-span-4">
                  <div className="py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 text-[11px] font-semibold text-center">
                    Nenhum horário disponível para este dia.
                  </div>
                </div>
              ) : (
                (slotsByDay[selectedDay] ?? []).map((slot) => {
                  const active = slot.time === selectedTime;
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      onClick={() => slot.available && setSelectedTime(slot.time)}
                      disabled={!slot.available}
                      className={[
                        "py-3 rounded-xl border text-sm transition-all",
                        !slot.available
                          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                          : active
                          ? "border-client-primary bg-[color:rgb(217_119_6/0.10)] text-client-primary font-black"
                          : "border-slate-200 bg-white text-slate-900 font-bold hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {slot.time}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Recorrência */}
          <section className="px-6">
            <div className="bg-white p-5 rounded-ios border border-slate-100 card-shadow space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                    <span className="material-symbols-outlined text-[20px]">sync</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Agendamento Recorrente</h3>
                    <p className="text-[10px] font-medium text-slate-400">Garanta seu horário fixo</p>
                  </div>
                </div>

                <label className="switch">
                  <input checked={isRecurring} type="checkbox" onChange={(e) => setIsRecurring(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>

              {isRecurring && (
                <div className="space-y-4 pt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRecurringOption("weekly")}
                      className={[
                        "flex-1 py-2.5 rounded-xl border text-[11px] font-bold transition-all",
                        recurringOption === "weekly"
                          ? "border-client-primary bg-[color:rgb(217_119_6/0.05)] text-client-primary"
                          : "border-slate-100 bg-slate-50 text-slate-500",
                      ].join(" ")}
                    >
                      Toda semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecurringOption("biweekly")}
                      className={[
                        "flex-1 py-2.5 rounded-xl border text-[11px] font-bold transition-all",
                        recurringOption === "biweekly"
                          ? "border-client-primary bg-[color:rgb(217_119_6/0.05)] text-client-primary"
                          : "border-slate-100 bg-slate-50 text-slate-500",
                      ].join(" ")}
                    >
                      A cada 15 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecurringOption("monthly")}
                      className={[
                        "flex-1 py-2.5 rounded-xl border text-[11px] font-bold transition-all",
                        recurringOption === "monthly"
                          ? "border-client-primary bg-[color:rgb(217_119_6/0.05)] text-client-primary"
                          : "border-slate-100 bg-slate-50 text-slate-500",
                      ].join(" ")}
                    >
                      Mensal
                    </button>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">info</span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Seu horário será reservado{" "}
                      <span className="text-client-primary">
                        {recurringOption === "weekly"
                          ? `toda ${selectedDowLabel.toLowerCase()}-feira às ${selectedTime}`
                          : recurringOption === "biweekly"
                          ? `a cada 15 dias às ${selectedTime}`
                          : `todo mês às ${selectedTime}`}
                      </span>
                      .
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 4. Dados */}
          <section className="px-6 space-y-6">
            <div className="pt-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">4. Seus Dados</h2>
              <div className="space-y-3">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    person
                  </span>
                  <input
                    className="w-full h-14 pl-11 pr-4 rounded-2xl border border-slate-200 bg-white text-sm font-medium focus:ring-4 focus:ring-[color:rgb(217_119_6/0.05)] focus:border-client-primary outline-none transition-all"
                    placeholder="Seu nome completo"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    phone_iphone
                  </span>
                  <input
                    className="w-full h-14 pl-11 pr-4 rounded-2xl border border-slate-200 bg-white text-sm font-medium focus:ring-4 focus:ring-[color:rgb(217_119_6/0.05)] focus:border-client-primary outline-none transition-all"
                    placeholder="Seu WhatsApp"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 5. Cupom e Pagamento */}
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">5. Cupom e Pagamento</h2>

              <div className="bg-white p-5 rounded-ios border border-slate-100 card-shadow space-y-5">
                <div className="flex items-center gap-3 p-1 pl-4 bg-slate-50 border border-slate-100 rounded-xl focus-within:ring-2 focus-within:ring-[color:rgb(217_119_6/0.10)] transition-all">
                  <span className="material-symbols-outlined text-slate-400 text-[20px]">confirmation_number</span>
                  <input
                    className="flex-1 bg-transparent border-none p-0 h-10 text-sm font-bold placeholder:text-slate-400 focus:ring-0"
                    placeholder="Inserir código"
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={onApplyCoupon}
                    className="px-4 h-9 bg-client-primary text-white text-[11px] font-black uppercase tracking-wider rounded-lg shadow-sm shadow-[color:rgb(217_119_6/0.20)] active:scale-95 transition-all"
                  >
                    Aplicar
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-500">Subtotal</span>
                    <span className="text-sm font-bold text-slate-700">R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                  </div>

                  {/* ✅ Desconto só aparece quando cupom foi aplicado */}
                  {couponApplied && couponPercent > 0 && (
                    <div className="flex justify-between items-center text-emerald-600">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-tight">Desconto ({couponPercent}%)</span>
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                      </div>
                      <span className="text-sm font-bold">- R$ {discountValue.toFixed(2).replace(".", ",")}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-dashed border-slate-100 flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">
                        Total a Pagar
                      </span>
                      <span className="text-xs text-slate-400 font-medium">Pagamento no salão</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-slate-900 leading-none">
                        R$ {total.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] p-6 bg-white/90 backdrop-blur-2xl border-t border-slate-100 z-50">
          <button
            type="button"
            onClick={finalizeBooking}
            className="w-full h-16 bg-slate-900 text-white font-black text-base rounded-2xl shadow-2xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            Finalizar Agendamento
            <span className="material-symbols-outlined !text-[20px]">calendar_month</span>
          </button>

          <div className="mt-4 flex flex-col items-center gap-0.5">
            <span className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Powered by</span>
            <span className="text-[10px] font-black tracking-tighter text-slate-500">Agendixx</span>
          </div>
        </div>
      </div>
    </div>
  );
}
