import ProfessionalSettingsClient from "./ProfessionalSettingsClient"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  return <ProfessionalSettingsClient slug={slug} professionalId={id} />
}