// src/app/(public)/c/[slug]/services/[serviceId]/book/actions.ts
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

export async function fetchProfessionals(input: FetchProfessionalsInput): Promise<ProfessionalRow[]> {
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
  serviceId: string
  professionalId: string
  date: string // YYYY-MM-DD
}

type SlotRow = { t: string }

function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function fetchAvailableSlots(input: FetchAvailableSlotsInput): Promise<string[]> {
  try {
    const slug = input.slug?.trim()
    const serviceId = input.serviceId?.trim()
    const professionalId = input.professionalId?.trim()
    const date = input.date?.trim()

    if (!slug || !serviceId || !professionalId) return []
    if (!isIsoDate(date)) return []

    const tenant = await getTenantBySlug(slug)
    if (!tenant?.id) return []

    // passo de início do slot (ex.: a cada 15 minutos)
    const stepMin = 15

    const r = (await sql`
      with params as (
        select
          ${tenant.id}::uuid as tenant_id,
          ${professionalId}::uuid as professional_id,
          ${serviceId}::uuid as service_id,
          ${date}::date as day_date,
          ${stepMin}::int as step_min
      ),

      -- duração do serviço
      svc as (
        select s.duration_minutes
        from public.services s
        join params p on p.service_id = s.id
        where s.tenant_id = p.tenant_id
        limit 1
      ),

      -- janela semanal do profissional no dia da semana (0=Dom ... 6=Sáb)
      win as (
        select a.start_time, a.end_time
        from public.availability a
        join params p on p.professional_id = a.professional_id
        where a.tenant_id = p.tenant_id
          and a.professional_id = p.professional_id
          and a.is_active = true
          and a.day_of_week = extract(dow from p.day_date)::int
      ),

      -- slots candidatos dentro da janela: [start_time, end_time - duration]
      candidate as (
        select
          gs as slot_start,
          gs + make_interval(mins => (select duration_minutes from svc)) as slot_end
        from win w
        join params p on true
        join lateral generate_series(
          (p.day_date::timestamp + w.start_time),
          (p.day_date::timestamp + w.end_time)
            - make_interval(mins => (select duration_minutes from svc)),
          make_interval(mins => p.step_min)
        ) gs on true
      ),

      -- appointments ocupados (conflito por sobreposição)
      busy as (
        select ap.start_at as busy_start, ap.end_at as busy_end
        from public.appointments ap
        join params p on p.tenant_id = ap.tenant_id and p.professional_id = ap.professional_id
        where ap.tenant_id = p.tenant_id
          and ap.professional_id = p.professional_id
          and coalesce(ap.status, 'confirmed') <> 'cancelled'
          -- pega tudo que possa sobrepor o dia
          and ap.start_at < (p.day_date + interval '1 day')
          and ap.end_at   > (p.day_date::timestamp)
      ),

      -- exceptions bloqueadas (is_available=false)
      blocked as (
        select
          (p.day_date::timestamp + e.start_time) as b_start,
          (p.day_date::timestamp + e.end_time)   as b_end
        from public.availability_exceptions e
        join params p
          on p.tenant_id = e.tenant_id
         and p.professional_id = e.professional_id
        where e.day = p.day_date
          and e.is_available = false
      ),

      -- exceptions liberadas (is_available=true) => override
      allowed as (
        select
          (p.day_date::timestamp + e.start_time) as a_start,
          (p.day_date::timestamp + e.end_time)   as a_end
        from public.availability_exceptions e
        join params p
          on p.tenant_id = e.tenant_id
         and p.professional_id = e.professional_id
        where e.day = p.day_date
          and e.is_available = true
      )

      select to_char(c.slot_start, 'HH24:MI') as t
      from candidate c
      where
        -- não conflita com appointments
        not exists (
          select 1
          from busy b
          where b.busy_start < c.slot_end
            and b.busy_end   > c.slot_start
        )
        -- não conflita com bloqueios
        and not exists (
          select 1
          from blocked b
          where b.b_start < c.slot_end
            and b.b_end   > c.slot_start
        )
        -- se existir allowed, só vale slot que esteja contido em allowed
        and (
          not exists (select 1 from allowed)
          or exists (
            select 1
            from allowed a
            where a.a_start <= c.slot_start
              and a.a_end   >= c.slot_end
          )
        )
      order by c.slot_start
    `) as unknown as { rows: SlotRow[] }

    return r.rows.map((x) => x.t)
  } catch (e) {
    console.error("[fetchAvailableSlots] error:", e)
    return []
  }
}