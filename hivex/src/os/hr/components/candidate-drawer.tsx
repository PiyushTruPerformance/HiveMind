'use client'

import { FileText, Mail, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/field'
import { Separator, Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/format'

import { hrApi, hrErrorMessage } from '../api/client'
import {
  useApplication,
  useDeleteApplication,
  useNoteMutations,
  useOverrideStatus,
  useResendEmail,
  useRetryApplication,
} from '../api/hooks'
import { hasFailedStage, type ApplicationStatus } from '../api/types'
import { HrServiceError } from './service-state'
import { HrStatusBadge, aiScoreTone } from './status'

/**
 * Candidate detail, ported from the CV Analyzer's drawer.
 *
 * The three things it exists to make obvious are preserved exactly: which
 * pipeline stage failed (so Retry is actionable), that the AI score — not the
 * ATS score — decided the outcome, and that a recruiter override is recorded as
 * an override rather than silently replacing the pipeline's own decision.
 */

const DECISION_OPTIONS: { status: ApplicationStatus; label: string }[] = [
  { status: 'SHORTLISTED', label: 'Shortlist' },
  { status: 'REVIEW', label: 'Move to review' },
  { status: 'REJECTED', label: 'Reject' },
]

/** Later stages — only ever reached by recruiter override, never by the pipeline. */
const PROGRESS_OPTIONS: { status: ApplicationStatus; label: string }[] = [
  { status: 'INTERVIEW', label: 'Move to interview' },
  { status: 'SELECTED', label: 'Select' },
  { status: 'HIRED', label: 'Mark hired' },
]

export function CandidateDrawer({
  applicationId,
  onOpenChange,
}: {
  applicationId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const query = useApplication(applicationId)
  const application = query.data

  const override = useOverrideStatus()
  const retry = useRetryApplication()
  const resend = useResendEmail()
  const remove = useDeleteApplication()
  const notes = useNoteMutations(applicationId)

  const [openingResume, setOpeningResume] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  async function handleOverride(status: ApplicationStatus) {
    if (!applicationId) return
    const label =
      [...DECISION_OPTIONS, ...PROGRESS_OPTIONS].find((o) => o.status === status)?.label ?? status
    const ok = await confirm({
      title: `${label} this candidate?`,
      description: 'They will be emailed about this status change.',
      confirmLabel: label,
      tone: status === 'REJECTED' ? 'destructive' : 'default',
    })
    if (!ok) return
    try {
      await override.mutateAsync({ applicationId, status })
      toast.success('Status updated', 'The candidate has been notified by email.')
    } catch (error) {
      toast.error('Could not update status', hrErrorMessage(error))
    }
  }

  async function handleRetry() {
    if (!applicationId) return
    try {
      await retry.mutateAsync(applicationId)
      // The AI step backs off and retries internally across ~14s, so the result
      // is not ready when this returns. useApplication polls while any stage is
      // PROCESSING, which covers the wait without a hand-rolled poll loop.
      toast.info(
        'Retrying',
        'This can take up to 30 seconds — the AI step backs off and retries on its own.',
      )
    } catch (error) {
      toast.error('Could not retry', hrErrorMessage(error))
    }
  }

  async function handleResend() {
    if (!applicationId) return
    try {
      const updated = await resend.mutateAsync(applicationId)
      if (updated.email_status === 'SENT') toast.success('Email sent')
      else toast.error('Email still failed to send', 'See the failure reason below.')
    } catch (error) {
      toast.error('Could not resend', hrErrorMessage(error))
    }
  }

  async function handleDelete() {
    if (!applicationId) return
    const ok = await confirm({
      title: 'Delete this application?',
      description: 'The candidate record and its screening results are removed permanently.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(applicationId)
      toast.success('Application deleted')
      onOpenChange(false)
    } catch (error) {
      toast.error('Could not delete', hrErrorMessage(error))
    }
  }

  async function handleViewResume() {
    if (!applicationId) return
    // Open the tab synchronously with the click. Popup blockers drop a
    // window.open() that happens after an await, even when the same click
    // started the fetch — the original app hit this for real.
    const tab = window.open('', '_blank')
    setOpeningResume(true)
    try {
      const blob = await hrApi.getResumeBlob(applicationId)
      if (tab) tab.location.href = URL.createObjectURL(blob)
    } catch (error) {
      tab?.close()
      toast.error('Could not open the resume', hrErrorMessage(error))
    } finally {
      setOpeningResume(false)
    }
  }

  async function handleDeleteNote(noteId: string) {
    const ok = await confirm({
      title: 'Delete this note?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await notes.remove.mutateAsync(noteId)
    } catch (error) {
      toast.error('Could not delete the note', hrErrorMessage(error))
    }
  }

  return (
    <Dialog open={applicationId !== null} onOpenChange={onOpenChange}>
      <DialogContent width="lg" className="max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{application?.candidate.name ?? 'Candidate'}</DialogTitle>
          <DialogDescription>
            {application
              ? [application.candidate.email, application.candidate.phone]
                  .filter(Boolean)
                  .join(' · ') || 'No contact details extracted'
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        {query.isError ? (
          <HrServiceError error={query.error} onRetry={() => query.refetch()} />
        ) : query.isLoading || !application ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <HrStatusBadge status={application.application_status} />
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => void handleViewResume()}
                loading={openingResume}
              >
                {!openingResume ? <FileText className="size-3.5" /> : null}
                View resume
              </Button>
            </div>

            {application.status_before_override ? (
              <p className="text-2xs text-muted-foreground">
                Manually overridden from{' '}
                <strong className="text-foreground">{application.status_before_override}</strong>
                {application.overridden_at
                  ? ` on ${formatDateTime(application.overridden_at)}`
                  : ''}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <OverrideGroup
                label="Recruiter override — decision"
                options={DECISION_OPTIONS}
                current={application.application_status}
                pending={override.isPending}
                onSelect={handleOverride}
              />
              <OverrideGroup
                label="Hiring progress"
                options={PROGRESS_OPTIONS}
                current={application.application_status}
                pending={override.isPending}
                onSelect={handleOverride}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-4">
              <StageCell label="OCR" status={application.ocr_status} />
              <StageCell label="Parsing" status={application.parsing_status} />
              <StageCell label="AI matching" status={application.ai_status} />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</p>
                <div className="mt-1">
                  <HrStatusBadge status={application.email_status} />
                </div>
                {application.email_status === 'FAILED' ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="mt-1"
                    onClick={() => void handleResend()}
                    loading={resend.isPending}
                  >
                    {!resend.isPending ? <Mail className="size-3" /> : null}
                    Resend
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  ATS score — keyword pre-filter
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {application.ats_score ?? '—'}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  AI score — decides the outcome
                </p>
                <p
                  className={cn(
                    'mt-1 font-display text-2xl font-semibold tabular-nums',
                    aiScoreTone(application.ai_score),
                  )}
                >
                  {application.ai_score ?? '—'}
                  <span className="text-sm font-normal text-muted-foreground">/10</span>
                </p>
              </div>
            </div>

            <SkillList
              label="Matched skills"
              skills={application.matched_skills}
              className="bg-success-soft text-success"
            />
            <SkillList
              label="Missing skills"
              skills={application.missing_skills}
              className="bg-destructive-soft text-destructive"
            />

            {application.ai_reason ? (
              <section>
                <p className="mb-1 text-2xs font-medium text-muted-foreground">Decision reason</p>
                <p className="text-[13px] leading-relaxed">{application.ai_reason}</p>
              </section>
            ) : null}

            {application.failure_reason ? (
              <section className="rounded-md border border-destructive/30 bg-destructive-soft/60 p-3">
                <p className="mb-1 text-2xs font-medium text-destructive">Failure reason</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-destructive/90">
                  {application.failure_reason}
                </p>
                {hasFailedStage(application) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleRetry()}
                    loading={retry.isPending}
                  >
                    {!retry.isPending ? <RotateCcw className="size-3.5" /> : null}
                    Retry
                  </Button>
                ) : null}
              </section>
            ) : null}

            {application.ocr_text ? (
              <details className="rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-2xs font-medium text-muted-foreground">
                  OCR output
                </summary>
                <pre className="scrollbar-thin max-h-56 overflow-y-auto whitespace-pre-wrap border-t bg-muted px-3 py-2 text-[11px] leading-relaxed">
                  {application.ocr_text}
                </pre>
              </details>
            ) : null}

            <Separator />

            <section>
              <p className="mb-2 text-2xs font-medium text-muted-foreground">
                Notes — your own commentary, separate from the AI reasoning above
              </p>

              {application.notes.length > 0 ? (
                <ul className="mb-3 space-y-2">
                  {application.notes.map((note) =>
                    editingNoteId === note.id ? (
                      <li key={note.id} className="space-y-2 rounded-md bg-muted p-2.5">
                        <Textarea
                          rows={2}
                          autoFocus
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            loading={notes.update.isPending}
                            disabled={!editingNoteText.trim()}
                            onClick={async () => {
                              try {
                                await notes.update.mutateAsync({
                                  noteId: note.id,
                                  text: editingNoteText.trim(),
                                })
                                setEditingNoteId(null)
                              } catch (error) {
                                toast.error('Could not save the note', hrErrorMessage(error))
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </li>
                    ) : (
                      <li key={note.id} className="group rounded-md bg-muted p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                            {note.text}
                          </p>
                          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              aria-label="Edit note"
                              onClick={() => {
                                setEditingNoteId(note.id)
                                setEditingNoteText(note.text)
                              }}
                              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete note"
                              onClick={() => void handleDeleteNote(note.id)}
                              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDateTime(note.created_at)}
                          {note.updated_at ? ' (edited)' : ''}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}

              <div className="space-y-2">
                <Textarea
                  rows={2}
                  placeholder="e.g. Called candidate, salary expectation in range…"
                  aria-label="New note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  loading={notes.add.isPending}
                  disabled={!noteText.trim()}
                  onClick={async () => {
                    try {
                      await notes.add.mutateAsync(noteText.trim())
                      setNoteText('')
                    } catch (error) {
                      toast.error('Could not add the note', hrErrorMessage(error))
                    }
                  }}
                >
                  Add note
                </Button>
              </div>
            </section>

            <Separator />

            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => void handleDelete()}
              loading={remove.isPending}
            >
              {!remove.isPending ? <Trash2 className="size-3.5" /> : null}
              Delete application
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OverrideGroup({
  label,
  options,
  current,
  pending,
  onSelect,
}: {
  label: string
  options: { status: ApplicationStatus; label: string }[]
  current: ApplicationStatus
  pending: boolean
  onSelect: (status: ApplicationStatus) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-2xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(({ status, label: optionLabel }) => (
          <Button
            key={status}
            size="sm"
            variant={current === status ? 'subtle' : 'outline'}
            disabled={pending || current === status}
            onClick={() => onSelect(status)}
          >
            {optionLabel}
          </Button>
        ))}
      </div>
    </div>
  )
}

function StageCell({ label, status }: { label: string; status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1">
        <HrStatusBadge status={status} />
      </div>
    </div>
  )
}

function SkillList({
  label,
  skills,
  className,
}: {
  label: string
  skills: string[] | null
  className: string
}) {
  if (!skills || skills.length === 0) return null
  return (
    <section>
      <p className="mb-1.5 text-2xs font-medium text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li key={skill}>
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-2xs', className)}>
              {skill}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
