'use client'

import { Download, LayoutGrid, List, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { EmptyState, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { cn } from '@/lib/utils/cn'

import { hrErrorMessage } from '../api/client'
import { useApplications, useBulkDeleteApplications, useBulkOverrideStatus } from '../api/hooks'
import type { Application, ApplicationStatus } from '../api/types'
import { downloadCsv, toCsv } from '../lib/csv'
import { SORT_LABELS, sortApplications, type SortOption } from '../lib/sort'
import { CandidateDrawer } from './candidate-drawer'
import { HrQueryBoundary } from './service-state'
import { HrStatusBadge, PipelineGlyph, aiScoreTone } from './status'

/**
 * Applications for one job — the CV Analyzer's main table.
 *
 * Ported onto the platform's table primitives. Bulk actions, CSV export, the
 * list/grid switch and the mobile card fallback all survive; polling moved into
 * the query layer (see api/hooks.ts).
 */

const BULK_STATUS_OPTIONS: { status: ApplicationStatus; label: string }[] = [
  { status: 'SHORTLISTED', label: 'Shortlist' },
  { status: 'REVIEW', label: 'Move to review' },
  { status: 'REJECTED', label: 'Reject' },
  { status: 'INTERVIEW', label: 'Move to interview' },
  { status: 'SELECTED', label: 'Select' },
  { status: 'HIRED', label: 'Mark hired' },
]

const CSV_HEADERS = [
  'Candidate',
  'Email',
  'Phone',
  'Status',
  'ATS Score',
  'AI Score',
  'Matched Skills',
  'Missing Skills',
  'AI Reason',
  'Failure Reason',
  'Overridden From',
  'Overridden At',
  'Created At',
]

function toCsvRow(application: Application): (string | number | null)[] {
  return [
    application.candidate.name,
    application.candidate.email,
    application.candidate.phone,
    application.application_status,
    application.ats_score,
    application.ai_score,
    (application.matched_skills ?? []).join('; '),
    (application.missing_skills ?? []).join('; '),
    application.ai_reason,
    application.failure_reason,
    application.status_before_override,
    application.overridden_at,
    application.created_at,
  ]
}

const PAGE_SIZE = 20

export function ApplicationsTable({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const access = useAccess()
  const query = useApplications(jobId)

  const bulkStatusMutation = useBulkOverrideStatus()
  const bulkDeleteMutation = useBulkDeleteApplications()

  const [view, setView] = useState<'list' | 'grid'>('list')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>('SHORTLISTED')
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)

  const canDecide = access.meetsRole('hr', 'editor')

  const applications = useMemo(() => query.data ?? [], [query.data])
  const sorted = useMemo(() => sortApplications(applications, sortBy), [applications, sortBy])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const allPagedSelected = paged.length > 0 && paged.every((a) => selectedIds.has(a.id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allPagedSelected) return new Set([...prev].filter((id) => !paged.some((a) => a.id === id)))
      const next = new Set(prev)
      paged.forEach((a) => next.add(a.id))
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExport() {
    const csv = toCsv(CSV_HEADERS, sorted.map(toCsvRow))
    const slug = jobTitle.toLowerCase().replace(/\s+/g, '-')
    downloadCsv(`candidates-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  async function handleBulkApply() {
    const label = BULK_STATUS_OPTIONS.find((o) => o.status === bulkStatus)?.label ?? bulkStatus
    const count = selectedIds.size
    const ok = await confirm({
      title: `${label} ${count} candidate${count === 1 ? '' : 's'}?`,
      description: 'Each of them will be emailed about this status change.',
      confirmLabel: label,
      tone: bulkStatus === 'REJECTED' ? 'destructive' : 'default',
    })
    if (!ok) return
    try {
      await bulkStatusMutation.mutateAsync({ ids: [...selectedIds], status: bulkStatus })
      toast.success(`Updated ${count} candidate${count === 1 ? '' : 's'}`, 'Emails sent.')
      setSelectedIds(new Set())
    } catch (error) {
      toast.error('Bulk update failed', hrErrorMessage(error))
    }
  }

  async function handleBulkDelete() {
    const count = selectedIds.size
    const ok = await confirm({
      title: `Delete ${count} application${count === 1 ? '' : 's'}?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await bulkDeleteMutation.mutateAsync([...selectedIds])
      toast.success(`Deleted ${count} application${count === 1 ? '' : 's'}`)
      setSelectedIds(new Set())
    } catch (error) {
      toast.error('Bulk delete failed', hrErrorMessage(error))
    }
  }

  return (
    <div className="space-y-3">
      <HrQueryBoundary query={query}>
        {(data) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">
                {data.length} application{data.length === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-44">
                  <Select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as SortOption)
                      setPage(0)
                    }}
                    aria-label="Sort candidates"
                  >
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={data.length === 0}
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
                <Button
                  variant={view === 'list' ? 'subtle' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('list')}
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                >
                  <List />
                </Button>
                <Button
                  variant={view === 'grid' ? 'subtle' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                >
                  <LayoutGrid />
                </Button>
              </div>
            </div>

            {selectedIds.size > 0 && canDecide ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface-sunken/70 px-3 py-2">
                <span className="text-[13px] font-medium">{selectedIds.size} selected</span>
                <div className="w-48">
                  <Select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value as ApplicationStatus)}
                    aria-label="Bulk action"
                  >
                    {BULK_STATUS_OPTIONS.map(({ status, label }) => (
                      <option key={status} value={status}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleBulkApply()}
                  loading={bulkStatusMutation.isPending}
                >
                  Apply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void handleBulkDelete()}
                  loading={bulkDeleteMutation.isPending}
                >
                  {!bulkDeleteMutation.isPending ? <Trash2 className="size-3.5" /> : null}
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            ) : null}

            {data.length === 0 ? (
              <EmptyState
                title="No applications yet for this role"
                description="Upload CVs and each one runs through OCR, parsing, ATS screening and AI matching."
              />
            ) : view === 'list' ? (
              <>
                {/* Below sm a six-column table forces horizontal scroll regardless,
                    so the list view falls back to the same cards as grid view. */}
                <div className="hidden sm:block">
                  <TableShell>
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-9 pl-3">
                            <input
                              type="checkbox"
                              checked={allPagedSelected}
                              onChange={toggleSelectAll}
                              aria-label="Select all on this page"
                              className="size-3.5 accent-[hsl(var(--primary))]"
                            />
                          </TH>
                          <TH>Candidate</TH>
                          <TH>Status</TH>
                          <TH>Pipeline</TH>
                          <TH className="text-right">ATS</TH>
                          <TH className="pr-3 text-right">AI</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {paged.map((application) => (
                          <TR
                            key={application.id}
                            className="cursor-pointer"
                            onClick={() => setOpenApplicationId(application.id)}
                          >
                            <TD className="pl-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(application.id)}
                                onChange={() => toggleSelect(application.id)}
                                aria-label={`Select ${application.candidate.name ?? 'candidate'}`}
                                className="size-3.5 accent-[hsl(var(--primary))]"
                              />
                            </TD>
                            <TD>
                              <p className="font-medium">
                                {application.candidate.name ?? 'Unknown'}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {application.candidate.email ?? '—'}
                              </p>
                            </TD>
                            <TD>
                              <HrStatusBadge status={application.application_status} />
                            </TD>
                            <TD>
                              <PipelineGlyph
                                ocrStatus={application.ocr_status}
                                parsingStatus={application.parsing_status}
                                aiStatus={application.ai_status}
                              />
                            </TD>
                            <TD className="text-right tabular-nums text-muted-foreground">
                              {application.ats_score ?? '—'}
                            </TD>
                            <TD className="pr-3 text-right">
                              <span
                                className={cn(
                                  'font-medium tabular-nums',
                                  aiScoreTone(application.ai_score),
                                )}
                              >
                                {application.ai_score ?? '—'}
                              </span>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableShell>
                </div>
                <div className="grid gap-3 sm:hidden">
                  {paged.map((application) => (
                    <ApplicationCard
                      key={application.id}
                      application={application}
                      onOpen={() => setOpenApplicationId(application.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paged.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    onOpen={() => setOpenApplicationId(application.id)}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(p - 1, 0))}
                >
                  Previous
                </Button>
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {safePage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </HrQueryBoundary>

      <CandidateDrawer
        applicationId={openApplicationId}
        onOpenChange={(open) => !open && setOpenApplicationId(null)}
      />
    </div>
  )
}

function ApplicationCard({
  application,
  onOpen,
}: {
  application: Application
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-border-strong hover:shadow-md"
    >
      <div>
        <p className="text-[13px] font-medium">{application.candidate.name ?? 'Unknown'}</p>
        <p className="text-2xs text-muted-foreground">{application.candidate.email ?? '—'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <HrStatusBadge status={application.application_status} />
        <PipelineGlyph
          ocrStatus={application.ocr_status}
          parsingStatus={application.parsing_status}
          aiStatus={application.ai_status}
        />
        {application.ai_score !== null ? (
          <span className={cn('text-2xs font-medium tabular-nums', aiScoreTone(application.ai_score))}>
            AI {application.ai_score}/10
          </span>
        ) : null}
      </div>
      {application.ai_reason ? (
        <p className="line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
          {application.ai_reason}
        </p>
      ) : null}
    </button>
  )
}
