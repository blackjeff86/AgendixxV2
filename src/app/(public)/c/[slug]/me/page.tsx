// src/app/(public)/c/[slug]/me/page.tsx
import MobileShell from "@/components/mobile/MobileShell"
import ProfileClient from "./ProfileClient"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <MobileShell slug={slug} title="Meu Perfil" subtitle="Dados e agendamentos" active="profile">
      <ProfileClient slug={slug} />
    </MobileShell>
  )
}