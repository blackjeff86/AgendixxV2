// src/app/(public)/c/[slug]/services/[serviceId]/success/page.tsx
import Link from "next/link"
import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"
import { notFound } from "next/navigation"

type DbSuccessRow = {
  id: string
  start_at: string
  end_at: string
  customer_name: string
  customer_phone: string | null
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

function fmtDayPt(iso: string) {
  const d = new Date(iso)
  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]
  return `${weekdays[d.getUTCDay()]}, ${d.getUTCDate()} de ${months[d.getUTCMonth()]}`
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; serviceId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug, serviceId } = await params
  if (!isUuid(serviceId)) return notFound()

  const sp = (await searchParams) ?? {}
  const appointmentId = typeof sp.appointmentId === "string" ? sp.appointmentId : ""

  let db: DbSuccessRow | null = null

  if (appointmentId && isUuid(appointmentId)) {
    const tenant = await getTenantBySlug(slug)
    if (tenant?.id) {
      const r = await sql<DbSuccessRow[]>`
        select
          a.id,
          a.start_at::text as start_at,
          a.end_at::text as end_at,
          c.name as customer_name,
          c.phone as customer_phone
        from public.appointments a
        join public.customers c on c.id = a.customer_id
        where a.id = ${appointmentId}::uuid
          and a.tenant_id = ${tenant.id}::uuid
          and a.service_id = ${serviceId}::uuid
        limit 1
      `
      db = r[0] ?? null
    }
  }

  // fallback (mock visual)
  const title = "Agendamento Realizado!"
  const clinicName = "Agendixx"
  const dayLabel = db ? fmtDayPt(db.start_at) : "Segunda, 15 de Outubro"
  const timeLabel = db ? `${fmtTime(db.start_at)} - ${fmtTime(db.end_at)}` : "14:30 - 15:30"

  return (
    <MobileShell slug={slug} title={title} subtitle="Confirmação" active="services" showBottomNav={false}>
      <div className="p-6 text-center space-y-4">
        <div className="mx-auto size-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.35)]">
          <MaterialIcon name="check" className="text-[52px] text-white" filled />
        </div>

        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium">
          {db ? `Tudo certo, ${db.customer_name}!` : "Tudo certo para o seu procedimento."}
        </p>

        <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700 text-left space-y-3">
          <div className="text-sm font-bold">{clinicName}</div>

          <div className="flex items-center gap-2">
            <MaterialIcon name="calendar_today" className="text-[18px] text-primary" />
            <span className="font-medium">{dayLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <MaterialIcon name="schedule" className="text-[18px] text-primary" />
            <span className="font-medium">{timeLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <MaterialIcon name="person" className="text-[18px] text-primary" />
            <span className="font-medium">Profissional a confirmar</span>
          </div>

          {db?.customer_phone ? (
            <div className="flex items-center gap-2">
              <MaterialIcon name="call" className="text-[18px] text-primary" />
              <span className="font-medium">{db.customer_phone}</span>
            </div>
          ) : null}
        </div>

        <div className="pt-4">
          <Link
            href={`/c/${slug}`}
            className="inline-flex w-full justify-center py-4 bg-primary text-white rounded-xl font-bold"
          >
            Voltar para Home
          </Link>
        </div>
      </div>
    </MobileShell>
  )
}