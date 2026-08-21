from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models import JobStatus, StageStatus
from app.services.jd_extraction_service import ExtractedJD


class JobRequirementFields(BaseModel):
    """Structured fields a recruiter can set directly or accept from AI extraction."""

    department: str | None = None
    employment_type: str | None = None
    work_mode: str | None = None
    location: str | None = None
    openings: int | None = None
    experience_min: int | None = None
    experience_max: int | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    education_requirements: list[str] | None = None
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None
    responsibilities: list[str] | None = None
    certifications: list[str] | None = None
    languages: list[str] | None = None
    keywords: list[str] | None = None
    nice_to_have: list[str] | None = None


class JobCreate(JobRequirementFields):
    title: str
    jd: str
    status: JobStatus = JobStatus.DRAFT
    client_id: str | None = None


class JobUpdate(JobRequirementFields):
    title: str | None = None
    jd: str | None = None
    status: JobStatus | None = None
    client_id: str | None = None


class JobOut(JobRequirementFields):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    jd: str
    jd_file_url: str | None
    status: JobStatus
    client_id: str | None
    jd_extraction_status: StageStatus
    jd_extraction_error: str | None
    jd_extracted_at: datetime | None
    created_at: datetime


class ExtractJDPreviewOut(BaseModel):
    jd_text: str
    extracted: ExtractedJD
