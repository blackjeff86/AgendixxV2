"use server"

import { sql } from "@/lib/db"
import { getTenantBySlug } from "@/lib/tenant"

type CreateAppointmentInput = {
  slug: string
  serviceId: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  professionalId: string // UUID
  customerName: string
  whatsappDigits: string
}

function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}
function isTime(v: string) {
  return /^\d{2}:\d{2}$/.test(v)
}
function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "")
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function toStartAt(date: string, time: string) {
  return new Date(`${date}T${time}:00.000Z`)
}

function normalizePgErrorMessage(e: any) {
  const msg = String(e?.message || e?.toString?.() || "")
  const code = String(e?.code || "")
  const lower = msg.toLowerCase()

  if (
    lower.includes('relation "customers" does not exist') ||
    lower.includes('relation "appointments" does not exist') ||
    lower.includes('relation "professionals" does not exist') ||
    lower.includes('relation "professional_services" does not exist')
  ) {
    return "Tabelas do agendamento/profissionais não existem no banco. Rode as migrations de customers/appointments/professionals."
  }

  if (
    lower.includes('column "full_name" of relation "customers" does not exist') ||
    lower.includes('column "whatsapp_e164" of relation "customers" does not exist') ||
    lower.includes('column "updated_at" of relation "customers" does not exist')
  ) {
    return 'Schema de customers desatualizado. Confirme se customers possui full_name, whatsapp_e164, updated_at e UNIQUE (tenant_id, whatsapp_e164).'
  }

  if (
    lower.includes('column "professional_name" of relation "appointments" does not exist') ||
    lower.includes('column "professional_id" of relation "appointments" does not exist')
  ) {
    return "Schema de appointments desatualizado. Confirme se appointments possui professional_id e professional_name."
  }

  if (lower.includes('relation "tenants" does not exist')) {
    return "A tabela tenants não existe no banco. Confirme se você rodou o SQL base de multi-tenant."
  }

  if (lower.includes("invalid input syntax for type uuid")) {
    return "UUID inválido em algum campo (tenant/service/professional/customer/appointment)."
  }

  if (code === "23505" || lower.includes("duplicate key")) {
    return "Esse horário acabou de ser reservado. Escolha outro horário."
  }

  if (code === "23503" || lower.includes("violates foreign key")) {
    return "Falha de integridade (FK). Confirme se tenant/professional/service existem e se as constraints foram criadas corretamente."
  }

  return msg || "Erro desconhecido no banco."
}

type ServiceRow = { id: string; duration_minutes: number }
type CustomerRow = { id: string }
type ProfessionalRow = { id: string; name: string }
type ApptRow = { id: string }

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<{ ok: true; appointmentId: string } | { ok: false; error: string }> {
  try {
    const slug = (input.slug || "").trim()
    const serviceId = (input.serviceId || "").trim()
    const date = (input.date || "").trim()
    const time = (input.time || "").trim()
    const professionalId = (input.professionalId || "").trim()
    const customerName = (input.customerName || "").trim()
    const whatsapp = onlyDigits(input.whatsappDigits)

    if (!slug) return { ok: false, error: "Slug inválido." }
    if (!serviceId) return { ok: false, error: "Serviço inválido." }
    if (!isUuid(serviceId)) return { ok: false, error: "Serviço inválido (UUID)." }
    if (!isIsoDate(date)) return { ok: false, error: "Data inválida." }
    if (!isTime(time)) return { ok: false, error: "Horário inválido." }
    if (!professionalId || !isUuid(professionalId)) return { ok: false, error: "Profissional inválido (UUID)." }
    if (customerName.length < 3) return { ok: false, error: "Nome inválido." }
    if (whatsapp.length < 10) return { ok: false, error: "WhatsApp inválido." }

    const tenant = await getTenantBySlug(slug)
    if (!tenant?.id) return { ok: false, error: "Tenant não encontrado (slug inválido ou tenant não cadastrado)." }

    // 1) valida serviço e pega duração real
    const s = (await sql`
      select id, duration_minutes
      from public.services
      where id = ${serviceId}::uuid
        and tenant_id = ${tenant.id}::uuid
        and is_active = true
      limit 1
    `) as unknown as { rows: ServiceRow[] }

    const service = s.rows[0]
    if (!service?.id) return { ok: false, error: "Serviço não encontrado para este tenant." }

    // 2) valida profissional (ativo) + se ele atende esse serviço
    const p = (await sql`
      select p.id, p.name
      from public.professionals p
      join public.professional_services ps
        on ps.professional_id = p.id
       and ps.tenant_id = p.tenant_id
      where p.tenant_id = ${tenant.id}::uuid
        and p.id = ${professionalId}::uuid
        and p.is_active = true
        and ps.service_id = ${serviceId}::uuid
        and ps.is_active = true
      limit 1
    `) as unknown as { rows: ProfessionalRow[] }

    const professional = p.rows[0]
    if (!professional?.id) return { ok: false, error: "Profissional inválido (não ativo ou não atende este serviço)." }

    const startAt = toStartAt(date, time)
    const duration = Number(service.duration_minutes || 60)
    const endAt = new Date(startAt.getTime() + duration * 60 * 1000)

    // 3) upsert customer por (tenant_id, whatsapp_e164)
    const c = (await sql`
      insert into public.customers (
        tenant_id, full_name, whatsapp_e164, updated_at
      ) values (
        ${tenant.id}::uuid, ${customerName}, ${whatsapp}, now()
      )
      on conflict (tenant_id, whatsapp_e164)
      do update set
        full_name = excluded.full_name,
        updated_at = now()
      returning id
    `) as unknown as { rows: CustomerRow[] }

    const customerId = c.rows[0]?.id ?? null
    if (!customerId) return { ok: false, error: "Falha ao criar/atualizar cliente." }

    // 4) cria appointment com professional_id + snapshot professional_name
    const a = (await sql`
      insert into public.appointments (
        tenant_id,
        service_id,
        customer_id,
        professional_id,
        professional_name,
        start_at,
        end_at,
        status
      ) values (
        ${tenant.id}::uuid,
        ${serviceId}::uuid,
        ${customerId}::uuid,
        ${professional.id}::uuid,
        ${professional.name},
        ${startAt.toISOString()}::timestamptz,
        ${endAt.toISOString()}::timestamptz,
        'confirmed'
      )
      returning id
    `) as unknown as { rows: ApptRow[] }

    const appointmentId = a.rows[0]?.id ?? null
    if (!appointmentId) return { ok: false, error: "Falha ao criar agendamento." }

    return { ok: true, appointmentId }
  } catch (e: any) {
    console.error("[createAppointment] DB error:", e)
    const pretty = normalizePgErrorMessage(e)
    return { ok: false, error: pretty }
  }
}