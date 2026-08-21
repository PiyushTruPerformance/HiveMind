import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils/cn'
import type { OSProduct } from '@/platform/types'

/**
 * The OS identity mark. Product hue appears here and nowhere else, so it reads
 * as identity rather than as state — the brand accent keeps its single meaning
 * ("this is selected / this is the primary action").
 */
export function OSTile({
  os,
  size = 'md',
  locked,
  active,
  className,
}: {
  os: OSProduct
  size?: 'sm' | 'md' | 'lg' | 'xl'
  locked?: boolean
  active?: boolean
  className?: string
}) {
  const Icon = os.icon
  const sizes = {
    sm: 'size-7 rounded-md [&_svg]:size-3.5',
    md: 'size-9 rounded-md [&_svg]:size-4',
    lg: 'size-11 rounded-lg [&_svg]:size-5',
    xl: 'size-14 rounded-xl [&_svg]:size-6',
  }

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center transition-shadow',
        sizes[size],
        locked && 'opacity-55 saturate-50',
        active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
      style={{
        backgroundColor: `hsl(${os.hue} / 0.13)`,
        color: `hsl(${os.hue})`,
        boxShadow: `inset 0 0 0 1px hsl(${os.hue} / 0.22)`,
      }}
    >
      <Icon aria-hidden />
      {locked ? (
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground">
          <Lock className="size-2.5" aria-hidden />
        </span>
      ) : null}
    </span>
  )
}
