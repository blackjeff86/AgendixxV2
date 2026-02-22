import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import Link from "next/link"
import { notFound } from "next/navigation"
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function moneyBRL(v: number) {
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function getRows<T>(res: any): T[] {
  return (res?.rows as T[]) ?? (res as T[]) ?? []
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; serviceId: string }>
}) {
  const { slug, serviceId } = await params
  if (!isUuid(serviceId)) return notFound()

  const tenant = await getTenantBySlug(slug)
  if (!tenant || tenant.status !== "active") return notFound()

  const r = await sql<ServiceRow[]>`
    select id, name, duration_minutes, price_cents, description
    from public.services
    where id = ${serviceId}::uuid
      and tenant_id = ${tenant.id}::uuid
      and is_active = true
    limit 1
  `
  const service = getRows<ServiceRow>(r)[0]
  if (!service) return notFound()

  const img = fallbackImage

  return (
    <MobileShell slug={slug} title="Detalhe do Serviço" active="services">
      {/* Hero Image */}
      <div className="relative h-[260px] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={service.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background-light dark:from-background-dark via-transparent to-black/20" />
      </div>

      {/* Card */}
      <div className="px-6 -mt-10 relative z-10">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-primary/5">
          <div className="flex justify-between items-start mb-2">
            <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full">
              Serviço
            </span>

            <div className="flex items-center gap-1 text-amber-500">
              <MaterialIcon name="star" filled />
              <span className="text-xs font-bold">4.9</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold">{service.name}</h1>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <MaterialIcon name="schedule" />
              <span>{service.duration_minutes} min</span>
            </div>

            <div className="text-xl font-bold text-primary">{moneyBRL(service.price_cents)}</div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-6 mt-6 pb-32">
        <h2 className="text-lg font-bold mb-3">Sobre o Tratamento</h2>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {service.description || "Procedimento realizado com cuidado e excelência."}
        </p>
      </div>

      {/* CTA Footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-white dark:bg-slate-900 border-t border-primary/5 z-50">
        <Link
          href={`/c/${slug}/services/${service.id}/book`}
          className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-primary/30 active:scale-[0.98] transition-all"
        >
          Agendar este Serviço
          <MaterialIcon name="calendar_month" />
        </Link>
      </div>
    </MobileShell>
  )
}
