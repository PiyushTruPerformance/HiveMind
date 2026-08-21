'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * Page chrome shared by every screen in the platform — one header shape, one
 * content rhythm, one entry animation, so Reporting OS and HR OS never look
 * like two different applications.
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="truncate font-display text-xl font-semibold tracking-tight sm:text-[22px]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Consistent page entrance. Kept short — 180ms, no stagger cascades. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>
}
