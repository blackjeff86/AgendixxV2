// src/app/(public)/c/[slug]/admin/clientes/actions.ts
"use server"

import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"

export type FetchAdminCustomersInput = {
  slug: string
  q?: string // busca por nome ou telefone
  letter?: string // "A".."Z" ou "ALL"
  limit?: number
  offset?: number
}

export type AdminCustomerRow = {
  id: string
  name: string
  phone: string | null
  avatar_url: string | null

  last_procedure: string | null
  last_visit_label: string | null
}

/**
 * Busca clientes do tenant (via slug) e retorna:
 * - nome, telefone, avatar
 * - último procedimento (baseado no último appointment)
 * - label da última visita (Hoje/Ontem/Há X dias)
 *
 * Espera tabelas:
 *  - public.customers (tenant_id, id, name, phone, avatar_url, ...)
 *  - public.appointments (tenant_id, customer_id, service_id, start_at, status, ...)
 *  - public.services (tenant_id, id, name, ...)
 */
export async function fetchAdminCustomers(input: FetchAdminCustomersInput): Promise<AdminCustomerRow[]> {
  try {
    const slug = (input.slug || "").trim()
    if (!slug) return []

    const tenant = await getTenantBySlug(slug)
    if (!tenant?.id) return []

    const q = (input.q || "").trim()
    const letterRaw = (input.letter || "ALL").trim().toUpperCase()
    const letter = letterRaw === "ALL" ? "ALL" : letterRaw.slice(0, 1)

    const limit = clampInt(input.limit, 50, 1, 200)
    const offset = clampInt(input.offset, 0, 0, 10_000)

    // Normaliza busca por telefone (só dígitos)
    const qDigits = onlyDigits(q)

    const r = await sql<AdminCustomerRow>`
      with filtered as (
        select
          c.id,
          c.name,
          c.phone,
          c.avatar_url
        from public.customers c
        where c.tenant_id = ${tenant.id}::uuid
          and (
            ${q} = ''
            or lower(c.name) like ('%' || lower(${q}) || '%')
            or (
              ${qDigits} <> ''
              and regexp_replace(coalesce(c.phone,''), '\\D', '', 'g') like ('%' || ${qDigits} || '%')
            )
          )
          and (
            ${letter} = 'ALL'
            or upper(left(trim(coalesce(c.name,'')), 1)) = ${letter}
          )
      )
      select
        f.id,
        f.name,
        f.phone,
        f.avatar_url,

        la.last_procedure,
        la.last_visit_label
      from filtered f
      left join lateral (
        select
          s.name as last_procedure,
          case
            when ap.start_at is null then null
            when (current_date - (ap.start_at at time zone 'UTC')::date) = 0 then 'Hoje'
            when (current_date - (ap.start_at at time zone 'UTC')::date) = 1 then 'Ontem'
            else 'Há ' || (current_date - (ap.start_at at time zone 'UTC')::date)::int || ' dias'
          end as last_visit_label
        from public.appointments ap
        left join public.services s
          on s.tenant_id = ap.tenant_id
         and s.id = ap.service_id
        where ap.tenant_id = ${tenant.id}::uuid
          and ap.customer_id = f.id
          and ap.status in ('confirmed','pending','done') -- ajuste se quiser incluir 'scheduled'
        order by ap.start_at desc nulls last
        limit 1
      ) la on true
      order by f.name asc
      limit ${limit} offset ${offset}
    `

    return r.rows
  } catch (e) {
    console.error("[fetchAdminCustomers] error:", e)
    return []
  }
}

// --------------------
// helpers
// --------------------
function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "")
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}