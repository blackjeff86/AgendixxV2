// src/app/(public)/c/[slug]/admin/relatorios/ReportsClient.tsx
"use client"

import React, { useMemo, useState } from "react"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type Props = { slug: string }

type Period = "daily" | "weekly" | "monthly"

type KpiCard = {
  id: string
  icon: string
  iconBg: string
  iconColor: string
  label: string
  value: string
  deltaLabel: string
  deltaColor: string
}

type TopService = {
  id: string
  name: string
  count: number
  pct: number // 0..100
  strength: "strong" | "mid" | "light" | "faint"
}

type TopPro = {
  id: string
  name: string
  role: string
  revenue: string
  shareLabel: string
  avatarUrl?: string | null
  shareColor: string
}

function toggleBtn(active: boolean) {
  return (
    "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all " +
    (active ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500")
  )
}

export default function ReportsClient({ slug }: Props) {
  const [period, setPeriod] = useState<Period>("monthly")

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        id: "k1",
        icon: "payments",
        iconBg: "bg-purple-100 dark:bg-purple-900/30",
        iconColor: "text-primary",
        label: "Lucro Bruto",
        value: "R$ 42.8k",
        deltaLabel: "+14%",
        deltaColor: "text-green-500",
      },
      {
        id: "k2",
        icon: "confirmation_number",
        iconBg: "bg-sky-100 dark:bg-sky-900/30",
        iconColor: "text-sky-500",
        label: "Ticket Médio",
        value: "R$ 385",
        deltaLabel: "+5%",
        deltaColor: "text-green-500",
      },
    ],
    []
  )

  const topServices = useMemo<TopService[]>(
    () => [
      { id: "s1", name: "Botox Facial", count: 142, pct: 85, strength: "strong" },
      { id: "s2", name: "Preenchimento", count: 98, pct: 65, strength: "mid" },
      { id: "s3", name: "Limpeza de Pele", count: 76, pct: 50, strength: "light" },
      { id: "s4", name: "Peeling", count: 45, pct: 30, strength: "faint" },
    ],
    []
  )

  const topPros = useMemo<TopPro[]>(
    () => [
      {
        id: "p1",
        name: "Dra. Amanda Oliveira",
        role: "Líder de Faturamento",
        revenue: "R$ 18.2k",
        shareLabel: "42% total",
        shareColor: "text-green-500",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuClvY2JHUTpnwvro1nHLNYuDuZhrMC77hZW6HAcncXXfPT6qvIhqSSAhecbIC18kswIl8FRk4WnMGVtoG7Zbl4TD_fKujiR8l4GHFWqzZfFgb6caHVrnYY36yc791uxLMCCkQii0yEKBoG9Josfb-Bfusn0HwahZ7W1tW4oLZK-eeSciiKxeUsv1gGUQFetpJuO_9Io0Q-4KN7eVDTKe-mvtPiZRi15okQAtV_SYyFN4cjd9SIyEbetzIgdDsZutvAJ_dHlTLsm9EU",
      },
      {
        id: "p2",
        name: "Juliana Costa",
        role: "Esteticista Senior",
        revenue: "R$ 12.5k",
        shareLabel: "29% total",
        shareColor: "text-sky-500",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDO5rRaLo2QsFaPAHAR_Th8ko-6VY7y7DeTBqGaWGVgNgfchLoMM8BpTqvF7KycKOcbLqwdSHCQcrMyZ83WT5FeMRNTP2WsyDE8IxUX25mQm9mVkwIBGoLSrM4KY98PvlWea7uQOKM7aOSbYwyFE5qACE5s608wiZ95u7dArE7wU2ha7Lt_xa2Sg_ie_qh75dkTmExpBtez0muShDPkmpTYKICSNfF6oVkZpiRK2citKzOt3D_Po_tdGkA3Bxmj9-coeFtuhTkz8WM",
      },
      {
        id: "p3",
        name: "Ricardo Mendes",
        role: "Biomédico",
        revenue: "R$ 12.1k",
        shareLabel: "28% total",
        shareColor: "text-sky-500",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBFy35aeWrPm-cizNLIJnrtYZKVT6cefOM33_LLHz-UyRtepqhp076SXek8K_nSXok3FUO9t7RhldG2hkF7RNbd2yYQNbsRLSg5ie7FB103HMw7PvAvq2b4ZUS3PyYIwHTmaK8M95X1hOHpZiNxtmlAKjYMyQGFl5DEjDl85nZnQOC4XBFFM6-2a_OlZMgbCQBGUuO_JrqMoRYPo3rgVw-HVmwe6C8FEkoAgYNumuuupdtjM57pyorSL8ZTrbqVaGnuU3RhabJmLTM",
      },
    ],
    []
  )

  function barClass(strength: TopService["strength"]) {
    if (strength === "strong") return "bg-primary"
    if (strength === "mid") return "bg-primary/70"
    if (strength === "light") return "bg-primary/50"
    return "bg-primary/30"
  }

  return (
    <AdminMobileShell slug={slug} title="Relatórios" subtitle="Performance" active="relatorios" showBottomNav>
      <div className="p-4 space-y-8">
        {/* Toggle período */}
        <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex">
          <button type="button" className={toggleBtn(period === "daily")} onClick={() => setPeriod("daily")}>
            Diário
          </button>
          <button type="button" className={toggleBtn(period === "weekly")} onClick={() => setPeriod("weekly")}>
            Semanal
          </button>
          <button type="button" className={toggleBtn(period === "monthly")} onClick={() => setPeriod("monthly")}>
            Mensal
          </button>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-4">
          {kpis.map((k) => (
            <div
              key={k.id}
              className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm"
            >
              <div className={"w-8 h-8 rounded-full flex items-center justify-center mb-3 " + k.iconBg}>
                <MaterialIcon name={k.icon} className={"text-[18px] " + k.iconColor} />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{k.label}</p>
              <p className="text-xl font-bold mt-1">{k.value}</p>

              <span className={"text-[10px] font-bold flex items-center gap-0.5 mt-1 " + k.deltaColor}>
                <MaterialIcon name="trending_up" className="text-[14px]" /> {k.deltaLabel}
              </span>
            </div>
          ))}
        </section>

        {/* Chart mock */}
        <section className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="mb-6">
            <h3 className="font-bold text-slate-900 dark:text-white">Agendamentos vs Cancelamentos</h3>

            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Realizados</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Cancelados</span>
              </div>
            </div>
          </div>

          <div className="w-full">
            <div className="h-40 w-full rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 px-3 py-3">
              <div className="h-full grid grid-cols-4 gap-3 items-end">
                {[
                  { week: "SEM 01", done: 52, canceled: 18 },
                  { week: "SEM 02", done: 64, canceled: 22 },
                  { week: "SEM 03", done: 44, canceled: 26 },
                  { week: "SEM 04", done: 72, canceled: 20 },
                ].map((item) => (
                  <div key={item.week} className="h-full flex flex-col justify-end">
                    <div className="h-full flex items-end justify-center gap-1.5">
                      <div
                        className="w-3 rounded-t-md bg-primary"
                        style={{ height: `${item.done}%` }}
                        title={`Realizados: ${item.done}`}
                      />
                      <div
                        className="w-3 rounded-t-md bg-sky-400"
                        style={{ height: `${item.canceled}%` }}
                        title={`Cancelados: ${item.canceled}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 mt-3">
              {["SEM 01", "SEM 02", "SEM 03", "SEM 04"].map((w) => (
                <span key={w} className="text-center text-[10px] text-slate-400 font-bold">
                  {w}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Top serviços */}
        <section className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold mb-6">Serviços mais Procurados</h3>

          <div className="space-y-5">
            {topServices.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span>{s.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{s.count}</span>
                </div>

                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={"h-full rounded-full " + barClass(s.strength)} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top profissionais */}
        <section className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold mb-6">Top Profissionais</h3>

          <div className="space-y-4">
            {topPros.map((p) => (
              <div key={p.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0">
                  {p.avatarUrl ? <img alt="" className="w-full h-full object-cover" src={p.avatarUrl} /> : null}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                    {p.role}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{p.revenue}</p>
                  <p className={"text-[10px] font-bold " + p.shareColor}>{p.shareLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* botão share (placeholder) */}
      <button
        type="button"
        className="fixed top-[76px] right-6 z-40 p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 transition"
        aria-label="Compartilhar"
        title="Compartilhar"
        onClick={() => alert(`Exportar/Compartilhar (${period}) — placeholder`)}
      >
        <MaterialIcon name="share" className="text-[20px] text-slate-600 dark:text-slate-300" />
      </button>
    </AdminMobileShell>
  )
}
