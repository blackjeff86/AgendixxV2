// src/app/(public)/c/[slug]/admin/marketing/actions.ts
"use server"

import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!)

type CouponStatus = "active" | "expired" | "scheduled" | "disabled"
type DiscountType = "percent" | "fixed"

export type CouponRow = {
  id: string
  code: string
  status: CouponStatus
  discount_type: DiscountType
  discount_value: number
  uses_count: number
  uses_limit: number | null
  conversion_cents: number
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export type CreateCouponInput = {
  code: string
  discount_type: DiscountType
  discount_value: number

  // limites / vigência (opcional)
  uses_limit?: number | null
  starts_at?: string | null // ISO
  ends_at?: string | null // ISO

  // escopo (mock por enquanto; pode virar tabelas de vínculo depois)
  applies_to_service_ids?: string[] // uuid[]
  applies_to_professional_ids?: string[] // uuid[]
}

export type UpdateCouponInput = Partial<CreateCouponInput> & {
  status?: CouponStatus
}

function mustEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function normalizeCode(code: string) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
}

async function resolveTenantIdBySlug(slug: string): Promise<string> {
  const s = String(slug || "").trim()
  if (!s) throw new Error("Slug inválido.")

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

function asNumber(v: any) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

/**
 * Observação importante:
 * Este actions.ts assume que você terá uma tabela `marketing_coupons`.
 *
 * Se a tabela ainda não existir, você pode criar depois.
 * (Eu NÃO vou inventar colunas além das usadas aqui.)
 *
 * Schema esperado (mínimo):
 * - id uuid PK
 * - tenant_id uuid FK
 * - code text
 * - status text
 * - discount_type text
 * - discount_value numeric
 * - uses_count int default 0
 * - uses_limit int null
 * - conversion_cents int default 0
 * - starts_at timestamptz null
 * - ends_at timestamptz null
 * - created_at timestamptz default now()
 * - updated_at timestamptz default now()
 */
export async function fetchCoupons(
  slug: string,
  opts?: { status?: CouponStatus | "all"; limit?: number; offset?: number }
): Promise<CouponRow[]> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const limit = clampInt(opts?.limit, 50, 1, 200)
  const offset = clampInt(opts?.offset, 0, 0, 100000)
  const status = opts?.status ?? "all"

  if (status !== "all") {
    const r = await sql<CouponRow[]>`
      SELECT
        id,
        code,
        status,
        discount_type,
        discount_value,
        uses_count,
        uses_limit,
        conversion_cents,
        starts_at,
        ends_at,
        created_at
      FROM public.marketing_coupons
      WHERE tenant_id = ${tenantId}::uuid
        AND status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    return r
  }

  const r = await sql<CouponRow[]>`
    SELECT
      id,
      code,
      status,
      discount_type,
      discount_value,
      uses_count,
      uses_limit,
      conversion_cents,
      starts_at,
      ends_at,
      created_at
    FROM public.marketing_coupons
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return r
}

export async function createCoupon(slug: string, input: CreateCouponInput): Promise<{ id: string }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const code = normalizeCode(input.code)
  if (!code) throw new Error("Código do cupom é obrigatório.")

  const dt = input.discount_type
  if (dt !== "percent" && dt !== "fixed") throw new Error("Tipo de desconto inválido.")

  const dv = asNumber(input.discount_value)
  if (dv === null || dv <= 0) throw new Error("Valor de desconto inválido.")

  if (dt === "percent" && dv > 100) throw new Error("Desconto em % não pode ser maior que 100.")

  const usesLimit =
    input.uses_limit === undefined ? null : input.uses_limit === null ? null : clampInt(input.uses_limit, 0, 0, 1_000_000)

  const startsAt = input.starts_at ? new Date(input.starts_at) : null
  const endsAt = input.ends_at ? new Date(input.ends_at) : null

  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("starts_at inválido.")
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("ends_at inválido.")
  if (startsAt && endsAt && startsAt > endsAt) throw new Error("Período inválido: starts_at > ends_at.")

  // status default: active (você pode mudar pra scheduled se starts_at no futuro)
  const status: CouponStatus =
    startsAt && startsAt.getTime() > Date.now() ? "scheduled" : "active"

  // garante unicidade por tenant (se você tiver unique index)
  // se não tiver, ainda evita duplicado com verificação
  const existing = await sql<{ id: string }[]>`
    SELECT id
    FROM public.marketing_coupons
    WHERE tenant_id = ${tenantId}::uuid
      AND code = ${code}
    LIMIT 1
  `
  if (existing?.[0]?.id) throw new Error("Já existe um cupom com esse código.")

  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.marketing_coupons (
      id,
      tenant_id,
      code,
      status,
      discount_type,
      discount_value,
      uses_count,
      uses_limit,
      conversion_cents,
      starts_at,
      ends_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      ${tenantId}::uuid,
      ${code},
      ${status},
      ${dt},
      ${dv},
      0,
      ${usesLimit},
      0,
      ${startsAt},
      ${endsAt},
      now(),
      now()
    )
    RETURNING id
  `

  const id = rows?.[0]?.id
  if (!id) throw new Error("Falha ao criar cupom.")
  return { id }
}

export async function updateCoupon(
  slug: string,
  couponId: string,
  patch: UpdateCouponInput
): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)

  const id = String(couponId || "").trim()
  if (!id) throw new Error("couponId inválido.")

  // Carrega atual para validar e permitir patch parcial
  const currentRows = await sql<CouponRow[]>`
    SELECT
      id,
      code,
      status,
      discount_type,
      discount_value,
      uses_count,
      uses_limit,
      conversion_cents,
      starts_at,
      ends_at,
      created_at
    FROM public.marketing_coupons
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
    LIMIT 1
  `
  const cur = currentRows?.[0]
  if (!cur) throw new Error("Cupom não encontrado.")

  const nextCode = patch.code !== undefined ? normalizeCode(patch.code) : cur.code
  if (!nextCode) throw new Error("Código do cupom é obrigatório.")

  const nextType =
    patch.discount_type !== undefined ? patch.discount_type : (cur.discount_type as DiscountType)
  if (nextType !== "percent" && nextType !== "fixed") throw new Error("Tipo de desconto inválido.")

  const nextValue =
    patch.discount_value !== undefined ? asNumber(patch.discount_value) : Number(cur.discount_value)
  if (nextValue === null || nextValue <= 0) throw new Error("Valor de desconto inválido.")
  if (nextType === "percent" && nextValue > 100) throw new Error("Desconto em % não pode ser maior que 100.")

  const nextUsesLimit =
    patch.uses_limit !== undefined
      ? patch.uses_limit === null
        ? null
        : clampInt(patch.uses_limit, 0, 0, 1_000_000)
      : cur.uses_limit

  const nextStartsAt =
    patch.starts_at !== undefined ? (patch.starts_at ? new Date(patch.starts_at) : null) : (cur.starts_at ? new Date(cur.starts_at) : null)
  const nextEndsAt =
    patch.ends_at !== undefined ? (patch.ends_at ? new Date(patch.ends_at) : null) : (cur.ends_at ? new Date(cur.ends_at) : null)

  if (nextStartsAt && Number.isNaN(nextStartsAt.getTime())) throw new Error("starts_at inválido.")
  if (nextEndsAt && Number.isNaN(nextEndsAt.getTime())) throw new Error("ends_at inválido.")
  if (nextStartsAt && nextEndsAt && nextStartsAt > nextEndsAt) throw new Error("Período inválido: starts_at > ends_at.")

  const nextStatus: CouponStatus =
    patch.status !== undefined ? patch.status : (cur.status as CouponStatus)

  // Se mudou código, checa duplicidade no tenant
  if (nextCode !== cur.code) {
    const dup = await sql<{ id: string }[]>`
      SELECT id
      FROM public.marketing_coupons
      WHERE tenant_id = ${tenantId}::uuid
        AND code = ${nextCode}
        AND id <> ${id}::uuid
      LIMIT 1
    `
    if (dup?.[0]?.id) throw new Error("Já existe um cupom com esse código.")
  }

  await sql`
    UPDATE public.marketing_coupons
    SET
      code = ${nextCode},
      status = ${nextStatus},
      discount_type = ${nextType},
      discount_value = ${nextValue},
      uses_limit = ${nextUsesLimit},
      starts_at = ${nextStartsAt},
      ends_at = ${nextEndsAt},
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
  `

  return { ok: true }
}

export async function disableCoupon(slug: string, couponId: string): Promise<{ ok: true }> {
  return updateCoupon(slug, couponId, { status: "disabled" })
}

export async function cancelCoupon(slug: string, couponId: string): Promise<{ ok: true }> {
  // alias semântico (pode escolher um só)
  return updateCoupon(slug, couponId, { status: "disabled" })
}

export async function deleteCoupon(slug: string, couponId: string): Promise<{ ok: true }> {
  mustEnv("DATABASE_URL")

  const tenantId = await resolveTenantIdBySlug(slug)
  const id = String(couponId || "").trim()
  if (!id) throw new Error("couponId inválido.")

  await sql`
    DELETE FROM public.marketing_coupons
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${id}::uuid
  `

  return { ok: true }
}