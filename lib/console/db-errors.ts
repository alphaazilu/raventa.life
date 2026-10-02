// PostgREST / Postgres codes meaning "this table or function doesn't exist
// yet" — the matching schema.sql section hasn't been run. (Client-safe.)
const MISSING = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING.has(error.code))
}
