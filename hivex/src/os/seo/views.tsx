'use client'

import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Link2,
  Mails,
  Plus,
  Search,
  Target,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Panel } from '@/components/os/os-kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AreaTrend, Donut, Legend } from '@/components/ui/charts'
import { EmptyState, StatCard, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Input } from '@/components/ui/field'
import { Progress, Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { cn } from '@/lib/utils/cn'
import { formatCompact, formatNumber, formatRelative } from '@/lib/utils/format'
import {
  backlinkSeries,
  campaigns,
  keywords,
  outreach,
  prospects,
  siteAuditIssues,
  visibilitySeries,
  type PipelineStage,
  type ProspectStatus,
} from '@/lib/mock/data/seo'

import type { WorkspaceViewProps } from '../types'

/**
 * SEO OS.
 *
 * Modelled on the AI Backlink Generator: Client → Campaign → Prospect site,
 * with an AI pipeline whose per-site stage is shown explicitly (queued,
 * scraping, scoring, ready, failed) rather than a site silently disappearing
 * when a stage fails.
 */

const STATUS_TONE: Record<ProspectStatus, { tone: 'neutral' | 'info' | 'warning' | 'success' | 'destructive' | 'dead-end'; pending: boolean }> = {
  discovered: { tone: 'neutral', pending: true },
  approved: { tone: 'info', pending: false },
  contacted: { tone: 'warning', pending: false },
  responded: { tone: 'info', pending: false },
  live: { tone: 'success', pending: false },
  rejected: { tone: 'dead-end', pending: false },
}

const STAGE_TONE: Record<PipelineStage, { tone: 'neutral' | 'info' | 'success' | 'destructive'; pending: boolean }> = {
  queued: { tone: 'neutral', pending: true },
  scraping: { tone: 'info', pending: true },
  scoring: { tone: 'info', pending: true },
  ready: { tone: 'success', pending: false },
  failed: { tone: 'destructive', pending: false },
}

function relevanceTone(score: number) {
  if (score >= 75) return 'text-success'
  if (score >= 50) return 'text-warning'
  return 'text-destructive'
}

/* -------------------------------------------------------------------------- */

export function SEOOverview({ workspace }: WorkspaceViewProps) {
  const list = prospects(workspace.id)
  const camps = campaigns(workspace.id)
  const emails = outreach(workspace.id)

  const live = list.filter((p) => p.status === 'live').length
  const ready = list.filter((p) => p.stage === 'ready').length
  const replied = emails.filter((e) => e.status === 'replied').length
  const avgRelevance = Math.round(
    list.filter((p) => p.relevance > 0).reduce((a, p) => a + p.relevance, 0) /
      Math.max(list.filter((p) => p.relevance > 0).length, 1),
  )

  const stageCounts = (['ready', 'scoring', 'scraping', 'queued', 'failed'] as PipelineStage[]).map(
    (stage) => ({ label: stage, value: list.filter((p) => p.stage === stage).length }),
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live backlinks" value={live} delta={14.2} icon={Link2} />
        <StatCard label="Avg. relevance" value={avgRelevance} delta={3.4} hint="AI score, 0-100" />
        <StatCard
          label="Reply rate"
          value={`${((replied / Math.max(emails.length, 1)) * 100).toFixed(1)}%`}
          delta={4.1}
          icon={Mails}
        />
        <StatCard label="Pipeline ready" value={`${ready}/${list.length}`} icon={Target} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Search visibility" description="Share of voice across the tracked keyword set.">
          <AreaTrend
            data={visibilitySeries(workspace.id)}
            color="hsl(var(--success))"
            valueFormatter={(v) => `${v.toFixed(0)}%`}
          />
        </Panel>
        <Panel title="AI pipeline" description="Where every prospect site currently sits.">
          <Donut
            data={stageCounts}
            centerValue={String(list.length)}
            centerLabel="sites"
            valueFormatter={(v) => String(v)}
          />
          <div className="mt-3">
            <Legend items={stageCounts.map((s) => ({ label: s.label, value: String(s.value) }))} />
          </div>
        </Panel>
      </div>

      <Panel title="Campaigns" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Goal</TH>
                <TH className="text-right">Sites</TH>
                <TH className="text-right">Ready</TH>
                <TH className="text-right">Live</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {camps.map((campaign) => (
                <TR key={campaign.id}>
                  <TD className="font-medium">{campaign.name}</TD>
                  <TD className="max-w-[20rem] truncate text-muted-foreground">{campaign.goal}</TD>
                  <TD className="text-right tabular-nums">{campaign.sites}</TD>
                  <TD className="text-right tabular-nums">{campaign.ready}</TD>
                  <TD className="text-right tabular-nums">{campaign.live}</TD>
                  <TD>
                    <Badge
                      tone={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : 'neutral'}
                      dot
                      className="capitalize"
                    >
                      {campaign.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function CampaignsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const list = campaigns(workspace.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Each campaign holds its own prospect list, blacklist and follow-up rules.
        </p>
        <Button variant="primary" size="sm" onClick={() => toast.info('Campaign builder queued')}>
          <Plus className="size-3.5" />
          New campaign
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((campaign) => {
          const readyRatio = (campaign.ready / Math.max(campaign.sites, 1)) * 100
          return (
            <div key={campaign.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[14px] font-semibold">{campaign.name}</p>
                <Badge
                  tone={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : 'neutral'}
                  dot
                  className="capitalize"
                >
                  {campaign.status}
                </Badge>
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{campaign.goal}</p>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-baseline justify-between text-2xs">
                  <span className="text-muted-foreground">Pipeline</span>
                  <span className="tabular-nums">
                    {campaign.ready} / {campaign.sites} ready
                  </span>
                </div>
                <Progress value={readyRatio} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Live links</dt>
                  <dd className="font-display text-lg font-semibold tabular-nums">{campaign.live}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</dt>
                  <dd className="mt-1 text-2xs text-muted-foreground">
                    {formatRelative(campaign.createdAt, DEMO_NOW_MS)}
                  </dd>
                </div>
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function ProspectsView({ workspace }: WorkspaceViewProps) {
  const all = prospects(workspace.id)
  const [query, setQuery] = useState('')
  const [minRelevance, setMinRelevance] = useState(0)

  const filtered = useMemo(
    () =>
      all.filter(
        (site) =>
          site.domain.toLowerCase().includes(query.trim().toLowerCase()) &&
          site.relevance >= minRelevance,
      ),
    [all, query, minRelevance],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search domains or scraped content…"
            aria-label="Search prospect sites"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-surface px-3 py-1.5">
          <label htmlFor="relevance" className="whitespace-nowrap text-2xs text-muted-foreground">
            Min relevance
          </label>
          <input
            id="relevance"
            type="range"
            min={0}
            max={100}
            step={5}
            value={minRelevance}
            onChange={(e) => setMinRelevance(Number(e.target.value))}
            className="w-24 accent-[hsl(var(--primary))]"
          />
          <span className="w-6 text-2xs tabular-nums">{minRelevance}</span>
        </div>
        <Button variant="outline" size="sm">
          <Download className="size-3.5" />
          Export
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No prospect sites match"
          description="Lower the relevance threshold or clear the search."
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TR>
                <TH>Domain</TH>
                <TH>Classification</TH>
                <TH className="text-right">Relevance</TH>
                <TH className="text-right">OPR</TH>
                <TH>Pipeline</TH>
                <TH>Status</TH>
                <TH>Contact</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((site) => {
                const status = STATUS_TONE[site.status]
                const stage = STAGE_TONE[site.stage]
                return (
                  <TR key={site.id}>
                    <TD className="font-medium">{site.domain}</TD>
                    <TD className="text-muted-foreground">{site.classification}</TD>
                    <TD className="text-right">
                      {site.relevance > 0 ? (
                        <Tooltip content={site.reason}>
                          <span
                            className={cn(
                              'cursor-help font-medium tabular-nums underline decoration-dotted underline-offset-2',
                              relevanceTone(site.relevance),
                            )}
                          >
                            {site.relevance}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{site.authority}</TD>
                    <TD>
                      <Badge tone={stage.tone} pending={stage.pending} dot className="capitalize">
                        {site.stage}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={status.tone} pending={status.pending} dot className="capitalize">
                        {site.status}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">{site.contact ?? '—'}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableShell>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const OUTREACH_TONE = {
  sent: 'neutral',
  opened: 'info',
  replied: 'success',
  bounced: 'destructive',
} as const

export function OutreachView({ workspace }: WorkspaceViewProps) {
  const records = outreach(workspace.id)
  const counts = (['sent', 'opened', 'replied', 'bounced'] as const).map((status) => ({
    status,
    value: records.filter((r) => r.status === status).length,
  }))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        {counts.map(({ status, value }) => (
          <StatCard key={status} label={status} value={value} />
        ))}
      </div>

      <Panel title="Outreach records" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Recipient</TH>
                <TH>Domain</TH>
                <TH>Template</TH>
                <TH className="text-right">Follow-ups</TH>
                <TH>Sent</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {records.map((record) => (
                <TR key={record.id}>
                  <TD className="font-medium">{record.recipient}</TD>
                  <TD className="text-muted-foreground">{record.domain}</TD>
                  <TD>{record.template}</TD>
                  <TD className="text-right tabular-nums">{record.followUps}</TD>
                  <TD className="text-muted-foreground">
                    {formatRelative(record.sentAt, DEMO_NOW_MS)}
                  </TD>
                  <TD>
                    <Badge tone={OUTREACH_TONE[record.status]} dot className="capitalize">
                      {record.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function KeywordsView({ workspace }: WorkspaceViewProps) {
  const rows = keywords(workspace.id)
  const top3 = rows.filter((r) => r.position <= 3).length
  const top10 = rows.filter((r) => r.position <= 10).length

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tracked keywords" value={rows.length} />
        <StatCard label="Top 3" value={top3} delta={22.5} />
        <StatCard label="Top 10" value={top10} delta={9.1} />
      </div>

      <Panel title="Tracked keywords" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Keyword</TH>
                <TH>Landing page</TH>
                <TH className="text-right">Volume</TH>
                <TH className="text-right">Difficulty</TH>
                <TH className="text-right">Position</TH>
                <TH className="text-right">Change</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.keyword}>
                  <TD className="font-medium">{row.keyword}</TD>
                  <TD className="font-mono text-2xs text-muted-foreground">{row.url}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(row.volume)}</TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{row.difficulty}</TD>
                  <TD className="text-right">
                    <span className={cn('tabular-nums', row.position <= 3 && 'font-medium text-success')}>
                      {row.position}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 text-2xs font-medium tabular-nums',
                        row.change < 0 ? 'text-success' : row.change > 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {row.change < 0 ? (
                        <ArrowUpRight className="size-3" />
                      ) : row.change > 0 ? (
                        <ArrowDownRight className="size-3" />
                      ) : null}
                      {Math.abs(row.change).toFixed(1)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function RankingsView({ workspace }: WorkspaceViewProps) {
  return (
    <div className="space-y-5">
      <Panel title="Backlinks acquired" description="Live links verified per day.">
        <AreaTrend
          data={backlinkSeries(workspace.id)}
          color="hsl(var(--dead-end))"
          valueFormatter={(v) => formatCompact(v)}
        />
      </Panel>
      <Panel title="Visibility index" description="Weighted position across tracked keywords.">
        <AreaTrend
          data={visibilitySeries(workspace.id)}
          color="hsl(var(--success))"
          valueFormatter={(v) => `${v.toFixed(0)}%`}
        />
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const SEVERITY_TONE = {
  critical: 'destructive',
  warning: 'warning',
  notice: 'neutral',
} as const

export function SiteAuditView({ workspace }: WorkspaceViewProps) {
  const issues = siteAuditIssues(workspace.id)
  const critical = issues.filter((i) => i.severity === 'critical').length

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Issues found" value={issues.length} />
        <StatCard label="Critical" value={critical} hint="Fix these first" />
        <StatCard
          label="Pages affected"
          value={formatNumber(issues.reduce((a, i) => a + i.pages, 0))}
        />
      </div>

      <Panel title="Findings" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Issue</TH>
                <TH>Category</TH>
                <TH className="text-right">Pages</TH>
                <TH>Severity</TH>
              </TR>
            </THead>
            <TBody>
              {issues.map((issue) => (
                <TR key={issue.id}>
                  <TD className="font-medium">{issue.title}</TD>
                  <TD className="text-muted-foreground">{issue.category}</TD>
                  <TD className="text-right tabular-nums">{issue.pages}</TD>
                  <TD>
                    <Badge tone={SEVERITY_TONE[issue.severity]} dot className="capitalize">
                      {issue.severity}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function SEOSettingsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  return (
    <div className="space-y-5">
      <Panel title="Project" description="Target domain and niche used for AI relevance scoring.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium">Project name</span>
            <Input defaultValue={workspace.name} />
          </label>
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium">Target URL</span>
            <Input defaultValue={`https://${workspace.slug}.com`} />
          </label>
        </div>
      </Panel>

      <Panel title="Domain blacklist" description="Blocked permanently, auto-rejected on import.">
        <div className="flex flex-wrap gap-1.5">
          {['spamlinks.io', 'pbn-network.net', 'cheap-guest-posts.com'].map((domain) => (
            <Badge key={domain} tone="dead-end">
              {domain}
            </Badge>
          ))}
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => toast.success('Project settings saved')}>
          Save changes
        </Button>
      </div>
    </div>
  )
}

export const seoViews = {
  '': SEOOverview,
  campaigns: CampaignsView,
  prospects: ProspectsView,
  outreach: OutreachView,
  keywords: KeywordsView,
  rankings: RankingsView,
  audits: SiteAuditView,
  settings: SEOSettingsView,
}
