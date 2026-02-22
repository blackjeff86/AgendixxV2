"use client"

import React, { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type DayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"

type WorkDay = {
  key: DayKey
  label: string
  enabled: boolean
  start: string
  end: string
}

type BlockItem = {
  id: string
  title: string
  subtitle: string
  icon: string
  tone: "orange" | "blue"
  disabled?: boolean
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

const DEFAULT_DAYS: WorkDay[] = [
  { key: "seg", label: "Segunda", enabled: true, start: "09:00", end: "18:00" },
  { key: "ter", label: "Terça", enabled: true, start: "09:00", end: "18:00" },
  { key: "qua", label: "Quarta", enabled: false, start: "09:00", end: "18:00" },
  { key: "qui", label: "Quinta", enabled: false, start: "09:00", end: "18:00" },
  { key: "sex", label: "Sexta", enabled: false, start: "09:00", end: "18:00" },
  { key: "sab", label: "Sábado", enabled: false, start: "09:00", end: "13:00" },
  { key: "dom", label: "Domingo", enabled: false, start: "09:00", end: "13:00" },
]

export default function ProfessionalSettingsClient({
  slug,
  professionalId,
}: {
  slug: string
  professionalId: string
}) {
  const router = useRouter()

  // mock: depois você troca por fetch do banco
  const prof = useMemo(
    () => ({
      id: professionalId,
      name: professionalId === "2" ? "Carla Souza" : "Dra. Amanda Oliveira",
      role: professionalId === "2" ? "Esteticista Facial" : "Biomédica Esteta",
      photoUrl:
        professionalId === "2"
          ? "https://lh3.googleusercontent.com/aida-public/AB6AXuAQOMJwhlNRzU6iKsa48r7jrZoUB8spNtgrD5LKVLkzVXs3tD1smdBKyBmDKihc0Qh6BBMcm_jjKM_7eY4q7fk8pZFAfTBkkizLj4VLkdDeUpYcoKZNp1wAMIY8CiBzZMzPJWCn0dZkLuyC85DxA7zMowBBzbuK-SPjEGbdWrREi6wBcoLlX7sADKqlbBt_voLCMJ1JkU17Is2Uc0DamVTjv3TL84onfIKejO9H9LXOIdWHcqCrZnhlOkFpPXyz6Wp6g-PxA-q-9dU"
          : "https://lh3.googleusercontent.com/aida-public/AB6AXuClvY2JHUTpnwvro1nHLNYuDuZhrMC77hZW6HAcncXXfPT6qvIhqSSAhecbIC18kswIl8FRk4WnMGVtoG7Zbl4TD_fKujiR8l4GHFWqzZfFgb6caHVrnYY36yc791uxLMCCkQii0yEKBoG9Josfb-Bfusn0HwahZ7W1tW4oLZK-eeSciiKxeUsv1gGUQFetpJuO_9Io0Q-4KN7eVDTKe-mvtPiZRi15okQAtV_SYyFN4cjd9SIyEbetzIgdDsZutvAJ_dHlTLsm9EU",
      active: true,
    }),
    [professionalId]
  )

  const [days, setDays] = useState<WorkDay[]>(DEFAULT_DAYS)

  const [blocks, setBlocks] = useState<BlockItem[]>([
    {
      id: "b1",
      title: "Congresso de Estética",
      subtitle: "15/Nov - 18/Nov • Dia Todo",
      icon: "event_busy",
      tone: "orange",
    },
    {
      id: "b2",
      title: "Férias",
      subtitle: "20/Dez - 05/Jan • Dia Todo",
      icon: "flight",
      tone: "blue",
      disabled: true,
    },
  ])

  const [dirty, setDirty] = useState(false)

  function toggleDay(key: DayKey) {
    setDirty(true)
    setDays((prev) => prev.map((d) => (d.key === key ? { ...d, enabled: !d.enabled } : d)))
  }

  function setDayTime(key: DayKey, field: "start" | "end", value: string) {
    setDirty(true)
    setDays((prev) => prev.map((d) => (d.key === key ? { ...d, [field]: value } : d)))
  }

  function onNewBlock() {
    setDirty(true)
    const id = `b_${Date.now()}`
    setBlocks((prev) => [
      {
        id,
        title: "Novo Bloqueio",
        subtitle: "Defina datas e horários (mock)",
        icon: "event_busy",
        tone: "orange",
      },
      ...prev,
    ])
  }

  function onDeleteBlock(id: string) {
    setDirty(true)
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  function onCancel() {
    if (dirty && !confirm("Descartar alterações?")) return
    router.back()
  }

  async function onSave() {
    // mock: depois substitui por Server Action
    setDirty(false)
    alert("Alterações salvas (mock). Próximo passo: persistir no banco.")
    router.back()
  }

  return (
    <AdminMobileShell
      slug={slug}
      title="Configuração Individual"
      subtitle="Horários e bloqueios"
      active="mais"
      showBottomNav={false}
    >
      <div className="p-4 space-y-6 pb-36">
        {/* Card do profissional */}
        <section className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="mr-1 text-primary active:scale-[0.98] transition"
            aria-label="Voltar"
            title="Voltar"
          >
            <MaterialIcon name="arrow_back_ios" className="text-xl" />
          </button>

          <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 border-primary/20 shadow-sm bg-slate-50 dark:bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={prof.name} className="w-full h-full object-cover" src={prof.photoUrl} />
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight truncate">{prof.name}</h2>
            <p className="text-slate-500 text-sm font-medium truncate">{prof.role}</p>

            <div className="mt-2 inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Ativo
            </div>
          </div>
        </section>

        {/* Horário Individual */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-base">Horário Individual</h3>
            <span className="text-xs text-slate-400 font-medium">Fusos: GMT-3</span>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden divide-y divide-slate-50 dark:divide-slate-700/50">
            {days.map((d) => (
              <div
                key={d.key}
                className={clsx(
                  "p-4 flex items-center justify-between",
                  !d.enabled && "bg-slate-50/50 dark:bg-slate-900/10"
                )}
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={d.enabled} onChange={() => toggleDay(d.key)} />
                  <span className={clsx("font-semibold text-sm w-20", !d.enabled && "text-slate-400")}>{d.label}</span>
                </div>

                {d.enabled ? (
                  <div className="flex items-center gap-2">
                    <TimePill value={d.start} onChange={(v) => setDayTime(d.key, "start", v)} />
                    <span className="text-slate-400 text-[10px] font-bold">ÀS</span>
                    <TimePill value={d.end} onChange={(v) => setDayTime(d.key, "end", v)} />
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest px-2">
                    Indisponível
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Bloqueios */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-base">Bloqueios de Agenda</h3>

            <button
              type="button"
              onClick={onNewBlock}
              className="text-primary text-xs font-bold flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-full active:scale-[0.99] transition"
            >
              <MaterialIcon name="add" className="text-sm" />
              Novo Bloqueio
            </button>
          </div>

          <div className="grid gap-3">
            {blocks.map((b) => (
              <div
                key={b.id}
                className={clsx(
                  "bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4",
                  b.disabled && "opacity-75"
                )}
              >
                <div
                  className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    b.tone === "orange"
                      ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  )}
                >
                  <MaterialIcon name={b.icon} className="text-xl" filled />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm truncate">{b.title}</h4>

                    <button
                      type="button"
                      onClick={() => onDeleteBlock(b.id)}
                      className="text-slate-300 hover:text-red-400 transition"
                      aria-label="Excluir bloqueio"
                      title="Excluir"
                    >
                      <MaterialIcon name="delete" className="text-lg" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-0.5 truncate">{b.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer fixo */}
      <footer className="absolute bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-6 py-6 pb-10 flex gap-4 z-40">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-12 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-sm bg-slate-100 dark:bg-slate-800 active:scale-[0.99] transition"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={onSave}
          className="flex-1 h-12 rounded-xl text-white font-bold text-sm bg-primary shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[0.99] transition"
        >
          Salvar Alterações
        </button>
      </footer>
    </AdminMobileShell>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={clsx(
        "relative inline-flex items-center w-10 h-5 rounded-full px-1 transition-colors",
        checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
      )}
      title={checked ? "Ativo" : "Inativo"}
    >
      <span
        className={clsx(
          "w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  )
}

function TimePill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 h-8 text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:ring-1 focus:ring-primary"
    />
  )
}