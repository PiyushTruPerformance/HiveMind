from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_jobs: int
    open_jobs: int
    total_applications: int
    shortlisted: int
    review: int
    rejected: int
    pending_processing: int
    failed: int
