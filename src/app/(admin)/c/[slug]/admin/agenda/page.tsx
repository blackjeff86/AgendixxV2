import AgendaClient from "./AgendaClient"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <AgendaClient slug={slug} />
}