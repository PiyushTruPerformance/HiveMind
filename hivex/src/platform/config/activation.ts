import type { OSActivationStatus, OSId, OSSubscription } from '@/platform/types'

/**
 * The product activation funnel.
 *
 * One linear sequence per product:
 *
 *   discoverable → selected → payment_required → setup_required → active
 *
 * Each stage owns exactly one route. That mapping lives here and nowhere else,
 * so the router can always resume someone at the step they abandoned, and every
 * screen can ask one question — "where is this product up to?" — instead of
 * juggling separate booleans for purchased / paid / configured.
 */

export const ACTIVATION_ORDER: OSActivationStatus[] = [
  'discoverable',
  'selected',
  'payment_required',
  'setup_required',
  'active',
]

export function activationRank(status: OSActivationStatus): number {
  return ACTIVATION_ORDER.indexOf(status)
}

/** Where a product at this stage should send the user. */
export function routeForStatus(osId: OSId, status: OSActivationStatus): string {
  switch (status) {
    case 'discoverable':
      return `/app/os/${osId}/about`
    case 'selected':
    case 'payment_required':
      return `/app/os/${osId}/pricing`
    case 'setup_required':
      return `/app/os/${osId}/setup`
    case 'active':
    default:
      return `/app/os/${osId}`
  }
}

export function statusOf(subscription: OSSubscription | undefined): OSActivationStatus {
  return subscription?.status ?? 'discoverable'
}

export function isActive(subscription: OSSubscription | undefined): boolean {
  return statusOf(subscription) === 'active'
}

/**
 * Routes inside a product that are reachable before it is active.
 *
 * Everything else — the product itself — waits until setup is finished. Listed
 * as leading segments so `/about`, `/pricing`, `/checkout` and `/setup` stay
 * open while `/`, `/workspaces`, `/w/...` do not.
 */
export const PRE_ACTIVATION_SECTIONS = ['about', 'pricing', 'checkout', 'setup'] as const

export function isPreActivationSection(section: string): boolean {
  return (PRE_ACTIVATION_SECTIONS as readonly string[]).includes(section)
}

interface StageCopy {
  label: string
  /** Shown on the launcher card and the product header. */
  hint: string
  cta: string
}

export const ACTIVATION_COPY: Record<OSActivationStatus, StageCopy> = {
  discoverable: {
    label: 'Not added',
    hint: 'Explore what this product does before you commit.',
    cta: 'Explore',
  },
  selected: {
    label: 'Plan needed',
    hint: 'You chose this product — pick a plan to continue.',
    cta: 'Choose a plan',
  },
  payment_required: {
    label: 'Payment pending',
    hint: 'Complete checkout to activate this product.',
    cta: 'Complete checkout',
  },
  setup_required: {
    label: 'Setup needed',
    hint: 'Connect the required data sources to finish setup.',
    cta: 'Finish setup',
  },
  active: {
    label: 'Active',
    hint: 'Ready to use.',
    cta: 'Open',
  },
}
