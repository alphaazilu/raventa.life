'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { setAvatar, removeAvatar } from '@/app/account/avatar-actions'

const OUTPUT_SIZE = 512 // px, square
const JPEG_QUALITY = 0.85

// Round profile picture. Shows the photo if there is one, otherwise the
// first letter of the name on the brand colour. Also falls back to the
// letter if the photo link has stopped working (e.g. an old LINE picture).
export function AvatarCircle({
  src,
  name,
  className,
}: {
  src: string | null
  name: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  // Skip Thai leading vowels (เ แ โ ใ ไ) so "เอก" shows "อ", not "เ".
  const initial = (name.trim().replace(/^[เแโใไ]+/, '')[0] ?? '?').toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-display font-bold text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      {src && !broken ? (
        // Plain <img>: the photo is a short-lived signed link (or a LINE/
        // Google URL), which Next's image optimiser has no use for here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </span>
  )
}

// Shrinks and centre-crops the chosen photo to a 512px JPEG before upload,
// so uploads are quick on mobile data and every stored file is small. Uses
// createImageBitmap (no blob: URLs, which the site's security policy blocks).
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', JPEG_QUALITY),
  )
}

export function AvatarEditor({
  userId,
  src,
  name,
  hasUploaded,
}: {
  userId: string
  src: string | null
  name: string
  hasUploaded: boolean
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<keyof typeof authCopy | null>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      let jpeg: Blob
      try {
        jpeg = await toSquareJpeg(file)
      } catch {
        setError('avatarBadFile')
        return
      }
      // A new file name each time, so browsers never show a cached old photo.
      const path = `${userId}/${Date.now()}.jpg`
      const { error: uploadError } = await createClient()
        .storage.from('avatars')
        .upload(path, jpeg, { contentType: 'image/jpeg' })
      if (uploadError) {
        console.error('avatar upload failed', uploadError.message)
        setError('avatarUploadFailed')
        return
      }
      const result = await setAvatar(path)
      if (!result.ok) {
        setError('avatarUploadFailed')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onRemove = async () => {
    setError(null)
    setBusy(true)
    const result = await removeAvatar()
    setBusy(false)
    if (!result.ok) setError('avatarUploadFailed')
    else router.refresh()
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={tr(authCopy.avatarChange)}
        className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <AvatarCircle src={src} name={name} className="h-20 w-20 text-3xl" />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
            <Spinner className="h-6 w-6" />
          </span>
        )}
      </button>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-sm font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          {tr(authCopy.avatarChange)}
        </button>
        {hasUploaded && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            {tr(authCopy.avatarRemove)}
          </button>
        )}
        {error && <p className="text-xs text-destructive">{tr(authCopy[error])}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
    </div>
  )
}
