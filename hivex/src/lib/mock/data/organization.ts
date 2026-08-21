import type { OSId, OSSubscription, Organization, OrgMember, PlatformUser } from '@/platform/types'
import { daysAgo } from '../seed'

/**
 * The demo organization and its people.
 *
 * `DEMO_ORGANIZATION` is what a returning user sees. A first-time visitor
 * creates their own organization in onboarding; that record has the same shape
 * and simply replaces this one in platform state.
 */

export const DEMO_USER: PlatformUser = {
  id: 'usr_demo',
  clerkId: 'user_demo_2f81',
  name: 'Alex Mercer',
  email: 'alex.mercer@truperformance.us',
  designation: 'Director of Client Strategy',
}

export const DEMO_ORGANIZATION: Organization = {
  id: 'org_truperformance',
  name: 'TruPerformance',
  slug: 'truperformance',
  domain: 'truperformance.us',
  industry: 'Marketing agency',
  size: '11-50',
  monogram: 'TP',
  accent: '14 100% 57%',
  createdAt: daysAgo(412),
}

/**
 * What the sample organization has already bought.
 *
 * Reporting OS is fully active so the demo can walk straight into a working
 * product; SEO OS and HR OS are left un-added so the purchase funnel — explore,
 * plan, checkout, setup — can be demonstrated end to end from the home screen.
 */
export const DEMO_SUBSCRIPTIONS: Partial<Record<OSId, OSSubscription>> = {
  reporting: {
    osId: 'reporting',
    planId: 'gold',
    billingPeriod: 'monthly',
    status: 'active',
    selectedAt: daysAgo(412),
    purchasedAt: daysAgo(412),
    setupCompletedAt: daysAgo(411),
  },
}

const member = (
  id: string,
  name: string,
  email: string,
  role: OrgMember['role'],
  designation: string,
  overrides: Partial<OrgMember> = {},
): OrgMember => ({
  id,
  user: { id, clerkId: `user_${id}`, name, email, designation },
  role,
  status: 'approved',
  joinedAt: daysAgo(180),
  osAccess: [],
  workspaceAccess: {},
  osRoles: {},
  ...overrides,
})

export const DEMO_MEMBERS: OrgMember[] = [
  {
    id: DEMO_USER.id,
    user: DEMO_USER,
    role: 'admin',
    status: 'approved',
    joinedAt: daysAgo(412),
    osAccess: [],
    workspaceAccess: {},
    osRoles: {},
  },
  member(
    'usr_priya',
    'Priya Raghunathan',
    'priya@truperformance.us',
    'vp',
    'VP, Performance',
    { joinedAt: daysAgo(360) },
  ),
  member(
    'usr_dmitri',
    'Dmitri Volkov',
    'dmitri@truperformance.us',
    'team_lead',
    'Analytics Lead',
    {
      joinedAt: daysAgo(240),
      osAccess: ['reporting', 'seo'],
      osRoles: { reporting: 'team_lead', seo: 'analyst' },
      workspaceAccess: { reporting: ['ws_northwind', 'ws_meridian', 'ws_lumen'] },
    },
  ),
  member('usr_nadia', 'Nadia Okonkwo', 'nadia@truperformance.us', 'team_member', 'SEO Strategist', {
    joinedAt: daysAgo(150),
    osAccess: ['seo'],
    osRoles: { seo: 'editor' },
    workspaceAccess: { seo: ['ws_seo_northwind', 'ws_seo_coastline'] },
  }),
  member('usr_marco', 'Marco Bianchi', 'marco@truperformance.us', 'team_member', 'Reporting Analyst', {
    joinedAt: daysAgo(96),
    osAccess: ['reporting'],
    osRoles: { reporting: 'analyst' },
    workspaceAccess: { reporting: ['ws_northwind'] },
  }),
  member('usr_hana', 'Hana Sato', 'hana@truperformance.us', 'team_lead', 'Talent Lead', {
    joinedAt: daysAgo(74),
    osAccess: ['hr'],
    osRoles: { hr: 'admin' },
    // HR workspaces are served by services/hr-os, so per-workspace grants are
    // left unset here — an unset grant inherits OS access (see permissions.ts).
    workspaceAccess: {},
  }),
  member('usr_leon', 'Leon Whitaker', 'leon@northwind.com', 'client', 'Marketing Director', {
    joinedAt: daysAgo(58),
    osAccess: ['reporting'],
    osRoles: { reporting: 'viewer' },
    workspaceAccess: { reporting: ['ws_northwind'] },
  }),
  {
    ...member('usr_theo', 'Theo Lindqvist', 'theo@truperformance.us', 'user', 'Pending review'),
    status: 'waiting',
    joinedAt: daysAgo(2),
  },
]

export const INDUSTRY_OPTIONS = [
  'Marketing agency',
  'SaaS / Software',
  'E-commerce & retail',
  'Healthcare',
  'Financial services',
  'Professional services',
  'Education',
  'Media & publishing',
  'Travel & hospitality',
  'Non-profit',
  'Other',
]

export const ORG_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-1000', '1000+']

/** Accent choices offered during organization creation. */
export const ORG_ACCENTS: { id: string; label: string; hue: string }[] = [
  { id: 'ember', label: 'Ember', hue: '14 100% 57%' },
  { id: 'cobalt', label: 'Cobalt', hue: '212 84% 54%' },
  { id: 'jade', label: 'Jade', hue: '162 62% 38%' },
  { id: 'violet', label: 'Violet', hue: '272 58% 60%' },
  { id: 'rose', label: 'Rose', hue: '340 62% 56%' },
  { id: 'slate', label: 'Slate', hue: '215 16% 42%' },
]
