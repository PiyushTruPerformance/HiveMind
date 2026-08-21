import { buildSeries, daysAgo, daysAhead, deltaOf, makeRng, seedFrom, sumSeries, type SeriesPoint } from '../seed'

/**
 * Reporting OS fixtures.
 *
 * Shapes deliberately track the Reporting OS backend: GA4 / GSC / Ads period
 * reports, the `client_period_reports` rollup vocabulary, and the kanban sprint
 * and task model. Replacing these with `/api/v1/ga4-dashboards/{key}` and
 * friends is a change of data source, not of component code.
 */

export type PeriodKey = '7d' | '28d' | '90d'

export const PERIOD_OPTIONS: { key: PeriodKey; label: string; days: number }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '28d', label: 'Last 28 days', days: 28 },
  { key: '90d', label: 'Last 90 days', days: 90 },
]

export interface MetricSummary {
  id: string
  label: string
  value: number
  delta: number
  format: 'number' | 'currency' | 'percent' | 'duration'
  series: SeriesPoint[]
  hint?: string
}

const BASE_BY_WORKSPACE: Record<string, number> = {
  ws_northwind: 13_700,
  ws_meridian: 3_200,
  ws_lumen: 1_930,
  ws_coastline: 760,
}

export function analyticsSummary(workspaceId: string, period: PeriodKey): MetricSummary[] {
  const days = PERIOD_OPTIONS.find((p) => p.key === period)?.days ?? 28
  const base = BASE_BY_WORKSPACE[workspaceId] ?? 2_400

  const sessions = buildSeries({ key: `${workspaceId}:sessions:${period}`, days, base, trend: 0.22 })
  const users = buildSeries({ key: `${workspaceId}:users:${period}`, days, base: base * 0.72, trend: 0.18 })
  const conversions = buildSeries({
    key: `${workspaceId}:conv:${period}`,
    days,
    base: base * 0.015,
    trend: 0.3,
    noise: 0.22,
  })
  const engagement = buildSeries({
    key: `${workspaceId}:engage:${period}`,
    days,
    base: 61,
    trend: 0.04,
    weekly: 0.03,
    noise: 0.03,
    integer: false,
  })

  return [
    {
      id: 'sessions',
      label: 'Sessions',
      value: sumSeries(sessions),
      delta: deltaOf(sessions),
      format: 'number',
      series: sessions,
      hint: 'GA4 · all channels',
    },
    {
      id: 'users',
      label: 'Active users',
      value: sumSeries(users),
      delta: deltaOf(users),
      format: 'number',
      series: users,
      hint: 'GA4 · unique',
    },
    {
      id: 'conversions',
      label: 'Conversions',
      value: sumSeries(conversions),
      delta: deltaOf(conversions),
      format: 'number',
      series: conversions,
      hint: 'GA4 · key events',
    },
    {
      id: 'engagement',
      label: 'Engagement rate',
      value: Number((sumSeries(engagement) / engagement.length).toFixed(1)),
      delta: deltaOf(engagement),
      format: 'percent',
      series: engagement,
      hint: 'GA4 · engaged sessions',
    },
  ]
}

export function sessionsSeries(workspaceId: string, period: PeriodKey): SeriesPoint[] {
  const days = PERIOD_OPTIONS.find((p) => p.key === period)?.days ?? 28
  const base = BASE_BY_WORKSPACE[workspaceId] ?? 2_400
  return buildSeries({ key: `${workspaceId}:sessions:${period}`, days, base, trend: 0.22 })
}

export interface ChannelSlice {
  channel: string
  sessions: number
  conversions: number
  share: number
}

/** Base share per channel, so the mix reads like a real acquisition profile
 *  rather than a uniform random split. Jitter is applied on top. */
const CHANNELS: { name: string; weight: number }[] = [
  { name: 'Organic Search', weight: 0.34 },
  { name: 'Paid Search', weight: 0.24 },
  { name: 'Direct', weight: 0.17 },
  { name: 'Referral', weight: 0.11 },
  { name: 'Organic Social', weight: 0.09 },
  { name: 'Email', weight: 0.05 },
]

export function channelBreakdown(workspaceId: string, period: PeriodKey): ChannelSlice[] {
  const rng = makeRng(seedFrom(`${workspaceId}:channels:${period}`))
  const weights = CHANNELS.map((c) => c.weight * (0.82 + rng() * 0.36))
  const total = weights.reduce((a, b) => a + b, 0)
  const base = (BASE_BY_WORKSPACE[workspaceId] ?? 2_400) * (period === '7d' ? 7 : period === '28d' ? 28 : 90)

  return CHANNELS.map((channel, i) => {
    const share = weights[i] / total
    const sessions = Math.round(base * share)
    return {
      channel: channel.name,
      sessions,
      conversions: Math.round(sessions * (0.008 + rng() * 0.02)),
      share: Number((share * 100).toFixed(1)),
    }
  }).sort((a, b) => b.sessions - a.sessions)
}

export interface SearchQueryRow {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

const QUERY_POOL: Record<string, string[]> = {
  ws_northwind: [
    'northwind outdoor jackets',
    'best hiking boots 2026',
    'waterproof shell review',
    'northwind retail store hours',
    'insulated backpack sale',
    'trail running gear guide',
    'northwind returns policy',
    'winter layering system',
  ],
  ws_meridian: [
    'meridian health clinic',
    'walk in clinic portland',
    'family doctor near me',
    'meridian patient portal',
    'urgent care wait times',
    'annual physical booking',
    'pediatric clinic oregon',
    'telehealth appointment',
  ],
  ws_lumen: [
    'brand identity studio',
    'lumen studio portfolio',
    'design system consultancy',
    'packaging design agency',
    'motion branding examples',
    'studio rebrand case study',
    'creative direction services',
    'editorial layout inspiration',
  ],
  ws_coastline: [
    'personal injury lawyer',
    'coastline legal reviews',
    'free legal consultation',
    'employment law attorney',
    'car accident claim help',
    'wrongful termination advice',
    'estate planning solicitor',
    'no win no fee lawyer',
  ],
}

export function searchQueries(workspaceId: string, period: PeriodKey): SearchQueryRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:queries:${period}`))
  const pool = QUERY_POOL[workspaceId] ?? QUERY_POOL.ws_northwind
  const multiplier = period === '7d' ? 1 : period === '28d' ? 3.8 : 11.5

  return pool
    .map((query) => {
      const impressions = Math.round((900 + rng() * 14_000) * multiplier)
      const ctr = 1.4 + rng() * 9
      return {
        query,
        impressions,
        clicks: Math.round((impressions * ctr) / 100),
        ctr: Number(ctr.toFixed(2)),
        position: Number((1.4 + rng() * 22).toFixed(1)),
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
}

export function searchSummary(workspaceId: string, period: PeriodKey): MetricSummary[] {
  const days = PERIOD_OPTIONS.find((p) => p.key === period)?.days ?? 28
  const base = (BASE_BY_WORKSPACE[workspaceId] ?? 2_400) * 0.35
  const clicks = buildSeries({ key: `${workspaceId}:gscclicks:${period}`, days, base, trend: 0.16 })
  const impressions = buildSeries({
    key: `${workspaceId}:gscimpr:${period}`,
    days,
    base: base * 18,
    trend: 0.12,
  })
  const position = buildSeries({
    key: `${workspaceId}:gscpos:${period}`,
    days,
    base: 11.4,
    trend: -0.1,
    weekly: 0.02,
    noise: 0.05,
    integer: false,
  })
  const totalClicks = sumSeries(clicks)
  const totalImpr = sumSeries(impressions)

  return [
    { id: 'clicks', label: 'Clicks', value: totalClicks, delta: deltaOf(clicks), format: 'number', series: clicks, hint: 'Search Console' },
    { id: 'impressions', label: 'Impressions', value: totalImpr, delta: deltaOf(impressions), format: 'number', series: impressions, hint: 'Search Console' },
    {
      id: 'ctr',
      label: 'Average CTR',
      value: Number(((totalClicks / Math.max(totalImpr, 1)) * 100).toFixed(2)),
      delta: 4.2,
      format: 'percent',
      series: clicks,
      hint: 'Clicks ÷ impressions',
    },
    {
      id: 'position',
      label: 'Average position',
      value: Number((sumSeries(position) / position.length).toFixed(1)),
      delta: -6.1,
      format: 'number',
      series: position,
      hint: 'Lower is better',
    },
  ]
}

export interface AdsCampaignRow {
  id: string
  name: string
  status: 'enabled' | 'paused' | 'limited'
  cost: number
  clicks: number
  conversions: number
  cpc: number
  roas: number
}

const CAMPAIGN_POOL = [
  'Brand — Exact',
  'Non-brand — Category',
  'Performance Max — Retail',
  'Remarketing — Cart',
  'Competitor — Conquest',
  'Local — Store Visits',
]

export function adsCampaigns(workspaceId: string, period: PeriodKey): AdsCampaignRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:ads:${period}`))
  const multiplier = period === '7d' ? 1 : period === '28d' ? 4 : 12.5
  const statuses: AdsCampaignRow['status'][] = ['enabled', 'enabled', 'enabled', 'paused', 'limited']

  return CAMPAIGN_POOL.map((name, i) => {
    const cost = Math.round((1_400 + rng() * 9_800) * multiplier)
    const cpc = Number((0.7 + rng() * 4.2).toFixed(2))
    const clicks = Math.round(cost / cpc)
    const conversions = Math.round(clicks * (0.012 + rng() * 0.05))
    return {
      id: `cmp_${i}`,
      name,
      status: statuses[i % statuses.length],
      cost,
      clicks,
      conversions,
      cpc,
      roas: Number((1.1 + rng() * 5.4).toFixed(2)),
    }
  })
}

export function adsSummary(workspaceId: string, period: PeriodKey): MetricSummary[] {
  const days = PERIOD_OPTIONS.find((p) => p.key === period)?.days ?? 28
  const base = (BASE_BY_WORKSPACE[workspaceId] ?? 2_400) * 0.22
  const cost = buildSeries({ key: `${workspaceId}:cost:${period}`, days, base: base * 1.4, trend: 0.08 })
  const conv = buildSeries({ key: `${workspaceId}:adsconv:${period}`, days, base: base * 0.03, trend: 0.24, noise: 0.2 })
  const roas = buildSeries({
    key: `${workspaceId}:roas:${period}`,
    days,
    base: 3.4,
    trend: 0.06,
    weekly: 0.04,
    noise: 0.09,
    integer: false,
  })

  return [
    { id: 'cost', label: 'Ad spend', value: sumSeries(cost), delta: deltaOf(cost), format: 'currency', series: cost, hint: 'Google Ads' },
    { id: 'adsconv', label: 'Conversions', value: sumSeries(conv), delta: deltaOf(conv), format: 'number', series: conv, hint: 'Google Ads' },
    {
      id: 'cpa',
      label: 'Cost per conversion',
      value: Math.round(sumSeries(cost) / Math.max(sumSeries(conv), 1)),
      delta: -8.4,
      format: 'currency',
      series: cost,
      hint: 'Spend ÷ conversions',
    },
    {
      id: 'roas',
      label: 'ROAS',
      value: Number((sumSeries(roas) / roas.length).toFixed(2)),
      delta: deltaOf(roas),
      format: 'number',
      series: roas,
      hint: 'Return on ad spend',
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* Period reports — mirrors client_period_reports                              */
/* -------------------------------------------------------------------------- */

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface PeriodReport {
  id: string
  periodType: PeriodType
  periodStart: string
  status: 'ready' | 'generating' | 'scheduled' | 'failed'
  sources: string[]
  sessions: number
  clicks: number
  spend: number
  generatedAt?: string
  recipients: number
}

export function periodReports(workspaceId: string): PeriodReport[] {
  const rng = makeRng(seedFrom(`${workspaceId}:reports`))
  const rows: PeriodReport[] = [
    { periodType: 'monthly', periodStart: daysAgo(21), status: 'ready', offset: 0 },
    { periodType: 'weekly', periodStart: daysAgo(7), status: 'ready', offset: 1 },
    { periodType: 'weekly', periodStart: daysAgo(14), status: 'ready', offset: 2 },
    { periodType: 'daily', periodStart: daysAgo(1), status: 'ready', offset: 3 },
    { periodType: 'quarterly', periodStart: daysAgo(52), status: 'ready', offset: 4 },
    { periodType: 'monthly', periodStart: daysAgo(0), status: 'generating', offset: 5 },
    { periodType: 'weekly', periodStart: daysAhead(2), status: 'scheduled', offset: 6 },
    { periodType: 'daily', periodStart: daysAgo(3), status: 'failed', offset: 7 },
  ].map(({ periodType, periodStart, status, offset }) => ({
    id: `rep_${workspaceId}_${offset}`,
    periodType: periodType as PeriodType,
    periodStart,
    status: status as PeriodReport['status'],
    sources: ['GA4', 'Search Console', 'Google Ads'].slice(0, 2 + Math.round(rng())),
    sessions: Math.round(8_000 + rng() * 240_000),
    clicks: Math.round(2_000 + rng() * 60_000),
    spend: Math.round(1_200 + rng() * 48_000),
    generatedAt: status === 'ready' ? periodStart : undefined,
    recipients: Math.round(1 + rng() * 8),
  }))
  return rows
}

/* -------------------------------------------------------------------------- */
/* Decks                                                                       */
/* -------------------------------------------------------------------------- */

export interface Deck {
  id: string
  title: string
  kind: 'QBR' | 'Monthly' | 'Pitch' | 'Audit readout'
  slides: number
  status: 'draft' | 'ready' | 'sent'
  updatedAt: string
  owner: string
}

export function decks(workspaceId: string): Deck[] {
  const rng = makeRng(seedFrom(`${workspaceId}:decks`))
  const kinds: Deck['kind'][] = ['QBR', 'Monthly', 'Pitch', 'Audit readout']
  const owners = ['Alex Mercer', 'Priya Raghunathan', 'Dmitri Volkov', 'Marco Bianchi']
  const statuses: Deck['status'][] = ['ready', 'sent', 'draft', 'ready', 'sent']

  return Array.from({ length: 5 }, (_, i) => ({
    id: `deck_${workspaceId}_${i}`,
    title: [
      'Q3 Business Review',
      'August performance summary',
      'Paid media expansion proposal',
      'Technical audit readout',
      'July performance summary',
    ][i],
    kind: kinds[i % kinds.length],
    slides: 12 + Math.round(rng() * 22),
    status: statuses[i],
    updatedAt: daysAgo(Math.round(rng() * 26)),
    owner: owners[Math.floor(rng() * owners.length)],
  }))
}

/* -------------------------------------------------------------------------- */
/* Audits                                                                      */
/* -------------------------------------------------------------------------- */

export interface AuditRow {
  id: string
  title: string
  score: number
  stage: 'queued' | 'crawling' | 'analysing' | 'complete'
  findings: { critical: number; warning: number; passed: number }
  ranAt: string
}

export function audits(workspaceId: string): AuditRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:audits`))
  const stages: AuditRow['stage'][] = ['complete', 'complete', 'analysing', 'queued']
  return Array.from({ length: 4 }, (_, i) => ({
    id: `aud_${workspaceId}_${i}`,
    title: ['Full site audit', 'Conversion path review', 'Core Web Vitals sweep', 'Tracking integrity check'][i],
    score: Math.round(52 + rng() * 44),
    stage: stages[i],
    findings: {
      critical: Math.round(rng() * 7),
      warning: Math.round(4 + rng() * 22),
      passed: Math.round(40 + rng() * 90),
    },
    ranAt: daysAgo(Math.round(rng() * 40)),
  }))
}

/* -------------------------------------------------------------------------- */
/* Kanban — mirrors kanban_sprints / kanban_tasks                              */
/* -------------------------------------------------------------------------- */

export type TaskStatus = 'TODO' | 'WORKING' | 'BLOCKED' | 'COMPLETED'

export interface KanbanTask {
  id: string
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee: string
  dueAt: string
  channel?: string
  comments: number
}

export interface Sprint {
  id: string
  title: string
  startsAt: string
  endsAt: string
  tasks: KanbanTask[]
}

const TASK_TITLES = [
  'Rebuild conversion event mapping in GA4',
  'Draft August performance narrative',
  'Investigate 14% drop in branded impressions',
  'Add Business Profile locations to weekly rollup',
  'Refresh Performance Max asset group',
  'QA the new dashboard filters',
  'Send Q3 review deck to stakeholders',
  'Fix UTM tagging on email campaign',
  'Reconcile Ads conversions vs GA4 key events',
  'Schedule quarterly data hygiene sweep',
  'Prepare landing page test brief',
  'Review Search Console coverage errors',
]

export function sprints(workspaceId: string): Sprint[] {
  const rng = makeRng(seedFrom(`${workspaceId}:kanban`))
  const owners = ['Alex Mercer', 'Priya Raghunathan', 'Dmitri Volkov', 'Marco Bianchi', 'Nadia Okonkwo']
  /* Weighted so a live board reads like work in progress: mostly done or
     moving, with a single blocker rather than a third of the sprint stuck. */
  const statuses: TaskStatus[] = [
    'COMPLETED',
    'COMPLETED',
    'COMPLETED',
    'WORKING',
    'WORKING',
    'TODO',
    'TODO',
    'BLOCKED',
  ]
  const priorities: KanbanTask['priority'][] = ['low', 'medium', 'high', 'urgent']

  const build = (sprintIdx: number, title: string, count: number, start: number, end: number): Sprint => ({
    id: `spr_${workspaceId}_${sprintIdx}`,
    title,
    startsAt: daysAgo(start),
    endsAt: end < 0 ? daysAhead(-end) : daysAgo(end),
    tasks: Array.from({ length: count }, (_, i) => ({
      id: `tsk_${workspaceId}_${sprintIdx}_${i}`,
      title: TASK_TITLES[(sprintIdx * 5 + i) % TASK_TITLES.length],
      // Cycled rather than sampled, so every column on the board is populated.
      status: statuses[(sprintIdx * 3 + i) % statuses.length],
      priority: priorities[Math.floor(rng() * priorities.length)],
      assignee: owners[Math.floor(rng() * owners.length)],
      dueAt: daysAhead(Math.round(rng() * 12) - 3),
      channel: rng() > 0.6 ? '#client-updates' : undefined,
      comments: Math.round(rng() * 6),
    })),
  })

  return [
    build(0, 'Sprint 14 — Current', 9, 6, -8),
    build(1, 'Sprint 13', 7, 20, 6),
  ]
}

export const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'TODO', label: 'To do' },
  { id: 'WORKING', label: 'In progress' },
  { id: 'BLOCKED', label: 'Blocked' },
  { id: 'COMPLETED', label: 'Done' },
]
