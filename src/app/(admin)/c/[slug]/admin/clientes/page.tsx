// src/app/(public)/c/[slug]/admin/clientes/page.tsx
import AdminClientesClient from "./AdminClientesClient"

export default async function Page({ params }: { params: { slug: string } }) {
  const slug = params.slug
  return <AdminClientesClient slug={slug} />
}