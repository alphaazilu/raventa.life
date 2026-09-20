import type { BenefitKey } from '@/lib/i18n'

/** One of the 8 real zones defined in lib/i18n.ts (zones[].id) */
export type ZoneId =
  | 'warm-roots'
  | 'heartwood'
  | 'living-sap'
  | 'winter-ring'
  | 'sunlight'
  | 'forest-mist'
  | 'golden-leaf'
  | 'the-canopy'

/** A wellness goal — reuses the site's own "benefits" as the quiz's goal taxonomy. */
export type Goal = BenefitKey

/**
 * Whether a journey opens with a warm zone (the conventional contrast-therapy
 * order) or opens with a cold zone (used sparingly, e.g. a quick energizing
 * reset, or when comfort calls for delaying deep heat).
 */
export type Flavor = 'warm-forward' | 'cold-forward'

export type Round = {
  zone: ZoneId
  durationMin: number
}

/** A single pre-authored "journey" template — the unit the matcher selects from. */
export type Journey = {
  id: string
  goal: Goal
  flavor: Flavor
  timeBudget: { min: number; max: number }
  rounds: Round[]
}

export type Experience = 'first' | 'regular'

export type SafetyFlag = 'pregnant' | 'heart' | 'recentInjury'

export type QuizAnswers = {
  /** primary goal first — also used as the tie-break hash seed */
  goals: Goal[]
  /** minutes available today */
  time: number
  experience: Experience
  /** did the guest just finish an intense workout? */
  justExercised: boolean
  /** hard medical flags — pregnant/heart force the safe default journey */
  safety: SafetyFlag[]
  /** asks for extra gentleness today (e.g. menstrual comfort) without being a hard exclusion */
  gentleToday: boolean
  preferences: {
    avoidZones: ZoneId[]
    preferredZone: ZoneId | null
  }
}

export type MatchTuning = {
  hardContraindications?: SafetyFlag[]
  defaultJourneyId?: string
  firstTimerScaleFactor?: number
  firstTimerColdCapMin?: number
  maxHeatZoneMin?: number
  timeTrimHeatScale?: number
}

export type MatchResult = {
  journey: Journey
  ending: 'warm' | 'cold'
  totalMinutes: number
}
