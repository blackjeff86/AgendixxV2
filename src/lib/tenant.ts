import { sql } from "./db"

export type Tenant = {
  id: string
  name: string
  slug: string
  status: string
}

export async function getTenantBySlug(slug: unknown): Promise<Tenant | null> {
  const s = String(slug ?? "").trim().toLowerCase()
  if (!s) return null

  const rows = await sql<Tenant[]>`
    select id, name, slug, status
    from tenants
    where slug = ${s}
    limit 1
  `

  return rows[0] ?? null
}