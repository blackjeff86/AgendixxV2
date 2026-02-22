import Link from "next/link"
import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"
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

function moneyBRL(v: number) {
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant || tenant.status !== "active") return notFound()

  const services = await sql<ServiceRow[]>`
    select id, name, duration_minutes, price_cents, description
    from public.services
    where tenant_id = ${tenant.id}::uuid
      and is_active = true
    order by name asc
  `

  return (
    <MobileShell slug={slug} title="Lista de Serviços" active="services">
      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MaterialIcon
              name="search"
              className="text-primary/60 group-focus-within:text-primary transition-colors"
            />
          </div>
          <input
            className="block w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-none rounded-xl ring-1 ring-primary/10 focus:ring-2 focus:ring-primary text-sm shadow-sm placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Buscar procedimento ou tratamento..."
            type="text"
          />
        </div>
      </div>

      {/* Chips */}
      <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar pb-2">
        <button className="shrink-0 px-5 py-2 rounded-full bg-primary text-white text-sm font-medium shadow-md shadow-primary/20">
          Todos
        </button>
        {["Facial", "Corporal", "Massagem", "Depilação"].map((c) => (
          <button
            key={c}
            type="button"
            className="shrink-0 px-5 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium border border-primary/10 hover:border-primary/40 transition-colors"
          >
            {c}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4 px-4 space-y-4 pb-10">
        {services.map((s) => (
          <div
            key={s.id}
            className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-primary/5 group hover:border-primary/20 transition-all flex flex-col gap-3"
          >
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-primary/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={s.name} className="w-full h-full object-cover" src={fallbackImage} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors truncate">
                  {s.name}
                </h3>

                <div className="flex items-center gap-2 mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <MaterialIcon name="schedule" className="text-[14px]" />
                    {s.duration_minutes} min
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-primary font-bold text-sm">{moneyBRL(s.price_cents)}</span>
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {s.description || "Procedimento realizado com cuidado e excelência."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-800 pt-3">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Serviço
              </span>

              <Link
                href={`/c/${slug}/services/${s.id}`}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/20"
              >
                Selecionar
              </Link>
            </div>
          </div>
        ))}

        {services.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-primary/5">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nenhum serviço ativo encontrado para essa clínica.
            </p>
          </div>
        ) : null}
      </div>
    </MobileShell>
  )
}