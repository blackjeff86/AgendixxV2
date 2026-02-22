"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createAppointment } from "./actions"

type Props = {
  slug: string
  serviceId: string
  successHref: string
  totalLabel: string
  defaultDate: string
  defaultTime: string
  defaultPro: string // agora é proId (UUID) — mantido pra não quebrar o parent
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "")
}

function formatWhatsappBR(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  )
}

const SUBMIT_EVENT = "agendixx_confirm_submit"

function dispatchSubmit() {
  window.dispatchEvent(new Event(SUBMIT_EVENT))
}

function SubmitProxy() {
  return (
    <button
      type="button"
      onClick={dispatchSubmit}
      className="w-full bg-primary hover:opacity-95 text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all"
    >
      Confirmar Agendamento
    </button>
  )
}

export default function ConfirmClient({
  slug,
  serviceId,
  successHref,
  totalLabel,
  defaultDate,
  defaultTime,
  defaultPro,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [error, setError] = useState<string | null>(null)

  // trava contra duplo clique / eventos repetidos
  const submittingRef = useRef(false)

  const canSubmit = useMemo(() => {
    const n = name.trim().length >= 3
    const w = onlyDigits(whatsapp).length >= 10
    const svcOk = isUuid(serviceId)
    const proOk = isUuid(defaultPro) // defaultPro = proId
    return n && w && Boolean(defaultDate) && Boolean(defaultTime) && proOk && svcOk
  }, [name, whatsapp, defaultDate, defaultTime, defaultPro, serviceId])

  const onSubmit = useCallback(() => {
    setError(null)

    if (isPending || submittingRef.current) return

    if (!isUuid(serviceId)) {
      setError("Serviço inválido (UUID).")
      return
    }

    if (!isUuid(defaultPro)) {
      setError("Profissional inválido (UUID).")
      return
    }

    if (!canSubmit) {
      setError("Preencha seu nome e um WhatsApp válido para confirmar.")
      return
    }

    submittingRef.current = true

    startTransition(async () => {
      try {
        const res = await createAppointment({
          slug,
          serviceId,
          date: defaultDate,
          time: defaultTime,
          professionalId: defaultPro, // ✅ proId
          customerName: name.trim(),
          whatsappDigits: onlyDigits(whatsapp),
        })

        if (!res.ok) {
          setError(res.error)
          return
        }

        const qs = new URLSearchParams()
        qs.set("appointmentId", res.appointmentId)
        qs.set("total", totalLabel)

        router.push(`${successHref}?${qs.toString()}`)
      } finally {
        submittingRef.current = false
      }
    })
  }, [
    canSubmit,
    defaultDate,
    defaultPro,
    defaultTime,
    isPending,
    name,
    router,
    serviceId,
    slug,
    successHref,
    totalLabel,
    whatsapp,
  ])

  useEffect(() => {
    const handler = () => onSubmit()
    window.addEventListener(SUBMIT_EVENT, handler)
    return () => window.removeEventListener(SUBMIT_EVENT, handler)
  }, [onSubmit])

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium px-1" htmlFor="name">
          Nome Completo
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary px-4"
          placeholder="Ex: Ana Silva"
          type="text"
          autoComplete="name"
          disabled={isPending}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium px-1" htmlFor="whatsapp">
          WhatsApp
        </label>
        <input
          id="whatsapp"
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatWhatsappBR(e.target.value))}
          className="w-full h-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary px-4"
          placeholder="(00) 00000-0000"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          disabled={isPending}
        />
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400 px-1">{error}</p> : null}
      {isPending ? <p className="text-sm text-slate-500 dark:text-slate-400 px-1">Salvando...</p> : null}
    </div>
  )
}

export { SubmitProxy }