import Link from "next/link"
import { notFound } from "next/navigation"
import { getTenantBySlug } from "@/lib/tenant"
import { sql } from "@/lib/db"
import MobileShell from "@/components/mobile/MobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type ServiceRow = {
  id: string
  name: string
  description: string | null
  price_cents: number
  duration_minutes: number
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant || tenant.status !== "active") return notFound()

  const services = await sql<ServiceRow[]>`
    select id, name, description, price_cents, duration_minutes
    from services
    where tenant_id = ${tenant.id}::uuid
      and is_active = true
    order by name asc
    limit 6
  `

  return (
    <MobileShell
      slug={tenant.slug}
      title={tenant.name}
      subtitle="Estética & Bem-estar"
      active="home"
    >
      {/* Hero */}
      <section className="px-6 py-6 text-center">
        <div className="relative mx-auto w-32 h-32 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-pulse" />
          <div className="rounded-full w-full h-full bg-primary/10 border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center">
            <MaterialIcon name="spa" className="text-primary text-[40px]" />
          </div>
        </div>

        <h2 className="text-2xl font-bold">Bem-vinda à {tenant.name}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Sua beleza, nosso cuidado e dedicação.
        </p>

        <Link
          href={`/c/${tenant.slug}/services`}
          className="mt-6 w-full py-4 bg-primary text-white rounded-xl font-bold text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <MaterialIcon name="event_available" className="text-xl" />
          Agendar Agora
        </Link>
      </section>

      {/* Quick stats (mock por enquanto) */}
      <section className="px-6 flex gap-3 mb-8">
        <div className="flex-1 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-1 text-center">
          <MaterialIcon name="star" className="text-yellow-500 text-xl" filled />
          <p className="text-sm font-bold">4.9 Estrelas</p>
          <p className="text-[10px] text-slate-400">Avaliação Google</p>
        </div>
        <div className="flex-1 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-1 text-center">
          <MaterialIcon name="group" className="text-primary text-xl" />
          <p className="text-sm font-bold">1k+ Clientes</p>
          <p className="text-[10px] text-slate-400">Atendidos com amor</p>
        </div>
      </section>

      {/* Categorias (mock por enquanto) */}
      <section className="mb-8">
        <h3 className="px-6 text-lg font-bold mb-4">Categorias</h3>
        <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar">
          <Category label="Facial" icon="face" primary />
          <Category label="Corporal" icon="body_system" />
          <Category label="Massagem" icon="relax" />
          <Category label="Depilação" icon="content_cut" />
          <Category label="Outros" icon="more_horiz" />
        </div>
      </section>

      {/* Serviços em destaque (dados reais, estilo card simples) */}
      <section className="mb-10">
        <div className="px-6 flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Serviços em Destaque</h3>
          <Link className="text-sm font-semibold text-primary" href={`/c/${tenant.slug}/services`}>
            Ver todos
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar pb-2">
          {services.map((s) => (
            <div
              key={s.id}
              className="min-w-[280px] bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700"
            >
              <div className="h-32 bg-primary/10 flex items-center justify-center">
                <MaterialIcon name="spa" className="text-primary text-4xl" />
              </div>
              <div className="p-4">
                <h4 className="font-bold text-sm">{s.name}</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {s.description || "Procedimento realizado com cuidado e excelência."}
                </p>
                <div className="mt-3 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-primary">
                      {(s.price_cents / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    <span className="text-[10px] text-slate-400">{s.duration_minutes} min</span>
                  </div>
                  <Link
                    href={`/c/${tenant.slug}/services/${s.id}`}
                    className="px-4 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg"
                  >
                    Ver
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  )
}

function Category({ label, icon, primary = false }: { label: string; icon: string; primary?: boolean }) {
  const box = primary
    ? "bg-primary text-white shadow-md"
    : "bg-soft-pink dark:bg-pink-900/30 text-pink-600"

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className={`size-16 rounded-2xl flex items-center justify-center ${box}`}>
        <MaterialIcon name={icon} className="text-3xl" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}