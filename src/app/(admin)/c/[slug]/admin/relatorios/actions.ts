"use server"

import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"

export type ReportsPeriod = "daily" | "weekly" | "monthly"

export type ReportsKpis = {
  grossProfitLabel: string // ex: "R$ 42.8k"
  grossProfitDeltaLabel: string // ex: "+14%"
  ticketAvgLabel: string // ex: "R$ 385"
  ticketAvgDeltaLabel: string // ex: "+5%"
}

export type ReportsLinePoint = {
  label: string // ex: "SEM 01"
  done: number
  cancelled: number
}

export type TopServiceRow = {
  serviceId: string
  name: string
  count: number
  pct: number // 0..100
}

export type TopProfessionalRow = {
  professionalId: string
  name: string
  roleLabel: string
  revenueCents: number
  revenueLabel: string
  sharePct: number // 0..100
}

export type ReportsPayload = {
  period: ReportsPeriod
  kpis: ReportsKpis
  series: ReportsLinePoint[]
  topServices: TopServiceRow[]
  topProfessionals: TopProfessionalRow[]
}

function safeInt(v: unknown, def = 0) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.trunc(n)
}

function brlFromCents(cents: number) {
  const v = (cents || 0) / 100
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function brlCompactFromCents(cents: number) {
  const v = (cents || 0) / 100
  if (v >= 1000) {
    const k = v / 1000
    const s = k.toFixed(1).replace(".0", "").replace(".", ",")
    return `R$ ${s}k`
  }
  return brlFromCents(cents)
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function endExclusiveOfDay(date: Date) {
  return addDays(startOfDay(date), 1)
}

function startOfWeekMonday(date: Date) {
  const d = startOfDay(date)
  const day = d.getDay() // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function endExclusiveOfWeekMonday(date: Date) {
  return addDays(startOfWeekMonday(date), 7)
}

// inicio do mês (local)
function monthStart(date = new Date()) {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

// inicio do próximo mês
function monthEndExclusive(date = new Date()) {
  const d = monthStart(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

/**
 * Resolve tenant_id via slug e garante tenant-safe.
 */
async function getTenantIdBySlug(slug: string): Promise<string> {
  const r = await sql<{ id: string }>`
    SELECT id
    FROM public.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  if (!r.rows[0]?.id) throw new Error("Tenant não encontrado para esse slug.")
  return r.rows[0].id
}

/**
 * Range conforme período:
 * - daily: hoje
 * - weekly: semana atual (segunda..domingo)
 * - monthly: mês atual
 */
function resolveRange(period: ReportsPeriod) {
  const now = new Date()

  if (period === "daily") {
    const start = startOfDay(now)
    const end = endExclusiveOfDay(now)
    return { start, end }
  }

  if (period === "weekly") {
    const start = startOfWeekMonday(now)
    const end = endExclusiveOfWeekMonday(now)
    return { start, end }
  }

  const start = monthStart(now)
  const end = monthEndExclusive(now)
  return { start, end }
}

/**
 * Retorna KPIs e tabelas para a tela de relatórios do ADMIN.
 * Se você ainda não tem "amount_cents" em appointments,
 * usa services.price_cents como fallback.
 */
export async function fetchAdminReports(params: {
  slug: string
  period?: ReportsPeriod
}): Promise<ReportsPayload> {
  const slug = String(params.slug || "").trim()
  if (!slug) throw new Error("slug é obrigatório")

  const period: ReportsPeriod = params.period ?? "monthly"
  const tenantId = await getTenantIdBySlug(slug)

  const { start, end } = resolveRange(period)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  // 1) KPIs
  const kpiR = await sql<{
    total_done: number
    revenue_cents: string | number
    avg_ticket_cents: string | number
  }>`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(a.status, '') IN ('done','completed','paid','confirmed'))::int AS total_done,
      COALESCE(SUM(
        COALESCE(a.amount_cents, s.price_cents, 0)
      ), 0) AS revenue_cents,
      COALESCE(AVG(
        COALESCE(a.amount_cents, s.price_cents, 0)
      ), 0) AS avg_ticket_cents
    FROM public.appointments a
    LEFT JOIN public.services s
      ON s.id = a.service_id
     AND s.tenant_id = ${tenantId}::uuid
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.start_at >= ${startIso}::timestamptz
      AND a.start_at <  ${endIso}::timestamptz
  `

  const revenueCents = safeInt(kpiR.rows[0]?.revenue_cents, 0)
  const avgTicketCents = safeInt(kpiR.rows[0]?.avg_ticket_cents, 0)

  // 2) Série semanal do mês atual (SEM 01..04/05)
  const now = new Date()
  const mStart = monthStart(now)
  const mEnd = monthEndExclusive(now)
  const mStartIso = mStart.toISOString()
  const mEndIso = mEnd.toISOString()

  const seriesR = await sql<{
    week_index: number
    done: number
    cancelled: number
  }>`
    WITH base AS (
      SELECT
        a.start_at,
        COALESCE(a.status, '') AS status
      FROM public.appointments a
      WHERE a.tenant_id = ${tenantId}::uuid
        AND a.start_at >= ${mStartIso}::timestamptz
        AND a.start_at <  ${mEndIso}::timestamptz
    )
    SELECT
      (FLOOR(EXTRACT(EPOCH FROM (start_at - ${mStartIso}::timestamptz)) / 604800) + 1)::int AS week_index,
      COUNT(*) FILTER (WHERE status IN ('done','completed','paid','confirmed'))::int AS done,
      COUNT(*) FILTER (WHERE status IN ('cancelled','canceled','no_show'))::int AS cancelled
    FROM base
    GROUP BY 1
    ORDER BY 1 ASC
  `

  const byWeek = new Map<number, { done: number; cancelled: number }>()
  for (const row of seriesR.rows) {
    byWeek.set(row.week_index, { done: safeInt(row.done), cancelled: safeInt(row.cancelled) })
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const maxWeeks = Math.ceil(daysInMonth / 7)

  const series: ReportsLinePoint[] = []
  for (let i = 1; i <= Math.max(4, Math.min(5, maxWeeks)); i++) {
    const v = byWeek.get(i) ?? { done: 0, cancelled: 0 }
    series.push({ label: `SEM ${String(i).padStart(2, "0")}`, done: v.done, cancelled: v.cancelled })
  }

  // 3) Top serviços
  const topServicesR = await sql<{
    service_id: string
    name: string
    cnt: number
  }>`
    SELECT
      s.id AS service_id,
      s.name AS name,
      COUNT(*)::int AS cnt
    FROM public.appointments a
    JOIN public.services s
      ON s.id = a.service_id
     AND s.tenant_id = ${tenantId}::uuid
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.start_at >= ${startIso}::timestamptz
      AND a.start_at <  ${endIso}::timestamptz
      AND COALESCE(a.status,'') NOT IN ('cancelled','canceled')
    GROUP BY s.id, s.name
    ORDER BY cnt DESC
    LIMIT 8
  `

  const maxServiceCount = Math.max(
    1,
    ...topServicesR.rows.map((r: { cnt: number }) => safeInt(r.cnt, 0))
  )

  const topServices: TopServiceRow[] = topServicesR.rows.map(
    (r: { service_id: string; name: string; cnt: number }) => ({
      serviceId: r.service_id,
      name: r.name,
      count: safeInt(r.cnt, 0),
      pct: clampPct((safeInt(r.cnt, 0) / maxServiceCount) * 100),
    })
  )

  // 4) Top profissionais (por receita)
  const topProsR = await sql<{
    professional_id: string
    name: string
    revenue_cents: string | number
  }>`
    SELECT
      p.id AS professional_id,
      p.name AS name,
      COALESCE(SUM(COALESCE(a.amount_cents, s.price_cents, 0)), 0) AS revenue_cents
    FROM public.appointments a
    JOIN public.professionals p
      ON p.id = a.professional_id
     AND p.tenant_id = ${tenantId}::uuid
    LEFT JOIN public.services s
      ON s.id = a.service_id
     AND s.tenant_id = ${tenantId}::uuid
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.start_at >= ${startIso}::timestamptz
      AND a.start_at <  ${endIso}::timestamptz
      AND COALESCE(a.status,'') IN ('done','completed','paid','confirmed')
    GROUP BY p.id, p.name
    ORDER BY revenue_cents DESC
    LIMIT 10
  `

  const totalRevenueTopPros = topProsR.rows.reduce(
    (acc: number, r: { revenue_cents: string | number }) => acc + safeInt(r.revenue_cents, 0),
    0
  )
  const denom = Math.max(1, totalRevenueTopPros)

  const topProfessionals: TopProfessionalRow[] = topProsR.rows.map(
    (r: { professional_id: string; name: string; revenue_cents: string | number }, idx: number) => {
      const cents = safeInt(r.revenue_cents, 0)
      const pct = clampPct((cents / denom) * 100)

      const roleLabel =
        idx === 0 ? "Líder de Faturamento" : idx === 1 ? "Profissional Destaque" : "Profissional"

      return {
        professionalId: r.professional_id,
        name: r.name,
        roleLabel,
        revenueCents: cents,
        revenueLabel: brlFromCents(cents),
        sharePct: pct,
      }
    }
  )

  // 5) Delta placeholders (depois comparamos com período anterior)
  const payload: ReportsPayload = {
    period,
    kpis: {
      grossProfitLabel: brlCompactFromCents(revenueCents),
      grossProfitDeltaLabel: "+0%",
      ticketAvgLabel: brlFromCents(avgTicketCents),
      ticketAvgDeltaLabel: "+0%",
    },
    series,
    topServices,
    topProfessionals,
  }

  return payload
}