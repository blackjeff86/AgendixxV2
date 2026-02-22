// src/app/(public)/c/[slug]/admin/relatorios/page.tsx
import ReportsClient from "./ReportsClient"

export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <ReportsClient slug={slug} />
}