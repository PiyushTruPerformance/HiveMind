'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'
import { initialsOf } from '@/lib/utils/format'

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  src,
  hue,
  size = 'md',
  square,
  className,
}: {
  name: string
  src?: string
  /** HSL triplet. When set, the fallback tile uses it instead of neutral. */
  hue?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  square?: boolean
  className?: string
}) {
  const sizes = {
    xs: 'size-5 text-[9px]',
    sm: 'size-7 text-[10px]',
    md: 'size-9 text-[11px]',
    lg: 'size-11 text-[13px]',
    xl: 'size-14 text-base',
  }
  const initials = initialsOf(name)

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden',
        square ? 'rounded-md' : 'rounded-full',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className={cn(
          'flex size-full items-center justify-center font-semibold tracking-wide',
          !hue && 'bg-muted text-muted-foreground',
        )}
        style={hue ? { backgroundColor: `hsl(${hue} / 0.14)`, color: `hsl(${hue})` } : undefined}
      >
        {initials || '?'}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Separator                                                                   */
/* -------------------------------------------------------------------------- */

export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
})

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function Progress({
  value,
  tone = 'accent',
  className,
}: {
  value: number
  tone?: 'accent' | 'success' | 'warning' | 'destructive' | 'neutral'
  className?: string
}) {
  const tones = {
    accent: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    neutral: 'bg-foreground/60',
  }
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-transform duration-500 ease-out', tones[tone])}
        style={{ transform: `translateX(-${100 - Math.min(Math.max(value, 0), 100)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                      */
/* -------------------------------------------------------------------------- */

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        'transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  )
})

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('inline-flex items-center gap-1 rounded-md bg-muted p-1', className)}
      {...props}
    />
  )
})

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-[13px] font-medium text-muted-foreground',
        'transition-colors hover:text-foreground',
        'data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs',
        className,
      )}
      {...props}
    />
  )
})

export const TabsContent = TabsPrimitive.Content

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  side = 'top',
  children,
  delay = 250,
}: {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
  delay?: number
}) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-64 rounded-md border bg-popover px-2.5 py-1.5 text-2xs leading-relaxed text-popover-foreground shadow-md',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Keyboard hint                                                               */
/* -------------------------------------------------------------------------- */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
