import type { Metadata } from "next";
import "./globals.css";
import { Manrope } from "next/font/google";
import ThemeBodyClass from "./ThemeBodyClass";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agendixx",
  description: "Agendixx - Agenda online para salões",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(() => { try { const p = location.pathname || '/'; const useApp = !(p === '/' || p.startsWith('/admin')); const b = document.body; if (useApp) { b?.classList.add('theme-app'); b?.classList.remove('theme-light'); } else { b?.classList.add('theme-light'); b?.classList.remove('theme-app'); } } catch (e) {} })();",
          }}
        />
        <ThemeBodyClass />
        {children}
      </body>
    </html>
  );
}
