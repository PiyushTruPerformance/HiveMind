'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  FileBarChart,
  Kanban as KanbanIcon,
  MessageSquare,
  Plus,
  Presentation,
  RefreshCw,
  Send,
  Settings2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { StatusPill } from '@/components/integrations/status-pill'
import { MetricRow, Panel, PeriodSelector, formatMetric } from '@/components/os/os-kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AreaTrend, Donut, HorizontalBars, Legend } from '@/components/ui/charts'
import { Delta, EmptyState, StatCard, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Avatar, Progress, Separator, Tooltip } from '@/components/ui/misc'
import { Field, Input, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { cn } from '@/lib/utils/cn'
import { formatCompact, formatCurrency, formatDate, formatNumber, formatRelative } from '@/lib/utils/format'
import { getIntegration } from '@/platform/config/integrations'
import {
  TASK_COLUMNS,
  adsCampaigns,
  adsSummary,
  analyticsSummary,
  audits,
  channelBreakdown,
  decks,
  periodReports,
  searchQueries,
  searchSummary,
  sessionsSeries,
  sprints,
  type PeriodKey,
  type TaskStatus,
} from '@/lib/mock/data/reporting'

import type { WorkspaceViewProps } from '../types'

/**
 * Reporting OS.
 *
 * The most complete of the three products, because the Reporting OS
 * architecture is the platform's primary reference. Shapes here mirror its real
 * data model: GA4 / GSC / Ads period reports, `client_period_reports` rollups,
 * generated decks, client audits and the kanban sprint board.
 */

/* -------------------------------------------------------------------------- */
/* Command centre                                                              */
/* -------------------------------------------------------------------------- */

export function CommandCentre({ workspace, os }: WorkspaceViewProps) {
  const [period, setPeriod] = useState<PeriodKey>('28d')
  const metrics = analyticsSummary(workspace.id, period)
  const channels = channelBreakdown(workspace.id, period)
  const currentSprint = sprints(workspace.id)[0]
  const reports = periodReports(workspace.id)
  const { connectionFor } = usePlatform()

  const completed = currentSprint.tasks.filter((t) => t.status === 'COMPLETED').length
  const blocked = currentSprint.tasks.filter((t) => t.status === 'BLOCKED').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <SyncButton />
      </div>

      <MetricRow metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title="Sessions"
          description="Solid line is the selected period, dashed is the comparison."
        >
          <AreaTrend data={metrics[0].series} color="hsl(var(--info))" />
        </Panel>

        <Panel title="Channel mix" description="Sessions by default channel group.">
          <Donut
            data={channels.map((c) => ({ label: c.channel, value: c.sessions }))}
            centerValue={formatCompact(channels.reduce((a, c) => a + c.sessions, 0))}
            centerLabel="sessions"
          />
          <div className="mt-3">
            <Legend
              items={channels.slice(0, 4).map((c) => ({
                label: c.channel,
                value: `${c.share}%`,
              }))}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Current sprint"
          description={currentSprint.title}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/os/${os.id}/w/${workspace.id}/kanban`}>Open board</Link>
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl font-semibold tabular-nums">
                {completed}/{currentSprint.tasks.length}
              </span>
              <span className="text-2xs text-muted-foreground">tasks done</span>
            </div>
            <Progress value={(completed / currentSprint.tasks.length) * 100} tone="success" />
            {blocked > 0 ? (
              <p className="flex items-center gap-1.5 text-2xs text-warning">
                <AlertTriangle className="size-3" />
                {blocked} blocked
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Latest report"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/os/${os.id}/w/${workspace.id}/reports`}>All reports</Link>
            </Button>
          }
        >
          {reports[0] ? (
            <div className="space-y-2">
              <p className="text-[13px] font-medium capitalize">
                {reports[0].periodType} · {formatDate(reports[0].periodStart)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {reports[0].sources.map((source) => (
                  <Badge key={source} tone="neutral">
                    {source}
                  </Badge>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">
                Delivered to {reports[0].recipients} recipients
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Data freshness">
          <div className="space-y-2">
            {workspace.connectedIntegrations.slice(0, 4).map((id) => {
              const integration = getIntegration(id)
              if (!integration) return null
              const connection = connectionFor(id)
              return (
                <div key={id} className="flex items-center gap-2">
                  <IntegrationIcon integration={integration} size="sm" className="!size-6 !text-[9px]" />
                  <span className="min-w-0 flex-1 truncate text-2xs">{integration.name}</span>
                  {connection?.lastSyncAt ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(connection.lastSyncAt, DEMO_NOW_MS)}
                    </span>
                  ) : (
                    <StatusPill status={connection?.status ?? 'not_connected'} />
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SyncButton() {
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)

  return (
    <Button
      variant="outline"
      size="sm"
      loading={syncing}
      onClick={() => {
        setSyncing(true)
        setTimeout(() => {
          setSyncing(false)
          toast.success('Sync complete', '90 days refreshed across GA4, Search Console and Ads.')
        }, 1_600)
      }}
    >
      {!syncing ? <RefreshCw className="size-3.5" /> : null}
      Sync data
    </Button>
  )
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

export function AnalyticsView({ workspace }: WorkspaceViewProps) {
  const [period, setPeriod] = useState<PeriodKey>('28d')
  const metrics = analyticsSummary(workspace.id, period)
  const channels = channelBreakdown(workspace.id, period)
  const series = sessionsSeries(workspace.id, period)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Badge tone="neutral" dot>
          GA4 property {workspace.id === 'ws_northwind' ? '318294771' : '—'}
        </Badge>
      </div>

      <MetricRow metrics={metrics} />

      <Panel title="Traffic over time">
        <AreaTrend data={series} color="hsl(var(--info))" height={280} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Channels by sessions">
          <HorizontalBars
            data={channels.map((c) => ({ label: c.channel, value: c.sessions }))}
            color="hsl(var(--info))"
          />
        </Panel>

        <Panel title="Channel performance" bodyClassName="px-0 pb-0">
          <TableShell className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <TR>
                  <TH>Channel</TH>
                  <TH className="text-right">Sessions</TH>
                  <TH className="text-right">Conv.</TH>
                  <TH className="text-right">Share</TH>
                </TR>
              </THead>
              <TBody>
                {channels.map((channel) => (
                  <TR key={channel.channel}>
                    <TD className="font-medium">{channel.channel}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(channel.sessions)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(channel.conversions)}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">
                      {channel.share}%
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableShell>
        </Panel>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export function SearchView({ workspace }: WorkspaceViewProps) {
  const [period, setPeriod] = useState<PeriodKey>('28d')
  const metrics = searchSummary(workspace.id, period)
  const queries = searchQueries(workspace.id, period)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Button variant="outline" size="sm">
          <Download className="size-3.5" />
          Export
        </Button>
      </div>

      <MetricRow metrics={metrics} />

      <Panel title="Clicks and impressions">
        <AreaTrend data={metrics[0].series} color="hsl(var(--success))" height={260} />
      </Panel>

      <Panel title="Top queries" description="Search Console, last period." bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Query</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">Impressions</TH>
                <TH className="text-right">CTR</TH>
                <TH className="text-right">Position</TH>
              </TR>
            </THead>
            <TBody>
              {queries.map((row) => (
                <TR key={row.query}>
                  <TD className="max-w-[18rem] truncate font-medium">{row.query}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(row.clicks)}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(row.impressions)}</TD>
                  <TD className="text-right tabular-nums">{row.ctr}%</TD>
                  <TD className="text-right tabular-nums">
                    <span className={cn(row.position <= 3 && 'font-medium text-success')}>
                      {row.position}
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
/* Paid media                                                                  */
/* -------------------------------------------------------------------------- */

const CAMPAIGN_TONE = {
  enabled: 'success',
  paused: 'neutral',
  limited: 'warning',
} as const

export function AdsView({ workspace }: WorkspaceViewProps) {
  const [period, setPeriod] = useState<PeriodKey>('28d')
  const metrics = adsSummary(workspace.id, period)
  const campaigns = adsCampaigns(workspace.id, period)
  const totalSpend = campaigns.reduce((a, c) => a + c.cost, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Badge tone="neutral" dot>
          {campaigns.filter((c) => c.status === 'enabled').length} active campaigns
        </Badge>
      </div>

      <MetricRow metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Spend over time">
          <AreaTrend
            data={metrics[0].series}
            color="hsl(var(--warning))"
            valueFormatter={(v) => `$${formatCompact(v)}`}
          />
        </Panel>
        <Panel title="Spend by campaign">
          <Donut
            data={campaigns.map((c) => ({ label: c.name, value: c.cost }))}
            centerValue={formatCurrency(totalSpend)}
            centerLabel="total"
            valueFormatter={(v) => formatCurrency(v)}
          />
        </Panel>
      </div>

      <Panel title="Campaigns" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH className="text-right">Spend</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">CPC</TH>
                <TH className="text-right">Conv.</TH>
                <TH className="text-right">ROAS</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((campaign) => (
                <TR key={campaign.id}>
                  <TD className="font-medium">{campaign.name}</TD>
                  <TD>
                    <Badge tone={CAMPAIGN_TONE[campaign.status]} dot className="capitalize">
                      {campaign.status}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{formatCurrency(campaign.cost)}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(campaign.clicks)}</TD>
                  <TD className="text-right tabular-nums">${campaign.cpc.toFixed(2)}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(campaign.conversions)}</TD>
                  <TD className="text-right tabular-nums">
                    <span className={cn(campaign.roas >= 4 && 'font-medium text-success')}>
                      {campaign.roas.toFixed(2)}×
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
/* Period reports                                                              */
/* -------------------------------------------------------------------------- */

const REPORT_TONE = {
  ready: { tone: 'success', pending: false },
  generating: { tone: 'info', pending: true },
  scheduled: { tone: 'neutral', pending: true },
  failed: { tone: 'destructive', pending: false },
} as const

export function ReportsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const reports = periodReports(workspace.id)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Ready to send"
          value={reports.filter((r) => r.status === 'ready').length}
          icon={FileBarChart}
        />
        <StatCard label="Scheduled" value={reports.filter((r) => r.status === 'scheduled').length} />
        <StatCard
          label="Failed"
          value={reports.filter((r) => r.status === 'failed').length}
          hint="Needs a retry"
        />
      </div>

      <Panel
        title="Period reports"
        description="Rollups are rebuilt in place until the period closes."
        action={
          <Button variant="outline" size="sm" onClick={() => toast.info('Report queued')}>
            <Plus className="size-3.5" />
            Generate
          </Button>
        }
        bodyClassName="px-0 pb-0"
      >
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Starts</TH>
                <TH>Sources</TH>
                <TH className="text-right">Sessions</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">Spend</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {reports.map((report) => {
                const meta = REPORT_TONE[report.status]
                return (
                  <TR key={report.id}>
                    <TD className="font-medium capitalize">{report.periodType}</TD>
                    <TD className="text-muted-foreground">{formatDate(report.periodStart)}</TD>
                    <TD>
                      <div className="flex gap-1">
                        {report.sources.map((source) => (
                          <Badge key={source} tone="neutral">
                            {source}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">{formatCompact(report.sessions)}</TD>
                    <TD className="text-right tabular-nums">{formatCompact(report.clicks)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(report.spend)}</TD>
                    <TD>
                      <Badge tone={meta.tone} pending={meta.pending} dot className="capitalize">
                        {report.status}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          toast.info(
                            report.status === 'failed' ? 'Retry queued' : 'Report sent',
                            `${report.periodType} report for ${workspace.name}.`,
                          )
                        }
                      >
                        {report.status === 'failed' ? (
                          <RefreshCw className="size-3" />
                        ) : (
                          <Send className="size-3" />
                        )}
                        {report.status === 'failed' ? 'Retry' : 'Send'}
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Decks                                                                       */
/* -------------------------------------------------------------------------- */

export function DecksView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const list = decks(workspace.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Presentations generated from this {`workspace`}&apos;s live data.
        </p>
        <Button variant="primary" size="sm" onClick={() => toast.info('Deck generation queued')}>
          <Plus className="size-3.5" />
          New deck
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((deck) => (
          <div
            key={deck.id}
            className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-border-strong hover:shadow-md"
          >
            <div className="relative flex aspect-[16/9] items-center justify-center border-b bg-surface-sunken">
              <Presentation className="size-6 text-muted-foreground/50" aria-hidden />
              <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {deck.slides} slides
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium leading-snug">{deck.title}</p>
                <Badge
                  tone={deck.status === 'sent' ? 'success' : deck.status === 'ready' ? 'info' : 'neutral'}
                  pending={deck.status === 'draft'}
                  className="shrink-0 capitalize"
                >
                  {deck.status}
                </Badge>
              </div>
              <p className="mt-1 text-2xs text-muted-foreground">
                {deck.kind} · {deck.owner}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                <span className="text-[10px] text-muted-foreground">
                  {formatRelative(deck.updatedAt, DEMO_NOW_MS)}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs" onClick={() => toast.info('Export started')}>
                    <Download className="size-3" />
                    PPTX
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Audits                                                                      */
/* -------------------------------------------------------------------------- */

export function AuditsView({ workspace }: WorkspaceViewProps) {
  const rows = audits(workspace.id)

  return (
    <div className="space-y-4">
      {rows.map((audit) => (
        <div key={audit.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ClipboardCheck className="size-4" />
              </span>
              <div>
                <p className="text-[14px] font-medium">{audit.title}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  Last run {formatRelative(audit.ranAt, DEMO_NOW_MS)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {audit.stage === 'complete' ? (
                <div className="text-right">
                  <p className="font-display text-2xl font-semibold tabular-nums">{audit.score}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">score</p>
                </div>
              ) : (
                <Badge tone="info" pending dot className="capitalize">
                  {audit.stage}
                </Badge>
              )}
            </div>
          </div>

          {audit.stage === 'complete' ? (
            <>
              <Separator className="my-3" />
              <div className="flex flex-wrap items-center gap-4">
                <FindingCount label="Critical" value={audit.findings.critical} tone="destructive" />
                <FindingCount label="Warnings" value={audit.findings.warning} tone="warning" />
                <FindingCount label="Passed" value={audit.findings.passed} tone="success" />
                <Button variant="ghost" size="sm" className="ml-auto">
                  View findings
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function FindingCount({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'destructive' | 'warning' | 'success'
}) {
  const colors = {
    destructive: 'text-destructive',
    warning: 'text-warning',
    success: 'text-success',
  }
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('font-display text-lg font-semibold tabular-nums', colors[tone])}>
        {value}
      </span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Kanban                                                                      */
/* -------------------------------------------------------------------------- */

const PRIORITY_TONE = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
} as const

export function KanbanView({ workspace }: WorkspaceViewProps) {
  const all = sprints(workspace.id)
  const [sprintId, setSprintId] = useState(all[0]?.id)
  const sprint = all.find((s) => s.id === sprintId) ?? all[0]

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, typeof sprint.tasks> = {
      TODO: [],
      WORKING: [],
      BLOCKED: [],
      COMPLETED: [],
    }
    sprint.tasks.forEach((task) => map[task.status].push(task))
    return map
  }, [sprint])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KanbanIcon className="size-4 text-muted-foreground" aria-hidden />
          <div className="w-56">
            <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)} aria-label="Sprint">
              {all.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <span className="text-2xs text-muted-foreground">
          {formatDate(sprint.startsAt)} – {formatDate(sprint.endsAt)}
        </span>
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {TASK_COLUMNS.map((column) => (
          <div key={column.id} className="w-[17rem] shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {column.label}
              </span>
              <span className="text-2xs tabular-nums text-muted-foreground">
                {byStatus[column.id].length}
              </span>
            </div>
            <div className="min-h-24 space-y-2 rounded-lg bg-surface-sunken/70 p-2">
              {byStatus[column.id].length === 0 ? (
                <p className="px-2 py-6 text-center text-2xs text-muted-foreground">Nothing here</p>
              ) : (
                byStatus[column.id].map((task) => (
                  <article
                    key={task.id}
                    className="cursor-grab rounded-md border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing"
                  >
                    <p className="text-2xs font-medium leading-snug">{task.title}</p>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[task.priority]} dot className="capitalize">
                        {task.priority}
                      </Badge>
                      {task.channel ? (
                        <Badge tone="neutral" pending>
                          {task.channel}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <Tooltip content={task.assignee}>
                        <span>
                          <Avatar name={task.assignee} size="xs" />
                        </span>
                      </Tooltip>
                      <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {task.comments > 0 ? (
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="size-2.5" />
                            {task.comments}
                          </span>
                        ) : null}
                        {formatDate(task.dueAt, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Workspace settings                                                          */
/* -------------------------------------------------------------------------- */

export function WorkspaceSettingsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const access = useAccess()
  const { connectionFor } = usePlatform()
  const readOnly = !access.can('workspace:edit')

  return (
    <div className="space-y-5">
      {readOnly ? (
        <div className="rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
          <p className="text-2xs text-muted-foreground">
            Your role can view these settings but not change them.
          </p>
        </div>
      ) : null}

      <Panel title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            {(props) => <Input {...props} defaultValue={workspace.name} disabled={readOnly} />}
          </Field>
          <Field label="Slug" hint="Used in URLs and exports.">
            {(props) => <Input {...props} defaultValue={workspace.slug} disabled={readOnly} />}
          </Field>
        </div>
      </Panel>

      <Panel
        title="Connector mapping"
        description="Which property or account each data source reads for this workspace."
      >
        <div className="space-y-3">
          {workspace.connectedIntegrations.map((id) => {
            const integration = getIntegration(id)
            if (!integration) return null
            const connection = connectionFor(id)
            const resource = connection?.selectedResources[0]
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5"
              >
                <IntegrationIcon integration={integration} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{integration.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {resource ? `${resource.name} · ${resource.id}` : 'No resource mapped'}
                  </p>
                </div>
                <StatusPill status={connection?.status ?? 'not_connected'} />
                <Button variant="ghost" size="xs" disabled={readOnly}>
                  <Settings2 className="size-3" />
                  Change
                </Button>
              </div>
            )
          })}
          {workspace.connectedIntegrations.length === 0 ? (
            <EmptyState compact title="No data sources mapped" />
          ) : null}
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" disabled={readOnly} onClick={() => toast.success('Settings saved')}>
          Save changes
        </Button>
      </div>
    </div>
  )
}

/** Re-exported so the section registry stays a plain lookup table. */
export const reportingViews = {
  '': CommandCentre,
  dashboard: AnalyticsView,
  search: SearchView,
  ads: AdsView,
  reports: ReportsView,
  decks: DecksView,
  audits: AuditsView,
  kanban: KanbanView,
  settings: WorkspaceSettingsView,
}

export { formatMetric }
