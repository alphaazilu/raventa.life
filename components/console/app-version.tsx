import { cn } from '@/lib/utils'

// "v0.20.2 · 1a2b3c4" — which build this screen is running, so a photo of
// the tablet shows at once whether it has picked up the latest deploy.
// Both values are baked in at build time (next.config.mjs).
export function AppVersion({ className }: { className?: string }) {
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA
  return (
    <span className={cn('font-mono text-[11px] text-muted-foreground', className)}>
      v{process.env.NEXT_PUBLIC_APP_VERSION}
      {sha ? ` · ${sha}` : ''}
    </span>
  )
}
