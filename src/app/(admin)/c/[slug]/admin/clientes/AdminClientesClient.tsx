"use client"

import React, { useMemo, useState } from "react"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type Props = { slug: string }

type Customer = {
  id: string
  name: string
  phone: string
  avatarUrl?: string | null
  lastProcedure?: string | null
  lastVisitLabel?: string | null
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "")
}

function formatPhoneBR(phone: string) {
  const d = onlyDigits(phone)
  // 11 digits: (11) 98765-4321
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  // 10 digits: (11) 8765-4321
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

function normalizeName(v: string) {
  return String(v || "").trim()
}

function firstLetter(name: string) {
  const n = normalizeName(name)
  if (!n) return "#"
  return n[0]!.toUpperCase()
}

function waLink(phone: string) {
  const d = onlyDigits(phone)
  if (!d) return "#"
  // BR default country code 55
  const withCC = d.startsWith("55") ? d : `55${d}`
  return `https://wa.me/${withCC}`
}

function chipClass(active: boolean) {
  return (
    "min-w-[32px] h-8 flex items-center justify-center rounded-lg text-xs font-bold border transition-colors " +
    (active
      ? "bg-primary text-white border-transparent"
      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700")
  )
}

export default function AdminClientesClient({ slug }: Props) {
  // ✅ mock (por enquanto). Depois ligamos no banco.
  const baseCustomers = useMemo<Customer[]>(
    () => [
      {
        id: "1",
        name: "Maria Silva Oliveira",
        phone: "11987654321",
        lastProcedure: "Limpeza de Pele",
        lastVisitLabel: "Há 15 dias",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuAQOMJwhlNRzU6iKsa48r7jrZoUB8spNtgrD5LKVLkzVXs3tD1smdBKyBmDKihc0Qh6BBMcm_jjKM_7eY4q7fk8pZFAfTBkkizLj4VLkdDeUpYcoKZNp1wAMIY8CiBzZMzPJWCn0dZkLuyC85DxA7zMowBBzbuK-SPjEGbdWrREi6wBcoLlX7sADKqlbBt_voLCMJ1JkU17Is2Uc0DamVTjv3TL84onfIKejO9H9LXOIdWHcqCrZnhlOkFpPXyz6Wp6g-PxA-q-9dU",
      },
      {
        id: "2",
        name: "Juliana Costa",
        phone: "11977665544",
        lastProcedure: "Botox Facial",
        lastVisitLabel: "Ontem",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDO5rRaLo2QsFaPAHAR_Th8ko-6VY7y7DeTBqGaWGVgNgfchLoMM8BpTqvF7KycKOcbLqwdSHCQcrMyZ83WT5FeMRNTP2WsyDE8IxUX25mQm9mVkwIBGoLSrM4KY98PvlWea7uQOKM7aOSbYwyFE5qACE5s608wiZ95u7dArE7wU2ha7Lt_xa2Sg_ie_qh75dkTmExpBtez0muShDPkmpTYKICSNfF6oVkZpiRK2citKzOt3D_Po_tdGkA3Bxmj9-coeFtuhTkz8WM",
      },
      {
        id: "3",
        name: "Ricardo Mendes",
        phone: "11912345678",
        lastProcedure: "Drenagem Linfática",
        lastVisitLabel: "Há 32 dias",
        avatarUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBFy35aeWrPm-cizNLIJnrtYZKVT6cefOM33_LLHz-UyRtepqhp076SXek8K_nSXok3FUO9t7RhldG2hkF7RNbd2yYQNbsRLSg5ie7FB103HMw7PvAvq2b4ZUS3PyYIwHTmaK8M95X1hOHpZiNxtmlAKjYMyQGFl5DEjDl85nZnQOC4XBFFM6-2a_OlZMgbCQBGUuO_JrqMoRYPo3rgVw-HVmwe6C8FEkoAgYNumuuupdtjM57pyorSL8ZTrbqVaGnuU3RhabJmLTM",
      },
      {
        id: "4",
        name: "Ana Beatriz Rocha",
        phone: "11966554433",
        lastProcedure: "Peeling Químico",
        lastVisitLabel: "Há 7 dias",
        avatarUrl: null,
      },
    ],
    []
  )

  const [query, setQuery] = useState("")
  const [letter, setLetter] = useState<string>("ALL")

  const letters = useMemo(() => {
    // no template você mostrou “Tudo” + letras fixas.
    // Aqui deixo dinâmico (mas mantendo o visual).
    const set = new Set<string>()
    for (const c of baseCustomers) {
      const l = firstLetter(c.name)
      if (/^[A-Z]$/.test(l)) set.add(l)
    }
    return Array.from(set).sort()
  }, [baseCustomers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return baseCustomers
      .filter((c) => {
        if (letter !== "ALL") {
          if (firstLetter(c.name) !== letter) return false
        }
        if (!q) return true
        const name = (c.name || "").toLowerCase()
        const phone = onlyDigits(c.phone || "")
        const qq = onlyDigits(q)
        if (qq) return phone.includes(qq) || name.includes(q)
        return name.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [baseCustomers, query, letter])

  function onNew() {
    alert("Novo cliente (placeholder)")
  }

  return (
    <AdminMobileShell slug={slug} title="Gestão de Clientes" active="clientes">
      {/* Header interno da página (igual ao template, mas dentro do shell) */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Voltar"
              onClick={() => history.back()}
            >
              <MaterialIcon name="arrow_back_ios" className="text-slate-600 dark:text-slate-300 text-[20px]" />
            </button>

            <h2 className="text-xl font-bold tracking-tight">Gestão de Clientes</h2>
          </div>

          <button
            type="button"
            onClick={onNew}
            className="bg-primary text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1 shadow-lg shadow-primary/20 active:scale-[0.98] transition"
          >
            <MaterialIcon name="person_add" className="text-[20px] text-white" />
            Novo
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <MaterialIcon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[22px]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary shadow-sm"
            placeholder="Buscar por nome ou telefone..."
            type="text"
          />
        </div>

        {/* Letter filters */}
        <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
          <button type="button" className={chipClass(letter === "ALL")} onClick={() => setLetter("ALL")}>
            Tudo
          </button>

          {letters.length === 0 ? (
            <>
              {"ABCDEFGH".split("").map((l) => (
                <button key={l} type="button" className={chipClass(letter === l)} onClick={() => setLetter(l)}>
                  {l}
                </button>
              ))}
            </>
          ) : (
            letters.map((l) => (
              <button key={l} type="button" className={chipClass(letter === l)} onClick={() => setLetter(l)}>
                {l}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="p-4 space-y-3 pb-28">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              Nenhum cliente encontrado com esses filtros.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Dica: tente buscar por parte do nome.</p>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0 border-2 border-primary/10 flex items-center justify-center">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={c.name} className="w-full h-full object-cover" src={c.avatarUrl} />
                  ) : (
                    <MaterialIcon name="person" className="text-slate-400 text-[26px]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">{c.name}</h3>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {formatPhoneBR(c.phone)}
                    </span>

                    <a
                      className="w-7 h-7 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center"
                      href={waLink(c.phone)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      title="WhatsApp"
                    >
                      <MaterialIcon name="chat" className="text-[18px]" />
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Ações"
                  onClick={() => alert("Ações do cliente (placeholder)")}
                >
                  <MaterialIcon name="more_vert" className="text-slate-500 dark:text-slate-300 text-[22px]" />
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Último Procedimento</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {c.lastProcedure || "—"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Última Visita</p>
                  <p className="text-xs font-semibold text-primary">{c.lastVisitLabel || "—"}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB (igual ao template) */}
      <button
        type="button"
        onClick={onNew}
        className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
        aria-label="Adicionar cliente"
        title="Adicionar cliente"
      >
        <MaterialIcon name="add" className="text-[30px] text-white" />
      </button>
    </AdminMobileShell>
  )
}