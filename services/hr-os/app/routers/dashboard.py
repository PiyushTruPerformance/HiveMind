from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.db.models import Application, ApplicationStatus, Job, JobStatus, StageStatus
from app.db.session import get_db
from app.schemas.dashboard import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(client_id: str | None = None, job_id: str | None = None, db: Session = Depends(get_db)) -> DashboardStats:
    jobs_query: Query = db.query(Job)
    applications_query: Query = db.query(Application)
    if job_id is not None:
        # Most specific scope: a single job, not its whole client.
        jobs_query = jobs_query.filter(Job.id == job_id)
        applications_query = applications_query.filter(Application.job_id == job_id)
    elif client_id is not None:
        jobs_query = jobs_query.filter(Job.client_id == client_id)
        applications_query = applications_query.join(Job, Application.job_id == Job.id).filter(Job.client_id == client_id)

    total_jobs = jobs_query.count()
    open_jobs = jobs_query.filter(Job.status == JobStatus.OPEN).count()
    total_applications = applications_query.count()

    def count_status(status: ApplicationStatus) -> int:
        return applications_query.filter(Application.application_status == status).count()

    pending_processing = applications_query.filter(
        (Application.ocr_status == StageStatus.PROCESSING)
        | (Application.parsing_status == StageStatus.PROCESSING)
        | (Application.ai_status == StageStatus.PROCESSING)
    ).count()
    failed = applications_query.filter(
        (Application.ocr_status == StageStatus.FAILED)
        | (Application.parsing_status == StageStatus.FAILED)
        | (Application.ai_status == StageStatus.FAILED)
    ).count()

    return DashboardStats(
        total_jobs=total_jobs,
        open_jobs=open_jobs,
        total_applications=total_applications,
        shortlisted=count_status(ApplicationStatus.SHORTLISTED),
        review=count_status(ApplicationStatus.REVIEW),
        rejected=count_status(ApplicationStatus.REJECTED),
        pending_processing=pending_processing,
        failed=failed,
    )
