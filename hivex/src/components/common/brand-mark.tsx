import { cn } from '@/lib/utils/cn'
import { BRAND } from '@/platform/config/brand'

/**
 * The platform mark — a hex cell, drawn rather than imported, so it inherits
 * `currentColor` and works on any surface in either theme.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('size-6', className)} aria-hidden>
      <path
        d="M12 2.5 20.4 7.25v9.5L12 21.5 3.6 16.75v-9.5L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8.2v7.6M8.6 10.2v3.6M15.4 10.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function BrandLockup({
  className,
  showWordmark = true,
}: {
  className?: string
  showWordmark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
        <BrandMark className="size-4" />
      </span>
      {showWordmark ? (
        <span className="font-display text-[15px] font-semibold tracking-tight">{BRAND.name}</span>
      ) : null}
    </span>
  )
}
