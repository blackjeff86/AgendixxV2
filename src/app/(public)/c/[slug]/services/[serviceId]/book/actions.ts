"use server"

import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"

type FetchProfessionalsInput = {
  slug: string
  serviceId: string
}

type ProfessionalRow = {
  id: string
  name: string
  specialty: string | null
  photo_url: string | null
  color_hex: string | null
}

export async function fetchProfessionals(
  input: FetchProfessionalsInput
): Promise<ProfessionalRow[]> {
  try {
    const slug = (input.slug || "").trim()
    const serviceId = (input.serviceId || "").trim()

    if (!slug || !serviceId) return []

    const tenant = await getTenantBySlug(slug)
    if (!tenant?.id) return []

    const r = (await sql`
      select
        p.id,
        p.name,
        p.specialty,
        p.photo_url,
        p.color_hex
      from public.professionals p
      join public.professional_services ps
        on ps.professional_id = p.id
       and ps.tenant_id = p.tenant_id
      where p.tenant_id = ${tenant.id}::uuid
        and ps.service_id = ${serviceId}::uuid
        and p.is_active = true
        and ps.is_active = true
      order by p.sort_order, p.name
    `) as unknown as { rows: ProfessionalRow[] }

    return r.rows
  } catch (e) {
    console.error("[fetchProfessionals] error:", e)
    return []
  }
}

type FetchAvailableSlotsInput = {
  slug: string
  professionalId: string
  date: string
}

type SlotRow = { t: string }

function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function fetchAvailableSlots(
  input: FetchAvailableSlotsInput
): Promise<string[]> {
  try {
    const slug = input.slug?.trim()
    const professionalId = input.professionalId?.trim()
    const date = input.date?.trim()

    if (!slug || !professionalId) return []
    if (!isIsoDate(date)) return []

    const tenant = await getTenantBySlug(slug)
    if (!tenant?.id) return []

    const r = (await sql`
      with base as (
        select
          a.tenant_id,
          a.professional_id,
          ${date}::date as day,
          a.start_time,
          a.end_time,
          a.slot_minutes
        from public.availability a
        where a.tenant_id = ${tenant.id}::uuid
          and a.professional_id = ${professionalId}::uuid
          and a.is_active = true
          and a.weekday = extract(dow from ${date}::date)::int
        limit 1
      ),
      slots as (
        select
          (day + start_time)::timestamptz
          + (n * (slot_minutes || ' minutes')::interval) as start_at
        from base
        cross join generate_series(
          0,
          floor(
            extract(epoch from ((day + end_time)::timestamptz - (day + start_time)::timestamptz))
            / 60
            / slot_minutes
          )::int - 1
        ) as n
      ),
      busy as (
        select ap.start_at
        from public.appointments ap
        where ap.tenant_id = ${tenant.id}::uuid
          and ap.professional_id = ${professionalId}::uuid
          and ap.status in ('confirmed','pending')
          and ap.start_at >= ${date}::date
          and ap.start_at < (${date}::date + interval '1 day')
      )
      select to_char(s.start_at at time zone 'UTC', 'HH24:MI') as t
      from slots s
      left join busy b on b.start_at = s.start_at
      where b.start_at is null
      order by s.start_at
    `) as unknown as { rows: SlotRow[] }

    return r.rows.map(x => x.t)
  } catch (e) {
    console.error("[fetchAvailableSlots] error:", e)
    return []
  }
}