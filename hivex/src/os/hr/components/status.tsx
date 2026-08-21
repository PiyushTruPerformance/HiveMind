'use client'

import { Badge, type BadgeTone } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

import type { ApplicationStatus, EmailStatus, JobStatus, StageStatus } from '../api/types'

/**
 * Status presentation for HR OS.
 *
 * The family mapping is carried over from the CV Analyzer's StatusBadge — the
 * point of it was that *meaning*, not the raw enum value, drives the look, and
 * that survives the port. What changes is the renderer: it now emits the
 * platform's <Badge>, whose filled-vs-dashed rule already encodes the same
 * "decided vs not yet happened" distinction the original implemented by hand.
 */

type AnyStatus = ApplicationStatus | StageStatus | EmailStatus | JobStatus

type Family = 'success' | 'active' | 'failure' | 'deadEnd' | 'info' | 'pending'

const STATUS_FAMILY: Record<AnyStatus, Family> = {
  // application_status
  UPLOADED: 'pending',
  DUPLICATE: 'deadEnd',
  PARSED: 'pending',
  SCREENED: 'pending',
  SHORTLISTED: 'success',
  REVIEW: 'active',
  REJECTED: 'failure',
  INTERVIEW: 'info',
  SELECTED: 'success',
  HIRED: 'success',
  // per-stage pipeline status
  PENDING: 'pending',
  PROCESSING: 'active',
  SUCCESS: 'success',
  FAILED: 'failure',
  // email
  SENT: 'success',
  // job
  DRAFT: 'pending',
  OPEN: 'success',
  PAUSED: 'active',
  CLOSED: 'deadEnd',
  ARCHIVED: 'deadEnd',
}

const FAMILY_TONE: Record<Family, { tone: BadgeTone; pending: boolean }> = {
  success: { tone: 'success', pending: false },
  active: { tone: 'warning', pending: false },
  failure: { tone: 'destructive', pending: false },
  deadEnd: { tone: 'dead-end', pending: false },
  info: { tone: 'info', pending: false },
  pending: { tone: 'neutral', pending: true },
}

export function HrStatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const { tone, pending } = FAMILY_TONE[STATUS_FAMILY[status]]
  return (
    <Badge tone={tone} pending={pending} dot className={className}>
      {status}
    </Badge>
  )
}

/** Just the dot, for rows where a full pill would crowd the label. */
export function HrStatusDot({ status, className }: { status: AnyStatus; className?: string }) {
  const { tone } = FAMILY_TONE[STATUS_FAMILY[status]]
  const dot: Record<BadgeTone, string> = {
    neutral: 'bg-muted-foreground',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    info: 'bg-info',
    'dead-end': 'bg-dead-end',
    accent: 'bg-primary',
  }
  return (
    <span
      className={cn('inline-block size-1.5 shrink-0 rounded-full', dot[tone], className)}
      aria-label={status}
      title={status}
    />
  )
}

const SEGMENT_COLOR: Record<StageStatus, string> = {
  PENDING: 'bg-muted-foreground/25',
  PROCESSING: 'bg-warning',
  SUCCESS: 'bg-success',
  FAILED: 'bg-destructive',
}

/**
 * Compact stand-in for the OCR / Parsing / AI columns.
 *
 * A recruiter scanning the table needs to spot a failed stage at a glance —
 * that is what drives the Retry action — without three text badges' worth of
 * width. Full stage detail stays in the candidate drawer.
 */
export function PipelineGlyph({
  ocrStatus,
  parsingStatus,
  aiStatus,
  className,
}: {
  ocrStatus: StageStatus
  parsingStatus: StageStatus
  aiStatus: StageStatus
  className?: string
}) {
  const stages: { label: string; status: StageStatus }[] = [
    { label: 'OCR', status: ocrStatus },
    { label: 'Parsing', status: parsingStatus },
    { label: 'AI matching', status: aiStatus },
  ]
  const title = stages.map((s) => `${s.label}: ${s.status}`).join(' · ')

  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={title} aria-label={title}>
      {stages.map((stage) => (
        <span
          key={stage.label}
          className={cn('h-2 w-4 rounded-sm transition-colors', SEGMENT_COLOR[stage.status])}
        />
      ))}
    </span>
  )
}

/** Score colouring is shared by the table, the drawer and the pipeline board. */
export function aiScoreTone(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 8) return 'text-success'
  if (score >= 5) return 'text-warning'
  return 'text-destructive'
}
