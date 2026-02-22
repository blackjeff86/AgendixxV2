import postgres from "postgres"

const DATABASE_URL = process.env.POSTGRES_URL

if (!DATABASE_URL) {
  throw new Error("Missing env POSTGRES_URL")
}

// Neon: sempre SSL
const client = postgres(DATABASE_URL, {
  ssl: "require",
})

type RowOf<T> = T extends ReadonlyArray<infer U> ? U : T
type SqlResult<T> = { rows: RowOf<T>[] } & RowOf<T>[]

function hasRowsShape(value: unknown): value is { rows: unknown[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { rows?: unknown[] }).rows)
}

export async function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<SqlResult<T>> {
  const result = await (client as any)(strings, ...values)
  const rows = Array.isArray(result)
    ? (result as RowOf<T>[])
    : hasRowsShape(result)
      ? (result.rows as RowOf<T>[])
      : []

  const wrapped = new Proxy(
    { rows } as { rows: RowOf<T>[] },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver)
        const value = (target.rows as any)[prop as any]
        return typeof value === "function" ? value.bind(target.rows) : value
      },
      set(target, prop, value, receiver) {
        if (prop in target) return Reflect.set(target, prop, value, receiver)
        ;(target.rows as any)[prop as any] = value
        return true
      },
      has(target, prop) {
        return prop in target || prop in target.rows
      },
      ownKeys(target) {
        const keys = new Set([...Reflect.ownKeys(target.rows), ...Reflect.ownKeys(target)])
        return [...keys]
      },
      getOwnPropertyDescriptor(target, prop) {
        if (Reflect.has(target, prop)) {
          return Reflect.getOwnPropertyDescriptor(target, prop)
        }
        return Reflect.getOwnPropertyDescriptor(target.rows, prop)
      },
    }
  )

  return wrapped as SqlResult<T>
}
