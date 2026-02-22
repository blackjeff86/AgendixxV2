"use server"

import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"

export type ProfileAppointmentRow = {
  id: string
  service_name: string
  status: string
  start_at: string
}

type FetchProfileAppointmentsInput = {
  slug: string
  tab: "upcoming" | "past"
  whatsappDigits?: string
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "")
}

export async function fetchProfileAppointments(
  input: FetchProfileAppointmentsInput
): Promise<ProfileAppointmentRow[]> {
  const slug = String(input.slug || "").trim()
  const tab = input.tab === "past" ? "past" : "upcoming"
  const phone = onlyDigits(input.whatsappDigits || "")

  if (!slug) return []

  const tenant = await getTenantBySlug(slug)
  if (!tenant?.id) return []

  if (phone) {
    if (tab === "upcoming") {
      return sql<ProfileAppointmentRow[]>`
        select
          a.id,
          s.name as service_name,
          a.status::text as status,
          a.start_at::text as start_at
        from public.appointments a
        join public.services s on s.id = a.service_id
        join public.customers c on c.id = a.customer_id
        where a.tenant_id = ${tenant.id}::uuid
          and c.phone = ${phone}
          and a.start_at >= now()
        order by a.start_at asc
        limit 30
      `
    }

    return sql<ProfileAppointmentRow[]>`
      select
        a.id,
        s.name as service_name,
        a.status::text as status,
        a.start_at::text as start_at
      from public.appointments a
      join public.services s on s.id = a.service_id
      join public.customers c on c.id = a.customer_id
      where a.tenant_id = ${tenant.id}::uuid
        and c.phone = ${phone}
        and a.start_at < now()
      order by a.start_at desc
      limit 30
    `
  }

  if (tab === "upcoming") {
    return sql<ProfileAppointmentRow[]>`
      select
        a.id,
        s.name as service_name,
        a.status::text as status,
        a.start_at::text as start_at
      from public.appointments a
      join public.services s on s.id = a.service_id
      where a.tenant_id = ${tenant.id}::uuid
        and a.start_at >= now()
      order by a.start_at asc
      limit 30
    `
  }

  return sql<ProfileAppointmentRow[]>`
    select
      a.id,
      s.name as service_name,
      a.status::text as status,
      a.start_at::text as start_at
    from public.appointments a
    join public.services s on s.id = a.service_id
    where a.tenant_id = ${tenant.id}::uuid
      and a.start_at < now()
    order by a.start_at desc
    limit 30
  `
}
