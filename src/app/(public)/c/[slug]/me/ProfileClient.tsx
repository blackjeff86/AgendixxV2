// src/app/(public)/c/[slug]/me/ProfileClient.tsx
"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import { fetchProfileAppointments, type ProfileAppointmentRow } from "./actions"

type UiAppointment = {
  id: string
  title: string
  clinic: string
  status: "confirmed" | "pending" | "done" | "cancelled"
  dateLabel: string
  timeLabel: string
  icon: string
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "")
}

function statusNormalize(s: string): UiAppointment["status"] {
  const v = (s || "").toLowerCase()
  if (v === "confirmed") return "confirmed"
  if (v === "pending") return "pending"
  if (v === "cancelled" || v === "canceled") return "cancelled"
  // qualquer outro vira done quando estiver no "past"
  return "done"
}

function fmtDatePt(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")
}

function fmtTimePt(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function pickIconByServiceName(name: string) {
  const s = (name || "").toLowerCase()
  if (s.includes("limpeza")) return "face_retouching_natural"
  if (s.includes("drenagem")) return "spa"
  if (s.includes("massagem")) return "self_improvement"
  if (s.includes("depila")) return "content_cut"
  return "event"
}

export default function ProfileClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const wpp = useMemo(() => {
    const raw = searchParams?.get("wpp") || ""
    return onlyDigits(raw)
  }, [searchParams])

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ProfileAppointmentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchProfileAppointments({
          slug,
          tab,
          whatsappDigits: wpp || undefined,
        })
        if (!alive) return
        setRows(data)
      } catch (e: any) {
        if (!alive) return
        setError("Erro ao carregar seus agendamentos.")
        setRows([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [slug, tab, wpp])

  const list: UiAppointment[] = useMemo(() => {
    const clinicName = "Agendixx" // MVP (depois vem do tenant)
    return rows.map((r) => ({
      id: r.id,
      title: r.service_name,
      clinic: clinicName,
      status: statusNormalize(r.status),
      dateLabel: fmtDatePt(r.start_at),
      timeLabel: fmtTimePt(r.start_at),
      icon: pickIconByServiceName(r.service_name),
    }))
  }, [rows])

  function statusPill(s: UiAppointment["status"]) {
    if (s === "confirmed")
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/15"
    if (s === "pending")
      return "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-black/5 dark:border-white/10"
    if (s === "cancelled")
      return "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/10"
    return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/10"
  }

  function statusText(s: UiAppointment["status"]) {
    if (s === "confirmed") return "Confirmado"
    if (s === "pending") return "Pendente"
    if (s === "cancelled") return "Cancelado"
    return "Concluído"
  }

  return (
    <div className="pb-6">
      {/* Profile Card (MVP: dados “fixos”; depois a gente puxa de customers via wpp) */}
      <section className="p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-black/5 dark:border-white/10 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-[color:rgba(91,19,236,0.20)] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Cliente"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-sEA6bBGb-qVFhCrvmvmJKkfetUvRejhvQgCv_4WhhX5KWMDkADSqqL35lsf75empssd4nkJHlRXPUDilusX2jgbTnIJot0DIV_nD9Dsiz7l8_E3CdEBh5f6wPopJqwmPgDHtNZL9j2CIlaztyWvRZU6LAYw0MMPB_U6lexGtM0bT-n-m09L6bXyoNC2VMDkA_G5eXjY-5Hnu_ucDDY4r1TcR3m7r2b6yTJ67OarzElNht0r5QDoNNapOB3OX6l2qhl-WxeltEMA"
              />
            </div>

            <div className="absolute bottom-0 right-0 bg-[var(--color-primary)] p-1.5 rounded-full border-2 border-white dark:border-slate-900">
              <MaterialIcon name="verified" className="text-[14px] text-white" filled />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold">{wpp ? "Meu Perfil" : "Cliente"}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {wpp ? `WhatsApp: ${wpp}` : "Dica: abra com ?wpp=5511999999999 para filtrar"}
            </p>
          </div>

          <button
            type="button"
            className="w-full py-3 px-6 bg-[var(--color-primary)] text-white font-bold rounded-full hover:opacity-90 transition-opacity active:scale-[0.99]"
            disabled
            title="MVP"
          >
            Editar Perfil
          </button>
        </div>
      </section>

      {/* Appointments */}
      <section className="mt-2">
        <div className="px-4 mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Meus Agendamentos</h3>
          {loading ? <span className="text-xs text-slate-500 dark:text-slate-400">Carregando…</span> : null}
        </div>

        {/* Segmented Control */}
        <div className="px-4 mb-6">
          <div className="bg-[color:rgba(91,19,236,0.10)] dark:bg-white/5 p-1 rounded-full flex">
            <button
              type="button"
              onClick={() => setTab("upcoming")}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-semibold transition-all ${
                tab === "upcoming"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Próximos
            </button>

            <button
              type="button"
              onClick={() => setTab("past")}
              className={`flex-1 py-2 px-4 rounded-full text-sm font-semibold transition-all ${
                tab === "past"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Passados
            </button>
          </div>
        </div>

        {error ? <p className="px-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {/* Booking List */}
        <div className="px-4 space-y-4">
          {!loading && list.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-black/5 dark:border-white/10">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhum agendamento {tab === "upcoming" ? "futuro" : "passado"} encontrado.
              </p>
            </div>
          ) : null}

          {list.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-black/5 dark:border-white/10 flex gap-4"
            >
              <div className="flex-shrink-0 w-16 h-16 bg-[color:rgba(91,19,236,0.10)] rounded-lg flex items-center justify-center">
                <MaterialIcon name={a.icon} className="text-[30px] text-[var(--color-primary)]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-base truncate">{a.title}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-xs truncate">{a.clinic}</p>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusPill(
                      a.status
                    )}`}
                  >
                    {statusText(a.status)}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4 text-slate-600 dark:text-slate-300 text-xs">
                  <div className="flex items-center gap-1">
                    <MaterialIcon name="calendar_today" className="text-[16px]" />
                    {a.dateLabel}
                  </div>
                  <div className="flex items-center gap-1">
                    <MaterialIcon name="schedule" className="text-[16px]" />
                    {a.timeLabel}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Favorite Clinics (mantém mock por enquanto) */}
      <section className="mt-8">
        <div className="px-4 mb-4">
          <h3 className="text-lg font-bold">Clínicas Favoritas</h3>
        </div>

        <div className="flex overflow-x-auto gap-4 px-4 pb-4 no-scrollbar">
          {[
            {
              name: "Bella Clinic",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAygemduklEhUCNWpkhYI3RoMeRehMpYL2bVgRsH-KVXRX4vK-wh48XxoJixrZ6_vP2C3KccRj5dmTIouRYCgrSly4Gk8P6W2oy-cXZ4-1VBTfLpeZ9iMkqx1SpfQKLjhhfM4oKW7U0kKiOc274Jw1iZQU3cciq1-Lf-b7rBpyGX7xfz59tTHvN2JvJbs5J224vxPCTG9fgEDXitN-ljSxBDQydUKBY4TrJHVzMPK8nFiUJcR7PVoyMFpttUAAttQZPQyLzfEPifkY",
            },
            {
              name: "Renew Clinic",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDhxosAELxTASlKG7RucJACpSHGI7NamV_RCBHIqbToeVYtReW82OOpe8uSGiJqtMuEHjqKF4O2-uH5REvnTD2sPTKBsb_6ET1wkm6gGPTaHYzixAWhYZhKrmpWb2fB6QLeVGoGiRxqAYE5SNhASvP9knY_HCMhNeNQeNakiBQ7T9edkb702TTPTRywuECc7XUKuG-LN3TEpe6zFz4q3PU0bEulzIBhc59YP0kxqqge9rL6-Lx2K8cn0eSzLPgfM4FwRAO5HyKbmjc",
            },
            {
              name: "Glow Studio",
              img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDIHOwdCvuoNtvoMYGpQZ8U4kT2HmmSUgV5SkOCPqWP1QSGXy6oLS2UYlDDMNFFFxoHzb1iYJDLk0a1TIKdD2RxTSBvnwuPa97i98cAgg95LtsATahyNUfsYpfKJTITxXfg8pYSpFzLzXsPhawDu0u-REwv69vst0UwKNCQMVIcefRjjaZmvEvpU8ZWAEHVZWrquZK98BbrdWED0GGOWrJyEv1HP2NLDY59daxCYATakoxPPJbIsCqZowSIYjY0cEHt6YYf62bKHaI",
            },
          ].map((c) => (
            <div key={c.name} className="flex-shrink-0 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-900 shadow-sm border border-black/5 dark:border-white/10 p-1">
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={c.name} className="w-full h-full object-cover" src={c.img} />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-center w-16 truncate">{c.name}</span>
            </div>
          ))}

          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-900 shadow-sm border border-black/5 dark:border-white/10 p-1">
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 text-[var(--color-primary)] flex items-center justify-center">
                <MaterialIcon name="add" className="text-[22px]" />
              </div>
            </div>
            <span className="text-[10px] font-semibold text-center w-16 truncate">Explorar</span>
          </div>
        </div>
      </section>

      <div className="h-4" />
    </div>
  )
}