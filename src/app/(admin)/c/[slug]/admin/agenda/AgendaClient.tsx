"use client"

import React, { useMemo, useState } from "react"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type Props = { slug: string }

type CalendarAppt = {
  id: string
  topPx: number
  heightPx: number
  startLabel: string
  endLabel: string
  customerName: string
  serviceName?: string
  variant: "a" | "b"
  verified?: boolean
}

type ModalAppt = {
  id: string
  name: string
  badge?: string
  service: string
  timeRange: string
  statusLabel: string
  statusTone: "amber" | "green" | "slate"
  avatarUrl?: string
}

function toneChip(tone: ModalAppt["statusTone"]) {
  if (tone === "green") return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300"
  if (tone === "amber") return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
  return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
}

function monthPt(m: number) {
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
  return months[m] ?? "—"
}

export default function AgendaClient({ slug }: Props) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(2)
  const [modalOpen, setModalOpen] = useState(true)

  const headerMonth = useMemo(() => `${monthPt(5)} 2024`, [])

  const weekDays = useMemo(
    () => [
      { dow: "Seg", day: 10 },
      { dow: "Ter", day: 11 },
      { dow: "Qua", day: 12 },
      { dow: "Qui", day: 13 },
      { dow: "Sex", day: 14 },
      { dow: "Sab", day: 15 },
    ],
    []
  )

  const hours = useMemo(() => ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"], [])

  const appts = useMemo<CalendarAppt[]>(
    () => [
      {
        id: "a1",
        topPx: 20,
        heightPx: 64,
        startLabel: "08:15",
        endLabel: "09:00",
        customerName: "Ana Beatriz",
        serviceName: "Limpeza Profunda",
        variant: "a",
      },
      {
        id: "a2",
        topPx: 160,
        heightPx: 96,
        startLabel: "10:00",
        endLabel: "11:30",
        customerName: "Mariana Costa",
        serviceName: "Aplicação Botox",
        variant: "b",
        verified: true,
      },
      {
        id: "a3",
        topPx: 320,
        heightPx: 56,
        startLabel: "12:00",
        endLabel: "12:45",
        customerName: "Juliana Souza",
        variant: "a",
      },
      {
        id: "a4",
        topPx: 480,
        heightPx: 64,
        startLabel: "14:00",
        endLabel: "15:00",
        customerName: "Carla Oliveira",
        serviceName: "Massagem Relax",
        variant: "b",
      },
    ],
    []
  )

  const modalAppt = useMemo<ModalAppt>(
    () => ({
      id: "m1",
      name: "Ricardo Mendes",
      badge: "Cliente VIP",
      service: "Peeling Químico (Face)",
      timeRange: "15:15 - 16:15 (60 min)",
      statusLabel: "Aguardando Confirmação",
      statusTone: "amber",
      avatarUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAQOMJwhlNRzU6iKsa48r7jrZoUB8spNtgrD5LKVLkzVXs3tD1smdBKyBmDKihc0Qh6BBMcm_jjKM_7eY4q7fk8pZFAfTBkkizLj4VLkdDeUpYcoKZNp1wAMIY8CiBzZMzPJWCn0dZkLuyC85DxA7zMowBBzbuK-SPjEGbdWrREi6wBcoLlX7sADKqlbBt_voLCMJ1JkU17Is2Uc0DamVTjv3TL84onfIKejO9H9LXOIdWHcqCrZnhlOkFpPXyz6Wp6g-PxA-q-9dU",
    }),
    []
  )

  return (
    <AdminMobileShell slug={slug} title="Agenda" subtitle="Calendário" active="agenda" showBottomNav>
      {/* Header do template (mês + filtros + semana) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Anterior"
            >
              <MaterialIcon name="chevron_left" className="text-slate-600 dark:text-slate-300 text-[22px]" />
            </button>

            <h1 className="text-lg font-bold">{headerMonth}</h1>

            <button
              type="button"
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Próximo"
            >
              <MaterialIcon name="chevron_right" className="text-slate-600 dark:text-slate-300 text-[22px]" />
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full text-sm font-semibold border border-slate-200 dark:border-slate-700"
          >
            <MaterialIcon name="tune" className="text-[16px]" />
            Filtros
          </button>
        </div>

        <div className="flex justify-between items-center text-center">
          {weekDays.map((d, idx) => {
            const active = idx === selectedDayIdx
            return (
              <button
                key={`${d.dow}-${d.day}`}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className="flex flex-col items-center gap-1"
              >
                <span className={"text-[10px] uppercase font-bold " + (active ? "text-primary" : "text-slate-400")}>
                  {d.dow}
                </span>
                <span
                  className={
                    "w-8 h-8 flex items-center justify-center text-sm font-bold rounded-full " +
                    (active ? "bg-primary text-white" : "text-slate-900 dark:text-slate-100")
                  }
                >
                  {d.day}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      <main className="bg-white dark:bg-slate-900">
        <div className="grid grid-cols-[60px_1fr] relative">
          {/* coluna de horas */}
          <div className="flex flex-col">
            {hours.map((h) => (
              <div
                key={h}
                className="h-20 border-b border-slate-50 dark:border-slate-800 flex items-start justify-center pt-2"
              >
                <span className="text-[10px] font-bold text-slate-400">{h}</span>
              </div>
            ))}
          </div>

          {/* coluna agenda */}
          <div className="relative border-l border-slate-100 dark:border-slate-800">
            <div className="absolute inset-0 grid grid-rows-9 pointer-events-none">
              {hours.map((h) => (
                <div key={`row-${h}`} className="border-b border-slate-50 dark:border-slate-800" />
              ))}
            </div>

            {appts.map((a) => {
              const bg = a.variant === "a" ? "bg-pink-100 dark:bg-pink-900/20" : "bg-violet-100 dark:bg-violet-900/20"
              const border = a.variant === "a" ? "border-pink-800/60" : "border-violet-800/60"
              const textTone = a.variant === "a" ? "text-pink-800 dark:text-pink-300" : "text-violet-800 dark:text-violet-300"

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className={
                    "absolute left-2 right-2 rounded-r-lg p-2 shadow-sm z-10 cursor-pointer border-l-4 text-left " +
                    bg +
                    " " +
                    border
                  }
                  style={{ top: a.topPx, height: a.heightPx }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={"text-[10px] font-bold uppercase tracking-tight " + textTone}>
                        {a.startLabel} - {a.endLabel}
                      </p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{a.customerName}</p>
                      {a.serviceName ? <p className={"text-[9px] font-medium " + textTone}>{a.serviceName}</p> : null}
                    </div>

                    {a.verified ? <MaterialIcon name="verified" className={"text-[18px] shrink-0 " + textTone} /> : null}
                  </div>
                </button>
              )
            })}

            {modalOpen ? (
              <div className="absolute top-[410px] left-1/2 -translate-x-1/2 w-[85%] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 p-4 ring-1 ring-black/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    {modalAppt.avatarUrl ? (
                      <img alt="Cliente" className="w-full h-full object-cover" src={modalAppt.avatarUrl} />
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate">{modalAppt.name}</h4>
                    {modalAppt.badge ? (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">
                        {modalAppt.badge}
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    onClick={() => setModalOpen(false)}
                    aria-label="Fechar"
                  >
                    <MaterialIcon name="close" className="text-[20px]" />
                  </button>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <MaterialIcon name="content_cut" className="text-[16px]" />
                    <span>{modalAppt.service}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <MaterialIcon name="schedule" className="text-[16px]" />
                    <span>{modalAppt.timeRange}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"px-2 py-0.5 text-[9px] font-bold rounded uppercase " + toneChip(modalAppt.statusTone)}>
                      {modalAppt.statusLabel}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl"
                    onClick={() => alert("Reagendar (placeholder)")}
                  >
                    Reagendar
                  </button>
                  <button
                    type="button"
                    className="py-2 bg-primary text-white text-xs font-bold rounded-xl"
                    onClick={() => alert("Confirmar (placeholder)")}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* FAB */}
      <button
        type="button"
        className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
        aria-label="Novo"
        onClick={() => alert("Novo agendamento (placeholder)")}
      >
        <MaterialIcon name="add" className="text-[30px] text-white" />
      </button>
    </AdminMobileShell>
  )
}