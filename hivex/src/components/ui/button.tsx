'use client'

import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * The one button.
 *
 * `primary` carries the brand accent and is reserved for the single most
 * important action on a surface — the same discipline the HR OS design system
 * applies to its orange. Everything else is neutral.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'destructive'
  | 'subtle'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/95 disabled:bg-primary/50',
  secondary:
    'bg-foreground text-background shadow-xs hover:bg-foreground/90 active:bg-foreground/95',
  outline:
    'border border-border-strong bg-surface text-foreground shadow-xs hover:bg-muted hover:border-border-strong active:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted',
  subtle: 'bg-muted text-foreground hover:bg-muted/70 active:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/95',
}

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 rounded-sm px-2 text-2xs font-medium',
  sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-md px-4 text-sm',
  lg: 'h-11 gap-2 rounded-md px-5 text-[15px]',
  icon: 'h-9 w-9 rounded-md',
  'icon-sm': 'h-8 w-8 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'outline', size = 'md', asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  // Slot forwards props onto exactly one child, so an `asChild` button must not
  // introduce a sibling spinner. Link-shaped buttons never show a loader.
  const content = asChild ? (
    children
  ) : (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </>
  )

  return (
    <Comp
      ref={ref}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {content}
    </Comp>
  )
})
