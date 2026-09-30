import Image from 'next/image'

// Shown while a page's data loads (Next.js route loading UI): the full
// logo on white, breathing gently, with a thin progress line.
export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลด · Loading"
    >
      <Image
        src="/images/logo-full.png"
        alt="RAVENTA"
        width={1166}
        height={620}
        priority
        className="h-auto w-56 motion-safe:animate-[rv-breathe_2.4s_ease-in-out_infinite] md:w-72"
      />
      <div className="mt-10 h-[3px] w-36 overflow-hidden rounded-full bg-secondary md:mt-12 md:w-44">
        <div className="h-full w-2/5 rounded-full bg-primary motion-safe:animate-[rv-slide_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="mt-4 text-xs font-medium tracking-brand text-muted-foreground uppercase">
        Nature meets modern wellness
      </p>
    </div>
  )
}
