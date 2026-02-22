import "./globals.css"
import { Inter } from "next/font/google"
import ThemeProvider from "@/components/ThemeProvider"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-display",
})

export const metadata = {
  title: "Agendixx v2",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  other: {
    // Material Symbols Outlined (garantido no <head>)
    "material-symbols": "enabled",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400..700,0..1,-25..200&display=swap"
          rel="stylesheet"
        />
      </head>

      <body className="font-[var(--font-display)] bg-background-light text-slate-900 antialiased dark:bg-background-dark dark:text-slate-100">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}