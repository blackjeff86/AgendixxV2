/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tema Admin (templates 2 e 3)
        primary: "#13b6ec",
        "background-light": "#f8fafb",
        "surface-light": "#ffffff",
        "text-main": "#1e293b",
        "text-muted": "#64748b",
        "border-light": "#e2e8f0",

        // ✅ Fundo azul clarinho (quase branco) para Admin/Login
        "background-admin": "#F3F8FF",
        // ✅ opcional: um tom ainda um pouco mais azulado
        "background-admin-2": "#EEF6FF",

        // Tema Cliente (template 1)
        "client-primary": "#D97706",
        "client-primary-light": "#FEF3C7",
        "background-offwhite": "#F8FAFC",
        surface: "#FFFFFF",
        "border-soft": "#F1F5F9",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "Manrope", "sans-serif"],
        sans: ["var(--font-manrope)", "Manrope", "sans-serif"],
      },
      borderRadius: {
        ios: "1.25rem",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")],
};
