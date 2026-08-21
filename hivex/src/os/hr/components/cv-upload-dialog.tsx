'use client'

import { CloudUpload } from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'

import { hrErrorMessage } from '../api/client'
import { useApplications, useJobs, useUploadCVs } from '../api/hooks'
import { isStillProcessing, toClientId, type Application } from '../api/types'
import { HrStatusBadge } from './status'

/**
 * CV upload, ported from the CV Analyzer.
 *
 * Two behaviours carried over deliberately: uploads are only accepted by a job
 * whose status is OPEN (so the job selector lists nothing else), and the dialog
 * stays open after upload to show per-file pipeline progress — the processing
 * is a background task, and hiding it would make a 20-second AI step look like
 * a no-op.
 */
export function CvUploadDialog({
  open,
  onOpenChange,
  workspaceId,
  defaultJobId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Platform workspace id — scopes the job list to this client. */
  workspaceId: string
  defaultJobId?: string | null
}) {
  const toast = useToast()
  const jobsQuery = useJobs()
  const upload = useUploadCVs()

  const [jobId, setJobId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploadedIds, setUploadedIds] = useState<string[]>([])
  const [fileNames, setFileNames] = useState<Record<string, string>>({})

  const clientId = toClientId(workspaceId)

  const openJobs = useMemo(
    () =>
      (jobsQuery.data ?? []).filter(
        (job) => job.status === 'OPEN' && job.client_id === clientId,
      ),
    [jobsQuery.data, clientId],
  )

  useEffect(() => {
    if (!open) return
    setFiles([])
    setUploadedIds([])
    setFileNames({})
    setJobId(defaultJobId && openJobs.some((j) => j.id === defaultJobId) ? defaultJobId : (openJobs[0]?.id ?? ''))
    // openJobs is derived from a query that can resolve after open; keyed on its length.
  }, [open, defaultJobId, openJobs])

  /* Progress reuses the job's application query, which already polls while any
     application is mid-pipeline — no second polling loop for the same data. */
  const applicationsQuery = useApplications(uploadedIds.length > 0 ? jobId : null)
  const tracked: Application[] = (applicationsQuery.data ?? []).filter((a) =>
    uploadedIds.includes(a.id),
  )
  const settled = tracked.filter((a) => !isStillProcessing(a)).length

  async function handleUpload() {
    if (!jobId || files.length === 0) return
    try {
      const results = await upload.mutateAsync({ jobId, files })
      setUploadedIds(results.map((r) => r.application_id))
      setFileNames(
        Object.fromEntries(
          results.map((r, i) => [r.application_id, files[i]?.name ?? `File ${i + 1}`]),
        ),
      )
    } catch (error) {
      toast.error('Upload failed', hrErrorMessage(error))
    }
  }

  const showingProgress = uploadedIds.length > 0
  const allSettled = showingProgress && settled === uploadedIds.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload CVs</DialogTitle>
          <DialogDescription>
            {showingProgress
              ? 'Each file runs through OCR, parsing, ATS screening and AI matching.'
              : 'CVs can only be uploaded to a job that is OPEN.'}
          </DialogDescription>
        </DialogHeader>

        {showingProgress ? (
          <ul className="space-y-1.5">
            {uploadedIds.map((id) => {
              const application = tracked.find((a) => a.id === id)
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[13px]">{fileNames[id]}</span>
                  <HrStatusBadge status={application?.application_status ?? 'UPLOADED'} />
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="space-y-4">
            <Field
              label="Job"
              hint={
                openJobs.length === 0
                  ? 'No OPEN roles for this client — open one first.'
                  : undefined
              }
            >
              {(props) => (
                <Select {...props} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="" disabled>
                    Select an open job
                  </option>
                  {openJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <label
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-muted',
                upload.isPending && 'pointer-events-none opacity-60',
              )}
            >
              <CloudUpload className="size-5 text-muted-foreground" aria-hidden />
              <span className="text-[13px] font-medium">Choose CV files</span>
              <span className="text-2xs text-muted-foreground">
                PDF, DOCX, TXT or images — scanned CVs are read with OCR
              </span>
              {files.length > 0 ? (
                <span className="text-2xs font-medium text-primary">
                  {files.length} file{files.length === 1 ? '' : 's'} selected
                </span>
              ) : null}
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,image/*"
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFiles(Array.from(e.target.files ?? []))
                }
              />
            </label>
          </div>
        )}

        <DialogFooter>
          {showingProgress ? (
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              {allSettled ? 'Done' : `Processing ${settled}/${uploadedIds.length}…`}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void handleUpload()}
              loading={upload.isPending}
              disabled={!jobId || files.length === 0}
            >
              Upload {files.length > 0 ? files.length : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
