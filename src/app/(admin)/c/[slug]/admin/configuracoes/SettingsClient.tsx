"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import AdminMobileShell from "@/components/mobile/AdminMobileShell"
import MaterialIcon from "@/components/mobile/MaterialIcon"

type TabKey = "funcionarios" | "servicos" | "horarios"

type TeamMember = {
  id: string
  name: string
  role: string
  photoUrl: string
  enabled: boolean
}

type ServiceItem = {
  id: string
  name: string
  meta: string
  icon: string
}

type DayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"

type WorkDay = {
  key: DayKey
  label: string
  enabled: boolean
  start: string
  end: string
}

export default function SettingsClient({ slug }: { slug: string }) {
  const [tab, setTab] = useState<TabKey>("funcionarios")

  const [team, setTeam] = useState<TeamMember[]>([
    {
      id: "1",
      name: "Dra. Amanda Oliveira",
      role: "Biomédica Esteta",
      photoUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuClvY2JHUTpnwvro1nHLNYuDuZhrMC77hZW6HAcncXXfPT6qvIhqSSAhecbIC18kswIl8FRk4WnMGVtoG7Zbl4TD_fKujiR8l4GHFWqzZfFgb6caHVrnYY36yc791uxLMCCkQii0yEKBoG9Josfb-Bfusn0HwahZ7W1tW4oLZK-eeSciiKxeUsv1gGUQFetpJuO_9Io0Q-4KN7eVDTKe-mvtPiZRi15okQAtV_SYyFN4cjd9SIyEbetzIgdDsZutvAJ_dHlTLsm9EU",
      enabled: true,
    },
    {
      id: "2",
      name: "Carla Souza",
      role: "Esteticista Facial",
      photoUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAQOMJwhlNRzU6iKsa48r7jrZoUB8spNtgrD5LKVLkzVXs3tD1smdBKyBmDKihc0Qh6BBMcm_jjKM_7eY4q7fk8pZFAfTBkkizLj4VLkdDeUpYcoKZNp1wAMIY8CiBzZMzPJWCn0dZkLuyC85DxA7zMowBBzbuK-SPjEGbdWrREi6wBcoLlX7sADKqlbBt_voLCMJ1JkU17Is2Uc0DamVTjv3TL84onfIKejO9H9LXOIdWHcqCrZnhlOkFpPXyz6Wp6g-PxA-q-9dU",
      enabled: true,
    },
  ])

  const services = useMemo<ServiceItem[]>(
    () => [
      { id: "s1", name: "Limpeza de Pele", meta: "60 min • R$ 180", icon: "face" },
      { id: "s2", name: "Peeling Químico", meta: "45 min • R$ 250", icon: "content_cut" },
    ],
    []
  )

  const [hours, setHours] = useState<WorkDay[]>([
    { key: "seg", label: "Segunda", enabled: true, start: "08:00", end: "18:00" },
    { key: "ter", label: "Terça", enabled: true, start: "08:00", end: "18:00" },
    { key: "qua", label: "Quarta", enabled: false, start: "08:00", end: "18:00" },
    { key: "qui", label: "Quinta", enabled: false, start: "08:00", end: "18:00" },
    { key: "sex", label: "Sexta", enabled: false, start: "08:00", end: "18:00" },
    { key: "sab", label: "Sábado", enabled: false, start: "09:00", end: "13:00" },
    { key: "dom", label: "Domingo", enabled: false, start: "09:00", end: "13:00" },
  ])

  const shareLink = useMemo(() => `http://localhost:3000/c/${slug}`, [slug])

  const [logoUrl, setLogoUrl] = useState(
    "https://lh3.googleusercontent.com/aida-public/AB6AXuClvY2JHUTpnwvro1nHLNYuDuZhrMC77hZW6HAcncXXfPT6qvIhqSSAhecbIC18kswIl8FRk4WnMGVtoG7Zbl4TD_fKujiR8l4GHFWqzZfFgb6caHVrnYY36yc791uxLMCCkQii0yEKBoG9Josfb-Bfusn0HwahZ7W1tW4oLZK-eeSciiKxeUsv1gGUQFetpJuO_9Io0Q-4KN7eVDTKe-mvtPiZRi15okQAtV_SYyFN4cjd9SIyEbetzIgdDsZutvAJ_dHlTLsm9EU"
  )

  const [copied, setCopied] = useState(false)

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      alert("Não foi possível copiar. Seu navegador bloqueou a ação.")
    }
  }

  function toggleMember(id: string) {
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)))
  }

  function toggleDay(key: DayKey) {
    setHours((prev) => prev.map((d) => (d.key === key ? { ...d, enabled: !d.enabled } : d)))
  }

  function setDayTime(key: DayKey, field: "start" | "end", value: string) {
    setHours((prev) => prev.map((d) => (d.key === key ? { ...d, [field]: value } : d)))
  }

  function onAddMember() {
    alert("Adicionar funcionário (mock). Próximo passo: CRUD em professionals.")
  }

  function onNewService() {
    alert("Novo serviço (mock). Próximo passo: CRUD em services.")
  }

  function onEditService(id: string) {
    alert(`Editar serviço ${id} (mock).`)
  }

  function onUploadLogoMock(file?: File) {
    if (!file) return
    const url = URL.createObjectURL(file)
    setLogoUrl(url)
  }

  function openWhatsAppShare() {
    const text = encodeURIComponent(`Agende seu horário aqui: ${shareLink}`)
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer")
  }

  return (
    <AdminMobileShell slug={slug} title="Configurações" active="mais">
      <div className="p-4 space-y-8 pb-10">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto no-scrollbar">
          <TabButton active={tab === "funcionarios"} onClick={() => setTab("funcionarios")}>
            Funcionários
          </TabButton>
          <TabButton active={tab === "servicos"} onClick={() => setTab("servicos")}>
            Serviços
          </TabButton>
          <TabButton active={tab === "horarios"} onClick={() => setTab("horarios")}>
            Horários
          </TabButton>
        </div>

        {/* Funcionários */}
        {tab === "funcionarios" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-lg">Equipe</h3>

              <button
                type="button"
                onClick={onAddMember}
                className="text-primary text-sm font-bold flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-lg active:scale-[0.99] transition"
              >
                <MaterialIcon name="add" className="text-sm" />
                Adicionar
              </button>
            </div>

            <div className="grid gap-3">
              {team.map((m) => {
                const href = `/c/${slug}/admin/configuracoes/profissionais/${m.id}`

                return (
                  <Link
                    key={m.id}
                    href={href}
                    className="bg-white dark:bg-slate-800 p-4 rounded-2xl flex items-center gap-4 border border-slate-100 dark:border-slate-700 shadow-sm hover:border-primary/30 transition"
                    aria-label={`Configurar ${m.name}`}
                    title="Abrir configurações do funcionário"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-primary/20 bg-slate-50 dark:bg-slate-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={m.name} className="w-full h-full object-cover" src={m.photoUrl} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm truncate">{m.name}</h4>
                      <p className="text-xs text-slate-500 truncate">{m.role}</p>

                      <div className="mt-1 text-[10px] text-slate-400 font-semibold">
                        Toque para configurar horários e bloqueios
                      </div>
                    </div>

                    {/* Toggle não navega */}
                    <Toggle
                      checked={m.enabled}
                      onChange={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleMember(m.id)
                      }}
                    />
                  </Link>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* Serviços */}
        {tab === "servicos" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-lg">Catálogo de Serviços</h3>

              <button
                type="button"
                onClick={onNewService}
                className="text-primary text-sm font-bold flex items-center gap-1 active:scale-[0.99] transition"
              >
                <MaterialIcon name="add_circle" className="text-xl" filled />
                Novo Serviço
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm"
                >
                  <div className="bg-primary/5 w-10 h-10 rounded-lg flex items-center justify-center mb-3 text-primary">
                    <MaterialIcon name={s.icon} className="text-xl" />
                  </div>

                  <h4 className="font-bold text-sm mb-1">{s.name}</h4>
                  <p className="text-[10px] text-slate-500 font-medium mb-2 uppercase tracking-wide">{s.meta}</p>

                  <button
                    type="button"
                    onClick={() => onEditService(s.id)}
                    className="w-full py-1 text-xs font-semibold text-primary border border-primary/20 rounded-lg hover:bg-primary/5 active:scale-[0.99] transition"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Horários */}
        {tab === "horarios" ? (
          <section className="space-y-4">
            <h3 className="font-bold text-lg px-2">Horário de Funcionamento</h3>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {hours.map((d) => (
                  <div key={d.key} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Toggle checked={d.enabled} onChange={() => toggleDay(d.key)} variant="green" />
                      <span className="font-bold text-sm w-20">{d.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <TimePill
                        value={d.start}
                        disabled={!d.enabled}
                        onChange={(v) => setDayTime(d.key, "start", v)}
                      />
                      <span className="text-slate-400 text-xs">às</span>
                      <TimePill value={d.end} disabled={!d.enabled} onChange={(v) => setDayTime(d.key, "end", v)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 px-2">
              * Próximo passo: persistir horários/agenda no banco e refletir nos bloqueios de agenda.
            </div>
          </section>
        ) : null}

        {/* Logo */}
        <section className="space-y-4">
          <h3 className="font-bold text-lg px-2">Logo da Clínica</h3>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Clinic Logo" className="w-full h-full object-contain p-2" src={logoUrl} />
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-500 mb-4">Formatos aceitos: PNG, JPG ou SVG. Máx 2MB.</p>

              <label className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition cursor-pointer">
                <MaterialIcon name="upload" className="text-lg" />
                Alterar Logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => onUploadLogoMock(e.target.files?.[0])}
                />
              </label>

              <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                * Upload é apenas preview (mock).
              </div>
            </div>
          </div>
        </section>

        {/* Link compartilhável */}
        <section className="space-y-4">
          <h3 className="font-bold text-lg px-2">Link para Compartilhar</h3>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <p className="text-xs text-slate-500 mb-3 px-1">
              Este é o link que seus clientes usarão para agendar horários online.
            </p>

            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <MaterialIcon name="link" className="text-primary text-xl" />
              <span className="text-sm font-medium flex-1 truncate text-slate-700 dark:text-slate-300">
                {shareLink}
              </span>

              <button
                type="button"
                onClick={() => copyToClipboard(shareLink)}
                className="text-primary p-2 hover:bg-primary/5 rounded-lg active:scale-[0.98] transition"
                aria-label="Copiar"
                title="Copiar"
              >
                <MaterialIcon name={copied ? "check_circle" : "content_copy"} className="text-xl" filled={copied} />
              </button>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => copyToClipboard(shareLink)}
                className="flex-1 bg-primary/10 text-primary py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/15 active:scale-[0.99] transition"
              >
                <MaterialIcon name={copied ? "check" : "share"} className="text-lg" />
                {copied ? "Copiado!" : "Copiar Link"}
              </button>

              <button
                type="button"
                onClick={openWhatsAppShare}
                className="w-12 h-12 bg-green-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20 hover:brightness-110 active:scale-[0.98] transition"
                aria-label="Enviar no WhatsApp"
                title="Enviar no WhatsApp"
              >
                <MaterialIcon name="send" className="text-xl" filled />
              </button>
            </div>
          </div>
        </section>
      </div>
    </AdminMobileShell>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex-1 px-4 py-2.5 rounded-lg text-sm whitespace-nowrap transition active:scale-[0.99]",
        active
          ? "font-bold bg-primary text-white"
          : "font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
      )}
    >
      {children}
    </button>
  )
}

function Toggle({
  checked,
  onChange,
  variant = "primary",
}: {
  checked: boolean
  onChange: (e: React.MouseEvent<HTMLButtonElement>) => void
  variant?: "primary" | "green"
}) {
  const bgOn = variant === "green" ? "bg-green-500" : "bg-primary"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={clsx(
        "relative inline-flex items-center w-10 h-5 rounded-full px-1 transition-colors",
        checked ? bgOn : "bg-slate-200 dark:bg-slate-700"
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

function TimePill({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium w-[86px]",
        disabled ? "opacity-50" : ""
      )}
    />
  )
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}