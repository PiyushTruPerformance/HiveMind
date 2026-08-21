from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

from app.db.models import ApplicationStatus, EmailStatus, StageStatus
from app.schemas.candidate import CandidateOut


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    application_id: str
    text: str
    created_at: datetime
    updated_at: datetime | None


class NoteCreate(BaseModel):
    text: str


class NoteUpdate(BaseModel):
    text: str


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    candidate_id: str
    job_id: str
    application_status: ApplicationStatus
    ocr_status: StageStatus
    parsing_status: StageStatus
    ai_status: StageStatus
    email_status: EmailStatus
    ocr_text: str | None
    ats_score: int | None
    ai_score: int | None
    matched_skills: list[str] | None
    missing_skills: list[str] | None
    ai_reason: str | None
    failure_reason: str | None
    retry_count: int
    status_before_override: ApplicationStatus | None
    overridden_at: datetime | None
    notes: list[NoteOut]
    created_at: datetime

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_notes(cls, value: Any) -> list[NoteOut]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class ApplicationWithCandidateOut(ApplicationOut):
    candidate: CandidateOut


class ApplicationWithJobOut(ApplicationWithCandidateOut):
    job_title: str


class ApplicationStatusUpdate(BaseModel):
    application_status: ApplicationStatus


class BulkApplicationStatusUpdate(BaseModel):
    application_ids: list[str]
    application_status: ApplicationStatus


class BulkDeleteRequest(BaseModel):
    application_ids: list[str]


class UploadResult(BaseModel):
    application_id: str
    candidate_id: str
