// Shared date helper (v0.37.13). One definition for "shift a YYYY-MM-DD date
// by n days in UTC", which the whole app had copied in a dozen places.
export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
