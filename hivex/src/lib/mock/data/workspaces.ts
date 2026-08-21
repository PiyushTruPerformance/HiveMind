import type { OSId, Workspace } from '@/platform/types'
import { daysAgo, hoursAgo } from '../seed'

/**
 * Workspaces, keyed by OS.
 *
 * A workspace is the unit of context every OS operates inside. Reporting OS
 * calls them Clients (matching the `client` table in the Reporting OS schema),
 * SEO OS calls them Projects, HR OS calls them Teams — the noun comes from the
 * OS registry, the entity is the same.
 */

const ws = (w: Omit<Workspace, 'organizationId'>): Workspace => ({
  ...w,
  organizationId: 'org_truperformance',
})

export const DEMO_WORKSPACES: Record<OSId, Workspace[]> = {
  reporting: [
    ws({
      id: 'ws_northwind',
      osId: 'reporting',
      name: 'Northwind Retail',
      slug: 'northwind-retail',
      monogram: 'NR',
      accent: '212 84% 54%',
      description: 'Omnichannel retail. Paid + organic, US and Canada.',
      health: 'healthy',
      healthScore: 92,
      memberCount: 7,
      connectedIntegrations: ['ga4', 'gsc', 'google-ads', 'gbp', 'slack'],
      createdAt: daysAgo(388),
      updatedAt: hoursAgo(3),
      stats: [
        { label: 'Sessions (30d)', value: '412K', delta: 8.4 },
        { label: 'Ad spend (30d)', value: '$84.2K', delta: -3.1 },
        { label: 'Conversions', value: '6,180', delta: 12.7 },
      ],
    }),
    ws({
      id: 'ws_meridian',
      osId: 'reporting',
      name: 'Meridian Health',
      slug: 'meridian-health',
      monogram: 'MH',
      accent: '162 62% 38%',
      description: 'Multi-location healthcare network. Local search focus.',
      health: 'attention',
      healthScore: 74,
      memberCount: 5,
      connectedIntegrations: ['ga4', 'gsc', 'gbp'],
      createdAt: daysAgo(295),
      updatedAt: hoursAgo(19),
      stats: [
        { label: 'Sessions (30d)', value: '96.4K', delta: -4.2 },
        { label: 'Local actions', value: '11.3K', delta: 5.6 },
        { label: 'Conversions', value: '1,942', delta: -1.8 },
      ],
    }),
    ws({
      id: 'ws_lumen',
      osId: 'reporting',
      name: 'Lumen Studio',
      slug: 'lumen-studio',
      monogram: 'LS',
      accent: '272 58% 60%',
      description: 'Design studio. Content-led acquisition.',
      health: 'healthy',
      healthScore: 88,
      memberCount: 4,
      connectedIntegrations: ['ga4', 'gsc'],
      createdAt: daysAgo(211),
      updatedAt: daysAgo(1),
      stats: [
        { label: 'Sessions (30d)', value: '58.1K', delta: 21.4 },
        { label: 'Organic clicks', value: '24.6K', delta: 18.9 },
        { label: 'Conversions', value: '712', delta: 9.2 },
      ],
    }),
    ws({
      id: 'ws_coastline',
      osId: 'reporting',
      name: 'Coastline Legal',
      slug: 'coastline-legal',
      monogram: 'CL',
      accent: '340 62% 56%',
      description: 'Regional law firm. High-intent lead generation.',
      health: 'at_risk',
      healthScore: 58,
      memberCount: 3,
      connectedIntegrations: ['ga4', 'google-ads'],
      createdAt: daysAgo(122),
      updatedAt: daysAgo(4),
      stats: [
        { label: 'Sessions (30d)', value: '22.7K', delta: -11.6 },
        { label: 'Cost per lead', value: '$186', delta: 24.3 },
        { label: 'Conversions', value: '118', delta: -14.1 },
      ],
    }),
  ],

  seo: [
    ws({
      id: 'ws_seo_northwind',
      osId: 'seo',
      name: 'Northwind Retail',
      slug: 'northwind-retail',
      monogram: 'NR',
      accent: '212 84% 54%',
      description: 'Category page authority build, US market.',
      health: 'healthy',
      healthScore: 90,
      memberCount: 4,
      connectedIntegrations: ['gsc', 'semrush'],
      createdAt: daysAgo(240),
      updatedAt: hoursAgo(6),
      stats: [
        { label: 'Live backlinks', value: '184', delta: 14.2 },
        { label: 'Avg. relevance', value: '78', delta: 3.4 },
        { label: 'Reply rate', value: '21.8%', delta: 4.1 },
      ],
    }),
    ws({
      id: 'ws_seo_coastline',
      osId: 'seo',
      name: 'Coastline Legal',
      slug: 'coastline-legal',
      monogram: 'CL',
      accent: '340 62% 56%',
      description: 'Local citation and legal directory acquisition.',
      health: 'attention',
      healthScore: 71,
      memberCount: 3,
      connectedIntegrations: ['gsc'],
      createdAt: daysAgo(140),
      updatedAt: daysAgo(2),
      stats: [
        { label: 'Live backlinks', value: '62', delta: 6.9 },
        { label: 'Avg. relevance', value: '64', delta: -2.2 },
        { label: 'Reply rate', value: '12.4%', delta: -1.7 },
      ],
    }),
    ws({
      id: 'ws_seo_lumen',
      osId: 'seo',
      name: 'Lumen Studio',
      slug: 'lumen-studio',
      monogram: 'LS',
      accent: '272 58% 60%',
      description: 'Editorial placements and design-community links.',
      health: 'healthy',
      healthScore: 86,
      memberCount: 2,
      connectedIntegrations: ['gsc', 'semrush', 'wappalyzer'],
      createdAt: daysAgo(88),
      updatedAt: hoursAgo(31),
      stats: [
        { label: 'Live backlinks', value: '97', delta: 26.5 },
        { label: 'Avg. relevance', value: '83', delta: 7.8 },
        { label: 'Reply rate', value: '28.9%', delta: 9.3 },
      ],
    }),
  ],

  /**
   * HR OS workspaces are hiring clients served by services/hr-os, loaded at
   * runtime via OS_WORKSPACE_SOURCES — there are deliberately no fixtures here.
   */
  hr: [],

  finance: [],
}

export function workspacesForOS(osId: OSId): Workspace[] {
  return DEMO_WORKSPACES[osId] ?? []
}

export function findWorkspace(osId: OSId, workspaceId: string): Workspace | undefined {
  return workspacesForOS(osId).find((w) => w.id === workspaceId)
}

export const ALL_WORKSPACES: Workspace[] = Object.values(DEMO_WORKSPACES).flat()
