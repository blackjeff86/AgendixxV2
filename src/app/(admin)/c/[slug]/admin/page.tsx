// src/app/(admin)/c/[slug]/admin/page.tsx
import AdminDashboardClient from "./AdminDashboardClient"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // depois a gente liga isso no Neon:
  // - validar sessão/admin
  // - buscar KPIs, próximos agendamentos, etc.
  return <AdminDashboardClient slug={slug} />
}