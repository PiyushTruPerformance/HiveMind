'use client'

import { Sparkles, Upload } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'

import { hrApi, hrErrorMessage } from '../api/client'
import { useClients, useSaveJob } from '../api/hooks'
import { toClientId, type ExtractedJD, type Job, type JobStatus } from '../api/types'
import { TagListInput } from './tag-list-input'

/**
 * Three-step job wizard, ported from the CV Analyzer.
 *
 * The sequence is the product's core claim and is unchanged: describe the role,
 * hand the AI the JD, then *review and edit* what it extracted before anything
 * is created. Nothing is auto-published — step 3 is an approval gate, not a
 * confirmation screen.
 */

const JOB_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'ARCHIVED']
const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship']
const WORK_MODES = ['Remote', 'Hybrid', 'On-site']

type TagField =
  | 'education_requirements'
  | 'required_skills'
  | 'preferred_skills'
  | 'responsibilities'
  | 'certifications'
  | 'languages'
  | 'keywords'
  | 'nice_to_have'

interface FormState {
  title: string
  client_id: string | null
  department: string
  employment_type: string
  work_mode: string
  location: string
  openings: string
  experience_min: string
  experience_max: string
  salary_min: string
  salary_max: string
  jd: string
  status: JobStatus
  education_requirements: string[]
  required_skills: string[]
  preferred_skills: string[]
  responsibilities: string[]
  certifications: string[]
  languages: string[]
  keywords: string[]
  nice_to_have: string[]
}

function emptyForm(job?: Job, defaultClientId?: string | null): FormState {
  return {
    title: job?.title ?? '',
    client_id: job ? job.client_id : (defaultClientId ?? null),
    department: job?.department ?? '',
    employment_type: job?.employment_type ?? '',
    work_mode: job?.work_mode ?? '',
    location: job?.location ?? '',
    openings: job?.openings?.toString() ?? '',
    experience_min: job?.experience_min?.toString() ?? '',
    experience_max: job?.experience_max?.toString() ?? '',
    salary_min: job?.salary_min?.toString() ?? '',
    salary_max: job?.salary_max?.toString() ?? '',
    jd: job?.jd ?? '',
    status: job?.status ?? 'DRAFT',
    education_requirements: job?.education_requirements ?? [],
    required_skills: job?.required_skills ?? [],
    preferred_skills: job?.preferred_skills ?? [],
    responsibilities: job?.responsibilities ?? [],
    certifications: job?.certifications ?? [],
    languages: job?.languages ?? [],
    keywords: job?.keywords ?? [],
    nice_to_have: job?.nice_to_have ?? [],
  }
}

function toInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function JobWizard({
  open,
  onOpenChange,
  job,
  workspaceId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  job?: Job
  /** Platform workspace id; converted to the service's client_id on save. */
  workspaceId?: string | null
  onSaved?: (job: Job) => void
}) {
  const toast = useToast()
  const clientsQuery = useClients()
  const saveJob = useSaveJob()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(job, workspaceId ? toClientId(workspaceId) : null),
  )
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(emptyForm(job, workspaceId ? toClientId(workspaceId) : null))
    setStep(1)
  }, [open, job, workspaceId])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function applyExtracted(extracted: ExtractedJD) {
    setForm((prev) => ({
      ...prev,
      department: extracted.department ?? prev.department,
      employment_type: extracted.employment_type ?? prev.employment_type,
      work_mode: extracted.work_mode ?? prev.work_mode,
      location: extracted.location ?? prev.location,
      openings: extracted.openings?.toString() ?? prev.openings,
      experience_min: extracted.experience_min?.toString() ?? prev.experience_min,
      experience_max: extracted.experience_max?.toString() ?? prev.experience_max,
      salary_min: extracted.salary_min?.toString() ?? prev.salary_min,
      salary_max: extracted.salary_max?.toString() ?? prev.salary_max,
      education_requirements: extracted.education_requirements,
      required_skills: extracted.required_skills,
      preferred_skills: extracted.preferred_skills,
      responsibilities: extracted.responsibilities,
      certifications: extracted.certifications,
      languages: extracted.languages,
      keywords: extracted.keywords,
      nice_to_have: extracted.nice_to_have,
    }))
  }

  async function analyze() {
    if (!form.jd.trim()) {
      toast.error('Paste or upload a job description first')
      return
    }
    setExtracting(true)
    try {
      const result = await hrApi.extractJD({ jdText: form.jd })
      applyExtracted(result.extracted)
      setStep(3)
    } catch (error) {
      toast.error('AI extraction failed', hrErrorMessage(error))
    } finally {
      setExtracting(false)
    }
  }

  async function analyzeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setExtracting(true)
    try {
      const result = await hrApi.extractJD({ file })
      set('jd', result.jd_text)
      applyExtracted(result.extracted)
      setStep(3)
    } catch (error) {
      toast.error('AI extraction failed', hrErrorMessage(error))
    } finally {
      setExtracting(false)
      event.target.value = ''
    }
  }

  async function save() {
    if (!form.title.trim() || !form.jd.trim()) {
      toast.error('Title and job description are required')
      return
    }
    try {
      const saved = await saveJob.mutateAsync({
        jobId: job?.id,
        payload: {
          title: form.title,
          jd: form.jd,
          status: form.status,
          client_id: form.client_id,
          department: form.department || undefined,
          employment_type: form.employment_type || undefined,
          work_mode: form.work_mode || undefined,
          location: form.location || undefined,
          openings: toInt(form.openings),
          experience_min: toInt(form.experience_min),
          experience_max: toInt(form.experience_max),
          salary_min: toInt(form.salary_min),
          salary_max: toInt(form.salary_max),
          education_requirements: form.education_requirements,
          required_skills: form.required_skills,
          preferred_skills: form.preferred_skills,
          responsibilities: form.responsibilities,
          certifications: form.certifications,
          languages: form.languages,
          keywords: form.keywords,
          nice_to_have: form.nice_to_have,
        },
      })
      toast.success(job ? 'Job updated' : 'Job created')
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      toast.error('Could not save the job', hrErrorMessage(error))
    }
  }

  const setTag = (field: TagField, values: string[]) => set(field, values)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg" className="max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? 'Edit job' : 'Create job'}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Basic details for the role.'
              : step === 2
                ? 'Paste or upload the job description — the AI reads it and fills in the requirements.'
                : 'Review what the AI extracted. Nothing is published until you approve it.'}
          </DialogDescription>
        </DialogHeader>

        <StepRail step={step} />

        {step === 1 ? (
          <div className="space-y-4">
            <Field label="Job title" required>
              {(props) => (
                <Input
                  {...props}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Senior Backend Engineer"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Client" hint="Clients are HR OS workspaces on this platform.">
              {(props) => (
                <Select
                  {...props}
                  value={form.client_id ?? ''}
                  onChange={(e) => set('client_id', e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {(clientsQuery.data ?? []).map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                {(props) => (
                  <Input
                    {...props}
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                    placeholder="Engineering"
                  />
                )}
              </Field>
              <Field label="Location">
                {(props) => (
                  <Input
                    {...props}
                    value={form.location}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="Remote"
                  />
                )}
              </Field>
              <Field label="Employment type">
                {(props) => (
                  <Select
                    {...props}
                    value={form.employment_type}
                    onChange={(e) => set('employment_type', e.target.value)}
                  >
                    <option value="">—</option>
                    {EMPLOYMENT_TYPES.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Work mode">
                {(props) => (
                  <Select
                    {...props}
                    value={form.work_mode}
                    onChange={(e) => set('work_mode', e.target.value)}
                  >
                    <option value="">—</option>
                    {WORK_MODES.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Openings">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={form.openings}
                    onChange={(e) => set('openings', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Experience (years)">
                {() => (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Min"
                      aria-label="Minimum experience"
                      value={form.experience_min}
                      onChange={(e) => set('experience_min', e.target.value)}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Max"
                      aria-label="Maximum experience"
                      value={form.experience_max}
                      onChange={(e) => set('experience_max', e.target.value)}
                    />
                  </div>
                )}
              </Field>
              <Field label="Salary range" className="sm:col-span-2">
                {() => (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Min"
                      aria-label="Minimum salary"
                      value={form.salary_min}
                      onChange={(e) => set('salary_min', e.target.value)}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Max"
                      aria-label="Maximum salary"
                      value={form.salary_max}
                      onChange={(e) => set('salary_max', e.target.value)}
                    />
                  </div>
                )}
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <Field label="Job description" required>
              {(props) => (
                <Textarea
                  {...props}
                  rows={11}
                  value={form.jd}
                  onChange={(e) => set('jd', e.target.value)}
                  placeholder="Paste the full job description here…"
                />
              )}
            </Field>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-2.5 transition-colors hover:bg-muted',
                extracting && 'pointer-events-none opacity-60',
              )}
            >
              <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-2xs text-muted-foreground">
                …or upload it as a PDF, DOCX or text file
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={analyzeFile}
                disabled={extracting}
                className="sr-only"
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <TagListInput
              label="Required skills"
              values={form.required_skills}
              onChange={(v) => setTag('required_skills', v)}
              placeholder="Add a required skill"
            />
            <TagListInput
              label="Preferred skills"
              values={form.preferred_skills}
              onChange={(v) => setTag('preferred_skills', v)}
              placeholder="Add a preferred skill"
            />
            <TagListInput
              label="Responsibilities"
              values={form.responsibilities}
              onChange={(v) => setTag('responsibilities', v)}
              placeholder="Add a responsibility"
            />
            <TagListInput
              label="Education requirements"
              values={form.education_requirements}
              onChange={(v) => setTag('education_requirements', v)}
              placeholder="e.g. B.Tech"
            />
            <TagListInput
              label="Certifications"
              values={form.certifications}
              onChange={(v) => setTag('certifications', v)}
              placeholder="e.g. AWS Certified"
            />
            <TagListInput
              label="Languages"
              values={form.languages}
              onChange={(v) => setTag('languages', v)}
              placeholder="e.g. English"
            />
            <TagListInput
              label="Keywords"
              values={form.keywords}
              onChange={(v) => setTag('keywords', v)}
              placeholder="Other ATS keywords"
            />
            <TagListInput
              label="Nice to have"
              values={form.nice_to_have}
              onChange={(v) => setTag('nice_to_have', v)}
              placeholder="Non-skill bonuses"
            />
            <Field label="Status" hint="CVs can only be uploaded to a job that is OPEN.">
              {(props) => (
                <Select
                  {...props}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as JobStatus)}
                >
                  {JOB_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {step === 1 ? (
              <Button variant="primary" onClick={() => setStep(2)} disabled={!form.title.trim()}>
                Next
              </Button>
            ) : null}
            {step === 2 ? (
              <>
                <Button variant="outline" onClick={() => setStep(3)} disabled={!form.jd.trim()}>
                  Skip AI, continue manually
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void analyze()}
                  loading={extracting}
                  disabled={!form.jd.trim()}
                >
                  {!extracting ? <Sparkles className="size-4" /> : null}
                  {extracting ? 'Analysing…' : 'Analyze with AI'}
                </Button>
              </>
            ) : null}
            {step === 3 ? (
              <Button variant="primary" onClick={() => void save()} loading={saveJob.isPending}>
                {job ? 'Save changes' : 'Approve & create job'}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepRail({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Details', 'Description', 'Review']
  return (
    <ol className="flex items-center gap-1.5" aria-label="Job creation steps">
      {labels.map((label, index) => {
        const position = index + 1
        const done = position < step
        const active = position === step
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                done
                  ? 'border-success bg-success text-success-foreground'
                  : active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong text-muted-foreground',
              )}
            >
              {position}
            </span>
            <span className={cn('text-2xs', active ? 'font-medium' : 'text-muted-foreground')}>
              {label}
            </span>
            {index < labels.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        )
      })}
    </ol>
  )
}
