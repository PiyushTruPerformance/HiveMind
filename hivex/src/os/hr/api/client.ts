import type {
  Application,
  ApplicationStatus,
  ApplicationWithJob,
  Client,
  DashboardStats,
  ExtractedJD,
  Job,
  JobPayload,
  UploadResult,
} from './types'

/**
 * HR OS API client.
 *
 * Talks to `services/hr-os` (the CV Analyzer FastAPI service) that now lives in
 * this repo. Ported from the standalone app's `src/lib/api.ts`; the endpoint
 * list is unchanged, so the service needed no modification to be adopted.
 *
 * Auth: the service verifies a Clerk session JWT and dev-bypasses when
 * CLERK_ISSUER is unset. The token getter is injected by <HrApiAuthBridge> so
 * this module stays free of any Clerk import.
 */

export const HR_API_BASE_URL =
  process.env.NEXT_PUBLIC_HR_API_URL?.replace(/\/$/, '') || 'http://localhost:8000'

export class HrApiError extends Error {
  status: number
  /** True when the request never reached the service at all. */
  offline: boolean

  constructor(status: number, message: string, offline = false) {
    super(message)
    this.name = 'HrApiError'
    this.status = status
    this.offline = offline
  }
}

let authTokenGetter: (() => Promise<string | null>) | null = null

export function setHrAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  authTokenGetter = getter
}

const OFFLINE_MESSAGE =
  'The HR OS service is not reachable. Start it with: uvicorn app.main:app --reload --port 8000 (from services/hr-os).'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await authTokenGetter?.().catch(() => null)

  let response: Response
  try {
    response = await fetch(`${HR_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    // fetch only rejects on a transport failure — DNS, refused connection, CORS
    // preflight rejection. Everything else is an HTTP status handled below.
    throw new HrApiError(0, OFFLINE_MESSAGE, true)
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      detail = (await response.json())?.detail
    } catch {
      detail = undefined
    }
    if (response.status === 401 && !token) {
      throw new HrApiError(401, 'The HR OS service requires a signed-in session.')
    }
    throw new HrApiError(response.status, detail ?? `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const hrApi = {
  health: () => request<{ status: string }>('/health'),

  /* Clients — surfaced in the platform as HR OS workspaces. */
  listClients: () => request<Client[]>('/clients'),
  createClient: (name: string) =>
    request<Client>('/clients', { method: 'POST', body: JSON.stringify({ name }) }),
  updateClient: (clientId: string, name: string) =>
    request<Client>(`/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteClient: (clientId: string) => request<void>(`/clients/${clientId}`, { method: 'DELETE' }),

  /* Jobs */
  listJobs: () => request<Job[]>('/jobs'),
  getJob: (jobId: string) => request<Job>(`/jobs/${jobId}`),
  createJob: (payload: JobPayload) =>
    request<Job>('/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  updateJob: (jobId: string, payload: Partial<JobPayload>) =>
    request<Job>(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteJob: (jobId: string) => request<void>(`/jobs/${jobId}`, { method: 'DELETE' }),
  extractJD: (input: { jdText: string } | { file: File }) => {
    const formData = new FormData()
    if ('file' in input) formData.append('file', input.file)
    else formData.append('jd_text', input.jdText)
    return request<{ jd_text: string; extracted: ExtractedJD }>('/jobs/extract-jd', {
      method: 'POST',
      body: formData,
    })
  },
  retryExtraction: (jobId: string) => request<Job>(`/jobs/${jobId}/extract`, { method: 'POST' }),

  /* Applications */
  listApplications: (jobId: string) => request<Application[]>(`/jobs/${jobId}/applications`),
  listAllApplications: () => request<ApplicationWithJob[]>('/applications?limit=500'),
  getApplication: (applicationId: string) =>
    request<Application>(`/applications/${applicationId}`),
  overrideApplicationStatus: (applicationId: string, status: ApplicationStatus) =>
    request<Application>(`/applications/${applicationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ application_status: status }),
    }),
  bulkOverrideApplicationStatus: (applicationIds: string[], status: ApplicationStatus) =>
    request<Application[]>('/applications/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ application_ids: applicationIds, application_status: status }),
    }),
  retryApplication: (applicationId: string) =>
    request<{ status: string }>(`/applications/${applicationId}/retry`, { method: 'POST' }),
  resendEmail: (applicationId: string) =>
    request<Application>(`/applications/${applicationId}/resend-email`, { method: 'POST' }),
  deleteApplication: (applicationId: string) =>
    request<void>(`/applications/${applicationId}`, { method: 'DELETE' }),
  bulkDeleteApplications: (applicationIds: string[]) =>
    request<void>('/applications/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ application_ids: applicationIds }),
    }),
  addNote: (applicationId: string, text: string) =>
    request<Application>(`/applications/${applicationId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  updateNote: (applicationId: string, noteId: string, text: string) =>
    request<Application>(`/applications/${applicationId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  deleteNote: (applicationId: string, noteId: string) =>
    request<Application>(`/applications/${applicationId}/notes/${noteId}`, { method: 'DELETE' }),
  uploadCVs: (jobId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return request<UploadResult[]>(`/jobs/${jobId}/applications/upload`, {
      method: 'POST',
      body: formData,
    })
  },

  /* Dashboard */
  getDashboardStats: (scope: { clientId?: string | null; jobId?: string | null } = {}) => {
    const params = new URLSearchParams()
    if (scope.jobId) params.set('job_id', scope.jobId)
    else if (scope.clientId) params.set('client_id', scope.clientId)
    const query = params.toString()
    return request<DashboardStats>(query ? `/dashboard/stats?${query}` : '/dashboard/stats')
  },

  getResumeBlob: async (applicationId: string): Promise<Blob> => {
    const token = await authTokenGetter?.().catch(() => null)
    let response: Response
    try {
      response = await fetch(`${HR_API_BASE_URL}/applications/${applicationId}/resume`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      throw new HrApiError(0, OFFLINE_MESSAGE, true)
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new HrApiError(
        response.status,
        body?.detail ?? `Request failed with status ${response.status}`,
      )
    }
    return response.blob()
  },
}

export function hrErrorMessage(error: unknown): string {
  if (error instanceof HrApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong talking to the HR OS service.'
}
