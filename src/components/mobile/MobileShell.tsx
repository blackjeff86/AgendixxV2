"use client"

import Link from "next/link"
import MaterialIcon from "./MaterialIcon"
import ThemeToggle from "./ThemeToggle"

type Props = {
  slug: string
  title: string
  subtitle?: string
  active?: "home" | "services" | "agenda" | "profile"
  children: React.ReactNode

  // opcional (não muda o padrão): útil em telas com footer fixo (/book, /confirm)
  showBottomNav?: boolean
}

export default function MobileShell({
  slug,
  title,
  subtitle,
  active = "home",
  children,
  showBottomNav = true,
}: Props) {
  return (
    <div className="relative flex min-h-dvh w-full max-w-[430px] mx-auto flex-col overflow-hidden bg-background-light dark:bg-background-dark shadow-2xl">
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-6 pb-2 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MaterialIcon name="spa" className="text-primary text-2xl" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 transition"
            aria-label="Favoritar"
            title="Favoritar"
          >
            <MaterialIcon name="favorite" className="text-red-500 text-[22px]" filled />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className={`flex-1 overflow-y-auto no-scrollbar ${showBottomNav ? "pb-24" : ""}`}>
        {children}
      </main>

      {/* Bottom Nav */}
      {showBottomNav ? (
        <nav className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 px-6 pt-2 pb-6 flex justify-between items-center z-30">
          <NavItem href={`/c/${slug}`} label="Home" icon="home" active={active === "home"} filled />
          <NavItem
            href={`/c/${slug}/services`}
            label="Serviços"
            icon="auto_awesome"
            active={active === "services"}
            filled
          />
          <NavItem
            href={`/c/${slug}/agenda`}
            label="Agenda"
            icon="calendar_month"
            active={active === "agenda"}
          />
          <NavItem href={`/c/${slug}/me`} label="Perfil" icon="person" active={active === "profile"} />
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
  const base = active
    ? "text-primary"
    : "text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors"

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