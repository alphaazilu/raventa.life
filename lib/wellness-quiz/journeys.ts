import type { Journey } from './types'

/**
 * Curated library of journey templates. This is hand-authored — like the
 * zones themselves — not generated. The matcher in match.ts only ever
 * filters, tie-breaks and lightly reshapes entries from this list; it never
 * invents a new sequence.
 *
 * Every id other than "gentle-session" is disposable: add, remove or retune
 * entries freely. "gentle-session" is load-bearing — it's the hardcoded
 * safe default for hard medical exclusions, so keep at least one journey
 * with that id, with no heat extremes and no cold plunge.
 */
export const journeys: Journey[] = [
  // ---- circulation ----
  {
    id: 'circulation-quick',
    goal: 'circulation',
    flavor: 'warm-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'warm-roots', durationMin: 8 },
      { zone: 'winter-ring', durationMin: 1 },
      { zone: 'heartwood', durationMin: 6 },
      { zone: 'living-sap', durationMin: 2 },
      { zone: 'the-canopy', durationMin: 5 },
    ],
  },
  {
    id: 'circulation-full',
    goal: 'circulation',
    flavor: 'warm-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'warm-roots', durationMin: 10 },
      { zone: 'winter-ring', durationMin: 2 },
      { zone: 'heartwood', durationMin: 10 },
      { zone: 'winter-ring', durationMin: 2 },
      { zone: 'forest-mist', durationMin: 8 },
      { zone: 'living-sap', durationMin: 3 },
      { zone: 'the-canopy', durationMin: 8 },
    ],
  },

  // ---- recovery ----
  {
    id: 'recovery-quick',
    goal: 'recovery',
    flavor: 'cold-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'living-sap', durationMin: 3 },
      { zone: 'heartwood', durationMin: 10 },
      { zone: 'forest-mist', durationMin: 8 },
      { zone: 'the-canopy', durationMin: 5 },
    ],
  },
  {
    id: 'recovery-full',
    goal: 'recovery',
    flavor: 'warm-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'heartwood', durationMin: 12 },
      { zone: 'living-sap', durationMin: 3 },
      { zone: 'forest-mist', durationMin: 10 },
      { zone: 'living-sap', durationMin: 3 },
      { zone: 'warm-roots', durationMin: 8 },
      { zone: 'the-canopy', durationMin: 8 },
    ],
  },

  // ---- stress ----
  {
    id: 'stress-quick',
    goal: 'stress',
    flavor: 'warm-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'forest-mist', durationMin: 10 },
      { zone: 'living-sap', durationMin: 2 },
      { zone: 'the-canopy', durationMin: 10 },
    ],
  },
  {
    id: 'stress-full',
    goal: 'stress',
    flavor: 'warm-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'sunlight', durationMin: 12 },
      { zone: 'forest-mist', durationMin: 10 },
      { zone: 'living-sap', durationMin: 2 },
      { zone: 'golden-leaf', durationMin: 10 },
      { zone: 'the-canopy', durationMin: 10 },
    ],
  },

  // ---- immunity ----
  {
    id: 'immunity-quick',
    goal: 'immunity',
    flavor: 'warm-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'warm-roots', durationMin: 8 },
      { zone: 'sunlight', durationMin: 10 },
      { zone: 'winter-ring', durationMin: 1 },
      { zone: 'the-canopy', durationMin: 5 },
    ],
  },
  {
    id: 'immunity-full',
    goal: 'immunity',
    flavor: 'warm-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'warm-roots', durationMin: 10 },
      { zone: 'sunlight', durationMin: 12 },
      { zone: 'winter-ring', durationMin: 2 },
      { zone: 'heartwood', durationMin: 8 },
      { zone: 'winter-ring', durationMin: 2 },
      { zone: 'the-canopy', durationMin: 8 },
    ],
  },

  // ---- sleep (no cold plunge — cold exposure before sleep is stimulating) ----
  {
    id: 'sleep-quick',
    goal: 'sleep',
    flavor: 'warm-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'warm-roots', durationMin: 10 },
      { zone: 'forest-mist', durationMin: 10 },
      { zone: 'the-canopy', durationMin: 8 },
    ],
  },
  {
    id: 'sleep-full',
    goal: 'sleep',
    flavor: 'warm-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'warm-roots', durationMin: 10 },
      { zone: 'heartwood', durationMin: 10 },
      { zone: 'forest-mist', durationMin: 10 },
      { zone: 'the-canopy', durationMin: 12 },
    ],
  },

  // ---- clarity ----
  {
    id: 'clarity-quick',
    goal: 'clarity',
    flavor: 'warm-forward',
    timeBudget: { min: 15, max: 32 },
    rounds: [
      { zone: 'warm-roots', durationMin: 6 },
      { zone: 'sunlight', durationMin: 10 },
      { zone: 'winter-ring', durationMin: 2 },
    ],
  },
  {
    id: 'clarity-full',
    goal: 'clarity',
    flavor: 'cold-forward',
    timeBudget: { min: 28, max: 80 },
    rounds: [
      { zone: 'living-sap', durationMin: 2 },
      { zone: 'sunlight', durationMin: 12 },
      { zone: 'winter-ring', durationMin: 2 },
      { zone: 'sunlight', durationMin: 8 },
      { zone: 'golden-leaf', durationMin: 10 },
      { zone: 'the-canopy', durationMin: 6 },
    ],
  },

  // ---- safe default — no heat extremes, no cold plunge ----
  {
    id: 'gentle-session',
    goal: 'stress',
    flavor: 'warm-forward',
    timeBudget: { min: 1, max: 999 },
    rounds: [
      { zone: 'warm-roots', durationMin: 8 },
      { zone: 'the-canopy', durationMin: 10 },
    ],
  },
]
