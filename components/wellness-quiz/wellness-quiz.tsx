"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { benefits, zones } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { goalEmoji, quizCopy, timeOptions, whyItWorks } from "@/lib/wellness-quiz/copy"
import { matchJourney } from "@/lib/wellness-quiz/match"
import type { Experience, Goal, QuizAnswers, SafetyFlag, ZoneId } from "@/lib/wellness-quiz/types"

type Step = "goal" | "time" | "experience" | "activity" | "safety" | "preferences" | "result"
const STEP_ORDER: Step[] = ["goal", "time", "experience", "activity", "safety", "preferences", "result"]

const initialAnswers: QuizAnswers = {
  goals: [],
  time: 35,
  experience: "regular",
  justExercised: false,
  safety: [],
  gentleToday: false,
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
      className={cn(
        "flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground/80 hover:border-primary/40",
        className,
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" />}
      {children}
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
    <div className="mt-10 flex items-center justify-between gap-4">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
        className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function WellnessQuiz() {
  const { tr } = useLanguage()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers)
  const step = STEP_ORDER[stepIndex]

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1))
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))
  const restart = () => {
    setAnswers(initialAnswers)
    setStepIndex(0)
  }

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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      {step === "goal" && (
        <div className="mb-8 text-center">
          <h1 className="text-balance font-display text-3xl font-extrabold text-foreground md:text-4xl">
            {tr(quizCopy.title)}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            {tr(quizCopy.subtitle)}
          </p>
        </div>
      )}
      {step !== "result" && (
        <div className="mb-10 flex items-center gap-1.5">
          {STEP_ORDER.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={cn("h-1 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      )}

      {step === "goal" && (
        <section>
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.goal.heading)}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr(quizCopy.steps.goal.sub)}</p>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {benefits.map((b) => (
              <OptionPill key={b.id} selected={answers.goals.includes(b.id)} onClick={() => toggleGoal(b.id)} className="justify-center">
                <span className="text-base">{goalEmoji[b.id]}</span>
                {tr(b.title)}
              </OptionPill>
            ))}
          </div>
          <NavRow showBack={false} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} nextDisabled={answers.goals.length === 0} />
        </section>
      )}

      {step === "time" && (
        <section>
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.time.heading)}
          </h2>
          <div className="mt-7 flex flex-wrap gap-3">
            {timeOptions.map((opt) => (
              <OptionPill key={opt.minutes} selected={answers.time === opt.minutes} onClick={() => setAnswers((a) => ({ ...a, time: opt.minutes }))}>
                {tr(opt.label)}
              </OptionPill>
            ))}
          </div>
          <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.next)} />
        </section>
      )}

      {step === "experience" && (
        <section>
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.experience.heading)}
          </h2>
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
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.activity.heading)}
          </h2>
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

      {step === "safety" && (
        <section>
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.safety.heading)}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr(quizCopy.steps.safety.sub)}</p>
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
          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground/80">
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
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.preferences.heading)}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr(quizCopy.steps.preferences.sub)}</p>

          <p className="mt-7 text-xs font-semibold tracking-brand uppercase text-wood">
            {tr(quizCopy.steps.preferences.preferredLabel)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {zones.map((z) => (
              <OptionPill key={z.id} selected={answers.preferences.preferredZone === z.id} onClick={() => setPreferredZone(z.id as ZoneId)}>
                {tr(z.name)}
              </OptionPill>
            ))}
          </div>

          <p className="mt-7 text-xs font-semibold tracking-brand uppercase text-wood">
            {tr(quizCopy.steps.preferences.avoidLabel)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {zones.map((z) => (
              <OptionPill key={z.id} selected={answers.preferences.avoidZones.includes(z.id as ZoneId)} onClick={() => toggleAvoidZone(z.id as ZoneId)}>
                {tr(z.name)}
              </OptionPill>
            ))}
          </div>

          <NavRow onBack={goBack} onNext={goNext} nextLabel={tr(quizCopy.nav.seeResult)} />
        </section>
      )}

      {step === "result" && result && (
        <section>
          <p className="text-xs font-semibold tracking-brand uppercase text-wood">{tr(quizCopy.result.eyebrow)}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-extrabold text-foreground md:text-4xl">
            {answers.goals.map((g) => goalEmoji[g]).join(" ")} {answers.goals.map((g) => tr(benefits.find((b) => b.id === g)!.title)).join(" · ")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr(quizCopy.result.totalLabel)}: {result.totalMinutes} {tr(quizCopy.result.minutesShort)}
          </p>

          <ol className="mt-8 space-y-3">
            {result.journey.rounds.map((round, i) => {
              const zone = zones.find((z) => z.id === round.zone)!
              return (
                <li key={`${round.zone}-${i}`} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                    <Image src={zone.image} alt={tr(zone.name)} fill sizes="56px" className="object-cover object-[center_27%]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-card-foreground">{tr(zone.name)}</p>
                    <p className="text-xs text-muted-foreground">{tr(zone.category)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">
                    {round.durationMin} {tr(quizCopy.result.minutesShort)}
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="mt-8 rounded-2xl bg-accent p-6 text-accent-foreground">
            <p className="font-display text-lg font-bold">{tr(quizCopy.result.whyHeading)}</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-accent-foreground/85">
              {isForcedGentle
                ? [tr(quizCopy.result.gentleNotice)].map((line, i) => <li key={i}>{line}</li>)
                : whyItWorks[primaryGoal][result.ending].map((line, i) => <li key={i}>{tr(line)}</li>)}
            </ul>
          </div>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              {tr(quizCopy.nav.retake)}
            </button>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tr(quizCopy.nav.book)}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      )}
    </div>
  )
}
