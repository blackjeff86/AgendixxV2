// src/app/(public)/c/[slug]/admin/configuracoes/page.tsx
import SettingsClient from "./SettingsClient"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <SettingsClient slug={slug} />
}