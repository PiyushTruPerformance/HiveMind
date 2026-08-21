'use client'

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserSearch,
  Users,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Panel } from '@/components/os/os-kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Donut, HorizontalBars, Legend } from '@/components/ui/charts'
import {
  EmptyState,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableShell,
} from '@/components/ui/data'
import { Field, Input, Select } from '@/components/ui/field'
import { Avatar, Progress, Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { cn } from '@/lib/utils/cn'
import { formatCurrency, formatNumber, formatRelative } from '@/lib/utils/format'
import { attendance, employees, payroll } from '@/lib/mock/data/hr'

import { hrErrorMessage } from './api/client'
import {
  useAllApplications,
  useClientMutations,
  useDashboardStats,
  useDeleteJob,
  useJobs,
} from './api/hooks'
import {
  UNASSIGNED_CLIENT_ID,
  toClientId,
  type ApplicationStatus,
  type ApplicationWithJob,
  type Job,
  type JobStatus,
} from './api/types'
import { ApplicationsTable } from './components/applications-table'
import { CandidateDrawer } from './components/candidate-drawer'
import { CandidateSearchDialog } from './components/candidate-search-dialog'
import { CvUploadDialog } from './components/cv-upload-dialog'
import { DemoModuleNotice } from './components/demo-notice'
import { JobWizard } from './components/job-wizard'
import { HrQueryBoundary, HrServiceError } from './components/service-state'
import { HrStatusBadge, aiScoreTone } from './components/status'

import type { WorkspaceViewProps } from '../types'

/**
 * HR OS — the CV Analyzer, running as a product of the platform.
 *
 * Recruitment (Overview, Jobs, Candidates, Pipeline, Settings) is served by
 * `services/hr-os`. People operations (Employees, Attendance, Payroll) are
 * still fixtures and say so. A HiveX *workspace* is a CV Analyzer *client*, so
 * every screen below is already scoped by the platform's workspace routing.
 */

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Jobs belonging to the client this workspace represents. */
function useClientJobs(workspaceId: string) {
  const query = useJobs()
  const clientId = toClientId(workspaceId)
  const jobs = useMemo(
    () => (query.data ?? []).filter((job) => job.client_id === clientId),
    [query.data, clientId],
  )
  return { ...query, jobs }
}

/**
 * Stats for the workspace.
 *
 * A real client uses the service's own aggregate. The synthetic "Unassigned"
 * workspace has no client_id to filter on, so its numbers are derived locally
 * rather than silently falling back to organization-wide totals.
 */
function useWorkspaceStats(workspaceId: string, jobs: Job[]) {
  const clientId = toClientId(workspaceId)
  const isUnassigned = clientId === null
  const remote = useDashboardStats(isUnassigned ? {} : { clientId })
  const all = useAllApplications(isUnassigned)

  return useMemo(() => {
    if (!isUnassigned) return remote

    const jobIds = new Set(jobs.map((job) => job.id))
    const mine = (all.data ?? []).filter((a) => jobIds.has(a.job_id))
    const count = (status: ApplicationStatus) =>
      mine.filter((a) => a.application_status === status).length

    return {
      ...all,
      data: all.data
        ? {
            total_jobs: jobs.length,
            open_jobs: jobs.filter((job) => job.status === 'OPEN').length,
            total_applications: mine.length,
            shortlisted: count('SHORTLISTED'),
            review: count('REVIEW'),
            rejected: count('REJECTED'),
            pending_processing: mine.filter((a) =>
              ['UPLOADED', 'PARSED', 'SCREENED'].includes(a.application_status),
            ).length,
            failed: mine.filter((a) =>
              [a.ocr_status, a.parsing_status, a.ai_status].includes('FAILED'),
            ).length,
          }
        : undefined,
    }
  }, [isUnassigned, remote, all, jobs])
}

const JOB_STATUS_TONE: Record<JobStatus, { tone: 'success' | 'warning' | 'neutral' | 'dead-end'; pending: boolean }> =
  {
    DRAFT: { tone: 'neutral', pending: true },
    OPEN: { tone: 'success', pending: false },
    PAUSED: { tone: 'warning', pending: false },
    CLOSED: { tone: 'dead-end', pending: false },
    ARCHIVED: { tone: 'dead-end', pending: false },
  }

/** Toolbar shared by the recruitment screens. */
function RecruitmentActions({ workspaceId, jobId }: { workspaceId: string; jobId?: string | null }) {
  const access = useAccess()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
        <Search className="size-3.5" />
        Search candidates
      </Button>
      {access.meetsRole('hr', 'editor') ? (
        <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="size-3.5" />
          Upload CVs
        </Button>
      ) : null}

      <CvUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId={workspaceId}
        defaultJobId={jobId}
      />
      <CandidateSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export function HROverview({ workspace }: WorkspaceViewProps) {
  const jobsQuery = useClientJobs(workspace.id)
  const statsQuery = useWorkspaceStats(workspace.id, jobsQuery.jobs)
  const stats = statsQuery.data

  const openJobs = jobsQuery.jobs.filter((job) => job.status === 'OPEN')

  if (jobsQuery.isError) {
    return <HrServiceError error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
  }

  const funnel = stats
    ? [
        { label: 'Processing', value: stats.pending_processing },
        { label: 'In review', value: stats.review },
        { label: 'Shortlisted', value: stats.shortlisted },
        { label: 'Rejected', value: stats.rejected },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <RecruitmentActions workspaceId={workspace.id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open roles"
          value={stats?.open_jobs ?? '—'}
          icon={Briefcase}
          hint={`${stats?.total_jobs ?? 0} total`}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Applications"
          value={stats ? formatNumber(stats.total_applications) : '—'}
          icon={Users}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Shortlisted"
          value={stats?.shortlisted ?? '—'}
          icon={CheckCircle2}
          hint={`${stats?.review ?? 0} still in review`}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Processing"
          value={stats?.pending_processing ?? '—'}
          icon={Clock}
          hint="Mid-pipeline right now"
          loading={statsQuery.isLoading}
        />
      </div>

      {/* The one card allowed to look different — and only when it has to.
          Carried over from the original stats bar. */}
      {stats && stats.failed > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border-2 border-destructive bg-destructive-soft/50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-display text-lg font-semibold tabular-nums text-destructive">
              {stats.failed} failed
            </p>
            <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
              A pipeline stage failed on these applications. They stay visible with a FAILED
              stage rather than dropping out of results — open one and use Retry.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Screening funnel" description="Applications by outcome for this client.">
          {funnel.some((f) => f.value > 0) ? (
            <HorizontalBars data={funnel} color="hsl(var(--dead-end))" valueFormatter={String} />
          ) : (
            <EmptyState compact title="No applications yet" />
          )}
        </Panel>

        <Panel title="Outcomes">
          {stats && stats.total_applications > 0 ? (
            <>
              <Donut
                data={[
                  { label: 'Shortlisted', value: stats.shortlisted },
                  { label: 'In review', value: stats.review },
                  { label: 'Rejected', value: stats.rejected },
                ]}
                centerValue={String(stats.total_applications)}
                centerLabel="applications"
                valueFormatter={String}
              />
              <div className="mt-3">
                <Legend
                  items={[
                    { label: 'Shortlisted', value: String(stats.shortlisted) },
                    { label: 'In review', value: String(stats.review) },
                    { label: 'Rejected', value: String(stats.rejected) },
                  ]}
                />
              </div>
            </>
          ) : (
            <EmptyState compact title="Nothing decided yet" />
          )}
        </Panel>
      </div>

      <Panel title="Open roles" bodyClassName="px-0 pb-0">
        {openJobs.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              compact
              icon={Briefcase}
              title="No open roles"
              description="A role must be OPEN before CVs can be uploaded to it."
            />
          </div>
        ) : (
          <TableShell className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <TR>
                  <TH>Role</TH>
                  <TH>Department</TH>
                  <TH>Location</TH>
                  <TH className="text-right">Openings</TH>
                  <TH>Requirements</TH>
                </TR>
              </THead>
              <TBody>
                {openJobs.map((job) => (
                  <TR key={job.id}>
                    <TD className="font-medium">{job.title}</TD>
                    <TD className="text-muted-foreground">{job.department ?? '—'}</TD>
                    <TD className="text-muted-foreground">{job.location ?? '—'}</TD>
                    <TD className="text-right tabular-nums">{job.openings ?? 1}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {(job.required_skills ?? []).slice(0, 3).map((skill) => (
                          <Badge key={skill} tone="neutral">
                            {skill}
                          </Badge>
                        ))}
                        {(job.required_skills ?? []).length > 3 ? (
                          <Badge tone="neutral" pending>
                            +{(job.required_skills ?? []).length - 3}
                          </Badge>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableShell>
        )}
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                        */
/* -------------------------------------------------------------------------- */

export function JobsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const access = useAccess()
  const jobsQuery = useClientJobs(workspace.id)
  const deleteJob = useDeleteJob()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<Job | undefined>(undefined)

  const canEdit = access.meetsRole('hr', 'editor')

  async function handleDelete(job: Job) {
    const ok = await confirm({
      title: `Delete “${job.title}”?`,
      description: 'Its applications and screening results go with it. This cannot be undone.',
      confirmLabel: 'Delete role',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await deleteJob.mutateAsync(job.id)
      toast.success('Role deleted')
    } catch (error) {
      toast.error('Could not delete the role', hrErrorMessage(error))
    }
  }

  if (jobsQuery.isError) {
    return <HrServiceError error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Requirements are extracted from the job description by AI, then reviewed before the
          role is created.
        </p>
        <div className="flex flex-wrap gap-2">
          <RecruitmentActions workspaceId={workspace.id} />
          {canEdit ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(undefined)
                setWizardOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              New job
            </Button>
          ) : null}
        </div>
      </div>

      {jobsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : jobsQuery.jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No roles for this client yet"
          description="Create a job, paste its description, and the AI extracts the requirements the ATS screens against."
          action={
            canEdit ? (
              <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
                <Plus className="size-3.5" />
                New job
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {jobsQuery.jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              canEdit={canEdit}
              onEdit={() => {
                setEditing(job)
                setWizardOpen(true)
              }}
              onDelete={() => void handleDelete(job)}
            />
          ))}
        </div>
      )}

      <JobWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        job={editing}
        workspaceId={workspace.id}
      />
    </div>
  )
}

function JobCard({
  job,
  canEdit,
  onEdit,
  onDelete,
}: {
  job: Job
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = JOB_STATUS_TONE[job.status]
  const skills = job.required_skills ?? []

  return (
    <div className="group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[14px] font-semibold">{job.title}</p>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {[job.department, job.location, job.work_mode].filter(Boolean).join(' · ') ||
              'No details set'}
          </p>
        </div>
        <Badge tone={meta.tone} pending={meta.pending} dot>
          {job.status}
        </Badge>
      </div>

      {job.jd_extraction_status === 'FAILED' ? (
        <p className="mt-2 flex items-start gap-1.5 text-2xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          JD extraction failed — edit the role to retry.
        </p>
      ) : null}

      {skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {skills.slice(0, 4).map((skill) => (
            <Badge key={skill} tone="neutral">
              {skill}
            </Badge>
          ))}
          {skills.length > 4 ? (
            <Tooltip content={skills.slice(4).join(', ')}>
              <Badge tone="neutral" pending>
                +{skills.length - 4}
              </Badge>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Openings</dt>
          <dd className="font-display text-base font-semibold tabular-nums">{job.openings ?? 1}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Experience</dt>
          <dd className="font-display text-base font-semibold tabular-nums">
            {job.experience_min ?? '—'}
            {job.experience_max ? `–${job.experience_max}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Salary</dt>
          <dd className="truncate font-display text-base font-semibold tabular-nums">
            {job.salary_min ? formatCurrency(job.salary_min) : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-[10px] text-muted-foreground">
          Created {formatRelative(job.created_at, DEMO_NOW_MS)}
        </span>
        {canEdit ? (
          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${job.title}`}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${job.title}`}
              className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Candidates                                                                  */
/* -------------------------------------------------------------------------- */

export function CandidatesView({ workspace }: WorkspaceViewProps) {
  const jobsQuery = useClientJobs(workspace.id)
  const [jobId, setJobId] = useState<string | null>(null)

  /* Default to the first OPEN role — the one CVs can actually be uploaded to. */
  const activeJobId =
    jobId ??
    jobsQuery.jobs.find((job) => job.status === 'OPEN')?.id ??
    jobsQuery.jobs[0]?.id ??
    null
  const activeJob = jobsQuery.jobs.find((job) => job.id === activeJobId)

  if (jobsQuery.isError) {
    return <HrServiceError error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
  }

  if (!jobsQuery.isLoading && jobsQuery.jobs.length === 0) {
    return (
      <EmptyState
        icon={UserSearch}
        title="No roles to screen against"
        description="Candidates are always attached to a role. Create one in Jobs first."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-72">
          <Field label="Role">
            {(props) => (
              <Select
                {...props}
                value={activeJobId ?? ''}
                onChange={(e) => setJobId(e.target.value)}
              >
                {jobsQuery.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.status}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecruitmentActions workspaceId={workspace.id} jobId={activeJobId} />
        </div>
      </div>

      {activeJobId && activeJob ? (
        <ApplicationsTable jobId={activeJobId} jobTitle={activeJob.title} />
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                    */
/* -------------------------------------------------------------------------- */

const PIPELINE_COLUMNS: { id: ApplicationStatus[]; label: string }[] = [
  { id: ['UPLOADED', 'PARSED'], label: 'Parsing' },
  { id: ['SCREENED', 'REVIEW'], label: 'Review' },
  { id: ['SHORTLISTED'], label: 'Shortlisted' },
  { id: ['INTERVIEW'], label: 'Interview' },
  { id: ['SELECTED', 'HIRED'], label: 'Offer' },
  { id: ['REJECTED', 'DUPLICATE'], label: 'Closed' },
]

export function PipelineView({ workspace }: WorkspaceViewProps) {
  const jobsQuery = useClientJobs(workspace.id)
  const applicationsQuery = useAllApplications()
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)

  const jobIds = useMemo(() => new Set(jobsQuery.jobs.map((job) => job.id)), [jobsQuery.jobs])
  const applications = useMemo(
    () => (applicationsQuery.data ?? []).filter((a) => jobIds.has(a.job_id)),
    [applicationsQuery.data, jobIds],
  )

  if (applicationsQuery.isError) {
    return (
      <HrServiceError error={applicationsQuery.error} onRetry={() => applicationsQuery.refetch()} />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Every application for this client, by stage. The AI score decides the outcome; a
          recruiter override is recorded as an override.
        </p>
        <RecruitmentActions workspaceId={workspace.id} />
      </div>

      {applicationsQuery.isLoading ? (
        <div className="flex gap-3">
          {PIPELINE_COLUMNS.map((c) => (
            <div key={c.label} className="h-56 w-64 shrink-0 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          title="Nothing in the pipeline"
          description="Upload CVs against an open role to start screening."
        />
      ) : (
        <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {PIPELINE_COLUMNS.map((column) => {
            const items = applications.filter((a) => column.id.includes(a.application_status))
            return (
              <section key={column.label} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {column.label}
                  </h3>
                  <span className="text-2xs tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <div className="min-h-24 space-y-2 rounded-lg bg-surface-sunken/70 p-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-2xs text-muted-foreground">Empty</p>
                  ) : (
                    items.map((application) => (
                      <PipelineCard
                        key={application.id}
                        application={application}
                        onOpen={() => setOpenApplicationId(application.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <CandidateDrawer
        applicationId={openApplicationId}
        onOpenChange={(open) => !open && setOpenApplicationId(null)}
      />
    </div>
  )
}

function PipelineCard({
  application,
  onOpen,
}: {
  application: ApplicationWithJob
  onOpen: () => void
}) {
  const failed = [application.ocr_status, application.parsing_status, application.ai_status].includes(
    'FAILED',
  )
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-md border bg-card p-3 text-left shadow-xs transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Avatar name={application.candidate.name ?? 'Unknown'} size="xs" />
        <span className="min-w-0 flex-1 truncate text-2xs font-medium">
          {application.candidate.name ?? 'Unknown'}
        </span>
        {failed ? (
          <Badge tone="destructive" dot className="px-1" />
        ) : (
          <span
            className={cn('text-[10px] font-medium tabular-nums', aiScoreTone(application.ai_score))}
          >
            {application.ai_score ?? '—'}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{application.job_title}</p>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* People operations — still fixtures, and labelled as such                    */
/* -------------------------------------------------------------------------- */

export function EmployeesView({ workspace }: WorkspaceViewProps) {
  const rows = employees(workspace.id)
  return (
    <div className="space-y-4">
      <DemoModuleNotice module="Employees" />
      <TableShell>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Role</TH>
              <TH>Department</TH>
              <TH>Location</TH>
              <TH>Manager</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((employee) => (
              <TR key={employee.id}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={employee.name} size="sm" />
                    <span className="font-medium">{employee.name}</span>
                  </div>
                </TD>
                <TD>{employee.role}</TD>
                <TD className="text-muted-foreground">{employee.department}</TD>
                <TD className="text-muted-foreground">{employee.location}</TD>
                <TD className="text-muted-foreground">{employee.manager}</TD>
                <TD>
                  <Badge
                    tone={
                      employee.status === 'active'
                        ? 'success'
                        : employee.status === 'onboarding'
                          ? 'info'
                          : 'warning'
                    }
                    dot
                    className="capitalize"
                  >
                    {employee.status}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>
    </div>
  )
}

export function AttendanceView({ workspace }: WorkspaceViewProps) {
  const rows = attendance(workspace.id)
  const present = rows.filter((r) => r.status === 'In office' || r.status === 'Remote').length

  return (
    <div className="space-y-5">
      <DemoModuleNotice module="Attendance" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Present today" value={`${present}/${rows.length}`} icon={CalendarClock} />
        <StatCard label="On PTO" value={rows.filter((r) => r.status === 'PTO').length} />
        <StatCard
          label="Hours logged"
          value={formatNumber(
            rows.reduce((a, r) => a + r.hours, 0),
            1,
          )}
        />
      </div>

      <Panel title="Today" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Status</TH>
                <TH>Checked in</TH>
                <TH className="text-right">Hours</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.name}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        row.status === 'In office'
                          ? 'success'
                          : row.status === 'Remote'
                            ? 'info'
                            : row.status === 'PTO'
                              ? 'dead-end'
                              : 'warning'
                      }
                      dot
                    >
                      {row.status}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">{row.checkedInAt ?? '—'}</TD>
                  <TD className="text-right tabular-nums">{row.hours || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      </Panel>
    </div>
  )
}

export function PayrollView({ workspace }: WorkspaceViewProps) {
  const rows = payroll(workspace.id)
  const current = rows[0]

  return (
    <div className="space-y-5">
      <DemoModuleNotice module="Payroll" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Current cycle" value={current.cycle} icon={Wallet} />
        <StatCard label="Gross" value={formatCurrency(current.gross)} />
        <StatCard label="Employer cost" value={formatCurrency(current.employerCost)} />
      </div>

      <Panel title="Payroll history" bodyClassName="px-0 pb-0">
        <TableShell className="rounded-none border-0 shadow-none">
          <Table>
            <THead>
              <TR>
                <TH>Cycle</TH>
                <TH className="text-right">Headcount</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Employer cost</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.cycle}>
                  <TD className="font-medium">{row.cycle}</TD>
                  <TD className="text-right tabular-nums">{row.headcount}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(row.gross)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(row.employerCost)}</TD>
                  <TD>
                    <Badge
                      tone={
                        row.status === 'paid' ? 'success' : row.status === 'approved' ? 'info' : 'neutral'
                      }
                      pending={row.status === 'draft'}
                      dot
                      className="capitalize"
                    >
                      {row.status}
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
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export function HRSettingsView({ workspace }: WorkspaceViewProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const access = useAccess()
  const { reloadWorkspaces } = usePlatform()
  const clients = useClientMutations()
  const jobsQuery = useClientJobs(workspace.id)

  const [name, setName] = useState(workspace.name)
  const isUnassigned = workspace.id === UNASSIGNED_CLIENT_ID
  const readOnly = !access.meetsRole('hr', 'team_lead') || isUnassigned

  async function handleRename() {
    try {
      await clients.rename.mutateAsync({ clientId: workspace.id, name: name.trim() })
      await reloadWorkspaces('hr')
      toast.success('Client renamed')
    } catch (error) {
      toast.error('Could not rename the client', hrErrorMessage(error))
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete “${workspace.name}”?`,
      description:
        'Its roles are not deleted — they become Unassigned and stay reachable in that workspace.',
      confirmLabel: 'Delete client',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await clients.remove.mutateAsync(workspace.id)
      await reloadWorkspaces('hr')
      toast.success('Client deleted', 'Its roles moved to Unassigned.')
    } catch (error) {
      toast.error('Could not delete the client', hrErrorMessage(error))
    }
  }

  const openRatio =
    jobsQuery.jobs.length === 0
      ? 0
      : (jobsQuery.jobs.filter((j) => j.status === 'OPEN').length / jobsQuery.jobs.length) * 100

  return (
    <div className="space-y-5">
      {isUnassigned ? (
        <div className="rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            Unassigned is a synthetic workspace holding roles with no client. It cannot be renamed
            or deleted — move a role to a client by editing it in Jobs.
          </p>
        </div>
      ) : null}

      <Panel title="Client" description="Clients are HR OS workspaces on this platform.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name">
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
              />
            )}
          </Field>
          <Field label="Roles" hint="Share of this client's roles that are currently open.">
            {() => (
              <div className="space-y-1.5 pt-2">
                <Progress value={openRatio} tone={openRatio >= 60 ? 'success' : 'warning'} />
                <p className="text-2xs text-muted-foreground">
                  {jobsQuery.jobs.filter((j) => j.status === 'OPEN').length} open of{' '}
                  {jobsQuery.jobs.length}
                </p>
              </div>
            )}
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            disabled={readOnly || !name.trim() || name.trim() === workspace.name}
            loading={clients.rename.isPending}
            onClick={() => void handleRename()}
          >
            Save changes
          </Button>
        </div>
      </Panel>

      {!isUnassigned && access.meetsRole('hr', 'admin') ? (
        <Panel title="Danger zone" description="Deleting a client never deletes its roles.">
          <Button
            variant="outline"
            className="text-destructive"
            loading={clients.remove.isPending}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-3.5" />
            Delete client
          </Button>
        </Panel>
      ) : null}
    </div>
  )
}

export const hrViews = {
  '': HROverview,
  jobs: JobsView,
  candidates: CandidatesView,
  pipeline: PipelineView,
  employees: EmployeesView,
  attendance: AttendanceView,
  payroll: PayrollView,
  settings: HRSettingsView,
}
