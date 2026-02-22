// src/app/(public)/c/[slug]/services/[serviceId]/book/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import BookClient from "./BookClient"
import { getTenantBySlug } from "@/lib/tenant"
import { sql } from "@/lib/db"

type ServiceRow = {
  id: string
  name: string
  duration_minutes: number
  price_cents: number
  description: string | null
}

const fallbackImage =
  "https://images.unsplash.com/photo-1587019158082-1d0a4f5d47a3?auto=format&fit=crop&w=1200&q=80"

function moneyBRLFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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

  // ✅ sem generic no template (evita erro TS)
  // ✅ normalizeRows suporta retorno como ARRAY ou como { rows: [...] }
  const res = await sql`
    select id, name, duration_minutes, price_cents, description
    from public.services
    where id = ${serviceId}::uuid
      and tenant_id = ${tenant.id}::uuid
      and is_active = true
    limit 1
  `
  const rows = normalizeRows<ServiceRow>(res)

  const service = rows[0]
  if (!service?.id) return notFound()

  const confirmHref = `/c/${slug}/services/${service.id}/confirm`

  const defaultDate = typeof sp.date === "string" ? sp.date : ""
  const defaultTime = typeof sp.time === "string" ? sp.time : ""

  // ✅ agora é proId (UUID)
  const defaultProId = typeof sp.proId === "string" ? sp.proId : ""

  return (
    <MobileShell
      slug={slug}
      title="Agendar Horário"
      subtitle="Selecione data e horário"
      active="services"
      showBottomNav={false}
    >
      {/* Top bar estilo wizard */}
      <div className="sticky top-0 z-30 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between p-4 h-16">
          <Link
            href={`/c/${slug}/services/${service.id}`}
            className="text-primary p-1 active:scale-[0.98]"
            aria-label="Voltar"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[24px]" />
          </Link>
          <h1 className="text-lg font-bold flex-1 text-center pr-8">Agendar Horário</h1>
        </div>

        {/* Progress (66%) */}
        <div className="px-4 pb-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Passo 2 de 3</span>
            <span className="text-xs font-medium text-primary">66%</span>
          </div>
          <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: "66%" }} />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-32">
        {/* Service mini card */}
        <section>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-black/5 dark:border-white/10 flex gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fallbackImage} alt={service.name} className="w-full h-full object-cover" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-base truncate">{service.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Serviço</p>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {moneyBRLFromCents(service.price_cents)}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <MaterialIcon name="schedule" className="text-[16px]" />
                <span className="text-xs">Duração: {service.duration_minutes} min</span>
              </div>
            </div>
          </div>
        </section>

        <BookClient
          slug={slug}
          serviceId={service.id}
          confirmHref={confirmHref}
          priceLabel={moneyBRLFromCents(service.price_cents)}
          durationMin={service.duration_minutes}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          defaultPro={defaultProId} // ✅ proId
        />
      </div>
    </MobileShell>
  )
}