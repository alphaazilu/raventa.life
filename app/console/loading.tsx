// Shown under the console bar while a Back Office page loads (switching
// tabs fetches fresh data from Supabase): a sliding progress line plus a
// quiet skeleton, so a tap always gets an answer straight away.
export default function ConsoleLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="กำลังโหลด · Loading">
      <div className="h-1 w-full overflow-hidden bg-secondary" aria-hidden="true">
        <div className="h-full w-2/5 rounded-full bg-loading motion-safe:animate-[rv-slide_1.2s_ease-in-out_infinite]" />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin" />
          กำลังโหลด…
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-secondary/60" />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-5" aria-hidden="true">
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-secondary/60 lg:col-span-3" />
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-secondary/60 lg:col-span-2" />
        </div>
      </div>
    </div>
  )
}
