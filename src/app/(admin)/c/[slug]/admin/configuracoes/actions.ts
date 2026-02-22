// src/app/(public)/c/[slug]/admin/configuracoes/actions.ts
"use server"

import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!)

/**
 * ⚠️ IMPORTANTE
 * - Este actions.ts foi desenhado para funcionar com as tabelas que você já listou no projeto:
 *   tenants, professionals, services (e opcionalmente um "settings" simples em tenants).
 * - Para Horário de Funcionamento (hours), como você não listou uma tabela própria,
 *   eu implementei a persistência em `tenants.settings` (JSONB) se existir.
 *   Se a coluna não existir, as funções ainda funcionam em modo "best effort":
 *   retornam defaults e não quebram o app (mas vão lançar erro ao salvar).
 *
 * ✅ Tudo é multi-tenant safe: slug -> tenant_id -> WHERE tenant_id = ${tenantId}
 * ✅ Usa postgres.js (NÃO @vercel/postgres)
 */

// -----------------------------
// Types
// -----------------------------
export type ProfessionalRow = {
  id: string
  name: string
  role: string | null
  photo_url: string | null
  is_active: boolean
  sort_order: number | null
  created_at: string | null
}

export type ServiceRow = {
  id: string
  name: string
  duration_min: number
  price_cents: number
  is_active: boolean
  created_at: string | null
}

export type WorkDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"

export type WorkDay = {
  key: WorkDayKey
  label: string
  enabled: boolean
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export type TenantBranding = {
  name?: string | null
  slug?: string | null
  logo_url?: string | null
}

export type TenantSettingsPayload = {
  hours?: WorkDay[]
  branding?: TenantBranding
}

// -----------------------------
// Utils
// -----------------------------
function mustEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function safeSlug(slug: string) {
  const s = String(slug || "").trim()
  if (!s) throw new Error("Slug inválido.")
  return s
}

async function resolveTenantIdBySlug(slug: string): Promise<string> {
  const s = safeSlug(slug)
  const r = await sql<{ id: string }[]>`
    SELECT id
    FROM public.tenants
    WHERE slug = ${s}
    LIMIT 1
  `
  const id = r?.[0]?.id
  if (!id) throw new Error("Tenant não encontrado para este slug.")
  return id
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function toBool(v: any) {
  return v === true || v === "true" || v === 1 || v === "1"
}

function centsFromBRL(v: any) {
  // aceita "180", "180.50", 180.5 etc.
  const n = Number(String(v).replace(",", "."))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function hhmm(v: any): string | null {
  const s = String(v ?? "").trim()
  if (!/^\d{2}:\d{2}$/.test(s)) return null
  const [hh, mm] = s.split(":").map((x) => Number(x))
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23) return null
  if (mm < 0 || mm > 59) return null
  return s
}

const DEFAULT_HOURS: WorkDay[] = [
  { key: "seg", label: "Segunda", enabled: true, start: "08:00", end: "18:00" },
  { key: "ter", label: "Terça", enabled: true, start: "08:00", end: "18:00" },
  { key: "qua", label: "Quarta", enabled: false, start: "08:00", end: "18:00" },
  { key: "qui", label: "Quinta", enabled: false, start: "08:00", end: "18:00" },
  { key: "sex", label: "Sexta", enabled: false, start: "08:00", end: "18:00" },
  { key: "sab", label: "Sábado", enabled: false, start: "09:00", end: "13:00" },
  { key: "dom", label: "Domingo", enabled: false, start: "09:00", end: "13:00" },
]

function normalizeHours(input?: WorkDay[] | null): WorkDay[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_HOURS

  const map = new Map<WorkDayKey, WorkDay>()
  for (const d of input) {
    if (!d || typeof d !== "object") continue
    const key = d.key as WorkDayKey
    if (!key || !["seg", "ter", "qua", "qui", "sex", "sab", "dom"].includes(key)) continue
    const start = hhmm((d as any).start) ?? DEFAULT_HOURS.find((x) => x.key === key)!.start
    const end = hhmm((d as any).end) ?? DEFAULT_HOURS.find((x) => x.key === key)!.end
    const label = String((d as any).label ?? DEFAULT_HOURS.find((x) => x.key === key)!.label)
    const enabled = toBool((d as any).enabled)
    map.set(key, { key, label, enabled, start, end })
  }

  // garante ordem e presença de todos os dias
  return DEFAULT_HOURS.map((d) => map.get(d.key) ?? d)
}

// -----------------------------
// TENANT SETTINGS (hours + branding)
// -----------------------------

/**
 * Busca:
 * - nome e logo (se existir)
 * - settings JSON (se existir em tenants.settings)
 *
 * Retorna defaults para hours quando não houver config salva.
 */
export async function fetchTenantSettings(slug: string): Promise<TenantSettingsPayload> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  // Tentamos ler campos comuns.
  // Se não existirem (ex: tenants.logo_url / tenants.settings), o Postgres vai acusar.
  // Para manter robusto, fazemos 2 tentativas:
  // 1) com settings/logo_url
  // 2) fallback só com name/slug
  try {
    const r = await sql<
      {
        name: string | null
        slug: string | null
        logo_url: string | null
        settings: any
      }[]
    >`
      SELECT name, slug, logo_url, settings
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `
    const row = r?.[0]
    const settings = row?.settings ?? {}
    return {
      branding: { name: row?.name ?? null, slug: row?.slug ?? null, logo_url: row?.logo_url ?? null },
      hours: normalizeHours(settings?.hours),
    }
  } catch {
    const r2 = await sql<{ name: string | null; slug: string | null }[]>`
      SELECT name, slug
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `
    const row2 = r2?.[0]
    return {
      branding: { name: row2?.name ?? null, slug: row2?.slug ?? null, logo_url: null },
      hours: DEFAULT_HOURS,
    }
  }
}

/**
 * Salva hours dentro de tenants.settings (JSONB).
 * Requer que exista coluna `tenants.settings` do tipo JSON/JSONB.
 */
export async function saveBusinessHours(slug: string, hours: WorkDay[]): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const normalized = normalizeHours(hours)

  // valida start/end (start < end quando enabled)
  for (const d of normalized) {
    if (!d.enabled) continue
    const [sh, sm] = d.start.split(":").map((x) => Number(x))
    const [eh, em] = d.end.split(":").map((x) => Number(x))
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (endMin <= startMin) throw new Error(`Horário inválido em ${d.label}: fim deve ser maior que início.`)
  }

  // merge JSON: settings = settings || {hours: [...]}
  await sql`
    UPDATE public.tenants
    SET settings = COALESCE(settings, '{}'::jsonb) || ${sql.json({ hours: normalized })}::jsonb
    WHERE id = ${tenantId}::uuid
  `

  return { ok: true }
}

/**
 * Salva logo_url (se existir tenants.logo_url).
 * Se não existir, lança erro com mensagem clara.
 */
export async function updateTenantLogoUrl(slug: string, logoUrl: string | null): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const v = logoUrl ? String(logoUrl).trim() : null

  try {
    await sql`
      UPDATE public.tenants
      SET logo_url = ${v}
      WHERE id = ${tenantId}::uuid
    `
  } catch {
    throw new Error("Sua tabela tenants não possui a coluna logo_url. Crie a coluna ou ajuste o actions.ts.")
  }

  return { ok: true }
}

// -----------------------------
// PROFESSIONALS (Equipe)
// -----------------------------

export async function fetchProfessionals(slug: string): Promise<ProfessionalRow[]> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const r = await sql<ProfessionalRow[]>`
    SELECT
      id,
      name,
      role,
      photo_url,
      is_active,
      sort_order,
      created_at
    FROM public.professionals
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY COALESCE(sort_order, 999999) ASC, created_at DESC
  `
  return r
}

export async function setProfessionalActive(
  slug: string,
  professionalId: string,
  isActive: boolean
): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const id = String(professionalId || "").trim()
  if (!id) throw new Error("professionalId inválido.")

  await sql`
    UPDATE public.professionals
    SET is_active = ${!!isActive}
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
  `
  return { ok: true }
}

export type CreateProfessionalInput = {
  name: string
  role?: string | null
  photo_url?: string | null
  sort_order?: number | null
}

export async function createProfessional(slug: string, input: CreateProfessionalInput): Promise<{ id: string }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const name = String(input.name || "").trim()
  if (!name) throw new Error("Nome é obrigatório.")

  const role = input.role ? String(input.role).trim() : null
  const photoUrl = input.photo_url ? String(input.photo_url).trim() : null
  const sortOrder =
    input.sort_order === undefined || input.sort_order === null
      ? null
      : clampInt(input.sort_order, 0, 0, 100000)

  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.professionals (
      id,
      tenant_id,
      name,
      role,
      photo_url,
      is_active,
      sort_order,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      ${tenantId}::uuid,
      ${name},
      ${role},
      ${photoUrl},
      true,
      ${sortOrder},
      now()
    )
    RETURNING id
  `
  const id = rows?.[0]?.id
  if (!id) throw new Error("Falha ao criar profissional.")
  return { id }
}

// -----------------------------
// SERVICES (Catálogo)
// -----------------------------

export async function fetchServices(slug: string): Promise<ServiceRow[]> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const r = await sql<ServiceRow[]>`
    SELECT
      id,
      name,
      duration_min,
      price_cents,
      COALESCE(is_active, true) as is_active,
      created_at
    FROM public.services
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
  `
  return r
}

export type CreateServiceInput = {
  name: string
  duration_min: number
  price_cents: number
}

export async function createService(slug: string, input: CreateServiceInput): Promise<{ id: string }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const name = String(input.name || "").trim()
  if (!name) throw new Error("Nome do serviço é obrigatório.")

  const duration = clampInt(input.duration_min, 0, 5, 24 * 60)
  const price = clampInt(input.price_cents, 0, 0, 1_000_000_00)

  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.services (
      id,
      tenant_id,
      name,
      duration_min,
      price_cents,
      is_active,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      ${tenantId}::uuid,
      ${name},
      ${duration},
      ${price},
      true,
      now()
    )
    RETURNING id
  `
  const id = rows?.[0]?.id
  if (!id) throw new Error("Falha ao criar serviço.")
  return { id }
}

export type UpdateServiceInput = {
  name?: string
  duration_min?: number
  price_cents?: number
  is_active?: boolean
}

export async function updateService(slug: string, serviceId: string, patch: UpdateServiceInput): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const id = String(serviceId || "").trim()
  if (!id) throw new Error("serviceId inválido.")

  // Lê atual para patch parcial
  const curRows = await sql<ServiceRow[]>`
    SELECT id, name, duration_min, price_cents, COALESCE(is_active, true) as is_active, created_at
    FROM public.services
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
    LIMIT 1
  `
  const cur = curRows?.[0]
  if (!cur) throw new Error("Serviço não encontrado.")

  const nextName = patch.name !== undefined ? String(patch.name).trim() : cur.name
  if (!nextName) throw new Error("Nome do serviço é obrigatório.")

  const nextDuration = patch.duration_min !== undefined ? clampInt(patch.duration_min, 0, 5, 24 * 60) : cur.duration_min
  const nextPrice = patch.price_cents !== undefined ? clampInt(patch.price_cents, 0, 0, 1_000_000_00) : cur.price_cents
  const nextActive = patch.is_active !== undefined ? !!patch.is_active : cur.is_active

  await sql`
    UPDATE public.services
    SET
      name = ${nextName},
      duration_min = ${nextDuration},
      price_cents = ${nextPrice},
      is_active = ${nextActive}
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
  `

  return { ok: true }
}

export async function setServiceActive(
  slug: string,
  serviceId: string,
  isActive: boolean
): Promise<{ ok: true }> {
  return updateService(slug, serviceId, { is_active: isActive })
}

// -----------------------------
// Helpers (UI)
// -----------------------------

/**
 * Helper opcional: converte BRL string/number para cents.
 * Útil se sua UI editar preço em reais.
 */
export async function convertBRLToCents(v: any): Promise<{ cents: number }> {
  const cents = centsFromBRL(v)
  if (cents === null) throw new Error("Valor inválido.")
  return { cents }
}