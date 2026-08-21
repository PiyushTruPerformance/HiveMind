import type { AssistantCitation, AssistantContext, OSId } from '@/platform/types'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { latency } from '../seed'

/**
 * Mock assistant service.
 *
 * Stands in for POST /api/v1/universal-chat/messages plus the MCP tool layer.
 * Two things here are architecture rather than decoration, because they are
 * what the real backend must also do:
 *
 *  1. The caller passes an `AssistantScope`. The service never infers what the
 *     user may read; it is told. Frontend scope is NOT security — the real
 *     enforcement is the MCP server resolving tenant identity from a token
 *     hash — but the contract is shaped so the same fields carry through.
 *  2. When a question reaches past the caller's scope the answer is trimmed and
 *     a `permissionNotice` is returned alongside it, rather than the request
 *     silently returning less than was asked for.
 */

export interface AssistantScope {
  /** OS products this user may read from. */
  accessibleOS: OSId[]
  /** Workspace ids the user may read from, keyed by OS. */
  accessibleWorkspaces: Partial<Record<OSId, string[]>>
  /** False when the plan does not include cross-product answers. */
  crossOSAllowed: boolean
}

export interface AssistantReply {
  content: string
  citations: AssistantCitation[]
  permissionNotice?: string
}

const OS_KEYWORDS: Record<OSId, string[]> = {
  reporting: ['traffic', 'sessions', 'ga4', 'analytics', 'ads', 'spend', 'roas', 'search console', 'clicks', 'impressions', 'conversion', 'report'],
  seo: ['backlink', 'link', 'keyword', 'ranking', 'outreach', 'prospect', 'serp', 'anchor', 'domain authority'],
  hr: ['candidate', 'cv', 'resume', 'hiring', 'job', 'shortlist', 'payroll', 'attendance', 'employee', 'interview'],
  finance: ['invoice', 'retainer', 'margin', 'revenue', 'expense', 'budget', 'profit'],
}

function mentionedOS(prompt: string): OSId[] {
  const lower = prompt.toLowerCase()
  return (Object.keys(OS_KEYWORDS) as OSId[]).filter((osId) =>
    OS_KEYWORDS[osId].some((kw) => lower.includes(kw)),
  )
}

/* -------------------------------------------------------------------------- */
/* Answer bank                                                                 */
/* -------------------------------------------------------------------------- */

interface Answer {
  match: RegExp
  build: (
    ctx: AssistantContext,
    scope: AssistantScope,
  ) => { content: string; citations: AssistantCitation[] }
}

/** Blocks in an answer are separated by a blank line, matching the renderer. */
const PARAGRAPH_BREAK = '\n\n'

/**
 * The scope label already carries the workspace name ("Reporting OS · Acme"),
 * so answers read it from there instead of re-resolving the workspace — which
 * would mean this service knowing where each product stores them.
 */
const workspaceName = (ctx: AssistantContext) => {
  if (ctx.kind !== 'workspace') return 'this organization'
  const [, name] = ctx.label.split(' · ')
  return name ?? 'this workspace'
}

const ANSWERS: Answer[] = [
  {
    match: /organic|traffic|sessions|visitors/i,
    build: (ctx) => ({
      content: `Organic search delivered **148,300 sessions** to ${workspaceName(ctx)} over the last 30 days — 31% of all traffic and up **11.4%** on the previous period.

Search Console attributes **62,900 clicks** to the same window at an average position of 8.6, so click-through is holding while impressions grow.

The growth is concentrated in category and guide pages rather than brand terms, which is the intended outcome of the current authority work.`,
      citations: [
        { source: 'GA4', detail: 'sessions by default channel group · last 30 days' },
        { source: 'Search Console', detail: 'clicks, impressions, position · last 30 days' },
      ],
    }),
  },
  {
    match: /spend|budget|roas|cost per|cpc|ads|paid/i,
    build: (ctx) => ({
      content: `Paid media for ${workspaceName(ctx)} spent **$84,200** in the last 30 days, down 3.1% while conversions rose 12.7% — efficiency is improving.

| Campaign | Spend | Conv. | ROAS |
| --- | --- | --- | --- |
| Performance Max — Retail | $31,400 | 2,180 | 4.62 |
| Non-brand — Category | $24,900 | 1,410 | 2.88 |
| Brand — Exact | $12,700 | 1,940 | 8.14 |
| Remarketing — Cart | $9,300 | 520 | 5.31 |

Non-brand is the weakest performer on return. It is also the only campaign whose CPC rose this month.`,
      citations: [
        { source: 'Google Ads', detail: 'campaign performance · last 30 days' },
        { source: 'GA4', detail: 'key events attributed to paid search' },
      ],
    }),
  },
  {
    match: /drop|down|decline|worse|risk|attention|anomal/i,
    build: () => ({
      content: `Two things are moving in the wrong direction.

**Coastline Legal** — cost per lead is up **24%** week over week and conversions are down 14%. Spend held flat, so this is a conversion-rate problem rather than a budget one. Non-brand search accounts for most of the loss.

**Meridian Health** — sessions are down 4.2% over 30 days. Local actions are still growing, so the decline is concentrated in informational content rather than the location pages.

Nothing else in your accessible workspaces is outside its normal range.`,
      citations: [
        { source: 'GA4', detail: '4 properties · 30-day comparison' },
        { source: 'Google Ads', detail: '3 accounts · cost per conversion' },
      ],
    }),
  },
  {
    match: /backlink|link|prospect|outreach|relevance/i,
    build: (ctx) => ({
      content: `${workspaceName(ctx)} has **184 live backlinks**, up 14.2% this quarter.

Of the 312 prospects processed, 71% completed the pipeline and reached a relevance score. The average score of approved sites is **78**, and reply rate on outreach sits at **21.8%** — roughly double the 11% you were seeing before the editorial template replaced the generic pitch.

Twelve sites are currently stuck in the scoring stage; all twelve share the same root cause, a scrape timeout on JavaScript-rendered pages.`,
      citations: [
        { source: 'Outreach records', detail: 'sent, opened, replied · last 90 days' },
        { source: 'Prospect pipeline', detail: 'stage and relevance distribution' },
      ],
    }),
  },
  {
    match: /keyword|ranking|position|serp/i,
    build: () => ({
      content: `**Nine keywords** moved into the top three this month, and average position across the tracked set improved from 14.2 to **11.8**.

The biggest movers are all commercial-intent guides: *waterproof hiking boots* (11 → 3), *lightweight backpacking tent* (18 → 6) and *winter layering guide* (24 → 9).

Two terms slipped: *best trail running shoes* fell four places after a competitor refreshed their comparison page.`,
      citations: [
        { source: 'Search Console', detail: 'query position · 30-day comparison' },
        { source: 'SEMrush', detail: 'tracked keyword set' },
      ],
    }),
  },
  {
    match: /candidate|cv|resume|shortlist|hiring|job|applicant/i,
    build: () => ({
      content: `Across the open roles you can access there are **23 shortlisted candidates** from 147 applications.

**Senior Performance Analyst** is the healthiest pipeline — 6 shortlisted from 41, with three candidates scoring 8 or above on demonstrated GA4 and attribution evidence.

**Paid Media Specialist** has had no new applications in 16 days and is currently paused.

Three applications failed AI matching on a provider rate limit and are sitting at PARSED; they need a retry rather than a decision.`,
      citations: [
        { source: 'Applications', detail: 'status and score distribution' },
        { source: 'Job requirements', detail: 'AI-extracted skill sets' },
      ],
    }),
  },
  {
    /* Composed per accessible product rather than written as one fixed block —
       an organization-wide summary must never narrate a product the caller
       cannot open. */
    match: /summar|important|overview|what.?s happening|across/i,
    build: (_ctx, scope) => {
      const sections: Record<OSId, { body: string; citation: AssistantCitation }> = {
        reporting: {
          body: '**Reporting OS** — Northwind Retail is healthy: sessions +8.4%, conversions +12.7%, spend −3.1%. Coastline Legal needs intervention, with cost per lead up 24%.',
          citation: { source: 'GA4', detail: '4 properties' },
        },
        seo: {
          body: '**SEO OS** — Lumen Studio is the standout: 97 live backlinks, +26.5% this quarter, with a 28.9% outreach reply rate.',
          citation: { source: 'Outreach records', detail: '3 projects' },
        },
        hr: {
          body: '**HR OS** — 6 roles open, 23 candidates shortlisted, average time from upload to screening decision down to 1.4 days.',
          citation: { source: 'Applications', detail: '2 teams' },
        },
        finance: {
          body: '**Finance OS** — not released yet, so nothing to report.',
          citation: { source: 'Invoices', detail: 'not available' },
        },
      }

      const included = scope.accessibleOS.filter((osId) => osId in sections)
      const bodies = included.map((osId) => sections[osId].body)

      return {
        content: [
          'Here is where your organization stands this week.',
          ...bodies,
          '**One thing to act on:** the Google Business Profile connection needs reauthorization. Location metrics have been stale for 9 days across two workspaces.',
        ].join(PARAGRAPH_BREAK),
        citations: included.map((osId) => sections[osId].citation),
      }
    },
  },
]

const FALLBACK = (ctx: AssistantContext) => ({
  content: `I can answer that from ${ctx.dataSources.length > 0 ? ctx.dataSources.join(', ') : 'the data connected to this scope'}.

This is the frontend foundation, so the response you are reading is generated locally rather than by the model backend. The contract is real though: the question, the active scope (**${ctx.label}**) and the permitted data sources are all passed together, which is exactly what the production assistant receives.

Try one of the suggested prompts to see a fully worked answer.`,
  citations: ctx.dataSources.slice(0, 3).map((source) => ({ source, detail: 'scoped to your access' })),
})

/* -------------------------------------------------------------------------- */

export const assistantService = {
  /**
   * Resolves a reply. The real implementation posts to the universal chat
   * endpoint; the streaming behaviour lives in the provider so both paths
   * render identically.
   */
  async respond(prompt: string, context: AssistantContext, scope: AssistantScope): Promise<AssistantReply> {
    await latency(520)

    const requested = mentionedOS(prompt)
    const outOfScope = requested.filter((osId) => !scope.accessibleOS.includes(osId))

    const isOrgWide = /summar|important|overview|what.?s happening|across/i.test(prompt)
    const unreachable = (Object.keys(OS_REGISTRY) as OSId[]).filter(
      (osId) => !scope.accessibleOS.includes(osId) && OS_REGISTRY[osId].status !== 'coming_soon',
    )

    let permissionNotice: string | undefined
    if (outOfScope.length > 0) {
      const names = outOfScope.map((id) => OS_REGISTRY[id].name).join(' and ')
      permissionNotice = `${names} was excluded from this answer — it is not part of your access.`
    } else if (context.kind === 'platform' && !scope.crossOSAllowed && scope.accessibleOS.length > 1) {
      permissionNotice =
        'Cross-product answers are a Gold plan capability. This reply covers Reporting OS only.'
    } else if (isOrgWide && context.kind === 'platform' && unreachable.length > 0) {
      const names = unreachable.map((id) => OS_REGISTRY[id].name).join(' and ')
      permissionNotice = `${names} is outside your access, so it is not covered above.`
    }

    const answer = ANSWERS.find((a) => a.match.test(prompt))
    const { content, citations } = answer ? answer.build(context, scope) : FALLBACK(context)

    return { content, citations, permissionNotice }
  },

  /** Title generation for a new thread — first clause of the question. */
  titleFor(prompt: string): string {
    const clean = prompt.trim().replace(/\s+/g, ' ')
    if (clean.length <= 48) return clean.replace(/\?$/, '')
    return `${clean.slice(0, 45).trimEnd()}…`
  },
}
