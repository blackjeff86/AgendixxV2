// src/app/(public)/c/[slug]/admin/marketing/page.tsx
import MarketingClient from "./MarketingClient"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <MarketingClient slug={slug} />
}