// Audit log helpers safe on both server and client (v0.43.1).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** detail jsonb → readable "key: value" pairs (ids left out — they mean nothing to a reader). */
export function detailPairs(detail: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(detail)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'id' || k.endsWith('_id') || isUuid(v)) continue
    if (Array.isArray(v)) out.push([k, v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')])
    else if (typeof v === 'object') out.push([k, JSON.stringify(v)])
    else if (typeof v === 'boolean') out.push([k, v ? '✓' : '✗'])
    else out.push([k, String(v)])
  }
  return out
}
