// src/app/(public)/c/[slug]/services/[serviceId]/confirm/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import ConfirmClient, { SubmitProxy } from "./ConfirmClient"
import { getTenantBySlug } from "@/lib/tenant"
import { sql } from "@/lib/db"

type ServiceRow = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price_cents: number
  image_url: string | null
  category: string | null
}

type ProRow = {
  id: string
  name: string
  specialty: string | null
  photo_url: string | null
}

const fallbackImage =
  "https://images.unsplash.com/photo-1587019158082-1d0a4f5d47a3?auto=format&fit=crop&w=1200&q=80"

function moneyBRLFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDatePt(iso?: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
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
  return `${d.getDate()} de ${months[d.getMonth()]}`
}

function normalizeRows<T>(res: unknown): T[] {
  const anyRes = res as any
  if (Array.isArray(anyRes)) return anyRes as T[]
  if (anyRes && Array.isArray(anyRes.rows)) return anyRes.rows as T[]
  return []
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; serviceId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug, serviceId } = await params
  const sp = (await searchParams) ?? {}

  const tenant = await getTenantBySlug(slug)
  if (!tenant || tenant.status !== "active") return notFound()

  // booking params (vindos do /book)
  const date = typeof sp.date === "string" ? sp.date : ""
  const time = typeof sp.time === "string" ? sp.time : ""
  const proId = typeof sp.proId === "string" ? sp.proId : ""

  if (!date || !time || !proId) return notFound()

  // ✅ service real do banco (sem mock) — robusto para {rows} ou array
  const sRes = await sql`
    select
      id,
      name,
      description,
      duration_minutes,
      price_cents,
      image_url,
      category
    from public.services
    where id = ${serviceId}::uuid
      and tenant_id = ${tenant.id}::uuid
      and is_active = true
    limit 1
  `
  const sRows = normalizeRows<ServiceRow>(sRes)
  const service = sRows[0]
  if (!service?.id) return notFound()

  // ✅ profissional real do banco — robusto para {rows} ou array
  const pRes = await sql`
    select id, name, specialty, photo_url
    from public.professionals
    where id = ${proId}::uuid
      and tenant_id = ${tenant.id}::uuid
      and is_active = true
    limit 1
  `
  const pRows = normalizeRows<ProRow>(pRes)
  const pro = pRows[0]
  if (!pro?.id) return notFound()

  const dateLabel = formatDatePt(date)
  const timeLabel = time
  const totalLabel = moneyBRLFromCents(Number(service.price_cents || 0))
  const successHref = `/c/${slug}/services/${service.id}/success`

  const backHref = `/c/${slug}/services/${service.id}/book?date=${encodeURIComponent(
    date
  )}&time=${encodeURIComponent(time)}&proId=${encodeURIComponent(proId)}`

  return (
    <MobileShell
      slug={slug}
      title="Confirmar Agendamento"
      subtitle="Passo final: Confirmação"
      active="services"
      showBottomNav={false}
    >
      {/* Header interno (sticky + progress) */}
      <div className="sticky top-0 z-30 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between p-4 h-16">
          <Link href={backHref} className="text-primary p-1 active:scale-[0.98]" aria-label="Voltar">
            <MaterialIcon name="arrow_back_ios_new" className="text-[24px]" />
          </Link>
          <h1 className="text-lg font-bold flex-1 text-center pr-8">Confirmar Agendamento</h1>
        </div>

        <div className="px-4 pb-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Passo Final: Confirmação</span>
            <span className="text-xs font-medium text-primary">100%</span>
          </div>
          <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full w-full" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-32">
        {/* Service Summary Card */}
        <section className="@container">
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-black/5 dark:border-white/10 flex flex-col @sm:flex-row">
            <div
              className="w-full @sm:w-32 h-48 @sm:h-auto bg-center bg-cover"
              style={{ backgroundImage: `url('${service.image_url || fallbackImage}')` }}
            />
            <div className="p-4 flex flex-col justify-center flex-1">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {service.name}
                  </h2>
                  <p className="text-primary font-medium mt-1">{service.category || "Serviço"}</p>
                </div>
                <span className="text-xl font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {moneyBRLFromCents(Number(service.price_cents || 0)).replace(",00", "")}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3 text-slate-500 dark:text-slate-400">
                <MaterialIcon name="schedule" className="text-[16px]" />
                <span className="text-sm">Duração: {service.duration_minutes} min</span>
              </div>
            </div>
          </div>
        </section>

        {/* Booking Details */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Detalhes da Reserva
          </h3>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-black/5 dark:border-white/10 divide-y divide-black/5 dark:divide-white/10">
            <div className="flex items-center p-4 gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <MaterialIcon name="calendar_today" className="text-[20px]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Data</p>
                <p className="text-base font-semibold">{dateLabel}</p>
              </div>
            </div>

            <div className="flex items-center p-4 gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <MaterialIcon name="alarm" className="text-[20px]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Horário</p>
                <p className="text-base font-semibold">{timeLabel}</p>
              </div>
            </div>

            <div className="flex items-center p-4 gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <MaterialIcon name="person" className="text-[20px]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Profissional</p>
                <p className="text-base font-semibold">{pro.name}</p>
                {pro.specialty ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{pro.specialty}</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Customer Form */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Seus Dados
          </h3>

          <ConfirmClient
            slug={slug}
            serviceId={service.id}
            successHref={successHref}
            totalLabel={totalLabel}
            defaultDate={date}
            defaultTime={timeLabel}
            defaultPro={proId} // ✅ proId
          />

          <div className="flex items-center justify-center gap-2 py-2">
            <MaterialIcon name="lock" className="text-[16px] text-emerald-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Seus dados estão seguros e protegidos.</p>
          </div>
        </section>
      </div>

      {/* Footer fixo */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-black/5 dark:border-white/10 px-4 pt-4 pb-6">
        <div className="max-w-[430px] mx-auto flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Total:</span>
            <span className="text-2xl font-bold text-primary">{totalLabel}</span>
          </div>

          <SubmitProxy />
        </div>
      </footer>
    </MobileShell>
  )
}