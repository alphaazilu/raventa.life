'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, CameraOff, SwitchCamera } from 'lucide-react'
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

type Facing = 'user' | 'environment'
type CamState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable'

export function QrScanner({ onCode, paused }: { onCode: (text: string) => void; paused: boolean }) {
  const { tr } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  const [state, setState] = useState<CamState>('off')
  // A counter tablet usually faces the guest, so the front camera first.
  const [facing, setFacing] = useState<Facing>('user')

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
        setState('on')
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      }
    },
    [stop],
  )

  // Decode loop while the camera is on.
  useEffect(() => {
    if (state !== 'on') return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < SCAN_EVERY_MS || pausedRef.current) return
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
      navigator.vibrate?.(60)
      onCodeRef.current(found.data)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state])

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
            <div className={`h-3/5 aspect-square rounded-2xl border-4 ${paused ? 'border-white/30' : 'border-white/80'}`} />
          </div>
        )}
        {!on && (
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
        <p className="text-xs leading-relaxed text-muted-foreground">{tr(deskCopy.cameraHint)}</p>
        {on && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => {
                const next = facing === 'user' ? 'environment' : 'user'
                setFacing(next)
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
