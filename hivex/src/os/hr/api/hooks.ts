'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { hrApi } from './client'
import { isStillProcessing, type Application, type ApplicationStatus, type JobPayload } from './types'

/**
 * Server-state hooks for HR OS.
 *
 * The standalone app polled with bare `setInterval` inside each component. Here
 * TanStack Query owns it, so polling stops when the tab is hidden, several
 * components can watch the same job without duplicating requests, and a
 * mutation invalidates exactly the keys it touched.
 */

export const hrKeys = {
  all: ['hr'] as const,
  clients: () => [...hrKeys.all, 'clients'] as const,
  jobs: () => [...hrKeys.all, 'jobs'] as const,
  job: (jobId: string) => [...hrKeys.all, 'job', jobId] as const,
  applications: (jobId: string) => [...hrKeys.all, 'applications', jobId] as const,
  allApplications: () => [...hrKeys.all, 'applications', 'all'] as const,
  application: (id: string) => [...hrKeys.all, 'application', id] as const,
  stats: (scope: { clientId?: string | null; jobId?: string | null }) =>
    [...hrKeys.all, 'stats', scope.clientId ?? null, scope.jobId ?? null] as const,
}

/** Everything an ATS mutation can invalidate, in one place. */
function invalidatePipeline(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: hrKeys.all })
}

export function useClients() {
  return useQuery({ queryKey: hrKeys.clients(), queryFn: hrApi.listClients })
}

export function useJobs() {
  return useQuery({ queryKey: hrKeys.jobs(), queryFn: hrApi.listJobs })
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: hrKeys.job(jobId ?? ''),
    queryFn: () => hrApi.getJob(jobId!),
    enabled: Boolean(jobId),
  })
}

/** Polls every 2s while any application in the job is still mid-pipeline. */
export function useApplications(jobId: string | null) {
  return useQuery({
    queryKey: hrKeys.applications(jobId ?? ''),
    queryFn: () => hrApi.listApplications(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data as Application[] | undefined
      return data?.some(isStillProcessing) ? 2_000 : false
    },
  })
}

export function useAllApplications(enabled = true) {
  return useQuery({
    queryKey: hrKeys.allApplications(),
    queryFn: hrApi.listAllApplications,
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data as Application[] | undefined
      return data?.some(isStillProcessing) ? 4_000 : false
    },
  })
}

export function useApplication(applicationId: string | null) {
  return useQuery({
    queryKey: hrKeys.application(applicationId ?? ''),
    queryFn: () => hrApi.getApplication(applicationId!),
    enabled: Boolean(applicationId),
    refetchInterval: (query) => {
      const data = query.state.data as Application | undefined
      return data && isStillProcessing(data) ? 2_500 : false
    },
  })
}

export function useDashboardStats(scope: { clientId?: string | null; jobId?: string | null }) {
  return useQuery({
    queryKey: hrKeys.stats(scope),
    queryFn: () => hrApi.getDashboardStats(scope),
  })
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export function useSaveJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, payload }: { jobId?: string; payload: JobPayload }) =>
      jobId ? hrApi.updateJob(jobId, payload) : hrApi.createJob(payload),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => hrApi.deleteJob(jobId),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useOverrideStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: ApplicationStatus }) =>
      hrApi.overrideApplicationStatus(applicationId, status),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useBulkOverrideStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ApplicationStatus }) =>
      hrApi.bulkOverrideApplicationStatus(ids, status),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useBulkDeleteApplications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => hrApi.bulkDeleteApplications(ids),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useDeleteApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (applicationId: string) => hrApi.deleteApplication(applicationId),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useRetryApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (applicationId: string) => hrApi.retryApplication(applicationId),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useResendEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (applicationId: string) => hrApi.resendEmail(applicationId),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useNoteMutations(applicationId: string | null) {
  const qc = useQueryClient()
  const settle = () => invalidatePipeline(qc)

  return {
    add: useMutation({
      mutationFn: (text: string) => hrApi.addNote(applicationId!, text),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({ noteId, text }: { noteId: string; text: string }) =>
        hrApi.updateNote(applicationId!, noteId, text),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: (noteId: string) => hrApi.deleteNote(applicationId!, noteId),
      onSuccess: settle,
    }),
  }
}

export function useUploadCVs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, files }: { jobId: string; files: File[] }) =>
      hrApi.uploadCVs(jobId, files),
    onSuccess: () => invalidatePipeline(qc),
  })
}

export function useClientMutations() {
  const qc = useQueryClient()
  const settle = () => invalidatePipeline(qc)

  return {
    create: useMutation({ mutationFn: (name: string) => hrApi.createClient(name), onSuccess: settle }),
    rename: useMutation({
      mutationFn: ({ clientId, name }: { clientId: string; name: string }) =>
        hrApi.updateClient(clientId, name),
      onSuccess: settle,
    }),
    remove: useMutation({ mutationFn: (clientId: string) => hrApi.deleteClient(clientId), onSuccess: settle }),
  }
}
