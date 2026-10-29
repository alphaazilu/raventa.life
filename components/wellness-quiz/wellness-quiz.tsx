"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, Clock, Layers, MessageCircle, Phone, RotateCcw, Share2, Sparkles, UserPlus, X } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { useBrand } from "@/components/brand-provider"
import { benefits, zones } from "@/lib/i18n"
import type { Zone } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { goalEmoji, quizCopy, timeOptions, whyItWorks } from "@/lib/wellness-quiz/copy"
import { matchJourney } from "@/lib/wellness-quiz/match"
import { submitQuizLead } from "@/app/quiz/actions"
import type { MatchResult } from "@/lib/wellness-quiz/types"
import type { AgeBand, Experience, Fitness, Goal, Hydration, QuizAnswers, Rested, SafetyFlag, ZoneId } from "@/lib/wellness-quiz/types"
import { BRAND } from "@/lib/brand/config"

type Step = "goal" | "time" | "experience" | "activity" | "health" | "safety" | "preferences" | "result"
const STEP_ORDER: Step[] = ["goal", "time", "experience", "activity", "health", "safety", "preferences", "result"]
const QUESTION_COUNT = STEP_ORDER.length - 1

// Conversion links (phase 2). Booking needs an account, so it routes through
// login when the visitor isn't signed in yet.
const BOOK_HREF = "/account/bookings"
const SIGNUP_HREF = "/login"

// Display-only grouping for the result's colour coding (phase 3). The matcher
// keeps its own sets in match.ts; this never feeds back into timing.
type ZoneKind = "heat" | "cold" | "rest"
const zoneKind = (id: string): ZoneKind =>
  id === "living-sap" || id === "winter-ring" ? "cold" : id === "the-canopy" ? "rest" : "heat"
const kindChip: Record<ZoneKind, string> = {
  heat: "bg-primary/10 text-primary",
  cold: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  rest: "bg-secondary text-secondary-foreground",
}
const kindBar: Record<ZoneKind, string> = {
  heat: "bg-primary",
  cold: "bg-sky-500 dark:bg-sky-400",
  rest: "bg-wood/50",
}

const zoneById = (id: string) => zones.find((z) => z.id === id)!

const initialAnswers: QuizAnswers = {
  goals: [],
  time: 35,
  experience: "regular",
  justExercised: false,
  safety: [],
  gentleToday: false,
  ageBand: "adult",
  fitness: "moderate",
  hydration: "good",
  rested: "rested",
  preferences: { avoidZones: [], preferredZone: null },
}

function OptionPill({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
        selected
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-border bg-card text-foreground/80 hover:border-primary/40",
        className,
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">{title}</h2>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </>
  )
}

/** "Step 3 of 7 · Experience" plus a segmented bar that fills as you go. */
function QuizProgress({ index, step }: { index: number; step: Exclude<Step, "result"> }) {
  const { tr } = useLanguage()
  return (
    <div className="mb-10">
      <div className="flex items-baseline justify-between gap-3 text-xs font-semibold">
        <span className="tracking-brand uppercase text-wood">{tr(quizCopy.progress.names[step])}</span>
        <span className="tabular-nums text-muted-foreground">
          {tr(quizCopy.progress.step)} <span className="text-base font-bold text-foreground">{index + 1}</span> {tr(quizCopy.progress.of)}{" "}
          {QUESTION_COUNT}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={QUESTION_COUNT}
        aria-valuenow={index + 1}
        aria-label={`${tr(quizCopy.progress.step)} ${index + 1} ${tr(quizCopy.progress.of)} ${QUESTION_COUNT}`}
        className="mt-3 flex gap-1.5"
      >
        {Array.from({ length: QUESTION_COUNT }, (_, i) => (
          <div key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <span
              className={cn(
                "absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-500 ease-out",
                i <= index ? "scale-x-100" : "scale-x-0",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Big photo tile for picking a favourite zone. */
function ZoneTile({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const { tr } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative aspect-[4/5] overflow-hidden rounded-2xl text-left ring-offset-2 ring-offset-background transition-all duration-200 active:scale-[0.98]",
        selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/40",
      )}
    >
      <Image
        src={zone.image}
        alt=""
        fill
        sizes="(min-width: 640px) 160px, 45vw"
        className="object-cover object-[center_27%] transition-transform duration-500 group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/0" aria-hidden="true" />
      <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
        {zone.meta}
      </span>
      <span
        className={cn(
          "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-all duration-200",
          selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        aria-hidden="true"
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="block font-display text-sm font-bold leading-tight text-white">{tr(zone.name)}</span>
        <span className="mt-0.5 block text-[11px] text-white/75">{tr(zone.category)}</span>
      </span>
    </button>
  )
}

/** Compact thumbnail chip for zones to skip — greys out when chosen. */
function AvoidChip({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const { tr } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border p-1.5 pr-3 text-left transition-all duration-200 active:scale-[0.98]",
        selected ? "border-destructive/50 bg-destructive/5" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <Image
          src={zone.image}
          alt=""
          fill
          sizes="40px"
          className={cn("object-cover object-[center_27%] transition", selected && "opacity-60 grayscale")}
        />
        {selected && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white" aria-hidden="true">
            <X className="h-4 w-4" />
          </span>
        )}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-xs font-semibold leading-snug",
          selected ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {tr(zone.name)}
      </span>
    </button>
  )
}

function NavRow({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  showBack = true,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  showBack?: boolean
}) {
  const { tr } = useLanguage()
  return (
    <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-6">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr(quizCopy.nav.back)}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {nextLabel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}

export function WellnessQuiz() {
  const { tr } = useLanguage()
  const [stepIndex, setStepIndex] = useState(0)
  const [dir, setDir] = useState<"next" | "back">("next")
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers)
  const step = STEP_ORDER[stepIndex]
  const rootRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  const goNext = () => {
    setDir("next")
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1))
  }
  const goBack = () => {
    setDir("back")
    setStepIndex((i) => Math.max(i - 1, 0))
  }
  const restart = () => {
    setDir("back")
    setAnswers(initialAnswers)
    setStepIndex(0)
  }

  // A long step (health, result) can leave the visitor scrolled down; bring the
  // next one into view from its top so the new question is what they see.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const el = rootRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [stepIndex])

  const toggleGoal = (goal: Goal) => {
    setAnswers((a) => {
      const has = a.goals.includes(goal)
      if (has) return { ...a, goals: a.goals.filter((g) => g !== goal) }
      if (a.goals.length >= 2) return a
      return { ...a, goals: [...a.goals, goal] }
    })
  }

  const toggleSafety = (flag: SafetyFlag) => {
    setAnswers((a) => {
      const has = a.safety.includes(flag)
      return { ...a, safety: has ? a.safety.filter((f) => f !== flag) : [...a.safety, flag] }
    })
  }

  const toggleAvoidZone = (zone: ZoneId) => {
    setAnswers((a) => {
      const has = a.preferences.avoidZones.includes(zone)
      return {
        ...a,
        preferences: {
          ...a.preferences,
          avoidZones: has
            ? a.preferences.avoidZones.filter((z) => z !== zone)
            : [...a.preferences.avoidZones, zone],
        },
      }
    })
  }

  const setPreferredZone = (zone: ZoneId) => {
    setAnswers((a) => ({
      ...a,
      preferences: { ...a.preferences, preferredZone: a.preferences.preferredZone === zone ? null : zone },
    }))
  }

  const result = useMemo(() => {
    if (step !== "result") return null
    return matchJourney(answers)
  }, [step, answers])

  const isForcedGentle = answers.safety.includes("pregnant") || answers.safety.includes("heart")
  const primaryGoal: Goal = answers.goals[0] ?? "stress"

  const [copied, setCopied] = useState(false)
  const onShare = async () => {
    if (!result) return
    const url = typeof window !== "undefined" ? `${window.location.origin}/quiz` : "/quiz"
    const zoneNames = result.journey.rounds.map((r) => tr(zones.find((z) => z.id === r.zone)!.name)).join(" · ")
    const text = `${tr(quizCopy.result.shareTitle)} (~${result.totalMinutes} ${tr(quizCopy.result.minutesShort)}): ${zoneNames}`
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: tr(quizCopy.title), text, url })
        return
      }
    } catch {
      return // user cancelled the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-2xl scroll-mt-28 overflow-x-clip px-4 py-8">
      {step === "goal" && (
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold tracking-brand uppercase text-wood">{BRAND.name}</p>
          <h1 className="mt-3 text-balance font-display text-3xl font-extrabold text-foreground md:text-4xl">
            {tr(quizCopy.title)}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            {tr(quizCopy.subtitle)}
          </p>
        </div>
      )}
      {step !== "result" && <QuizProgress index={stepIndex} step={step} />}

      <div key={step} className={dir === "next" ? "motion-safe:animate-quiz-next" : "motion-safe:animate-quiz-back"}>
        {step === "goal" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.goal.heading)} sub={tr(quizCopy.steps.goal.sub)} />
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {benefits.map((b) => {
                const selected = answers.goals.includes(b.id)
                const full = !selected && answers.goals.length >= 2
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleGoal(b.id)}
                    aria-pressed={selected}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center transition-all duration-200 active:scale-[0.97]",
                      selected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40",
                      full && "opacity-50",
                    )}
                  >
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-colors",
                        selected ? "bg-primary/10" : "bg-secondary",
                      )}
                      aria-hidden="true"
                    >
                      {goalEmoji[b.id]}
                    </span>
                    <span className={cn("text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>{tr(b.title)}</span>
                  </button>
                )
              })}
            </div>
            <NavRow showBack={false} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} nextDisabled={answers.goals.length === 0} />
          </section>
        )}

        {step === "time" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.time.heading)} />
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {timeOptions.map((opt) => {
                const selected = answers.time === opt.minutes
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, time: opt.minutes }))}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-center rounded-2xl border px-3 py-5 transition-all duration-200 active:scale-[0.97]",
                      selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <Clock className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    <span className={cn("mt-2 font-display text-lg font-bold", selected ? "text-primary" : "text-foreground")}>
                      {tr(opt.label)}
                    </span>
                  </button>
                )
              })}
            </div>
            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
          </section>
        )}

        {step === "experience" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.experience.heading)} />
            <div className="mt-7 flex flex-wrap gap-3">
              {(["first", "regular"] as Experience[]).map((val) => (
                <OptionPill key={val} selected={answers.experience === val} onClick={() => setAnswers((a) => ({ ...a, experience: val }))}>
                  {tr(quizCopy.steps.experience[val])}
                </OptionPill>
              ))}
            </div>
            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
          </section>
        )}

        {step === "activity" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.activity.heading)} />
            <div className="mt-7 flex flex-wrap gap-3">
              <OptionPill selected={answers.justExercised} onClick={() => setAnswers((a) => ({ ...a, justExercised: true }))}>
                {tr(quizCopy.steps.activity.yes)}
              </OptionPill>
              <OptionPill selected={!answers.justExercised} onClick={() => setAnswers((a) => ({ ...a, justExercised: false }))}>
                {tr(quizCopy.steps.activity.no)}
              </OptionPill>
            </div>
            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
          </section>
        )}

        {step === "health" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.health.heading)} sub={tr(quizCopy.steps.health.sub)} />

            <div className="mt-7 space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.ageLabel)}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {(["teen", "adult", "mid", "senior"] as AgeBand[]).map((v) => (
                    <OptionPill key={v} selected={answers.ageBand === v} onClick={() => setAnswers((a) => ({ ...a, ageBand: v }))}>
                      {tr(quizCopy.steps.health.age[v])}
                    </OptionPill>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.fitnessLabel)}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {(["low", "moderate", "high"] as Fitness[]).map((v) => (
                    <OptionPill key={v} selected={answers.fitness === v} onClick={() => setAnswers((a) => ({ ...a, fitness: v }))}>
                      {tr(quizCopy.steps.health.fitness[v])}
                    </OptionPill>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.hydrationLabel)}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {(["good", "low"] as Hydration[]).map((v) => (
                    <OptionPill key={v} selected={answers.hydration === v} onClick={() => setAnswers((a) => ({ ...a, hydration: v }))}>
                      {tr(quizCopy.steps.health.hydration[v])}
                    </OptionPill>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.restedLabel)}</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {(["rested", "tired"] as Rested[]).map((v) => (
                    <OptionPill key={v} selected={answers.rested === v} onClick={() => setAnswers((a) => ({ ...a, rested: v }))}>
                      {tr(quizCopy.steps.health.rested[v])}
                    </OptionPill>
                  ))}
                </div>
              </div>
            </div>

            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
          </section>
        )}

        {step === "safety" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.safety.heading)} sub={tr(quizCopy.steps.safety.sub)} />
            <div className="mt-7 flex flex-wrap gap-3">
              {(["pregnant", "heart", "recentInjury"] as SafetyFlag[]).map((flag) => (
                <OptionPill key={flag} selected={answers.safety.includes(flag)} onClick={() => toggleSafety(flag)}>
                  {tr(quizCopy.steps.safety[flag])}
                </OptionPill>
              ))}
              <OptionPill selected={answers.safety.length === 0} onClick={() => setAnswers((a) => ({ ...a, safety: [] }))}>
                {tr(quizCopy.steps.safety.none)}
              </OptionPill>
            </div>
            <label
              className={cn(
                "mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-colors",
                answers.gentleToday ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-card text-foreground/80",
              )}
            >
              <input
                type="checkbox"
                checked={answers.gentleToday}
                onChange={(e) => setAnswers((a) => ({ ...a, gentleToday: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              {tr(quizCopy.steps.safety.gentleToday)}
            </label>
            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
          </section>
        )}

        {step === "preferences" && (
          <section>
            <StepHeading title={tr(quizCopy.steps.preferences.heading)} sub={tr(quizCopy.steps.preferences.sub)} />

            <p className="mt-7 text-xs font-semibold tracking-brand uppercase text-wood">
              {tr(quizCopy.steps.preferences.preferredLabel)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {zones.map((z) => (
                <ZoneTile
                  key={z.id}
                  zone={z}
                  selected={answers.preferences.preferredZone === z.id}
                  onClick={() => setPreferredZone(z.id as ZoneId)}
                />
              ))}
            </div>

            <p className="mt-8 text-xs font-semibold tracking-brand uppercase text-wood">
              {tr(quizCopy.steps.preferences.avoidLabel)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {zones.map((z) => (
                <AvoidChip
                  key={z.id}
                  zone={z}
                  selected={answers.preferences.avoidZones.includes(z.id as ZoneId)}
                  onClick={() => toggleAvoidZone(z.id as ZoneId)}
                />
              ))}
            </div>

            <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.seeResult)} />
          </section>
        )}

        {step === "result" && result && (
          <ResultView
            result={result}
            goals={answers.goals}
            isForcedGentle={isForcedGentle}
            primaryGoal={primaryGoal}
            copied={copied}
            onShare={onShare}
            onRestart={restart}
          />
        )}
      </div>
    </div>
  )
}

function ResultView({
  result,
  goals,
  isForcedGentle,
  primaryGoal,
  copied,
  onShare,
  onRestart,
}: {
  result: MatchResult
  goals: Goal[]
  isForcedGentle: boolean
  primaryGoal: Goal
  copied: boolean
  onShare: () => void
  onRestart: () => void
}) {
  const { tr } = useLanguage()
  // Phone + LINE from Back Office › Settings › Brand (v0.39.0).
  const brand = useBrand()
  const rounds = result.journey.rounds
  // Hero photo: the journey's longest non-rest round — its signature zone.
  const signature = rounds.reduce(
    (best, r) => (zoneKind(r.zone) !== "rest" && r.durationMin > best.durationMin ? r : best),
    rounds[0],
  )
  const heroZone = zoneById(signature.zone)
  const kindsUsed = (["heat", "cold", "rest"] as ZoneKind[]).filter((k) => rounds.some((r) => zoneKind(r.zone) === k))
  const rise = (i: number) => ({ animationDelay: `${120 + i * 70}ms` })

  return (
    <section>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-accent shadow-lg">
        <Image
          src={heroZone.image}
          alt={tr(heroZone.name)}
          fill
          priority
          sizes="(min-width: 768px) 672px, 100vw"
          className="object-cover object-[center_35%]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/10" aria-hidden="true" />
        <div className="relative px-6 pb-7 pt-28 text-white sm:px-8 sm:pb-8 sm:pt-40">
          <p className="text-xs font-semibold tracking-brand uppercase text-white/75">{tr(quizCopy.result.eyebrow)}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-extrabold leading-tight md:text-4xl">
            {goals.map((g) => goalEmoji[g]).join(" ")} {goals.map((g) => tr(benefits.find((b) => b.id === g)!.title)).join(" · ")}
          </h2>
          <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
              <dt className="flex items-center gap-1 text-[11px] text-white/70">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {tr(quizCopy.result.totalLabel)}
              </dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl">
                {result.totalMinutes}
                <span className="ml-1 text-xs font-medium text-white/75">{tr(quizCopy.result.minutesShort)}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
              <dt className="flex items-center gap-1 text-[11px] text-white/70">
                <Layers className="h-3 w-3" aria-hidden="true" />
                {tr(quizCopy.result.zonesLabel)}
              </dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl">{rounds.length}</dd>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
              <dt className="flex items-center gap-1 text-[11px] text-white/70">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {tr(quizCopy.result.endingLabel)}
              </dt>
              <dd className="mt-1 font-display text-base font-bold sm:text-lg">{tr(quizCopy.result.ending[result.ending])}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Sequence */}
      <div className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs font-semibold tracking-brand uppercase text-wood">{tr(quizCopy.result.sequenceHeading)}</p>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {kindsUsed.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", kindBar[k])} aria-hidden="true" />
                {tr(quizCopy.result.kind[k])}
              </span>
            ))}
          </div>
        </div>
        {/* Time share of each round, in order */}
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {rounds.map((r, i) => (
            <span key={`${r.zone}-${i}`} className={cn("h-full", kindBar[zoneKind(r.zone)])} style={{ flexGrow: r.durationMin }} />
          ))}
        </div>

        <ol className="mt-6">
          {rounds.map((round, i) => {
            const zone = zoneById(round.zone)
            const kind = zoneKind(round.zone)
            const last = i === rounds.length - 1
            return (
              <li key={`${round.zone}-${i}`} className="relative flex gap-3 motion-safe:animate-quiz-rise sm:gap-4" style={rise(i)}>
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-4 ring-background">
                    {i + 1}
                  </span>
                  {!last && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
                </div>
                <div className={cn("min-w-0 flex-1", !last && "pb-3")}>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm sm:gap-4 sm:p-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-24">
                      <Image src={zone.image} alt={tr(zone.name)} fill sizes="96px" className="object-cover object-[center_27%]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold text-card-foreground sm:text-base">{tr(zone.name)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", kindChip[kind])}>
                          {tr(quizCopy.result.kind[kind])}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {tr(zone.category)} · {zone.meta}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 pr-1 text-right">
                      <p className="font-display text-xl font-bold leading-none tabular-nums text-primary sm:text-2xl">{round.durationMin}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{tr(quizCopy.result.minutesShort)}</p>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Why */}
      <div className="mt-10 rounded-3xl bg-accent p-6 text-accent-foreground motion-safe:animate-quiz-rise sm:p-8" style={rise(rounds.length)}>
        <p className="font-display text-lg font-bold">{tr(quizCopy.result.whyHeading)}</p>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-accent-foreground/85">
          {isForcedGentle
            ? [tr(quizCopy.result.gentleNotice)].map((line, i) => <li key={i}>{line}</li>)
            : whyItWorks[primaryGoal][result.ending].map((line, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-foreground/60" aria-hidden="true" />
                  {tr(line)}
                </li>
              ))}
        </ul>
      </div>

      {!isForcedGentle && result.adjustments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">{tr(quizCopy.result.adjustHeading)}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {result.adjustments.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {tr(quizCopy.adjust[k])}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 rounded-2xl bg-secondary px-5 py-3.5 text-sm text-secondary-foreground">{tr(quizCopy.result.hydrationTip)}</p>

      <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">{tr(quizCopy.result.notMedical)}</p>

      {/* CTA */}
      <div className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-center font-display text-xl font-bold text-foreground">{tr(quizCopy.result.ctaHeading)}</p>
        <a
          href={BOOK_HREF}
          className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md"
        >
          <Calendar className="h-4 w-4" />
          {tr(quizCopy.nav.book)}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
        <a
          href={brand.lineHref}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#06C755" }}
        >
          <MessageCircle className="h-4 w-4" />
          {tr(quizCopy.nav.line)}
        </a>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            href={SIGNUP_HREF}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
          >
            <UserPlus className="h-4 w-4" />
            {tr(quizCopy.nav.signUp)}
          </a>
          <a
            href={`tel:${brand.phoneTel}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
          >
            <Phone className="h-4 w-4" />
            {tr(quizCopy.nav.call)}
          </a>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
            {copied ? tr(quizCopy.nav.shareCopied) : tr(quizCopy.nav.share)}
          </button>
        </div>
      </div>

      <LeadForm result={result} goals={goals} />

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          {tr(quizCopy.nav.retake)}
        </button>
      </div>
    </section>
  )
}

// Optional "contact me" form on the result (§52, v0.38.19). Submits to a
// public RPC; a signed-in guest's lead is tagged with their member id server-side.
function LeadForm({ result, goals }: { result: MatchResult; goals: Goal[] }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [contactType, setContactType] = useState<"phone" | "email" | "line">("phone")
  const [contact, setContact] = useState("")
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(false)

  const canSubmit = contact.trim().length > 0 && consent && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setErr(false)
    const summary = result.journey.rounds.map((r) => `${tr(zones.find((z) => z.id === r.zone)!.name)} ${r.durationMin}m`).join(" · ")
    const res = await submitQuizLead({
      name,
      contact,
      contactType,
      goals: goals as string[],
      journeyId: result.journey.id,
      journeySummary: summary,
      totalMinutes: result.totalMinutes,
      adjustments: result.adjustments as string[],
    })
    setBusy(false)
    if (res.ok) setDone(true)
    else setErr(true)
  }

  if (done) {
    return (
      <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center text-sm font-semibold text-foreground">
        {tr(quizCopy.lead.sent)}
      </div>
    )
  }

  const channels: ("phone" | "email" | "line")[] = ["phone", "email", "line"]
  const placeholder =
    contactType === "phone" ? quizCopy.lead.phonePh : contactType === "email" ? quizCopy.lead.emailPh : quizCopy.lead.linePh

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
      >
        {tr(quizCopy.lead.toggle)}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{tr(quizCopy.lead.sub)}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr(quizCopy.lead.name)}
            maxLength={120}
            className="mt-4 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={tr(quizCopy.lead.channel)}>
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={contactType === c}
                onClick={() => setContactType(c)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-semibold",
                  contactType === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
                )}
              >
                {tr(quizCopy.lead[c])}
              </button>
            ))}
          </div>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={tr(placeholder)}
            inputMode={contactType === "phone" ? "tel" : contactType === "email" ? "email" : "text"}
            maxLength={200}
            className="mt-3 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {tr(quizCopy.lead.consent)}{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                {tr(quizCopy.lead.privacyLink)}
              </a>
            </span>
          </label>
          {err && <p className="mt-3 text-sm font-semibold text-destructive">{tr(quizCopy.lead.error)}</p>}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? tr(quizCopy.lead.sending) : tr(quizCopy.lead.submit)}
          </button>
        </div>
      )}
    </div>
  )
}
