"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, Phone, RotateCcw, Share2, UserPlus } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { benefits, zones } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { goalEmoji, quizCopy, timeOptions, whyItWorks } from "@/lib/wellness-quiz/copy"
import { matchJourney } from "@/lib/wellness-quiz/match"
import { submitQuizLead } from "@/app/quiz/actions"
import type { MatchResult } from "@/lib/wellness-quiz/types"
import type { AgeBand, Experience, Fitness, Goal, Hydration, QuizAnswers, Rested, SafetyFlag, ZoneId } from "@/lib/wellness-quiz/types"

type Step = "goal" | "time" | "experience" | "activity" | "health" | "safety" | "preferences" | "result"
const STEP_ORDER: Step[] = ["goal", "time", "experience", "activity", "health", "safety", "preferences", "result"]

// Conversion links (phase 2). Booking needs an account, so it routes through
// login when the visitor isn't signed in yet.
const BOOK_HREF = "/account/bookings"
const SIGNUP_HREF = "/login"
const PHONE_TEL = "+66804294264"

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

      {step === "health" && (
        <section>
          <h2 className="text-balance font-display text-2xl font-bold text-foreground md:text-3xl">
            {tr(quizCopy.steps.health.heading)}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr(quizCopy.steps.health.sub)}</p>

          <p className="mt-7 text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.ageLabel)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(["teen", "adult", "mid", "senior"] as AgeBand[]).map((v) => (
              <OptionPill key={v} selected={answers.ageBand === v} onClick={() => setAnswers((a) => ({ ...a, ageBand: v }))}>
                {tr(quizCopy.steps.health.age[v])}
              </OptionPill>
            ))}
          </div>

          <p className="mt-6 text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.fitnessLabel)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(["low", "moderate", "high"] as Fitness[]).map((v) => (
              <OptionPill key={v} selected={answers.fitness === v} onClick={() => setAnswers((a) => ({ ...a, fitness: v }))}>
                {tr(quizCopy.steps.health.fitness[v])}
              </OptionPill>
            ))}
          </div>

          <p className="mt-6 text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.hydrationLabel)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(["good", "low"] as Hydration[]).map((v) => (
              <OptionPill key={v} selected={answers.hydration === v} onClick={() => setAnswers((a) => ({ ...a, hydration: v }))}>
                {tr(quizCopy.steps.health.hydration[v])}
              </OptionPill>
            ))}
          </div>

          <p className="mt-6 text-sm font-semibold text-foreground">{tr(quizCopy.steps.health.restedLabel)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(["rested", "tired"] as Rested[]).map((v) => (
              <OptionPill key={v} selected={answers.rested === v} onClick={() => setAnswers((a) => ({ ...a, rested: v }))}>
                {tr(quizCopy.steps.health.rested[v])}
              </OptionPill>
            ))}
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

          <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">{tr(quizCopy.result.hydrationTip)}</p>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{tr(quizCopy.result.notMedical)}</p>

          <div className="mt-9 rounded-2xl border border-border bg-card p-5">
            <p className="text-center font-display text-base font-bold text-foreground">{tr(quizCopy.result.ctaHeading)}</p>
            <a
              href={BOOK_HREF}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Calendar className="h-4 w-4" />
              {tr(quizCopy.nav.book)}
              <ArrowRight className="h-4 w-4" />
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
                href={`tel:${PHONE_TEL}`}
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

          <LeadForm result={result} goals={answers.goals} />

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              {tr(quizCopy.nav.retake)}
            </button>
          </div>
        </section>
      )}
    </div>
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
