"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import MaterialIcon from "./MaterialIcon"

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="size-10" />

  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-95 transition"
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      <MaterialIcon
        name={isDark ? "dark_mode" : "light_mode"}
        className="text-primary text-[22px]"
        filled
      />
    </button>
  )
}