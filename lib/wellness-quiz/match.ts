import { journeys as defaultLibrary } from './journeys'
import type { Journey, MatchResult, MatchTuning, QuizAnswers, Round, ZoneId } from './types'

/**
 * Matching engine for the "Find My Journey" quiz.
 *
 * This is deliberately NOT a weighted scoring model. It is a filter cascade
 * over a small, hand-authored library of journeys (see journeys.ts), with a
 * deterministic (not random) tie-break, followed by a handful of safety and
 * fit adjustments applied to whichever journey was chosen. That's the same
 * shape of system that was reverse-engineered from the Growth Club sauna
 * quiz — rebuilt here from scratch against Raventa's own zones and content,
 * not copied from their code or data.
 */

/** Zones capped individually when a session runs long (dry heat / steam). */
const HEAT_CAP_ZONES = new Set<ZoneId>(['sunlight', 'forest-mist'])

/** Broader "warm" set scaled down when a journey needs to be trimmed to fit. */
const TIME_TRIM_HEAT_ZONES = new Set<ZoneId>(['sunlight', 'forest-mist', 'heartwood'])

/** The two cold-plunge zones — capped for first-timers and on gentle days. */
const COLD_ZONES = new Set<ZoneId>(['winter-ring', 'living-sap'])

/**
 * Fallback chain used only if an avoided zone survives filtering (e.g. the
 * guest avoided it but every remaining candidate still contains it). Each
 * zone maps to a gentler stand-in; the chain stops once it reaches a zone
 * that isn't itself avoided.
 */
const AVOID_SUBSTITUTES: Partial<Record<ZoneId, ZoneId>> = {
  'winter-ring': 'living-sap',
  'living-sap': 'the-canopy',
  sunlight: 'forest-mist',
  'forest-mist': 'sunlight',
  heartwood: 'warm-roots',
  'warm-roots': 'golden-leaf',
  'golden-leaf': 'the-canopy',
}

function cloneJourney(journey: Journey): Journey {
  return { ...journey, rounds: journey.rounds.map((r) => ({ ...r })) }
}

function totalMinutes(rounds: Round[]): number {
  return rounds.reduce((sum, r) => sum + r.durationMin, 0)
}

/** djb2 — a plain string hash, not a source of real randomness. */
function djb2(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * Deterministic pseudo-random pick in [0, count). Same seed -> same index,
 * so retaking the quiz with the same primary goal on the same day lands on
 * the same journey; the pick rotates day to day instead of being truly
 * random.
 */
function pickIndex(seed: string, count: number): number {
  if (count <= 1) return 0
  return djb2(seed) % count
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function filterByGoal(library: Journey[], goals: Set<string>): Journey[] {
  return library.filter((j) => goals.has(j.goal))
}

function filterByTime(candidates: Journey[], minutes: number): Journey[] {
  return candidates.filter((j) => minutes >= j.timeBudget.min && minutes <= j.timeBudget.max)
}

function nearestTimeFirst(candidates: Journey[], minutes: number): Journey[] {
  return [...candidates].sort((a, b) => {
    const da = Math.min(Math.abs(a.timeBudget.min - minutes), Math.abs(a.timeBudget.max - minutes))
    const db = Math.min(Math.abs(b.timeBudget.min - minutes), Math.abs(b.timeBudget.max - minutes))
    return da - db
  })
}

export function matchJourney(
  answers: QuizAnswers,
  library: Journey[] = defaultLibrary,
  tuning: MatchTuning = {},
): MatchResult {
  const hardContraindications = tuning.hardContraindications ?? ['pregnant', 'heart']
  const defaultJourneyId = tuning.defaultJourneyId ?? 'gentle-session'
  const firstTimerScaleFactor = tuning.firstTimerScaleFactor ?? 0.6
  const firstTimerColdCapMin = tuning.firstTimerColdCapMin ?? 1
  const maxHeatZoneMin = tuning.maxHeatZoneMin ?? 15
  const timeTrimHeatScale = tuning.timeTrimHeatScale ?? 0.85

  const goalsSet = new Set(answers.goals)
  const primaryGoal = answers.goals[0] ?? 'stress'

  // 1. Hard contraindications bypass everything and return the safe default as-is.
  if (answers.safety.some((flag) => hardContraindications.includes(flag))) {
    const fallback = library.find((j) => j.id === defaultJourneyId)
    if (!fallback) throw new Error(`No candidates and no "${defaultJourneyId}" fallback in the library`)
    const journey = cloneJourney(fallback)
    return { journey, ending: classifyEnding(journey), totalMinutes: totalMinutes(journey.rounds) }
  }

  // 2. Filter cascade: goal -> time -> just-exercised exclusion -> gentle-today preference -> avoid-zones.
  let candidates = filterByGoal(library, goalsSet)
  candidates = filterByTime(candidates, answers.time)

  if (answers.justExercised && !goalsSet.has('recovery')) {
    const rested = candidates.filter((j) => j.flavor !== 'cold-forward')
    if (rested.length > 0) candidates = rested
  }

  if (answers.gentleToday) {
    const coldForward = candidates.filter((j) => j.flavor === 'cold-forward')
    if (coldForward.length > 0) candidates = coldForward
  }

  if (answers.preferences.avoidZones.length > 0) {
    const avoid = new Set(answers.preferences.avoidZones)
    const clean = candidates.filter((j) => !j.rounds.some((r) => avoid.has(r.zone)))
    if (clean.length > 0) candidates = clean
  }

  // 3. Relax step by step if nothing survived: goal+time only, then goal only
  //    (nearest time budget first), then the hardcoded gentle default.
  if (candidates.length === 0) {
    candidates = filterByTime(filterByGoal(library, goalsSet), answers.time)
  }
  if (candidates.length === 0) {
    candidates = nearestTimeFirst(filterByGoal(library, goalsSet), answers.time)
  }
  if (candidates.length === 0) {
    const fallback = library.find((j) => j.id === defaultJourneyId)
    if (!fallback) throw new Error(`No candidates and no "${defaultJourneyId}" fallback in the library`)
    candidates = [fallback]
  }

  // 4. Deterministic tie-break among whatever is left.
  const index = pickIndex(`${primaryGoal}:${todayKey()}`, candidates.length)
  let journey = cloneJourney(candidates[index])

  // 5. Post-processing adjustments — reshape the chosen journey, never swap it out.
  if (answers.experience === 'first') {
    journey.rounds = journey.rounds.map((r) => {
      if (r.durationMin === 0) return r
      let scaled = Math.round(r.durationMin * firstTimerScaleFactor)
      if (COLD_ZONES.has(r.zone)) scaled = Math.min(scaled, firstTimerColdCapMin)
      return { ...r, durationMin: Math.max(scaled, 1) }
    })
  }

  if (answers.safety.includes('recentInjury')) {
    journey.rounds = journey.rounds.map((r) => (r.zone === 'winter-ring' ? { ...r, zone: 'living-sap' } : r))
  }

  if (answers.gentleToday) {
    journey.rounds = journey.rounds.map((r) => {
      if (r.zone === 'winter-ring') return { ...r, zone: 'living-sap' as ZoneId }
      if (COLD_ZONES.has(r.zone) && r.durationMin > 1) return { ...r, durationMin: 1 }
      return r
    })
  }

  journey.rounds = journey.rounds.map((r) =>
    HEAT_CAP_ZONES.has(r.zone) && r.durationMin > maxHeatZoneMin ? { ...r, durationMin: maxHeatZoneMin } : r,
  )

  let overage = totalMinutes(journey.rounds) - answers.time
  if (overage > 0) {
    let remaining = overage
    journey.rounds = journey.rounds.map((r) => {
      if (remaining <= 0 || r.zone !== 'the-canopy' || r.durationMin <= 0) return r
      const cut = Math.min(r.durationMin, Math.ceil(overage / 2), remaining)
      remaining -= cut
      return { ...r, durationMin: Math.max(0, r.durationMin - cut) }
    })
    if (remaining > 0) {
      journey.rounds = journey.rounds.map((r) =>
        TIME_TRIM_HEAT_ZONES.has(r.zone) ? { ...r, durationMin: Math.max(1, Math.round(r.durationMin * timeTrimHeatScale)) } : r,
      )
    }
  }

  if (answers.preferences.avoidZones.length > 0) {
    const avoid = new Set(answers.preferences.avoidZones)
    if (journey.rounds.some((r) => avoid.has(r.zone))) {
      journey.rounds = journey.rounds.map((r) => {
        if (!avoid.has(r.zone)) return r
        const alt = AVOID_SUBSTITUTES[r.zone]
        return alt && !avoid.has(alt) ? { ...r, zone: alt } : r
      })
    }
  }

  if (journey.rounds.length > 1 && journey.rounds[0].zone === 'the-canopy') {
    const firstNonRest = journey.rounds.findIndex((r) => r.zone !== 'the-canopy')
    if (firstNonRest > 0) {
      const rounds = [...journey.rounds]
      const [moved] = rounds.splice(firstNonRest, 1)
      rounds.splice(0, 0, moved)
      journey.rounds = rounds
    }
  }

  const preferred = answers.preferences.preferredZone
  if (preferred) {
    const idx = journey.rounds.findIndex((r) => r.zone === preferred)
    if (idx > 0) {
      const rounds = [...journey.rounds]
      const [moved] = rounds.splice(idx, 1)
      rounds.splice(0, 0, moved)
      journey.rounds = rounds
    }
  }

  journey.rounds = journey.rounds.filter((r) => r.durationMin > 0)

  return { journey, ending: classifyEnding(journey), totalMinutes: totalMinutes(journey.rounds) }
}

function classifyEnding(journey: Journey): 'warm' | 'cold' {
  const last = journey.rounds[journey.rounds.length - 1]
  return last && COLD_ZONES.has(last.zone) ? 'cold' : 'warm'
}
