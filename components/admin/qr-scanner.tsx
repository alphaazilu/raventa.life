'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Pause, SwitchCamera } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { deskCopy } from '@/lib/check-in/copy'

// Camera QR reader for the counter tablet. Pure JS (jsQR) so it works the
// same on iPad Safari and Android Chrome — no extra hardware, no app.
// Frames are downscaled before decoding; a phone screen at arm's length
// reads in well under a second.

const SCAN_EVERY_MS = 140
const MAX_SIDE = 640
// The same code seen again within this window is ignored (the member is
// still holding their phone up after the first read).
const REPEAT_MS = 4000
// No code read for this long → the camera switches itself off (battery and
// heat on a tablet left at the counter all day). A tap turns it back on.
const IDLE_OFF_MS = 5 * 60 * 1000

type Facing = 'user' | 'environment'
const FACING_KEY = 'rv-desk-camera'
type CamState = 'off' | 'idle' | 'starting' | 'on' | 'denied' | 'unavailable'

export function QrScanner({
  onCode,
  paused,
  pausedText,
  hint,
  autoStart = false,
}: {
  onCode: (text: string) => void
  paused: boolean
  // Line under the camera; defaults to the front-desk hint for guests.
  hint?: string | null
  // Open the camera straight away (the tablet lock screen).
  autoStart?: boolean
  // Shown over the camera while paused, e.g. "Paused — tap Next guest".
  pausedText?: string
}) {
  const { tr } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const activityRef = useRef(0)
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  const [state, setState] = useState<CamState>('off')
  // Back camera by default (v0.14); a switch made on this device is
  // remembered so a tablet set up the other way round stays that way.
  const [facing, setFacing] = useState<Facing>('environment')
  useEffect(() => {
    let which: Facing = 'environment'
    try {
      if (localStorage.getItem(FACING_KEY) === 'user') which = 'user'
    } catch {
      /* storage unavailable — keep the back camera */
    }
    setFacing(which)
    if (autoStart) void startRef.current(which)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  onCodeRef.current = onCode
  pausedRef.current = paused

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(
    async (which: Facing) => {
      stop()
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable')
        return
      }
      setState('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: which, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        activityRef.current = Date.now()
        setState('on')
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      }
    },
    [stop],
  )
  const startRef = useRef(start)
  startRef.current = start

  // Decode loop while the camera is on. The decoder (jsQR, ~45 KB) is
  // fetched when the camera first starts, not with the page.
  useEffect(() => {
    if (state !== 'on') return
    let jsQR: typeof import('jsqr').default | null = null
    void import('jsqr').then((m) => {
      jsQR = m.default
    })
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (!jsQR || t - last < SCAN_EVERY_MS || pausedRef.current) return
      last = t
      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return
      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      const canvas = (canvasRef.current ??= document.createElement('canvas'))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
      if (!found?.data) return
      const now = Date.now()
      if (found.data === lastRef.current.text && now - lastRef.current.at < REPEAT_MS) return
      lastRef.current = { text: found.data, at: now }
      activityRef.current = now
      navigator.vibrate?.(60)
      onCodeRef.current(found.data)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state])

  // Auto-off after a quiet spell (time spent paused on a guest counts as
  // activity, so it never switches off mid-sale).
  useEffect(() => {
    if (state !== 'on') return
    const id = setInterval(() => {
      if (pausedRef.current) activityRef.current = Date.now()
      else if (Date.now() - activityRef.current > IDLE_OFF_MS) {
        stop()
        setState('idle')
      }
    }, 15_000)
    return () => clearInterval(id)
  }, [state, stop])

  useEffect(() => stop, [stop])

  const on = state === 'on' || state === 'starting'

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-foreground/90">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${on ? '' : 'hidden'}`}
        />
        {on && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-3/5 aspect-square rounded-2xl border-4 ${paused ? 'border-white/25' : 'border-white/80'}`} />
          </div>
        )}
        {on && paused && pausedText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 p-6">
            <p className="flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-center text-sm font-semibold text-foreground shadow">
              <Pause className="h-4 w-4 shrink-0" aria-hidden="true" />
              {pausedText}
            </p>
          </div>
        )}
        {state === 'idle' && (
          <button
            type="button"
            onClick={() => start(facing)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-background/85"
          >
            <Camera className="h-9 w-9" aria-hidden="true" />
            <span className="font-semibold">{tr(deskCopy.cameraIdleOff)}</span>
            <span className="rounded-full bg-background px-5 py-2.5 font-semibold text-foreground">{tr(deskCopy.cameraTapToStart)}</span>
          </button>
        )}
        {!on && state !== 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-background/80">
            <CameraOff className="h-8 w-8" aria-hidden="true" />
            {state === 'denied' && <p>{tr(deskCopy.cameraDenied)}</p>}
            {state === 'unavailable' && <p>{tr(deskCopy.cameraUnavailable)}</p>}
            <button
              type="button"
              onClick={() => start(facing)}
              className="inline-flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {tr(deskCopy.startCamera)}
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs leading-relaxed text-muted-foreground">{hint === undefined ? tr(deskCopy.cameraHint) : hint}</p>
        {on && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => {
                const next = facing === 'user' ? 'environment' : 'user'
                setFacing(next)
                try {
                  localStorage.setItem(FACING_KEY, next)
                } catch {
                  /* not remembered — fine */
                }
                void start(next)
              }}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={tr(deskCopy.switchCamera)}
              title={tr(deskCopy.switchCamera)}
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                stop()
                setState('off')
              }}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={tr(deskCopy.stopCamera)}
              title={tr(deskCopy.stopCamera)}
            >
              <CameraOff className="h-5 w-5" />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
