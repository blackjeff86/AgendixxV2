"use client"

import React, { useMemo } from "react"
import Link from "next/link"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type Props = { slug: string }

type UpcomingAppointment = {
  id: string
  customerName: string
  serviceName: string
  time: string
  status: "confirmed" | "pending" | "scheduled"
  avatarUrl?: string | null
}

type ActivityItem = {
  id: string
  type: "new_appointment" | "payment_confirmed"
  title: string
  description: string
  whenLabel: string
}

function statusChip(status: UpcomingAppointment["status"]) {
  if (status === "confirmed") return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20"
  if (status === "pending") return "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20"
  return "text-slate-500 bg-slate-50 dark:text-slate-300 dark:bg-slate-700"
}

export default function AdminDashboardClient({ slug }: Props) {
  const upcoming = useMemo<UpcomingAppointment[]>(
    () => [
      {
        id: "1",
        customerName: "Maria Silva",
        serviceName: "Botox Facial",
        time: "14:30",
        status: "confirmed",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuAQOMJwhlNRzU6iKsa48r7jrZoUB8spNtgrD5LKVLkzVXs3tD1smdBKyBmDKihc0Qh6BBMcm_jjKM_7eY4q7fk8pZFAfTBkkizLj4VLkdDeUpYcoKZNp1wAMIY8CiBzZMzPJWCn0dZkLuyC85DxA7zMowBBzbuK-SPjEGbdWrREi6wBcoLlX7sADKqlbBt_voLCMJ1JkU17Is2Uc0DamVTjv3TL84onfIKejO9H9LXOIdWHcqCrZnhlOkFpPXyz6Wp6g-PxA-q-9dU",
      },
      {
        id: "2",
        customerName: "Ricardo Mendes",
        serviceName: "Limpeza de Pele",
        time: "15:15",
        status: "pending",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBFy35aeWrPm-cizNLIJnrtYZKVT6cefOM33_LLHz-UyRtepqhp076SXek8K_nSXok3FUO9t7RhldG2hkF7RNbd2yYQNbsRLSg5ie7FB103HMw7PvAvq2b4ZUS3PyYIwHTmaK8M95X1hOHpZiNxtmlAKjYMyQGFl5DEjDl85nZnQOC4XBFFM6-2a_OlZMgbCQBGUuO_JrqMoRYPo3rgVw-HVmwe6C8FEkoAgYNumuuupdtjM57pyorSL8ZTrbqVaGnuU3RhabJmLTM",
      },
      {
        id: "3",
        customerName: "Juliana Costa",
        serviceName: "Peeling Químico",
        time: "16:00",
        status: "scheduled",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDO5rRaLo2QsFaPAHAR_Th8ko-6VY7y7DeTBqGaWGVgNgfchLoMM8BpTqvF7KycKOcbLqwdSHCQcrMyZ83WT5FeMRNTP2WsyDE8IxUX25mQm9mVkwIBGoLSrM4KY98PvlWea7uQOKM7aOSbYwyFE5qACE5s608wiZ95u7dArE7wU2ha7Lt_xa2Sg_ie_qh75dkTmExpBtez0muShDPkmpTYKICSNfF6oVkZpiRK2citKzOt3D_Po_tdGkA3Bxmj9-coeFtuhTkz8WM",
      },
    ],
    []
  )

  const activity = useMemo<ActivityItem[]>(
    () => [
      {
        id: "a1",
        type: "new_appointment",
        title: "Novo agendamento",
        description: "Ana Beatriz para Drenagem Linfática às 09:00.",
        whenLabel: "Há 10 min",
      },
      {
        id: "a2",
        type: "payment_confirmed",
        title: "Pagamento confirmado",
        description: "Maria Silva pagou R$ 450,00 via PIX.",
        whenLabel: "Há 45 min",
      },
    ],
    []
  )

  // ✅ Rotas ADMIN (padronizado com /admin/agenda)
  const hrefDashboard = `/c/${slug}/admin`
  const hrefAgenda = `/c/${slug}/admin/agenda`

  return (
    <AdminMobileShell slug={slug} title="Painel Geral" subtitle="Administração" active="dashboard" showBottomNav>
      <div className="p-4 space-y-8 pb-28">
        {/* KPI GRID (mobile template) */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-primary p-5 rounded-2xl text-white shadow-lg shadow-primary/20">
            <div className="flex items-center justify-between mb-2">
              <MaterialIcon name="event_available" className="text-[22px] opacity-80" />
              <span className="text-xs font-medium px-2 py-0.5 bg-white/20 rounded-full">+12%</span>
            </div>
            <p className="text-3xl font-bold">12</p>
            <p className="text-sm opacity-90 font-medium">Agendamentos hoje</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <MaterialIcon name="pending_actions" className="text-[22px] text-amber-500" />
              <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                Alerta
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">4</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Pendentes</p>
          </div>
        </section>

        {/* Revenue Chart Mock (mobile template) */}
        <section className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg">Faturamento Semanal</h3>
            <button type="button" className="text-sm text-slate-500 font-semibold flex items-center gap-1">
              Esta Semana <MaterialIcon name="expand_more" className="text-[18px]" />
            </button>
          </div>

          <div className="relative h-40 w-full flex items-end gap-2 px-1">
            {[
              { label: "SEG", h: 24, inner: 16 },
              { label: "TER", h: 32, inner: 24 },
              { label: "QUA", h: 40, inner: 32, strong: true },
              { label: "QUI", h: 28, inner: 20 },
              { label: "SEX", h: 36, inner: 28 },
              { label: "SAB", h: 20, inner: 12 },
            ].map((b) => (
              <div
                key={b.label}
                className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-t-lg relative group cursor-pointer"
                style={{ height: `${b.h * 4}px` }}
              >
                <div
                  className={
                    "absolute bottom-0 w-full rounded-t-lg transition-all " +
                    (b.strong ? "bg-primary" : "bg-primary/20 group-hover:bg-primary/40")
                  }
                  style={{ height: `${b.inner * 4}px` }}
                />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400">
                  {b.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-12 flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Acumulado</p>
              <p className="text-xl font-bold">R$ 12.450,00</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-500 font-bold flex items-center justify-end gap-1">
                <MaterialIcon name="trending_up" className="text-[16px]" /> 8.5%
              </p>
              <p className="text-xs text-slate-400">vs semana anterior</p>
            </div>
          </div>
        </section>

        {/* Upcoming Appointments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Próximos Horários</h3>
            <Link className="text-primary text-sm font-semibold" href={hrefAgenda}>
              Ver todos
            </Link>
          </div>

          <div className="space-y-3">
            {upcoming.map((a) => (
              <div
                key={a.id}
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0">
                  {a.avatarUrl ? <img className="w-full h-full object-cover" alt="" src={a.avatarUrl} /> : null}
                </div>

                <div className="flex-1">
                  <h4 className="font-bold text-sm leading-tight">{a.customerName}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{a.serviceName}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className={"font-bold text-sm " + (a.status === "confirmed" ? "text-primary" : "")}>{a.time}</p>
                  <span className={"text-[10px] font-bold uppercase px-1.5 py-0.5 rounded " + statusChip(a.status)}>
                    {a.status === "confirmed" ? "Confirmado" : a.status === "pending" ? "Pendente" : "Agendado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activity Feed */}
        <section className="space-y-4 pb-4">
          <h3 className="font-bold text-lg">Atividade Recente</h3>

          <div className="relative space-y-6 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
            {activity.map((it) => (
              <div key={it.id} className="relative flex gap-4 pl-10">
                <div
                  className={
                    "absolute left-0 w-10 h-10 rounded-full flex items-center justify-center border-4 " +
                    "border-background-light dark:border-background-dark z-10 " +
                    (it.type === "payment_confirmed" ? "bg-green-100 dark:bg-green-900/20" : "bg-primary/10")
                  }
                >
                  <MaterialIcon
                    name={it.type === "payment_confirmed" ? "check_circle" : "add_task"}
                    className={"text-[18px] " + (it.type === "payment_confirmed" ? "text-green-600" : "text-primary")}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold">{it.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{it.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{it.whenLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* FAB (mobile template) */}
      <button
        type="button"
        className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
        aria-label="Novo"
        onClick={() => alert("Ação rápida (placeholder)")}
      >
        <MaterialIcon name="add" className="text-[30px] text-white" />
      </button>
    </AdminMobileShell>
  )
}