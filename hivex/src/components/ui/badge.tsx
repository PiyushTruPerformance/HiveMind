import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * Status badges follow the rule set out in the HR OS design system:
 *
 *   filled pill  → a decided state (an outcome has been reached)
 *   dashed pill  → a pending state ("this hasn't happened yet")
 *
 * The shape carries meaning, not just the colour, and a leading dot repeats the
 * family colour so the distinction survives for colourblind readers.
 */

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'dead-end'
  | 'accent'

const TONES: Record<BadgeTone, { filled: string; dot: string }> = {
  neutral: { filled: 'bg-muted text-muted-foreground border-transparent', dot: 'bg-muted-foreground' },
  success: { filled: 'bg-success-soft text-success border-transparent', dot: 'bg-success' },
  warning: { filled: 'bg-warning-soft text-warning border-transparent', dot: 'bg-warning' },
  destructive: {
    filled: 'bg-destructive-soft text-destructive border-transparent',
    dot: 'bg-destructive',
  },
  info: { filled: 'bg-info-soft text-info border-transparent', dot: 'bg-info' },
  'dead-end': { filled: 'bg-dead-end-soft text-dead-end border-transparent', dot: 'bg-dead-end' },
  accent: { filled: 'bg-primary-soft text-primary border-transparent', dot: 'bg-primary' },
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Pending states render as a dashed outline instead of a filled pill. */
  pending?: boolean
  dot?: boolean
}

export function Badge({
  className,
  tone = 'neutral',
  pending = false,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium leading-4',
        pending
          ? 'border-dashed border-border-strong bg-transparent text-muted-foreground'
          : t.filled,
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', pending ? 'bg-muted-foreground' : t.dot)}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}

/** Just the dot, for tight rows where a full pill would crowd the layout. */
export function StatusDot({ tone = 'neutral', className }: { tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', TONES[tone].dot, className)}
      aria-hidden
    />
  )
}
