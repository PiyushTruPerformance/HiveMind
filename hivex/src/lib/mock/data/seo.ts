import { buildSeries, daysAgo, makeRng, seedFrom, type SeriesPoint } from '../seed'

/**
 * SEO OS fixtures.
 *
 * Modelled on the AI Backlink Generator documented in Docs/Backlink_Os.md:
 * Client -> Campaign -> Prospect site, an AI pipeline with per-site stages, a
 * status ladder, and outreach records with follow-ups.
 */

export type ProspectStatus =
  | 'discovered'
  | 'approved'
  | 'contacted'
  | 'responded'
  | 'live'
  | 'rejected'

export type PipelineStage = 'queued' | 'scraping' | 'scoring' | 'ready' | 'failed'

export type Classification =
  | 'Editorial'
  | 'Guest Post'
  | 'Paid'
  | 'Sponsored'
  | 'Free'
  | 'Link Exchange'
  | 'Manual Review'

export interface Campaign {
  id: string
  name: string
  goal: string
  sites: number
  ready: number
  live: number
  createdAt: string
  status: 'active' | 'paused' | 'complete'
}

export interface ProspectSite {
  id: string
  domain: string
  classification: Classification
  relevance: number
  authority: number
  status: ProspectStatus
  stage: PipelineStage
  contact?: string
  campaign: string
  addedAt: string
  reason: string
}

export interface OutreachRecord {
  id: string
  recipient: string
  domain: string
  template: string
  sentAt: string
  status: 'sent' | 'opened' | 'replied' | 'bounced'
  followUps: number
}

export interface KeywordRow {
  keyword: string
  volume: number
  difficulty: number
  position: number
  change: number
  url: string
}

const DOMAIN_POOL = [
  'trailjournal.com',
  'gearlab.io',
  'outdoorsdigest.net',
  'thehikersguide.co',
  'summitreview.org',
  'basecampweekly.com',
  'ridgelinemag.com',
  'packandpath.com',
  'northernroutes.io',
  'alpineinsider.net',
  'fieldnotes.press',
  'wanderstack.com',
  'terrainreport.co',
  'openpathmedia.com',
]

const CLASSIFICATIONS: Classification[] = [
  'Editorial',
  'Guest Post',
  'Paid',
  'Sponsored',
  'Free',
  'Link Exchange',
  'Manual Review',
]

const REASONS = [
  'Publishes long-form gear reviews with a topically aligned audience and an active editorial calendar.',
  'Accepts contributed articles; three recent posts overlap directly with the client niche.',
  'High topical overlap but the site sells placements, so treat cost as the deciding factor.',
  'Mostly off-topic lifestyle content; only one category page is relevant.',
  'Strong domain signals and a named editor contact discovered on the about page.',
]

export function campaigns(workspaceId: string): Campaign[] {
  const rng = makeRng(seedFrom(`${workspaceId}:campaigns`))
  const names = [
    'Category authority — Q3',
    'Editorial placements',
    'Local directory sweep',
    'Competitor gap links',
  ]
  const goals = [
    'Build topical authority on core category pages',
    'Earn 20 editorial mentions from tier-1 publications',
    'Complete citation coverage in target metros',
    'Match competitor link velocity on money pages',
  ]
  const statuses: Campaign['status'][] = ['active', 'active', 'paused', 'complete']

  return names.map((name, i) => {
    const sites = Math.round(28 + rng() * 120)
    const ready = Math.round(sites * (0.55 + rng() * 0.4))
    return {
      id: `cmp_${workspaceId}_${i}`,
      name,
      goal: goals[i],
      sites,
      ready,
      live: Math.round(ready * (0.12 + rng() * 0.3)),
      createdAt: daysAgo(Math.round(20 + rng() * 160)),
      status: statuses[i],
    }
  })
}

export function prospects(workspaceId: string): ProspectSite[] {
  const rng = makeRng(seedFrom(`${workspaceId}:prospects`))
  const statuses: ProspectStatus[] = [
    'discovered',
    'approved',
    'contacted',
    'responded',
    'live',
    'rejected',
  ]
  const stages: PipelineStage[] = ['ready', 'ready', 'ready', 'scoring', 'scraping', 'queued', 'failed']
  const campaignNames = campaigns(workspaceId).map((c) => c.name)

  return DOMAIN_POOL.map((domain, i) => {
    const stage = stages[Math.floor(rng() * stages.length)]
    const relevance = Math.round(28 + rng() * 70)
    return {
      id: `site_${workspaceId}_${i}`,
      domain,
      classification: CLASSIFICATIONS[Math.floor(rng() * CLASSIFICATIONS.length)],
      relevance: stage === 'ready' ? relevance : 0,
      authority: Math.round(2 + rng() * 8),
      status: statuses[Math.floor(rng() * statuses.length)],
      stage,
      contact: rng() > 0.35 ? `editor@${domain}` : undefined,
      campaign: campaignNames[Math.floor(rng() * campaignNames.length)],
      addedAt: daysAgo(Math.round(rng() * 60)),
      reason: REASONS[Math.floor(rng() * REASONS.length)],
    }
  })
}

export function outreach(workspaceId: string): OutreachRecord[] {
  const rng = makeRng(seedFrom(`${workspaceId}:outreach`))
  const templates = ['Editorial intro', 'Guest post pitch', 'Resource suggestion', 'Follow-up 1']
  const statuses: OutreachRecord['status'][] = ['sent', 'opened', 'replied', 'bounced', 'opened', 'sent']

  return DOMAIN_POOL.slice(0, 10).map((domain, i) => ({
    id: `out_${workspaceId}_${i}`,
    recipient: `editor@${domain}`,
    domain,
    template: templates[Math.floor(rng() * templates.length)],
    sentAt: daysAgo(Math.round(rng() * 30)),
    status: statuses[Math.floor(rng() * statuses.length)],
    followUps: Math.round(rng() * 3),
  }))
}

const KEYWORD_POOL = [
  'waterproof hiking boots',
  'best trail running shoes',
  'lightweight backpacking tent',
  'insulated jacket review',
  'winter layering guide',
  'day pack vs overnight pack',
  'gore-tex vs softshell',
  'trekking pole buying guide',
  'ultralight sleeping bag',
  'hiking gear for beginners',
]

export function keywords(workspaceId: string): KeywordRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:keywords`))
  return KEYWORD_POOL.map((keyword) => {
    const position = Number((1 + rng() * 40).toFixed(1))
    return {
      keyword,
      volume: Math.round(320 + rng() * 24_000),
      difficulty: Math.round(12 + rng() * 78),
      position,
      change: Number(((rng() - 0.42) * 12).toFixed(1)),
      url: `/guides/${keyword.replace(/\s+/g, '-')}`,
    }
  }).sort((a, b) => a.position - b.position)
}

export function visibilitySeries(workspaceId: string): SeriesPoint[] {
  return buildSeries({
    key: `${workspaceId}:visibility`,
    days: 90,
    base: 34,
    trend: 0.42,
    weekly: 0.02,
    noise: 0.05,
    integer: false,
  })
}

export function backlinkSeries(workspaceId: string): SeriesPoint[] {
  return buildSeries({ key: `${workspaceId}:backlinks`, days: 90, base: 3.2, trend: 0.6, noise: 0.4 })
}

export interface SiteAuditIssue {
  id: string
  title: string
  severity: 'critical' | 'warning' | 'notice'
  pages: number
  category: 'Crawlability' | 'Performance' | 'Content' | 'Links' | 'Markup'
}

export function siteAuditIssues(workspaceId: string): SiteAuditIssue[] {
  const rng = makeRng(seedFrom(`${workspaceId}:audit`))
  const rows: Omit<SiteAuditIssue, 'id' | 'pages'>[] = [
    { title: 'Pages returning 5xx', severity: 'critical', category: 'Crawlability' },
    { title: 'Missing canonical tags', severity: 'warning', category: 'Markup' },
    { title: 'Largest Contentful Paint above 2.5s', severity: 'critical', category: 'Performance' },
    { title: 'Duplicate title tags', severity: 'warning', category: 'Content' },
    { title: 'Orphaned pages with no internal links', severity: 'warning', category: 'Links' },
    { title: 'Images without descriptive alt text', severity: 'notice', category: 'Content' },
    { title: 'Redirect chains longer than two hops', severity: 'notice', category: 'Crawlability' },
  ]
  return rows.map((row, i) => ({
    ...row,
    id: `issue_${workspaceId}_${i}`,
    pages: Math.round(1 + rng() * 180),
  }))
}
