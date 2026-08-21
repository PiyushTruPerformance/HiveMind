import { cn } from '@/lib/utils/cn'
import type { IntegrationDefinition } from '@/platform/types'

/**
 * Provider mark.
 *
 * Deliberately a typographic tile in the provider's brand colour rather than a
 * fetched logo: no external asset requests, no licensing question, and one
 * consistent silhouette across twenty-plus providers. Swapping in real logos
 * later is a change to this component alone.
 */
export function IntegrationIcon({
  integration,
  size = 'md',
  className,
}: {
  integration: IntegrationDefinition
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'size-7 rounded-md text-[10px]',
    md: 'size-9 rounded-md text-[11px]',
    lg: 'size-11 rounded-lg text-[13px]',
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center font-display font-semibold tracking-tight',
        sizes[size],
        className,
      )}
      style={{
        backgroundColor: `${integration.brandColor}1f`,
        color: integration.brandColor,
        boxShadow: `inset 0 0 0 1px ${integration.brandColor}33`,
      }}
      aria-hidden
    >
      {integration.monogram}
    </span>
  )
}
