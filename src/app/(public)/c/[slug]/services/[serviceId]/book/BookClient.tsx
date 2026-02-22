"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import MaterialIcon from "@/components/mobile/MaterialIcon"
import { fetchAvailableSlots, fetchProfessionals } from "./actions"

type Professional = {
  id: string
  name: string
  specialty: string | null
  photo_url: string | null
  color_hex: string | null
}

type Props = {
  slug: string
  serviceId: string
  confirmHref: string
  priceLabel: string
  durationMin: number
  defaultDate: string
  defaultTime: string
  defaultPro: string // agora é proId (UUID) — mantido pra não quebrar o parent
}

function toIsoDate(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function dayLabelPt(d: Date) {
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  return weekdays[d.getDay()]
}

function monthLabelPt(d: Date) {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return months[d.getMonth()]
}

export default function BookClient({
  slug,
  serviceId,
  confirmHref,
  priceLabel,
  durationMin,
  defaultDate,
  defaultTime,
  defaultPro,
}: Props) {
  const router = useRouter()

  const nextDays = useMemo(() => {
    const base = new Date()
    const days: Date[] = []
    for (let i = 0; i < 10; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      days.push(d)
    }
    return days
  }, [])

  const initialDate =
    defaultDate && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate) ? defaultDate : toIsoDate(nextDays[0])

  const [date, setDate] = useState<string>(initialDate)
  const [time, setTime] = useState<string>(defaultTime || "")

  const [prosLoading, setProsLoading] = useState(false)
  const [pros, setPros] = useState<Professional[]>([])
  const [proId, setProId] = useState<string>(defaultPro || "")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [available, setAvailable] = useState<string[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPro = useMemo(() => pros.find((p) => p.id === proId) || null, [pros, proId])

  // Carrega profissionais reais do banco (por serviço)
  useEffect(() => {
    let alive = true
    async function run() {
      setProsLoading(true)
      try {
        const list = await fetchProfessionals({ slug, serviceId })
        if (!alive) return
        setPros(list)

        // define proId inicial
        const hasDefault = defaultPro && list.some((p) => p.id === defaultPro)
        const nextProId = hasDefault ? defaultPro : (list[0]?.id ?? "")
        setProId(nextProId)
      } finally {
        if (alive) setProsLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, serviceId])

  // Carrega horários disponíveis quando muda data/profissional
  useEffect(() => {
    let alive = true

    async function run() {
      setLoadingSlots(true)
      setError(null)
      setLoadFailed(false)

      try {
        if (!proId) {
          setAvailable([])
          setTime("")
          return
        }

        const list = await fetchAvailableSlots({
          slug,
          serviceId, 
          professionalId: proId,
          date,
        })

        if (!alive) return
        setAvailable(list)

        if (time && !list.includes(time)) setTime("")
      } catch (e: any) {
        if (!alive) return
        setAvailable([])
        setTime("")
        setLoadFailed(true)
        setError("Não foi possível carregar os horários disponíveis. Verifique a agenda desse profissional.")
      } finally {
        if (alive) setLoadingSlots(false)
      }
    }

    run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, serviceId, date, proId])

  const canContinue = Boolean(date && time && proId && !loadingSlots && !loadFailed)

  function goConfirm() {
    setError(null)

    if (!canContinue) {
      setError("Selecione data, horário e profissional para continuar.")
      return
    }

    if (!available.includes(time)) {
      setError("Esse horário não está mais disponível. Escolha outro horário.")
      return
    }

    const qs = new URLSearchParams()
    qs.set("date", date)
    qs.set("time", time)
    qs.set("proId", proId)

    router.push(`${confirmHref}?${qs.toString()}`)
  }

  return (
    <section className="space-y-6">
      {/* Profissional */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
          Profissional
        </h3>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-2 flex gap-2 flex-wrap">
          {prosLoading ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Carregando profissionais…</div>
          ) : pros.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              Nenhum profissional disponível para este serviço.
            </div>
          ) : (
            pros.map((p) => {
              const active = p.id === proId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProId(p.id)
                    setTime("")
                  }}
                  className={
                    "px-3 py-2 rounded-full text-sm font-semibold transition-all " +
                    (active
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200")
                  }
                  title={p.specialty || undefined}
                >
                  {p.name}
                </button>
              )
            })
          )}
        </div>

        {selectedPro?.specialty ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-1">Especialidade: {selectedPro.specialty}</p>
        ) : null}
      </div>

      {/* Datas */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">Data</h3>

        <div className="flex gap-3 overflow-x-auto no-scrollbar px-1 pb-2">
          {nextDays.map((d) => {
            const iso = toIsoDate(d)
            const active = iso === date

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setDate(iso)
                  setTime("")
                }}
                className={
                  "shrink-0 w-[72px] rounded-2xl border px-3 py-3 text-center transition-all active:scale-[0.99] " +
                  (active
                    ? "bg-[var(--color-primary)] text-white border-transparent"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-100 dark:border-slate-700")
                }
              >
                <div className={"text-xs font-bold " + (active ? "opacity-90" : "text-slate-500 dark:text-slate-400")}>
                  {dayLabelPt(d)}
                </div>
                <div className="text-xl font-extrabold leading-tight">{d.getDate()}</div>
                <div
                  className={"text-xs font-semibold " + (active ? "opacity-90" : "text-slate-500 dark:text-slate-400")}
                >
                  {monthLabelPt(d)}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Horários */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Horários
          </h3>
          {loadingSlots ? <span className="text-xs text-slate-500 dark:text-slate-400">Carregando…</span> : null}
        </div>

        {loadFailed ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900/40 p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : !loadingSlots && proId && available.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Não há horários disponíveis para <span className="font-semibold">{selectedPro?.name || "este profissional"}</span>{" "}
              em <span className="font-semibold">{date}</span>.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Dica: tente outro dia ou outro profissional.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {available.map((t) => {
              const active = t === time
              const cls =
                "py-3 rounded-xl font-bold text-sm border transition-all active:scale-[0.99] " +
                (active
                  ? "bg-[var(--color-primary)] text-white border-transparent"
                  : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-100 dark:border-slate-700")

              return (
                <button key={t} type="button" onClick={() => setTime(t)} className={cls}>
                  {t}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400">Resumo</div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{priceLabel}</div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <MaterialIcon name="schedule" className="text-[18px] text-[var(--color-primary)]" />
            <span>Duração: {durationMin} min</span>
          </div>

          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <MaterialIcon name="person" className="text-[18px] text-[var(--color-primary)]" />
            <span>{selectedPro?.name || "—"}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <MaterialIcon name="event" className="text-[18px] text-[var(--color-primary)]" />
            <span>{date}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <MaterialIcon name="alarm" className="text-[18px] text-[var(--color-primary)]" />
            <span>{time || "—"}</span>
          </div>
        </div>
      </div>

      {!loadFailed && error ? <p className="text-sm text-red-600 dark:text-red-400 px-1">{error}</p> : null}

      {/* CTA fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-100 dark:border-slate-700 px-4 pt-4 pb-6">
        <div className="max-w-[430px] mx-auto flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Próximo:</span>
            <span className="text-lg font-bold text-[var(--color-primary)]">Confirmar</span>
          </div>

          <button
            type="button"
            onClick={goConfirm}
            className={
              "w-full font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all " +
              (canContinue
                ? "bg-[var(--color-primary)] text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed")
            }
            disabled={!canContinue}
          >
            Continuar para Confirmação
          </button>
        </div>
      </div>
    </section>
  )
}