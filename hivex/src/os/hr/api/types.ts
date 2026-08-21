/**
 * HR OS API contracts.
 *
 * Carried over verbatim from the CV Analyzer frontend (`src/lib/types.ts`) so
 * the shapes stay identical to what `services/hr-os` serializes. Field names
 * are snake_case because they mirror the FastAPI response models — do not
 * camelCase them here; that would put a translation layer between the platform
 * and its own service for no benefit.
 */

export type JobStatus = 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED' | 'ARCHIVED'

export type ApplicationStatus =
  | 'UPLOADED'
  | 'DUPLICATE'
  | 'PARSED'
  | 'SCREENED'
  | 'SHORTLISTED'
  | 'REVIEW'
  | 'REJECTED'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'HIRED'

export type StageStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface JobRequirementFields {
  department: string | null
  employment_type: string | null
  work_mode: string | null
  location: string | null
  openings: number | null
  experience_min: number | null
  experience_max: number | null
  salary_min: number | null
  salary_max: number | null
  education_requirements: string[] | null
  required_skills: string[] | null
  preferred_skills: string[] | null
  responsibilities: string[] | null
  certifications: string[] | null
  languages: string[] | null
  keywords: string[] | null
  nice_to_have: string[] | null
}

export interface Client {
  id: string
  name: string
  created_at: string
}

export interface Job extends JobRequirementFields {
  id: string
  title: string
  jd: string
  jd_file_url: string | null
  status: JobStatus
  client_id: string | null
  jd_extraction_status: StageStatus
  jd_extraction_error: string | null
  jd_extracted_at: string | null
  created_at: string
}

export type ExtractedJD = Omit<
  JobRequirementFields,
  | 'education_requirements'
  | 'required_skills'
  | 'preferred_skills'
  | 'responsibilities'
  | 'certifications'
  | 'languages'
  | 'keywords'
  | 'nice_to_have'
> & {
  education_requirements: string[]
  required_skills: string[]
  preferred_skills: string[]
  responsibilities: string[]
  certifications: string[]
  languages: string[]
  keywords: string[]
  nice_to_have: string[]
}

export interface Candidate {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  blob_url: string | null
  created_at: string
}

export interface Note {
  id: string
  application_id: string
  text: string
  created_at: string
  updated_at: string | null
}

export interface Application {
  id: string
  candidate_id: string
  job_id: string
  application_status: ApplicationStatus
  ocr_status: StageStatus
  parsing_status: StageStatus
  ai_status: StageStatus
  email_status: EmailStatus
  ocr_text: string | null
  ats_score: number | null
  ai_score: number | null
  matched_skills: string[] | null
  missing_skills: string[] | null
  ai_reason: string | null
  failure_reason: string | null
  retry_count: number
  status_before_override: ApplicationStatus | null
  overridden_at: string | null
  notes: Note[]
  created_at: string
  candidate: Candidate
}

export interface ApplicationWithJob extends Application {
  job_title: string
}

export interface UploadResult {
  application_id: string
  candidate_id: string
}

export interface DashboardStats {
  total_jobs: number
  open_jobs: number
  total_applications: number
  shortlisted: number
  review: number
  rejected: number
  pending_processing: number
  failed: number
}

export type JobPayload = Partial<JobRequirementFields> & {
  title: string
  jd: string
  status?: JobStatus
  client_id?: string | null
}

/** Statuses at which the pipeline has stopped doing work on an application. */
export const TERMINAL_APP_STATUSES: ApplicationStatus[] = [
  'DUPLICATE',
  'SHORTLISTED',
  'REVIEW',
  'REJECTED',
  'INTERVIEW',
  'SELECTED',
  'HIRED',
]

export function hasFailedStage(application: Application): boolean {
  return [application.ocr_status, application.parsing_status, application.ai_status].includes(
    'FAILED',
  )
}

/** True while any stage is still expected to change — drives polling. */
export function isStillProcessing(application: Application): boolean {
  if (TERMINAL_APP_STATUSES.includes(application.application_status)) return false
  return !hasFailedStage(application)
}

/**
 * The synthetic workspace that holds jobs with no client.
 *
 * The backend models "no client" as `client_id: null`; the platform needs every
 * workspace to have an id for routing. This constant is the only place the two
 * representations meet — `toClientId()` converts back at the API boundary.
 */
export const UNASSIGNED_CLIENT_ID = 'unassigned'

export function toClientId(workspaceId: string): string | null {
  return workspaceId === UNASSIGNED_CLIENT_ID ? null : workspaceId
}

export function toWorkspaceId(clientId: string | null): string {
  return clientId ?? UNASSIGNED_CLIENT_ID
}
