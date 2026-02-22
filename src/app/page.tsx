import Link from "next/link"

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Agendixx</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Este projeto agora utiliza apenas rotas em <code>src/app</code>.
      </p>
      <p className="mt-6 text-sm">
        Acesse um tenant em <Link className="underline" href="/c/clinica-exemplo">/c/clinica-exemplo</Link>.
      </p>
    </main>
  )
}
