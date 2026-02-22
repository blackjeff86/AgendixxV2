"use client"

import Link from "next/link"
import MaterialIcon from "./MaterialIcon"
import ThemeToggle from "./ThemeToggle"

type AdminTab = "dashboard" | "agenda" | "clientes" | "relatorios" | "mais"

type Props = {
  slug: string
  title: string
  subtitle?: string
  active?: AdminTab
  children: React.ReactNode

  // útil em telas com footer fixo (mantém o padrão igual ao MobileShell)
  showBottomNav?: boolean
}

export default function AdminMobileShell({
  slug,
  title,
  subtitle,
  active = "dashboard",
  children,
  showBottomNav = true,
}: Props) {
  return (
    <div className="relative flex min-h-dvh w-full max-w-[430px] mx-auto flex-col overflow-hidden bg-background-light dark:bg-background-dark shadow-2xl">
      {/* Header (mesma estrutura do MobileShell público) */}
      <header className="flex items-center justify-between px-6 pt-6 pb-2 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MaterialIcon name="admin_panel_settings" className="text-primary text-2xl" />
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight tracking-tight truncate">{title}</h1>
            {subtitle ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Admin · {slug}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 transition"
            aria-label="Notificações"
            title="Notificações"
          >
            <MaterialIcon name="notifications" className="text-slate-600 dark:text-slate-300 text-[22px]" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className={`flex-1 overflow-y-auto no-scrollbar ${showBottomNav ? "pb-24" : ""}`}>{children}</main>

      {/* Bottom Nav (mesmo padrão do MobileShell público) */}
      {showBottomNav ? (
        <nav className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 px-6 pt-2 pb-6 flex justify-between items-center z-30">
          <NavItem
            href={`/c/${slug}/admin`}
            label="Início"
            icon="grid_view"
            active={active === "dashboard"}
            filled
          />

          <NavItem
            href={`/c/${slug}/admin/agenda`}
            label="Agenda"
            icon="calendar_month"
            active={active === "agenda"}
          />

          <NavItem
            href={`/c/${slug}/admin/clientes`}
            label="Clientes"
            icon="group"
            active={active === "clientes"}
          />

          <NavItem
            href={`/c/${slug}/admin/relatorios`}
            label="Relatórios"
            icon="bar_chart"
            active={active === "relatorios"}
          />

          <NavItem
            href={`/c/${slug}/admin/configuracoes`}
            label="Mais"
            icon="settings"
            active={active === "mais"}
          />
        </nav>
      ) : null}
    </div>
  )
}

function NavItem({
  href,
  label,
  icon,
  active,
  filled = false,
}: {
  href: string
  label: string
  icon: string
  active: boolean
  filled?: boolean
}) {
  const base = active ? "text-primary" : "text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors"
  const text = active ? "text-[10px] font-bold text-primary" : "text-[10px] font-medium"

  return (
    <Link className={`flex flex-col items-center gap-1 group ${base}`} href={href}>
      <div className="flex h-8 items-center justify-center">
        <MaterialIcon
          name={icon}
          className={active ? "text-primary text-[28px]" : "text-[28px]"}
          filled={filled && active}
        />
      </div>
      <p className={text}>{label}</p>
    </Link>
  )
}