import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * Two radius registers, used with intent (see globals.css):
 *   `soft`  — rounded-xl, for panels, stat cards and dialogs.
 *   `panel` — rounded-md, structural, for anything holding dense data.
 */
type CardTone = 'soft' | 'panel'

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { tone?: CardTone; interactive?: boolean }
>(function Card({ className, tone = 'soft', interactive, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'border bg-card text-card-foreground',
        tone === 'soft' ? 'rounded-xl shadow-sm' : 'rounded-md shadow-xs',
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-200 hover:border-border-strong hover:shadow-md',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
  },
)

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('font-display text-[15px] font-semibold leading-tight', className)}
        {...props}
      />
    )
  },
)

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn('text-[13px] leading-relaxed text-muted-foreground', className)} {...props} />
    )
  },
)

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-2 border-t px-5 py-3.5', className)}
        {...props}
      />
    )
  },
)
