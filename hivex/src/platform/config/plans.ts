import type { BillingPeriod, OSId, Plan, PlanId, TeamSize } from '@/platform/types'

/**
 * Subscription catalog — the single source of truth for pricing, limits and
 * capability gating.
 *
 * Two layers, on purpose:
 *
 *   PLANS      the four tiers, with the limits and capabilities each one grants.
 *   OS_PRICING what each tier costs *for a given product*, plus the bullets
 *              that only make sense for that product.
 *
 * A subscription is bought per OS (see OSSubscription), so an organization can
 * run Reporting OS on Gold and SEO OS on Silver. Nothing in the UI hardcodes a
 * price or a plan comparison — screens read this file through
 * src/lib/access/entitlements.ts.
 *
 * Prices are demo values. When real billing lands it should populate these same
 * shapes from the billing provider.
 */

export const UNLIMITED = -1

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try the product with a single workspace.',
    price: { monthly: 0, yearly: 0 },
    currency: 'USD',
    order: 0,
    limits: {
      workspacesPerOS: 1,
      members: 2,
      integrations: 2,
      aiMessagesPerMonth: 50,
      dataRetentionDays: 30,
      seatsIncluded: 2,
    },
    capabilities: {
      universalAssistant: true,
      crossOSAssistant: false,
      customAssistantPersonas: false,
      scheduledReports: false,
      apiAccess: false,
      mcpAccess: false,
      sso: false,
      auditLog: false,
      prioritySupport: false,
    },
    highlights: [
      '1 workspace',
      '2 members',
      '2 connected tools',
      '50 Ask Tru messages / month',
      '30 days of history',
    ],
  },

  silver: {
    id: 'silver',
    name: 'Silver',
    tagline: 'For one team running the product properly.',
    price: { monthly: 49, yearly: 490 },
    currency: 'USD',
    order: 1,
    limits: {
      workspacesPerOS: 5,
      members: 10,
      integrations: 8,
      aiMessagesPerMonth: 1_000,
      dataRetentionDays: 180,
      seatsIncluded: 5,
    },
    capabilities: {
      universalAssistant: true,
      crossOSAssistant: false,
      customAssistantPersonas: false,
      scheduledReports: true,
      apiAccess: false,
      mcpAccess: false,
      sso: false,
      auditLog: false,
      prioritySupport: false,
    },
    highlights: [
      '5 workspaces',
      '10 members',
      '8 connected tools',
      'Scheduled reports',
      '1,000 Ask Tru messages / month',
    ],
  },

  gold: {
    id: 'gold',
    name: 'Gold',
    tagline: 'For an agency running several teams, with Ask Tru across products.',
    price: { monthly: 149, yearly: 1_490 },
    currency: 'USD',
    order: 2,
    recommended: true,
    limits: {
      workspacesPerOS: 20,
      members: 30,
      integrations: 25,
      aiMessagesPerMonth: 10_000,
      dataRetentionDays: 365,
      seatsIncluded: 15,
    },
    capabilities: {
      universalAssistant: true,
      crossOSAssistant: true,
      customAssistantPersonas: true,
      scheduledReports: true,
      apiAccess: true,
      mcpAccess: true,
      sso: false,
      auditLog: true,
      prioritySupport: false,
    },
    highlights: [
      '20 workspaces',
      '30 members',
      '25 connected tools',
      'Cross-product Ask Tru',
      'API and MCP access',
    ],
  },

  platinum: {
    id: 'platinum',
    name: 'Platinum',
    tagline: 'No ceilings, SSO, and priority support.',
    price: { monthly: 399, yearly: 3_990 },
    currency: 'USD',
    order: 3,
    limits: {
      workspacesPerOS: UNLIMITED,
      members: UNLIMITED,
      integrations: UNLIMITED,
      aiMessagesPerMonth: UNLIMITED,
      dataRetentionDays: 1_095,
      seatsIncluded: 50,
    },
    capabilities: {
      universalAssistant: true,
      crossOSAssistant: true,
      customAssistantPersonas: true,
      scheduledReports: true,
      apiAccess: true,
      mcpAccess: true,
      sso: true,
      auditLog: true,
      prioritySupport: true,
    },
    highlights: [
      'Unlimited workspaces and members',
      'Unlimited connected tools',
      'Unlimited Ask Tru',
      'SSO and audit log',
      'Priority support',
    ],
  },
}

export const PLAN_ORDER: PlanId[] = (Object.values(PLANS) as Plan[])
  .sort((a, b) => a.order - b.order)
  .map((p) => p.id)

export const PLAN_LIST: Plan[] = PLAN_ORDER.map((id) => PLANS[id])

export function getPlan(id: PlanId): Plan {
  return PLANS[id]
}

/* -------------------------------------------------------------------------- */
/* Per-OS pricing                                                              */
/* -------------------------------------------------------------------------- */

export interface OSPlanOffer {
  price: Record<BillingPeriod, number>
  /** Bullets specific to this product on this tier, shown above the tier's own. */
  highlights: string[]
  /** Tier not sold for this product. */
  unavailable?: boolean
}

/**
 * What each tier costs for each product.
 *
 * Priced per product rather than per organization, because that is how the
 * purchase funnel now works: choose a product, then a plan for it. One
 * organization can hold several subscriptions at different tiers.
 */
export const OS_PRICING: Record<OSId, Record<PlanId, OSPlanOffer>> = {
  reporting: {
    free: {
      price: { monthly: 0, yearly: 0 },
      highlights: ['1 client workspace', 'GA4 and Search Console', 'Manual reports'],
    },
    silver: {
      price: { monthly: 49, yearly: 490 },
      highlights: ['5 client workspaces', 'GA4, Search Console, Google Ads', 'Scheduled period reports'],
    },
    gold: {
      price: { monthly: 149, yearly: 1_490 },
      highlights: [
        '20 client workspaces',
        'Every Google source, including Business Profile',
        'Generated QBR and monthly decks',
        'Client audits',
      ],
    },
    platinum: {
      price: { monthly: 399, yearly: 3_990 },
      highlights: [
        'Unlimited client workspaces',
        'White-label decks and exports',
        'MCP access for your own agents',
      ],
    },
  },

  seo: {
    free: {
      price: { monthly: 0, yearly: 0 },
      highlights: ['1 project', '25 tracked keywords', 'Manual prospect entry'],
    },
    silver: {
      price: { monthly: 39, yearly: 390 },
      highlights: ['5 projects', '500 tracked keywords', 'AI relevance scoring'],
    },
    gold: {
      price: { monthly: 119, yearly: 1_190 },
      highlights: [
        '20 projects',
        '5,000 tracked keywords',
        'Automated outreach and follow-ups',
        'Technical site audits',
      ],
    },
    platinum: {
      price: { monthly: 299, yearly: 2_990 },
      highlights: ['Unlimited projects and keywords', 'Bulk outreach', 'SEMrush and Looker connectors'],
    },
  },

  hr: {
    free: {
      price: { monthly: 0, yearly: 0 },
      highlights: ['1 hiring client', '25 CVs per month', 'AI job-description extraction'],
    },
    silver: {
      price: { monthly: 59, yearly: 590 },
      highlights: ['5 hiring clients', '250 CVs per month', 'AI screening and scoring'],
    },
    gold: {
      price: { monthly: 169, yearly: 1_690 },
      highlights: [
        '20 hiring clients',
        '2,000 CVs per month',
        'Candidate status emails',
        'Bulk decisions and CSV export',
      ],
    },
    platinum: {
      price: { monthly: 429, yearly: 4_290 },
      highlights: ['Unlimited clients and CVs', 'Custom screening thresholds', 'Priority AI throughput'],
    },
  },

  finance: {
    free: { price: { monthly: 0, yearly: 0 }, highlights: [], unavailable: true },
    silver: { price: { monthly: 0, yearly: 0 }, highlights: [], unavailable: true },
    gold: { price: { monthly: 0, yearly: 0 }, highlights: [], unavailable: true },
    platinum: { price: { monthly: 0, yearly: 0 }, highlights: [], unavailable: true },
  },
}

export function offerFor(osId: OSId, planId: PlanId): OSPlanOffer {
  return OS_PRICING[osId][planId]
}

/** Tiers actually sold for a product, cheapest first. */
export function plansForOS(osId: OSId): PlanId[] {
  return PLAN_ORDER.filter((id) => !OS_PRICING[osId][id].unavailable)
}

export function priceFor(osId: OSId, planId: PlanId, period: BillingPeriod): number {
  return OS_PRICING[osId][planId].price[period]
}

export function formatPrice(value: number): string {
  if (value === 0) return 'Free'
  return `$${value.toLocaleString('en-US')}`
}

export function formatPlanPrice(osId: OSId, planId: PlanId, period: BillingPeriod): string {
  return formatPrice(priceFor(osId, planId, period))
}

/** Yearly billing is priced at ten months; surfaced on the billing toggle. */
export function yearlySavingPercent(osId: OSId, planId: PlanId): number {
  const monthlyTotal = priceFor(osId, planId, 'monthly') * 12
  if (monthlyTotal === 0) return 0
  const yearly = priceFor(osId, planId, 'yearly')
  return Math.round(((monthlyTotal - yearly) / monthlyTotal) * 100)
}

/**
 * Which tier to highlight, given what the buyer told us.
 *
 * Deliberately a pure function of team size rather than a scored questionnaire:
 * the goal is a fast decision, not another wizard. Falls back to whichever tier
 * is marked `recommended`.
 */
export function recommendedPlanFor(osId: OSId, teamSize?: TeamSize): PlanId {
  const available = plansForOS(osId)
  const byTeamSize: Record<TeamSize, PlanId> = {
    '1-5': 'silver',
    '6-20': 'gold',
    '21-100': 'gold',
    '100+': 'platinum',
  }
  const wanted = teamSize
    ? byTeamSize[teamSize]
    : (PLAN_LIST.find((plan) => plan.recommended)?.id ?? 'gold')
  return available.includes(wanted) ? wanted : (available[available.length - 1] ?? 'free')
}

export const TEAM_SIZE_OPTIONS: { value: TeamSize; label: string }[] = [
  { value: '1-5', label: '1-5 people' },
  { value: '6-20', label: '6-20 people' },
  { value: '21-100', label: '21-100 people' },
  { value: '100+', label: '100+ people' },
]

export function formatLimit(value: number, noun?: string): string {
  if (value === UNLIMITED) return noun ? `Unlimited ${noun}` : 'Unlimited'
  const formatted = value.toLocaleString('en-US')
  return noun ? `${formatted} ${noun}` : formatted
}
