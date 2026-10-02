'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { getBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { setAvatar, removeAvatar } from '@/app/account/avatar-actions'
import { AvatarCircle } from '@/components/account/avatar-circle'

const OUTPUT_SIZE = 512 // px, square
const JPEG_QUALITY = 0.85

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
  subtitle,
}: {
  userId: string
  src: string | null
  name: string
  hasUploaded: boolean
  subtitle?: string | null
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
      const { error: uploadError } = await (await getBrowserClient())
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
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={tr(authCopy.avatarChange)}
        className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <AvatarCircle src={src} name={name} className="h-28 w-28 text-4xl" />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
            <Spinner className="h-7 w-7" />
          </span>
        )}
        {/* Camera badge: says "tap to change" without any words. */}
        <span className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background ring-4 ring-background">
          <Camera className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      <p className="mt-4 text-lg font-semibold text-foreground">{name}</p>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      {hasUploaded && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="mt-2 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          {tr(authCopy.avatarRemove)}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{tr(authCopy[error])}</p>}
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
