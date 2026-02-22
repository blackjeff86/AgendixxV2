"use server"

import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!)

// ---------------------------------
// Types
// ---------------------------------
export type WorkDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"

export type WorkDay = {
  key: WorkDayKey
  label: string
  enabled: boolean
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export type ProfessionalBlock = {
  id: string
  title: string
  // Datas em ISO (YYYY-MM-DD) para ficar simples pro front
  start_date: string
  end_date: string
  all_day: boolean
  // opcionais se não for all_day
  start_time?: string | null // "HH:MM"
  end_time?: string | null // "HH:MM"
  created_at: string // ISO
}

export type ProfessionalSummary = {
  id: string
  name: string
  role: string | null
  photo_url: string | null
  is_active: boolean
}

export type ProfessionalConfigPayload = {
  professional: ProfessionalSummary
  hours: WorkDay[]
  blocks: ProfessionalBlock[]
}

// ---------------------------------
// Utils (tenant-safe)
// ---------------------------------
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

function safeUuid(id: string, field = "id") {
  const s = String(id || "").trim()
  if (!s) throw new Error(`${field} inválido.`)
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

function hhmm(v: any): string | null {
  const s = String(v ?? "").trim()
  if (!/^\d{2}:\d{2}$/.test(s)) return null
  const [hh, mm] = s.split(":").map((x) => Number(x))
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23) return null
  if (mm < 0 || mm > 59) return null
  return s
}

function isoDate(v: any): string | null {
  const s = String(v ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

const DEFAULT_HOURS: WorkDay[] = [
  { key: "seg", label: "Segunda", enabled: true, start: "09:00", end: "18:00" },
  { key: "ter", label: "Terça", enabled: true, start: "09:00", end: "18:00" },
  { key: "qua", label: "Quarta", enabled: false, start: "09:00", end: "18:00" },
  { key: "qui", label: "Quinta", enabled: false, start: "09:00", end: "18:00" },
  { key: "sex", label: "Sexta", enabled: false, start: "09:00", end: "18:00" },
  { key: "sab", label: "Sábado", enabled: false, start: "09:00", end: "13:00" },
  { key: "dom", label: "Domingo", enabled: false, start: "09:00", end: "13:00" },
]

function normalizeHours(input?: WorkDay[] | null): WorkDay[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_HOURS

  const allowed: WorkDayKey[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
  const map = new Map<WorkDayKey, WorkDay>()

  for (const d of input) {
    if (!d || typeof d !== "object") continue
    const key = (d as any).key as WorkDayKey
    if (!allowed.includes(key)) continue

    const fallback = DEFAULT_HOURS.find((x) => x.key === key)!
    const start = hhmm((d as any).start) ?? fallback.start
    const end = hhmm((d as any).end) ?? fallback.end
    const enabled = !!(d as any).enabled
    const label = String((d as any).label ?? fallback.label)

    map.set(key, { key, label, enabled, start, end })
  }

  return DEFAULT_HOURS.map((d) => map.get(d.key) ?? d)
}

function normalizeBlocks(input?: any): ProfessionalBlock[] {
  if (!Array.isArray(input)) return []
  const out: ProfessionalBlock[] = []

  for (const b of input) {
    if (!b || typeof b !== "object") continue
    const id = String((b as any).id || "").trim()
    const title = String((b as any).title || "").trim()
    const start_date = isoDate((b as any).start_date)
    const end_date = isoDate((b as any).end_date)
    const all_day = (b as any).all_day === true

    if (!id || !title || !start_date || !end_date) continue

    const start_time = all_day ? null : hhmm((b as any).start_time)
    const end_time = all_day ? null : hhmm((b as any).end_time)
    const created_at = String((b as any).created_at || new Date().toISOString())

    out.push({
      id,
      title,
      start_date,
      end_date,
      all_day,
      start_time,
      end_time,
      created_at,
    })
  }

  // mais recentes primeiro
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return out
}

async function assertProfessionalBelongsToTenant(tenantId: string, professionalId: string) {
  const r = await sql<{ id: string }[]>`
    SELECT id
    FROM public.professionals
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${professionalId}::uuid
    LIMIT 1
  `
  if (!r?.[0]?.id) throw new Error("Profissional não encontrado neste tenant.")
}

async function fetchProfessionalSummary(tenantId: string, professionalId: string): Promise<ProfessionalSummary> {
  const r = await sql<ProfessionalSummary[]>`
    SELECT
      id,
      name,
      role,
      photo_url,
      COALESCE(is_active, true) AS is_active
    FROM public.professionals
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${professionalId}::uuid
    LIMIT 1
  `
  const row = r?.[0]
  if (!row) throw new Error("Profissional não encontrado.")
  return row
}

function randomId() {
  // Node runtime tem crypto.randomUUID()
  return crypto.randomUUID()
}

function requireTenantSettingsColumn() {
  // só pra padronizar o erro
  throw new Error(
    "Sua tabela tenants não possui a coluna settings (JSONB). Crie tenants.settings ou ajuste para persistir em tabelas próprias."
  )
}

// ---------------------------------
// Read: config completo (prof + hours + blocks)
// ---------------------------------
export async function fetchProfessionalConfig(slug: string, professionalId: string): Promise<ProfessionalConfigPayload> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const pid = safeUuid(professionalId, "professionalId")

  await assertProfessionalBelongsToTenant(tenantId, pid)

  // tenta ler tenants.settings
  let settings: any = {}
  try {
    const s = await sql<{ settings: any }[]>`
      SELECT settings
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `
    settings = s?.[0]?.settings ?? {}
  } catch {
    requireTenantSettingsColumn()
  }

  const prof = await fetchProfessionalSummary(tenantId, pid)

  const profSettings = settings?.professionals?.[pid] ?? {}
  const hours = normalizeHours(profSettings?.hours)
  const blocks = normalizeBlocks(profSettings?.blocks)

  return { professional: prof, hours, blocks }
}

// ---------------------------------
// Save: horário individual
// settings.professionals[pid].hours = [...]
// ---------------------------------
export async function saveProfessionalHours(
  slug: string,
  professionalId: string,
  hours: WorkDay[]
): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const pid = safeUuid(professionalId, "professionalId")

  await assertProfessionalBelongsToTenant(tenantId, pid)

  const normalized = normalizeHours(hours)

  // valida start/end quando enabled
  for (const d of normalized) {
    if (!d.enabled) continue
    const [sh, sm] = d.start.split(":").map((x) => Number(x))
    const [eh, em] = d.end.split(":").map((x) => Number(x))
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (endMin <= startMin) throw new Error(`Horário inválido em ${d.label}: fim deve ser maior que início.`)
  }

  // jsonb_set deep: settings->professionals->pid->hours
  try {
    await sql`
      UPDATE public.tenants
      SET settings =
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          ARRAY['professionals', ${pid}, 'hours'],
          ${sql.json(normalized)}::jsonb,
          true
        )
      WHERE id = ${tenantId}::uuid
    `
  } catch {
    requireTenantSettingsColumn()
  }

  return { ok: true }
}

// ---------------------------------
// Read blocks
// ---------------------------------
export async function fetchProfessionalBlocks(slug: string, professionalId: string): Promise<ProfessionalBlock[]> {
  const cfg = await fetchProfessionalConfig(slug, professionalId)
  return cfg.blocks ?? []
}

// ---------------------------------
// Create block
// settings.professionals[pid].blocks = [new, ...old]
// ---------------------------------
export type CreateProfessionalBlockInput = {
  title: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  all_day?: boolean
  start_time?: string | null // HH:MM
  end_time?: string | null // HH:MM
}

export async function createProfessionalBlock(
  slug: string,
  professionalId: string,
  input: CreateProfessionalBlockInput
): Promise<{ id: string }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const pid = safeUuid(professionalId, "professionalId")

  await assertProfessionalBelongsToTenant(tenantId, pid)

  const title = String(input.title || "").trim()
  if (!title) throw new Error("Título do bloqueio é obrigatório.")

  const sd = isoDate(input.start_date)
  const ed = isoDate(input.end_date)
  if (!sd || !ed) throw new Error("Datas inválidas. Use YYYY-MM-DD.")

  const all_day = input.all_day === true

  const st = all_day ? null : hhmm(input.start_time)
  const et = all_day ? null : hhmm(input.end_time)

  if (!all_day) {
    if (!st || !et) throw new Error("Informe start_time e end_time (HH:MM) ou marque all_day.")
    const [sh, sm] = st.split(":").map(Number)
    const [eh, em] = et.split(":").map(Number)
    if (eh * 60 + em <= sh * 60 + sm) throw new Error("Horário inválido: fim deve ser maior que início.")
  }

  const id = randomId()
  const nowIso = new Date().toISOString()

  // lê lista atual, acrescenta, grava de volta
  let settings: any = {}
  try {
    const s = await sql<{ settings: any }[]>`
      SELECT settings
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `
    settings = s?.[0]?.settings ?? {}
  } catch {
    requireTenantSettingsColumn()
  }

  const currentBlocks = normalizeBlocks(settings?.professionals?.[pid]?.blocks)
  const next: ProfessionalBlock[] = [
    { id, title, start_date: sd, end_date: ed, all_day, start_time: st, end_time: et, created_at: nowIso },
    ...currentBlocks,
  ]

  try {
    await sql`
      UPDATE public.tenants
      SET settings =
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          ARRAY['professionals', ${pid}, 'blocks'],
          ${sql.json(next)}::jsonb,
          true
        )
      WHERE id = ${tenantId}::uuid
    `
  } catch {
    requireTenantSettingsColumn()
  }

  return { id }
}

// ---------------------------------
// Delete block
// ---------------------------------
export async function deleteProfessionalBlock(
  slug: string,
  professionalId: string,
  blockId: string
): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const pid = safeUuid(professionalId, "professionalId")
  const bid = String(blockId || "").trim()
  if (!bid) throw new Error("blockId inválido.")

  await assertProfessionalBelongsToTenant(tenantId, pid)

  let settings: any = {}
  try {
    const s = await sql<{ settings: any }[]>`
      SELECT settings
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `
    settings = s?.[0]?.settings ?? {}
  } catch {
    requireTenantSettingsColumn()
  }

  const currentBlocks = normalizeBlocks(settings?.professionals?.[pid]?.blocks)
  const next = currentBlocks.filter((b) => b.id !== bid)

  try {
    await sql`
      UPDATE public.tenants
      SET settings =
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          ARRAY['professionals', ${pid}, 'blocks'],
          ${sql.json(next)}::jsonb,
          true
        )
      WHERE id = ${tenantId}::uuid
    `
  } catch {
    requireTenantSettingsColumn()
  }

  return { ok: true }
}

// ---------------------------------
// (Opcional) Ativar/desativar profissional
// ---------------------------------
export async function setProfessionalActive(
  slug: string,
  professionalId: string,
  isActive: boolean
): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const pid = safeUuid(professionalId, "professionalId")

  await sql`
    UPDATE public.professionals
    SET is_active = ${!!isActive}
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${pid}::uuid
  `
  return { ok: true }
}