"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
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
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  icon: string; // material symbols
  professionalIds?: string[];
};

type Professional = {
  id: string;
  name: string;
  avatarUrl: string;
};

type TenantOpeningHour = {
  dayIndex: number;
  active: boolean;
  start: string;
  end: string;
};

type TenantClosedRange = {
  id: string;
  date: string; // YYYY-MM-DD
  start?: string;
  end?: string;
  label?: string;
  allDay?: boolean;
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
  // fechamentos pontuais (YYYY-MM-DD) com intervalo ou dia inteiro
  closedRanges?: { date: string; start?: string; end?: string; allDay?: boolean; label?: string }[];
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

function hasAllDayClosedRange(cal: ProCalendar | null, ymd: string) {
  if (!cal || !Array.isArray(cal.closedRanges) || cal.closedRanges.length === 0) return false;
  return cal.closedRanges.some((r) => r?.date === ymd && Boolean(r?.allDay));
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

  if (hasAllDayClosedRange(cal, ymd)) return false;

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
  const [salonAddress, setSalonAddress] = useState<string>("");
  const publicLink = `agendix.me/${safeSlug}`;
  const [tenantOpeningHours, setTenantOpeningHours] = useState<TenantOpeningHour[]>([]);
  const [tenantClosedDates, setTenantClosedDates] = useState<string[]>([]);
  const [tenantClosedRanges, setTenantClosedRanges] = useState<TenantClosedRange[]>([]);

  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ===== Calendário real =====
  const [proCalendars, setProCalendars] = useState<Record<string, ProCalendar | null>>({});
  const [proBookingsMap, setProBookingsMap] = useState<
    Record<
      string,
      {
        id?: string;
        startAt: Timestamp;
        endAt?: Timestamp | null;
        durationMin?: number;
        professionalId?: string;
        status?: string;
        holdExpiresAt?: Timestamp | null;
        holdSessionId?: string | null;
      }[]
    >
  >({});
  const [loadingCalendar, setLoadingCalendar] = useState<boolean>(false);

  // ===== Modal (popup próprio) =====
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>("Aviso");
  const [modalMessage, setModalMessage] = useState<string>("");
  const [modalVariant, setModalVariant] = useState<ModalVariant>("info");
  const [modalPosition, setModalPosition] = useState<ModalPosition>("bottom");
  const [reloadOnClose, setReloadOnClose] = useState<boolean>(false);

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
    setReloadOnClose(false);
    setModalOpen(true);
  }

  // ===== Modal seleção de mês/dia =====
  const [datePickerOpen, setDatePickerOpen] = useState<boolean>(false);
  const [datePickerStep, setDatePickerStep] = useState<"month" | "day">("month");
  const [datePickerMonth, setDatePickerMonth] = useState<number>(() => new Date().getMonth()); // 0..11
  const [datePickerYear] = useState<number>(() => new Date().getFullYear());
  const [servicesModalOpen, setServicesModalOpen] = useState<boolean>(false);
  const [orderModalOpen, setOrderModalOpen] = useState<boolean>(false);
  const servicesCarouselRef = useRef<HTMLDivElement | null>(null);
  const servicesDrag = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const holdSessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const expiredHoldHandledRef = useRef<string | null>(null);
  const clientIdRef = useRef<string>("");

  // ===== Estado (mantém funcionalidades do template) =====
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [scheduleByService, setScheduleByService] = useState<
    Record<string, { professionalId: string; day: string; time: string; holdId?: string | null }>
  >({});
  const [currentServiceIndex, setCurrentServiceIndex] = useState<number>(0);
  const [holdRemainingSec, setHoldRemainingSec] = useState<number | null>(null);
  const [clientBusyRanges, setClientBusyRanges] = useState<{ start: Date; end: Date; id?: string }[]>([]);

  // Agora o "dia" é uma data real (YYYY-MM-DD) — reflete o serviço atual
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

  useEffect(() => {
    if (clientIdRef.current) return;
    const fromPhone = normalizePhoneId(customerPhone);
    if (fromPhone) {
      clientIdRef.current = fromPhone;
      return;
    }
  }, []);

  useEffect(() => {
    const fromPhone = normalizePhoneId(customerPhone);
    if (fromPhone) {
      clientIdRef.current = fromPhone;
    }
  }, [customerPhone]);

  const HOLD_MINUTES = 20;

  async function releaseHold(holdId?: string | null, serviceId?: string) {
    if (!safeSlug || !holdId) return;
    try {
      await deleteDoc(doc(db, "tenants", safeSlug, "holds", holdId));
      const clientId = clientIdRef.current || holdSessionIdRef.current;
      if (serviceId) {
        const clientRef = doc(db, "tenants", safeSlug, "pre_reservas", clientId);
        await deleteDoc(doc(db, "tenants", safeSlug, "pre_reservas", clientId, "itens", serviceId));
        await updateDoc(clientRef, { updatedAt: serverTimestamp() });
      }
    } catch {
      // silencioso: não bloqueia fluxo
    }
  }

  function isHoldExpired(ts?: Timestamp | null) {
    if (!ts || !(ts as any).toDate) return true;
    const d = (ts as any).toDate() as Date;
    return d.getTime() <= Date.now();
  }

  function formatHoldTimer(totalSeconds: number) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function normalizePhoneId(value: string) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length ? digits : "";
  }

  function buildDefaultTenantHours(): TenantOpeningHour[] {
    return [
      { dayIndex: 0, active: false, start: "09:00", end: "18:00" },
      { dayIndex: 1, active: true, start: "09:00", end: "18:00" },
      { dayIndex: 2, active: true, start: "09:00", end: "18:00" },
      { dayIndex: 3, active: true, start: "09:00", end: "18:00" },
      { dayIndex: 4, active: true, start: "09:00", end: "18:00" },
      { dayIndex: 5, active: true, start: "09:00", end: "18:00" },
      { dayIndex: 6, active: true, start: "09:00", end: "18:00" },
    ];
  }

  function getTenantHoursForDate(ymd: string) {
    const d = new Date(`${ymd}T00:00:00`);
    const dayIndex = d.getDay();
    const list = tenantOpeningHours.length ? tenantOpeningHours : buildDefaultTenantHours();
    return list.find((h) => h.dayIndex === dayIndex) ?? null;
  }

  function getClosedRangesForDay(ymd: string) {
    return tenantClosedRanges
      .filter((r) => r.date === ymd)
      .map((r) => {
        if (r.allDay) {
          return { allDay: true, startMin: 0, endMin: 24 * 60 };
        }
        if (!r.start || !r.end) return null;
        const startMin = parseTimeToMinutes(r.start);
        const endMin = parseTimeToMinutes(r.end);
        if (endMin <= startMin) return null;
        return { allDay: false, startMin, endMin };
      })
      .filter(Boolean) as { allDay: boolean; startMin: number; endMin: number }[];
  }

  function getClosedRangesForDayFromCal(cal: ProCalendar | null, ymd: string) {
    if (!cal || !Array.isArray(cal.closedRanges)) return [];
    return cal.closedRanges
      .filter((r) => r?.date === ymd)
      .map((r) => {
        if (r?.allDay) return { allDay: true, startMin: 0, endMin: 24 * 60 };
        if (!r?.start || !r?.end) return null;
        const startMin = parseTimeToMinutes(r.start);
        const endMin = parseTimeToMinutes(r.end);
        if (endMin <= startMin) return null;
        return { allDay: false, startMin, endMin };
      })
      .filter(Boolean) as { allDay: boolean; startMin: number; endMin: number }[];
  }

  function isSlotBlockedByClosedRange(startMin: number, endMin: number, ranges: { allDay: boolean; startMin: number; endMin: number }[]) {
    return ranges.some((r) => r.allDay || (startMin < r.endMin && endMin > r.startMin));
  }

  function isTenantOpenDay(ymd: string) {
    if (tenantClosedDates.includes(ymd)) return false;
    if (getClosedRangesForDay(ymd).some((r) => r.allDay)) return false;
    const h = getTenantHoursForDate(ymd);
    if (!h) return true;
    return Boolean(h.active);
  }

  function findNextOpenDay(fromYmd: string, maxDays = 30) {
    const base = new Date(`${fromYmd}T00:00:00`);
    for (let i = 0; i <= maxDays; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const ymd = toYMD(d);
      if (isTenantOpenDay(ymd)) return ymd;
    }
    return fromYmd;
  }

  function formatPhoneBR(value: string) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
    if (!digits) return "";
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length <= 5) return `(${ddd}) ${rest}`;
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  }

  async function createHoldForSelection(input: {
    service: Service;
    professionalId: string;
    day: string;
    time: string;
  }) {
    if (!safeSlug) throw new Error("Slug inválido.");
    const fromPhone = normalizePhoneId(customerPhone);
    if (!fromPhone) {
      throw new Error("phone_required");
    }
    const { service, professionalId, day, time } = input;
    const durationMin = Number(service.durationMin ?? 0) || 30;

    const clientId = fromPhone;
    const holdId = `${clientId}_${service.id}`;
    const holdRef = doc(db, "tenants", safeSlug, "holds", holdId);
    const bookingsRef = collection(db, "tenants", safeSlug, "bookings");
    const holdsRef = collection(db, "tenants", safeSlug, "holds");
    const clientRef = doc(db, "tenants", safeSlug, "pre_reservas", clientId);

    const dayStart = Timestamp.fromDate(combineYMDTimeToDate(day, "00:00"));
    const nextDay = toYMD(addDays(new Date(`${day}T00:00:00`), 1));
    const dayEnd = Timestamp.fromDate(combineYMDTimeToDate(nextDay, "00:00"));

    const qBookings = query(
      bookingsRef,
      where("startAt", ">=", dayStart),
      where("startAt", "<", dayEnd),
      orderBy("startAt", "asc")
    );

    const qHolds = query(
      holdsRef,
      where("startAt", ">=", dayStart),
      where("startAt", "<", dayEnd),
      orderBy("startAt", "asc")
    );

    const [bookingsSnap, holdsSnap] = await Promise.all([getDocs(qBookings), getDocs(qHolds)]);
    const existingBookings = bookingsSnap.docs.map((d) => {
      const b = d.data() as any;
      return {
        id: d.id,
        startAt: b?.startAt as Timestamp,
        endAt: (b?.endAt as Timestamp | null | undefined) ?? null,
        durationMin: Number(b?.durationMin ?? 0) || undefined,
        professionalId: String(b?.professionalId ?? ""),
        status: String(b?.status ?? ""),
        holdExpiresAt: (b?.holdExpiresAt as Timestamp | null | undefined) ?? null,
        holdSessionId: (b?.holdSessionId as string | null | undefined) ?? null,
      };
    });
    const existingHolds = holdsSnap.docs.map((d) => {
      const b = d.data() as any;
      return {
        id: d.id,
        startAt: b?.startAt as Timestamp,
        endAt: (b?.endAt as Timestamp | null | undefined) ?? null,
        durationMin: Number(b?.durationMin ?? 0) || undefined,
        professionalId: String(b?.professionalId ?? ""),
        status: String(b?.status ?? "hold"),
        holdExpiresAt: (b?.holdExpiresAt as Timestamp | null | undefined) ?? null,
        holdSessionId: (b?.holdSessionId as string | null | undefined) ?? null,
      };
    });

    const existing = [...existingBookings, ...existingHolds];

    const rangeStart = combineYMDTimeToDate(day, time);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setMinutes(rangeEnd.getMinutes() + durationMin);

    const hasConflict = existing.some((b) => {
      if (!b.startAt || String(b.professionalId) !== professionalId) return false;
      if (b.id === holdId) return false;
      if (String(b.status) === "cancelled") return false;
      if (String(b.status) === "hold") {
        const expired = isHoldExpired(b.holdExpiresAt);
        if (expired) return false;
        const sameHold =
          b.holdSessionId === holdSessionIdRef.current && String(b.id ?? "") === String(holdId);
        if (sameHold) return false;
        const s = b.startAt.toDate();
        let e: Date;
        if (b.endAt && (b.endAt as any).toDate) e = (b.endAt as any).toDate();
        else {
          const dur = Number(b.durationMin ?? durationMin) || durationMin;
          e = new Date(s);
          e.setMinutes(e.getMinutes() + dur);
        }
        return overlaps(rangeStart, rangeEnd, s, e);
      }
      const s = b.startAt.toDate();
      let e: Date;
      if (b.endAt && (b.endAt as any).toDate) e = (b.endAt as any).toDate();
      else {
        const dur = Number(b.durationMin ?? durationMin) || durationMin;
        e = new Date(s);
        e.setMinutes(e.getMinutes() + dur);
      }
      return overlaps(rangeStart, rangeEnd, s, e);
    });

    if (hasConflict) {
      throw new Error("conflict");
    }

    const holdExpiresAt = Timestamp.fromDate(new Date(Date.now() + HOLD_MINUTES * 60 * 1000));

    const holdSnap = await getDoc(holdRef);
    if (holdSnap.exists()) {
      const data = holdSnap.data() as any;
      const expired = isHoldExpired((data?.holdExpiresAt as Timestamp | null | undefined) ?? null);
      const sameSession = String(data?.holdSessionId ?? "") === holdSessionIdRef.current;
      if (!expired && !sameSession) {
        throw new Error("conflict");
      }
    }

    await setDoc(
      holdRef,
      {
        tenantId: safeSlug,
        serviceIds: [service.id],
        serviceNames: [service.name],
        serviceId: service.id,
        serviceName: service.name,
        durationMin,
        price: Number(service.price ?? 0) || 0,
        professionalId,
        professionalName: professionals.find((p) => p.id === professionalId)?.name ?? "",
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        startAt: Timestamp.fromDate(rangeStart),
        endAt: Timestamp.fromDate(rangeEnd),
        status: "hold",
        clientId,
        holdSessionId: holdSessionIdRef.current,
        holdExpiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      clientRef,
      {
        clientId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await setDoc(
      doc(clientRef, "itens", service.id),
      {
        clientId,
        tenantId: safeSlug,
        serviceId: service.id,
        serviceName: service.name,
        professionalId,
        professionalName: professionals.find((p) => p.id === professionalId)?.name ?? "",
        startAt: Timestamp.fromDate(rangeStart),
        endAt: Timestamp.fromDate(rangeEnd),
        status: "hold",
        holdExpiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return holdId;
  }

  function addLocalHold(input: {
    professionalId: string;
    holdId: string;
    startAt: Date;
    endAt: Date;
    durationMin: number;
  }) {
    setProBookingsMap((prev) => {
      const list = prev[input.professionalId] ? [...prev[input.professionalId]] : [];
      if (list.some((b) => b.id === input.holdId)) return prev;
      list.push({
        id: input.holdId,
        startAt: Timestamp.fromDate(input.startAt),
        endAt: Timestamp.fromDate(input.endAt),
        durationMin: input.durationMin,
        professionalId: input.professionalId,
        status: "hold",
        holdExpiresAt: Timestamp.fromDate(new Date(Date.now() + HOLD_MINUTES * 60 * 1000)),
        holdSessionId: holdSessionIdRef.current,
      });
      return { ...prev, [input.professionalId]: list };
    });
  }

  function removeLocalHold(professionalId: string, holdId: string) {
    setProBookingsMap((prev) => {
      const list = prev[professionalId];
      if (!list) return prev;
      const nextList = list.filter((b) => b.id !== holdId);
      return { ...prev, [professionalId]: nextList };
    });
  }

  function reorderSelectedServices(nextIds: string[]) {
    const currentId = currentService?.id ?? "";
    setSelectedServiceIds(nextIds);
    if (!currentId) {
      setCurrentServiceIndex(0);
      return;
    }
    const nextIndex = nextIds.findIndex((id) => id === currentId);
    setCurrentServiceIndex(nextIndex >= 0 ? nextIndex : 0);
  }

  function moveSelectedService(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...selectedServiceIds];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    reorderSelectedServices(next);
  }

  function handleCarouselMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const el = servicesCarouselRef.current;
    if (!el) return;
    servicesDrag.current.isDown = true;
    servicesDrag.current.startX = event.pageX - el.offsetLeft;
    servicesDrag.current.scrollLeft = el.scrollLeft;
    servicesDrag.current.moved = false;
  }

  function handleCarouselMouseLeave() {
    servicesDrag.current.isDown = false;
  }

  function handleCarouselMouseUp() {
    servicesDrag.current.isDown = false;
  }

  function handleCarouselMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = servicesCarouselRef.current;
    if (!el || !servicesDrag.current.isDown) return;
    event.preventDefault();
    const x = event.pageX - el.offsetLeft;
    const walk = x - servicesDrag.current.startX;
    if (Math.abs(walk) > 6) servicesDrag.current.moved = true;
    el.scrollLeft = servicesDrag.current.scrollLeft - walk;
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId];
      if (next.length === 0) setCurrentServiceIndex(0);
      else if (currentService && !next.includes(currentService.id)) setCurrentServiceIndex(0);
      return next;
    });
    const holdId = scheduleByService[serviceId]?.holdId ?? null;
    const holdProId = scheduleByService[serviceId]?.professionalId ?? "";
    if (holdId) {
      if (holdProId) removeLocalHold(holdProId, holdId);
      void releaseHold(holdId, serviceId);
    }
    setScheduleByService((prev) => {
      if (!prev[serviceId]) return prev;
      const next = { ...prev };
      delete next[serviceId];
      return next;
    });
    setSelectedTime("");
  }

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
  const selectedServices = useMemo(
    () => selectedServiceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[],
    [selectedServiceIds, services]
  );
  const currentService = selectedServices[currentServiceIndex] ?? null;
  const currentSchedule = currentService ? scheduleByService[currentService.id] : null;
  const currentProfessionalId = currentSchedule?.professionalId ?? "";
  const currentHoldId = currentSchedule?.holdId ?? null;
  const isSalonOpenSelectedDay = useMemo(
    () => isTenantOpenDay(selectedDay),
    [selectedDay, tenantClosedDates, tenantOpeningHours, tenantClosedRanges]
  );
  const currentHoldExpiresAt = useMemo(() => {
    if (!currentHoldId || !currentProfessionalId) return null;
    const list = proBookingsMap[currentProfessionalId] ?? [];
    const hold = list.find((b) => b.id === currentHoldId);
    return (hold?.holdExpiresAt as Timestamp | null | undefined) ?? null;
  }, [currentHoldId, currentProfessionalId, proBookingsMap]);

  useEffect(() => {
    if (!currentService) return;
    const existing = scheduleByService[currentService.id];
    if (existing?.day) setSelectedDay(existing.day);
    else setSelectedDay(toYMD(new Date()));
    if (existing?.time) setSelectedTime(existing.time);
    else setSelectedTime("");
  }, [currentService?.id, scheduleByService]);

  const isDayAllowedForCurrent = useMemo(() => {
    return (ymd: string) => {
      if (!currentProfessionalId) return false;
      const cal = proCalendars[currentProfessionalId] ?? null;
      if (!cal) return false;
      if (!isTenantOpenDay(ymd)) return false;
      return isDayAllowedGivenCal(cal, ymd);
    };
  }, [currentProfessionalId, proCalendars, tenantOpeningHours, tenantClosedDates, tenantClosedRanges]);

  // ===== Slots reais do dia selecionado (lidos do banco via regras: calendário + bookings) =====
  const slotsByDay: Record<string, TimeSlot[]> = useMemo(() => {
    const ymd = selectedDay;
    if (!ymd) return {};
    if (!currentService || !currentProfessionalId) return { [ymd]: [] };
    const cal = proCalendars[currentProfessionalId] ?? null;
    if (!cal) return { [ymd]: [] };
    if (!isDayAllowedForCurrent(ymd)) return { [ymd]: [] };

    const durationMin = Number(currentService.durationMin ?? 0) || 30;
    const currentClientId = normalizePhoneId(customerPhone);
    const tenantHours = getTenantHoursForDate(ymd);
    const closedRangesForDay = [
      ...getClosedRangesForDay(ymd),
      ...getClosedRangesForDayFromCal(cal, ymd),
    ];

    const bookingsForDay = (proBookingsMap[currentProfessionalId] || [])
      .map((b) => {
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
        return {
          start: s,
          end: e,
          id: b.id,
          status: b.status,
          holdExpiresAt: b.holdExpiresAt,
          holdSessionId: b.holdSessionId,
        };
      })
      .filter(Boolean) as {
      start: Date;
      end: Date;
      id?: string;
      status?: string;
      holdExpiresAt?: Timestamp | null;
      holdSessionId?: string | null;
    }[];

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
        if (tenantHours && tenantHours.active) {
          const tenantStartMin = parseTimeToMinutes(tenantHours.start);
          const tenantEndMin = parseTimeToMinutes(tenantHours.end);
          const slotStartMin = parseTimeToMinutes(t);
          if (slotStartMin < tenantStartMin || slotStartMin + durationMin > tenantEndMin) {
            slots.push({ time: t, available: false });
            continue;
          }
        }
        const slotStartMin = parseTimeToMinutes(t);
        const slotEndMin = slotStartMin + durationMin;
        if (isSlotBlockedByClosedRange(slotStartMin, slotEndMin, closedRangesForDay)) {
          slots.push({ time: t, available: false });
          continue;
        }
        const conflict = bookingsForDay.some((b) => {
          if (String(b.status) === "cancelled") return false;
          if (String(b.status) === "hold") {
            const expired = isHoldExpired(b.holdExpiresAt);
            if (expired) return false;
            const sameHold =
              b.holdSessionId === holdSessionIdRef.current && currentHoldId && b.id === currentHoldId;
            if (sameHold) return false;
            return overlaps(slotStart, slotEnd, b.start, b.end);
          }
          return overlaps(slotStart, slotEnd, b.start, b.end);
        });
        const clientConflict =
          currentClientId &&
          clientBusyRanges.some((b) => b.id !== currentHoldId && overlaps(slotStart, slotEnd, b.start, b.end));
        slots.push({ time: t, available: !conflict && !clientConflict });
      }
      return { [ymd]: slots };
    }

    let dayStart = cal?.dayStart ?? "09:00";
    let dayEnd = cal?.dayEnd ?? "18:00";
    if (tenantHours && tenantHours.active) {
      const startMin = Math.max(parseTimeToMinutes(dayStart), parseTimeToMinutes(tenantHours.start));
      const endMin = Math.min(parseTimeToMinutes(dayEnd), parseTimeToMinutes(tenantHours.end));
      if (endMin <= startMin) return { [ymd]: [] };
      dayStart = minutesToTime(startMin);
      dayEnd = minutesToTime(endMin);
    }
    const slotMin = Number(cal?.slotMin ?? 30) || 30;

    const startMin = parseTimeToMinutes(dayStart);
    const endMin = parseTimeToMinutes(dayEnd);

    for (let m = startMin; m + durationMin <= endMin; m += slotMin) {
      const t = minutesToTime(m);
      const slotStart = combineYMDTimeToDate(ymd, t);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMin);
      const slotStartMin = parseTimeToMinutes(t);
      const slotEndMin = slotStartMin + durationMin;
      if (isSlotBlockedByClosedRange(slotStartMin, slotEndMin, closedRangesForDay)) {
        slots.push({ time: t, available: false });
        continue;
      }
      const conflict = bookingsForDay.some((b) => {
        if (String(b.status) === "cancelled") return false;
        if (String(b.status) === "hold") {
          const expired = isHoldExpired(b.holdExpiresAt);
          if (expired) return false;
          const sameHold =
            b.holdSessionId === holdSessionIdRef.current && currentHoldId && b.id === currentHoldId;
          if (sameHold) return false;
          return overlaps(slotStart, slotEnd, b.start, b.end);
        }
        return overlaps(slotStart, slotEnd, b.start, b.end);
      });
      const clientConflict =
        currentClientId &&
        clientBusyRanges.some((b) => b.id !== currentHoldId && overlaps(slotStart, slotEnd, b.start, b.end));
      slots.push({ time: t, available: !conflict && !clientConflict });
    }

    return { [ymd]: slots };
  }, [
    selectedDay,
    currentService,
    currentProfessionalId,
    currentHoldId,
    proCalendars,
    proBookingsMap,
    clientBusyRanges,
    customerPhone,
    isDayAllowedForCurrent,
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
        const tenantAddress = String(tenantData?.address ?? "");
        const openingHoursRaw = Array.isArray(tenantData?.openingHours) ? (tenantData.openingHours as any[]) : null;
        const closedDatesRaw = Array.isArray(tenantData?.closedDates) ? (tenantData.closedDates as any[]) : [];
        const closedRangesRaw = Array.isArray(tenantData?.closedRanges) ? (tenantData.closedRanges as any[]) : [];

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
            professionalIds: Array.isArray(data?.professionalIds) ? (data.professionalIds as string[]) : [],
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
            avatarUrl: "",
          };
        });

        if (!alive) return;

        setSalonName(tenantName);
        setSalonAddress(tenantAddress);
        setTenantOpeningHours(
          openingHoursRaw
            ? openingHoursRaw
                .map((h) => ({
                  dayIndex: Number(h?.dayIndex ?? 0),
                  active: Boolean(h?.active ?? true),
                  start: String(h?.start ?? "09:00"),
                  end: String(h?.end ?? "18:00"),
                }))
                .sort((a, b) => a.dayIndex - b.dayIndex)
            : []
        );
        setTenantClosedDates(
          closedDatesRaw
            .map((c: any) => String(c?.date ?? ""))
            .filter(Boolean)
        );
        setTenantClosedRanges(
          closedRangesRaw
            .map((r: any, idx: number) => ({
              id: String(r?.id ?? `${r?.date ?? idx}-${idx}`),
              date: String(r?.date ?? ""),
              start: r?.start ? String(r.start) : "",
              end: r?.end ? String(r.end) : "",
              label: String(r?.label ?? ""),
              allDay: Boolean(r?.allDay ?? false),
            }))
            .filter((r: TenantClosedRange) => Boolean(r.date))
        );
        setServices(loadedServices);
        setProfessionals(loadedPros);

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
      const selectedProIds = Array.from(new Set(Object.values(scheduleByService).map((v) => v.professionalId).filter(Boolean)));
      if (!safeSlug || selectedProIds.length === 0) {
        setProCalendars({});
        setProBookingsMap({});
        return;
      }

      try {
        setLoadingCalendar(true);

        const base = startOfDay(new Date(`${selectedDay}T00:00:00`));
        const rangeStart = monthStart(base);
        const rangeEnd = nextMonthStart(base);

        const bookingsRef = collection(db, "tenants", safeSlug, "bookings");
        const holdsRef = collection(db, "tenants", safeSlug, "holds");
        const bookingsQ = query(
          bookingsRef,
          where("startAt", ">=", Timestamp.fromDate(rangeStart)),
          where("startAt", "<", Timestamp.fromDate(rangeEnd)),
          orderBy("startAt", "asc")
        );
        const holdsQ = query(
          holdsRef,
          where("startAt", ">=", Timestamp.fromDate(rangeStart)),
          where("startAt", "<", Timestamp.fromDate(rangeEnd)),
          orderBy("startAt", "asc")
        );

        const [bSnap, hSnap, calendars] = await Promise.all([
          getDocs(bookingsQ),
          getDocs(holdsQ),
          Promise.all(
            selectedProIds.map(async (pid) => {
              const proRef = doc(db, "tenants", safeSlug, "professionals", pid);
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

              const absencesRaw: any[] = Array.isArray(data?.absences) ? data.absences : [];
              const closedRangesRaw: any[] = Array.isArray(data?.closedRanges) ? data.closedRanges : [];
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
                closedRanges: closedRangesRaw
                  .map((r) => ({
                    date: String(r?.date ?? ""),
                    start: r?.start ? String(r.start) : "",
                    end: r?.end ? String(r.end) : "",
                    allDay: Boolean(r?.allDay ?? false),
                    label: String(r?.label ?? ""),
                  }))
                  .filter((r) => r.date),
                availableSlots: availableSlotsRaw ? availableSlotsRaw.map((t: any) => String(t)) : undefined,
              };

              return { pid, cal };
            })
          ),
        ]);

        const loadedBookings = bSnap.docs
          .map((d) => {
            const b = d.data() as any;
            return {
              id: d.id,
              startAt: b?.startAt as Timestamp,
              endAt: (b?.endAt as Timestamp | null | undefined) ?? null,
              durationMin: Number(b?.durationMin ?? 0) || undefined,
              professionalId: String(b?.professionalId ?? ""),
              status: String(b?.status ?? ""),
              holdExpiresAt: (b?.holdExpiresAt as Timestamp | null | undefined) ?? null,
              holdSessionId: (b?.holdSessionId as string | null | undefined) ?? null,
              customerPhone: String(b?.customerPhone ?? ""),
              clientId: String(b?.clientId ?? ""),
            };
          })
          .filter((b) => b?.startAt);

        const loadedHolds = hSnap.docs
          .map((d) => {
            const b = d.data() as any;
            return {
              id: d.id,
              startAt: b?.startAt as Timestamp,
              endAt: (b?.endAt as Timestamp | null | undefined) ?? null,
              durationMin: Number(b?.durationMin ?? 0) || undefined,
              professionalId: String(b?.professionalId ?? ""),
              status: "hold",
              holdExpiresAt: (b?.holdExpiresAt as Timestamp | null | undefined) ?? null,
              holdSessionId: (b?.holdSessionId as string | null | undefined) ?? null,
              clientId: String(b?.clientId ?? ""),
              serviceId: String(b?.serviceId ?? ""),
              customerPhone: String(b?.customerPhone ?? ""),
            };
          })
          .filter((b) => b?.startAt);

        const expiredHolds = loadedHolds.filter((b) => isHoldExpired(b.holdExpiresAt));

        if (expiredHolds.length) {
          await Promise.all(
            expiredHolds.map(async (b) => {
              if (b.id) await deleteDoc(doc(db, "tenants", safeSlug, "holds", b.id));
              if (b.clientId && b.serviceId) {
                await deleteDoc(doc(db, "tenants", safeSlug, "pre_reservas", b.clientId, "itens", b.serviceId));
              }
            })
          );
        }

        const calMap: Record<string, ProCalendar | null> = {};
        calendars.forEach(({ pid, cal }) => {
          calMap[pid] = cal;
        });

        const filteredHolds = loadedHolds.filter((b) => !isHoldExpired(b.holdExpiresAt));
        const combined = [...loadedBookings, ...filteredHolds];

        const clientId = normalizePhoneId(customerPhone);
        const clientRanges: { start: Date; end: Date; id?: string }[] = [];
        if (clientId) {
          combined.forEach((b) => {
            const sameClient =
              String(b?.clientId ?? "") === clientId ||
              normalizePhoneId(String(b?.customerPhone ?? "")) === clientId;
            if (!sameClient) return;
            const s = b.startAt?.toDate ? b.startAt.toDate() : null;
            if (!s) return;
            let e: Date;
            if (b.endAt && (b.endAt as any).toDate) e = (b.endAt as any).toDate();
            else {
              const dur = Number(b.durationMin ?? 30) || 30;
              e = new Date(s);
              e.setMinutes(e.getMinutes() + dur);
            }
            clientRanges.push({ start: s, end: e, id: b.id });
          });
        }

        const bookingsMap: Record<string, typeof loadedBookings> = {};
        selectedProIds.forEach((pid) => {
          bookingsMap[pid] = combined.filter((b) => b.professionalId === pid);
        });

        if (!alive) return;

        setProCalendars(calMap);
        setProBookingsMap(bookingsMap);
        setClientBusyRanges(clientRanges);

        setSelectedDay((prev) => (prev ? prev : toYMD(new Date())));
      } catch {
        if (!alive) return;
        setProCalendars({});
        setProBookingsMap({});
      } finally {
        if (!alive) return;
        setLoadingCalendar(false);
      }
    }

    loadCalendarAndBookings();
    return () => {
      alive = false;
    };
  }, [safeSlug, selectedDay, refreshKey, scheduleByService]);

  // ✅ Se selectedDay ficar inválido após carregar agenda, ajusta para o próximo válido (dentro do mês atual)
  useEffect(() => {
    if (!currentProfessionalId) return;
    if (isDayAllowedForCurrent(selectedDay)) return;

    const cur = new Date(`${selectedDay}T00:00:00`);
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const max = daysInMonth(y, m);

    for (let day = 1; day <= max; day++) {
      const candidate = toYMD(new Date(y, m, day));
      if (isDayAllowedForCurrent(candidate)) {
        setSelectedDay(candidate);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDayAllowedForCurrent, selectedDay, currentProfessionalId]);

  useEffect(() => {
    if (!selectedDay) return;
    if (isTenantOpenDay(selectedDay)) return;
    const next = findNextOpenDay(selectedDay, 30);
    if (next !== selectedDay) setSelectedDay(next);
  }, [selectedDay, tenantOpeningHours, tenantClosedDates, tenantClosedRanges]);

  useEffect(() => {
    if (!currentHoldId || !currentHoldExpiresAt) {
      setHoldRemainingSec(null);
      return;
    }
    const tick = () => {
      const expires = (currentHoldExpiresAt as any).toDate?.() as Date | undefined;
      if (!expires) {
        setHoldRemainingSec(null);
        return;
      }
      const diffSec = Math.floor((expires.getTime() - Date.now()) / 1000);
      if (diffSec <= 0) {
        setHoldRemainingSec(0);
        if (expiredHoldHandledRef.current !== currentHoldId) {
          expiredHoldHandledRef.current = currentHoldId;
          const svcId = currentService?.id ?? "";
          if (svcId) {
            removeLocalHold(currentProfessionalId, currentHoldId);
            void releaseHold(currentHoldId, svcId);
            setScheduleByService((prev) => ({
              ...prev,
              [svcId]: { professionalId: currentProfessionalId, day: selectedDay, time: "", holdId: null },
            }));
            openModal(
              "Pré-reserva expirada",
              "Sua pré-reserva expirou. Selecione uma nova data e horário.",
              "error"
            );
            setRefreshKey((k) => k + 1);
          }
        }
        return;
      }
      setHoldRemainingSec(diffSec);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentHoldId, currentHoldExpiresAt, currentProfessionalId, currentService?.id, selectedDay]);

  // ✅ Ao carregar slots (do banco via cal+bookings), seta o primeiro horário disponível (sem mock)
  useEffect(() => {
    const ymd = selectedDay;
    const slots = (slotsByDay[ymd] ?? []).filter((s) => s.available);
    const currentTime = currentSchedule?.time ?? "";
    if (!currentTime) {
      if (selectedTime) setSelectedTime("");
      return;
    }
    const stillOk = slots.some((s) => s.time === currentTime);
    if (!stillOk) {
      setSelectedTime("");
      return;
    }
    if (selectedTime !== currentTime) setSelectedTime(currentTime);
  }, [selectedDay, slotsByDay, selectedTime, currentSchedule?.time]);

  const subtotal = selectedServices.reduce((sum, s) => sum + (Number(s.price ?? 0) || 0), 0);

  const discountValue = couponApplied ? (subtotal * couponPercent) / 100 : 0;
  const total = Math.max(0, subtotal - discountValue);

  const selectedDowLabel = useMemo(() => {
    const dt = new Date(`${selectedDay}T00:00:00`);
    const dowNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return dowNames[dt.getDay()] ?? "Ter";
  }, [selectedDay]);

  function getProfessionalsForService(svc: Service) {
    const ids = Array.isArray(svc.professionalIds) ? svc.professionalIds : [];
    if (!ids.length) return professionals;
    return professionals.filter((p) => ids.includes(p.id));
  }

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
    const selectedSvcs = selectedServiceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[];
    const servicePairs = selectedSvcs.map((svc) => ({
      service: svc,
      professionalId: scheduleByService[svc.id]?.professionalId || "",
      day: scheduleByService[svc.id]?.day || "",
      time: scheduleByService[svc.id]?.time || "",
      holdId: scheduleByService[svc.id]?.holdId || "",
    }));

    if (!selectedServiceIds.length) {
      openModal("Seleção incompleta", "Selecione serviço, profissionais, data e horário.", "error");
      return;
    }
    if (servicePairs.some((p) => !p.professionalId || !p.day || !p.time)) {
      openModal("Seleção incompleta", "Selecione profissional, data e horário para cada serviço.", "error");
      return;
    }
    if (servicePairs.some((p) => !p.holdId)) {
      openModal(
        "Seleção incompleta",
        "Selecione o horário de cada serviço para garantir a pré-reserva.",
        "error"
      );
      return;
    }
    if (!safeSlug) {
      openModal("Erro", "Slug inválido.", "error");
      return;
    }

    const proIds = Array.from(new Set(servicePairs.map((p) => p.professionalId)));
    const pros = professionals.filter((p) => proIds.includes(p.id));
    if (pros.length === 0 || selectedSvcs.length === 0) {
      openModal("Erro", "Seleção inválida. Recarregue a página.", "error");
      return;
    }

    const totalDuration = selectedSvcs.reduce((sum, s) => sum + (Number(s.durationMin ?? 0) || 0), 0) || 30;

    try {
      const bookingsRef = collection(db, "tenants", safeSlug, "bookings");

      async function hasConflictForRange(
        pid: string,
        rangeStart: Date,
        rangeEnd: Date,
        occYmd: string,
        currentHoldId?: string | null
      ) {
        const dayStart = Timestamp.fromDate(combineYMDTimeToDate(occYmd, "00:00"));
        const dayEnd = Timestamp.fromDate(
          combineYMDTimeToDate(toYMD(addDays(new Date(`${occYmd}T00:00:00`), 1)), "00:00")
        );
        const qBookings = query(
          bookingsRef,
          where("startAt", ">=", dayStart),
          where("startAt", "<", dayEnd),
          orderBy("startAt", "asc")
        );
        const holdsRef = collection(db, "tenants", safeSlug, "holds");
        const qHolds = query(
          holdsRef,
          where("startAt", ">=", dayStart),
          where("startAt", "<", dayEnd),
          orderBy("startAt", "asc")
        );

        const [bSnap, hSnap] = await Promise.all([getDocs(qBookings), getDocs(qHolds)]);

        const fromSnap = (snap: typeof bSnap, statusOverride?: string) =>
          snap.docs
            .map((d) => ({ id: d.id, data: d.data() as any }))
            .filter((d) => String(d?.data?.professionalId ?? "") === pid)
            .map((d) => {
              const b = d.data;
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
              return {
                id: d.id,
                start: s,
                end: e,
                status: String(statusOverride ?? b?.status ?? ""),
                holdExpiresAt: (b?.holdExpiresAt as Timestamp | null | undefined) ?? null,
                holdSessionId: (b?.holdSessionId as string | null | undefined) ?? null,
              };
            })
            .filter(Boolean) as { start: Date; end: Date }[];

        const existing = [...fromSnap(bSnap), ...fromSnap(hSnap, "hold")];

        return existing.some((b: any) => {
          if (String(b.status) === "cancelled") return false;
          if (String(b.status) === "hold") {
            const expired = isHoldExpired(b.holdExpiresAt);
            if (expired) return false;
            const sameHold =
              b.holdSessionId === holdSessionIdRef.current && currentHoldId && b.id === currentHoldId;
            if (sameHold) return false;
          }
          return overlaps(rangeStart, rangeEnd, b.start, b.end);
        });
      }

      const seriesId = `${safeSlug}-${Date.now()}`;

      for (const pair of servicePairs) {
        const baseStart = combineYMDTimeToDate(pair.day, pair.time);
        const durationMin = Number(pair.service.durationMin ?? 0) || 30;
        const occurrences: Date[] = [baseStart];
        const holdRef = pair.holdId ? doc(db, "tenants", safeSlug, "holds", pair.holdId) : null;
        const clientId = normalizePhoneId(customerPhone);

        if (isRecurring) {
          for (let i = 1; i <= 7; i += 1) {
            const next = new Date(baseStart);
            if (recurringOption === "weekly") next.setDate(next.getDate() + 7 * i);
            if (recurringOption === "biweekly") next.setDate(next.getDate() + 14 * i);
            if (recurringOption === "monthly") next.setMonth(next.getMonth() + i);
            occurrences.push(next);
          }
        }

        const cal = proCalendars[pair.professionalId] ?? null;

        if (!holdRef) {
          openModal(
            "Pré-reserva expirada",
            "Sua pré-reserva expirou. Selecione uma nova data e horário.",
            "error"
          );
          return;
        }

        const holdSnap = await getDoc(holdRef);
        if (!holdSnap.exists()) {
          openModal(
            "Pré-reserva perdida",
            "Outra pessoa acabou de reservar esse horário. Selecione uma nova data.",
            "error"
          );
          if (pair.holdId) removeLocalHold(pair.professionalId, pair.holdId);
          setScheduleByService((prev) => ({
            ...prev,
            [pair.service.id]: { professionalId: pair.professionalId, day: pair.day, time: "", holdId: null },
          }));
          return;
        }

        const holdData = holdSnap.data() as any;
        const holdExpired = isHoldExpired((holdData?.holdExpiresAt as Timestamp | null | undefined) ?? null);
        const sameSession = String(holdData?.holdSessionId ?? "") === holdSessionIdRef.current;
        if (String(holdData?.status ?? "") !== "hold" || holdExpired || !sameSession) {
          openModal(
            "Pré-reserva expirada",
            "Sua pré-reserva expirou ou foi usada por outra pessoa. Selecione uma nova data.",
            "error"
          );
          if (pair.holdId) removeLocalHold(pair.professionalId, pair.holdId);
          setScheduleByService((prev) => ({
            ...prev,
            [pair.service.id]: { professionalId: pair.professionalId, day: pair.day, time: "", holdId: null },
          }));
          return;
        }

        for (const occStart of occurrences) {
          const occEnd = new Date(occStart);
          occEnd.setMinutes(occEnd.getMinutes() + durationMin);
          const occYmd = toYMD(occStart);

          if (!cal || !isDayAllowedGivenCal(cal, occYmd) || isDayWithinAbsences(cal, occYmd)) {
            openModal(
              "Data indisponível",
              "Algum profissional não atende nessa data (folga/férias/ausência/calendário).",
              "error"
            );
            return;
          }

          const conflict = await hasConflictForRange(
            pair.professionalId,
            occStart,
            occEnd,
            occYmd,
            occStart.getTime() === baseStart.getTime() ? pair.holdId : null
          );
          if (conflict) {
            if (pair.holdId) {
              removeLocalHold(pair.professionalId, pair.holdId);
              await releaseHold(pair.holdId, pair.service.id);
            }
            openModal("Horário indisponível", "Esse horário acabou de ser reservado. Escolha outro.", "error");
            return;
          }

          await addDoc(collection(db, "tenants", safeSlug, "bookings"), {
            tenantId: safeSlug,
            serviceIds: [pair.service.id],
            serviceNames: [pair.service.name],
            serviceId: pair.service.id,
            serviceName: pair.service.name,
            durationMin,
            price: Number(pair.service.price ?? 0) || 0,

            professionalId: pair.professionalId,
            professionalName: pros.find((p) => p.id === pair.professionalId)?.name ?? "",

            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            clientId,

            startAt: Timestamp.fromDate(occStart),
            endAt: Timestamp.fromDate(occEnd),

            recurring: Boolean(isRecurring),
            recurringOption: isRecurring ? recurringOption : null,
            seriesId: isRecurring ? `${seriesId}-${pair.service.id}` : null,

            couponCode: couponApplied ? couponCode.trim().toUpperCase() : null,
            couponPercent: couponApplied ? Number(couponPercent ?? 0) : 0,
            total: Number(total ?? 0),

            status: "confirmed",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (pair.holdId) {
          await releaseHold(pair.holdId, pair.service.id);
          removeLocalHold(pair.professionalId, pair.holdId);
        }
      }

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

      setProBookingsMap((prev) => {
        const next = { ...prev };
        servicePairs.forEach((p) => {
          const list = next[p.professionalId] ? [...next[p.professionalId]] : [];
          list.push({
            startAt: Timestamp.fromDate(combineYMDTimeToDate(p.day, p.time)),
            endAt: Timestamp.fromDate(
              (() => {
                const d = combineYMDTimeToDate(p.day, p.time);
                d.setMinutes(d.getMinutes() + (Number(p.service.durationMin ?? 0) || 30));
                return d;
              })()
            ),
            durationMin: Number(p.service.durationMin ?? 0) || 30,
            professionalId: p.professionalId,
            status: "confirmed",
          });
          next[p.professionalId] = list;
        });
        return next;
      });

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
        `Obrigado, ${customerName.trim()}!\n\nSeu agendamento foi confirmado.\n\nServiços: ${selectedSvcs
          .map((s) => s.name)
          .join(" + ")}\nProfissionais: ${pros.map((p) => p.name).join(" + ")}\nTotal: R$ ${total.toFixed(2).replace(".", ",")}`,
        "success",
        "center"
      );
      setReloadOnClose(true);
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
                  onClick={() => {
                    setModalOpen(false);
                    if (reloadOnClose && modalVariant === "success" && typeof window !== "undefined") {
                      window.location.reload();
                    }
                  }}
                  className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    if (reloadOnClose && modalVariant === "success" && typeof window !== "undefined") {
                      window.location.reload();
                    }
                  }}
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
                      const blocked = !isDayAllowedForCurrent(ymd);

                      return (
                        <button
                          key={ymd}
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            if (blocked) return;
                            if (currentService) {
                              const holdId = scheduleByService[currentService.id]?.holdId ?? null;
                              const holdProId = scheduleByService[currentService.id]?.professionalId ?? "";
                              if (holdId) {
                                if (holdProId) removeLocalHold(holdProId, holdId);
                                void releaseHold(holdId, currentService.id);
                              }
                            }
                            setSelectedDay(ymd);
                            setSelectedTime("");
                            if (currentService) {
                              setScheduleByService((prev) => ({
                                ...prev,
                                [currentService.id]: {
                                  professionalId: currentProfessionalId,
                                  day: ymd,
                                  time: "",
                                  holdId: null,
                                },
                              }));
                            }
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

        {/* Modal de serviços (grid) */}
        {servicesModalOpen && (
          <div className="fixed inset-0 z-[997] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setServicesModalOpen(false)}
            />
            <div className="relative w-full max-w-[520px] bg-white rounded-3xl border border-slate-100 card-shadow p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-600">
                    <span className="material-symbols-outlined">category</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm font-black text-slate-900">Selecione os serviços</h3>
                    <p className="text-[12px] font-medium text-slate-500 whitespace-pre-line mt-1">
                      Escolha 1 ou mais serviços para continuar.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setServicesModalOpen(false)}
                  className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 max-h-[320px] overflow-auto">
                {services.map((s) => {
                  const active = selectedServiceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!isSalonOpenSelectedDay}
                      onClick={() => toggleService(s.id)}
                      className={[
                        "p-3 rounded-2xl border text-left transition-all",
                        active ? "selection-active" : "border-slate-100 bg-white hover:border-slate-200",
                        !isSalonOpenSelectedDay ? "opacity-50 cursor-not-allowed" : "",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "w-9 h-9 rounded-xl flex items-center justify-center mb-2",
                          active ? "bg-[color:rgb(217_119_6/0.10)] text-client-primary" : "bg-slate-50 text-slate-400",
                        ].join(" ")}
                      >
                        <span className="material-symbols-outlined">{s.icon}</span>
                      </div>
                      <p className="text-[12px] font-bold text-slate-900">{s.name}</p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {s.durationMin} min • R$ {s.price}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setServicesModalOpen(false)}
                  className="flex-1 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setServicesModalOpen(false)}
                  className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de ordenação dos serviços */}
        {orderModalOpen && (
          <div className="fixed inset-0 z-[996] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setOrderModalOpen(false)}
            />
            <div className="relative w-full max-w-[520px] bg-white rounded-3xl border border-slate-100 card-shadow p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-600">
                    <span className="material-symbols-outlined">reorder</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm font-black text-slate-900">Ordene os serviços</h3>
                    <p className="text-[12px] font-medium text-slate-500 whitespace-pre-line mt-1">
                      Defina por qual serviço o cliente irá começar.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOrderModalOpen(false)}
                  className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="mt-4 space-y-3 max-h-[320px] overflow-auto">
                {selectedServices.map((svc, index) => (
                  <div key={svc.id} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400">
                      <span className="material-symbols-outlined">{svc.icon}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-slate-900">{svc.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {svc.durationMin} min • R$ {svc.price}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSelectedService(index, Math.max(0, index - 1))}
                        disabled={index === 0}
                        className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-600 disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedService(index, Math.min(selectedServices.length - 1, index + 1))}
                        disabled={index === selectedServices.length - 1}
                        className="w-9 h-9 rounded-xl border border-slate-100 bg-slate-50 text-slate-600 disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentServiceIndex(index);
                          setOrderModalOpen(false);
                        }}
                        className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-[11px] font-black"
                      >
                        Começar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setOrderModalOpen(false)}
                  className="flex-1 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-sm active:scale-[0.99]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setOrderModalOpen(false)}
                  className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-extrabold text-sm shadow-xl shadow-slate-200 active:scale-[0.99]"
                >
                  Confirmar
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
                <span className="text-[11px] font-semibold tracking-wide uppercase">
                  {salonAddress || publicLink}
                </span>
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
          {/* 1. Seus Dados */}
          <section className="px-6 space-y-4">
            <div className="pt-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">1. Seus Dados</h2>
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
                    onChange={(e) => setCustomerPhone(formatPhoneBR(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Serviço */}
          <section className="space-y-4">
            <div className="px-6 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">2. Selecione o Serviço</h2>
              <div className="flex items-center gap-3">
                {selectedServiceIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOrderModalOpen(true)}
                    className="text-[10px] font-bold text-slate-500"
                  >
                    Ordenar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setServicesModalOpen(true)}
                  className="text-[10px] font-bold text-client-primary"
                >
                  Ver todos
                </button>
              </div>
            </div>
            {!isSalonOpenSelectedDay ? (
              <div className="px-6 text-[11px] font-semibold text-slate-400">
                Salão fechado no dia selecionado. Escolha outra data para selecionar serviços e profissionais.
              </div>
            ) : null}

            <div
              ref={servicesCarouselRef}
              onMouseDown={handleCarouselMouseDown}
              onMouseLeave={handleCarouselMouseLeave}
              onMouseUp={handleCarouselMouseUp}
              onMouseMove={handleCarouselMouseMove}
              className="flex gap-4 overflow-x-auto overflow-y-hidden px-6 no-scrollbar snap-x snap-mandatory cursor-grab active:cursor-grabbing select-none touch-pan-x"
            >
              {services.map((s) => {
                const active = selectedServiceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!isSalonOpenSelectedDay}
                    onClick={() => {
                      if (servicesDrag.current.moved) {
                        servicesDrag.current.moved = false;
                        return;
                      }
                      toggleService(s.id);
                    }}
                    className={[
                      "min-w-[160px] bg-white p-4 rounded-ios border border-slate-100 card-shadow text-left transition-all snap-start",
                      active ? "selection-active" : "hover:border-slate-200",
                      !isSalonOpenSelectedDay ? "opacity-50 cursor-not-allowed" : "",
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
                    {active && (
                      <div className="mt-2 flex items-center gap-1.5 text-client-primary text-[10px] font-bold uppercase">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Selecionado
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Profissional */}
          <section className="space-y-4">
            <div className="px-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">3. Escolha o Profissional</h2>
            </div>

            <div className="space-y-4 px-6">
              {!selectedServiceIds.length ? (
                <div className="text-[11px] text-slate-400 font-semibold">
                  Selecione pelo menos 1 serviço para escolher os profissionais.
                </div>
              ) : null}
              {selectedServices.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {selectedServices.map((svc, idx) => {
                    const active = idx === currentServiceIndex;
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setCurrentServiceIndex(idx)}
                        className={[
                          "h-7 px-3 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap",
                          active
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {svc.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {selectedServiceIds.length > 0 && currentService ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etapa</span>
                    <span className="text-[11px] font-extrabold text-slate-700">
                      {currentServiceIndex + 1} de {selectedServices.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentServiceIndex((i) => Math.max(0, i - 1))}
                      className="h-7 px-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 bg-white"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentServiceIndex((i) => Math.min(selectedServices.length - 1, i + 1))}
                      className="h-7 px-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 bg-white"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              ) : null}
              {currentHoldId && holdRemainingSec !== null ? (
                <div className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-bold">
                  Pré-reserva ativa • expira em {formatHoldTimer(holdRemainingSec)}
                </div>
              ) : null}
              {selectedServices.map((svc) => {
                if (!currentService || svc.id !== currentService.id) return null;
                const pros = getProfessionalsForService(svc);
                return (
                  <div key={svc.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-slate-700">{svc.name}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Profissional</span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                      {pros.length === 0 ? (
                        <div className="text-[11px] text-slate-400 font-semibold">
                          Nenhum profissional disponível para este serviço.
                        </div>
                      ) : null}
                      {pros.map((p) => {
                        const active = scheduleByService[svc.id]?.professionalId === p.id;
                        const avatar = "";
                        return (
                          <button
                            key={p.id}
                            type="button"
                          disabled={!isSalonOpenSelectedDay}
                            onClick={() => {
                              const holdId = scheduleByService[svc.id]?.holdId ?? null;
                              const holdProId = scheduleByService[svc.id]?.professionalId ?? "";
                              if (holdId) {
                                if (holdProId) removeLocalHold(holdProId, holdId);
                                void releaseHold(holdId, svc.id);
                              }
                              setScheduleByService((prev) => ({
                                ...prev,
                                [svc.id]: {
                                  professionalId: p.id,
                                  day: prev[svc.id]?.day ?? selectedDay,
                                  time: "",
                                  holdId: null,
                                },
                              }));
                              setSelectedTime("");
                            }}
                          className={[
                            "flex flex-col items-center gap-2",
                            active ? "" : "opacity-60 hover:opacity-80",
                            !isSalonOpenSelectedDay ? "opacity-40 cursor-not-allowed" : "",
                          ].join(" ")}
                          >
                            <div className="relative">
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
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. Data e Horário */}
          <section className="space-y-4">
            <div className="px-6 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">4. Data e Horário</h2>

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
                const blocked = !isDayAllowedForCurrent(d.ymd);

                return (
                  <button
                    key={d.ymd}
                    type="button"
                    onClick={() => {
                      if (blocked) return;
                      if (currentService) {
                        const holdId = scheduleByService[currentService.id]?.holdId ?? null;
                        const holdProId = scheduleByService[currentService.id]?.professionalId ?? "";
                        if (holdId) {
                          if (holdProId) removeLocalHold(holdProId, holdId);
                          void releaseHold(holdId, currentService.id);
                        }
                      }
                      setSelectedDay(d.ymd);
                      setSelectedTime("");
                      if (currentService) {
                        setScheduleByService((prev) => ({
                          ...prev,
                          [currentService.id]: {
                            professionalId: currentProfessionalId,
                            day: d.ymd,
                            time: "",
                            holdId: null,
                          },
                        }));
                      }
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
              ) : Object.keys(proCalendars).length === 0 ? (
                <div className="col-span-4">
                  <div className="py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 text-[11px] font-semibold text-center">
                    Não foi possível carregar a agenda do profissional.
                  </div>
                </div>
              ) : (slotsByDay[selectedDay] ?? []).length === 0 && isDayAllowedForCurrent(selectedDay) ? (
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
                      onClick={async () => {
                        if (!slot.available) return;
                        if (!currentService) return;
                        const prevHoldId = scheduleByService[currentService.id]?.holdId ?? null;
                        if (prevHoldId) {
                          removeLocalHold(currentProfessionalId, prevHoldId);
                          await releaseHold(prevHoldId, currentService.id);
                        }
                        try {
                          const holdId = await createHoldForSelection({
                            service: currentService,
                            professionalId: currentProfessionalId,
                            day: selectedDay,
                            time: slot.time,
                          });
                          const startAt = combineYMDTimeToDate(selectedDay, slot.time);
                          const endAt = new Date(startAt);
                          endAt.setMinutes(endAt.getMinutes() + (Number(currentService.durationMin ?? 0) || 30));
                          addLocalHold({
                            professionalId: currentProfessionalId,
                            holdId,
                            startAt,
                            endAt,
                            durationMin: Number(currentService.durationMin ?? 0) || 30,
                          });
                          setSelectedTime(slot.time);
                          setScheduleByService((prev) => ({
                            ...prev,
                            [currentService.id]: {
                              professionalId: currentProfessionalId,
                              day: selectedDay,
                              time: slot.time,
                              holdId,
                            },
                          }));
                        } catch (err: any) {
                          if (String(err?.message ?? "") === "phone_required") {
                            openModal(
                              "Faltou o WhatsApp",
                              "Preencha seu WhatsApp antes de escolher o horário.",
                              "error"
                            );
                          } else {
                            openModal(
                              "Horário indisponível",
                              "Esse horário acabou de ser reservado. Selecione outro.",
                              "error"
                            );
                          }
                          setSelectedTime("");
                          setRefreshKey((k) => k + 1);
                        }
                      }}
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

          {/* 5. Cupom e Pagamento */}
          <section className="px-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">5. Cupom e Pagamento</h2>

              <div className="bg-white p-5 rounded-ios border border-slate-100 card-shadow space-y-5">
                <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl focus-within:ring-2 focus-within:ring-[color:rgb(217_119_6/0.10)] transition-all">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">confirmation_number</span>
                    <input
                      className="flex-1 min-w-0 bg-transparent border-none p-0 h-10 text-sm font-bold placeholder:text-slate-400 focus:ring-0"
                      placeholder="Inserir código"
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onApplyCoupon}
                    className="h-9 px-6 mx-auto bg-client-primary text-white text-[11px] font-black uppercase tracking-wider rounded-lg shadow-sm shadow-[color:rgb(217_119_6/0.20)] active:scale-95 transition-all"
                  >
                    Aplicar
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Resumo do agendamento
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {selectedServices.length} serviço(s)
                    </span>
                  </div>
                  {selectedServices.length === 0 ? (
                    <div className="text-[11px] text-slate-400 font-semibold">Nenhum serviço selecionado.</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedServices.map((svc) => {
                        const schedule = scheduleByService[svc.id];
                        const proName =
                          professionals.find((p) => p.id === schedule?.professionalId)?.name ?? "—";
                        return (
                          <div key={svc.id} className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-slate-900">{svc.name}</span>
                              <span className="text-[10px] text-slate-500">
                                {proName} • {schedule?.day || "—"} {schedule?.time || ""}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-700">
                              R$ {Number(svc.price ?? 0).toFixed(2).replace(".", ",")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
          </section>
        </main>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] p-6 bg-background-offwhite border-t border-slate-100 z-50">
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
