import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    PAUSED = "PAUSED"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class ApplicationStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    DUPLICATE = "DUPLICATE"
    PARSED = "PARSED"
    SCREENED = "SCREENED"
    SHORTLISTED = "SHORTLISTED"
    REVIEW = "REVIEW"
    REJECTED = "REJECTED"
    INTERVIEW = "INTERVIEW"
    SELECTED = "SELECTED"
    HIRED = "HIRED"


class StageStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class EmailStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    jobs: Mapped[list["Job"]] = relationship(back_populates="client")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    blob_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    applications: Mapped[list["Application"]] = relationship(back_populates="candidate")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    jd: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.DRAFT, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Nullable — a job isn't required to belong to a client, so existing jobs (created
    # before clients existed) don't need a forced migration to a placeholder client.
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("clients.id"), nullable=True)
    client: Mapped["Client | None"] = relationship(back_populates="jobs")

    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    work_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    openings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    experience_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    experience_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The originally uploaded JD file (if any), separate from `jd` which holds the
    # extracted/pasted text actually used for extraction and matching.
    jd_file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Structured requirements extracted from `jd` by jd_extraction_service — `jd` itself
    # stays the source-of-truth document; these are a derived, recruiter-editable summary.
    education_requirements: Mapped[list | None] = mapped_column(JSON, nullable=True)
    required_skills: Mapped[list | None] = mapped_column(JSON, nullable=True)
    preferred_skills: Mapped[list | None] = mapped_column(JSON, nullable=True)
    responsibilities: Mapped[list | None] = mapped_column(JSON, nullable=True)
    certifications: Mapped[list | None] = mapped_column(JSON, nullable=True)
    languages: Mapped[list | None] = mapped_column(JSON, nullable=True)
    keywords: Mapped[list | None] = mapped_column(JSON, nullable=True)
    nice_to_have: Mapped[list | None] = mapped_column(JSON, nullable=True)

    jd_extraction_status: Mapped[StageStatus] = mapped_column(
        Enum(StageStatus), default=StageStatus.PENDING, nullable=False
    )
    jd_extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    jd_extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    applications: Mapped[list["Application"]] = relationship(back_populates="job")


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    candidate_id: Mapped[str] = mapped_column(String(36), ForeignKey("candidates.id"), nullable=False)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), nullable=False)

    application_status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus), default=ApplicationStatus.UPLOADED, nullable=False
    )
    ocr_status: Mapped[StageStatus] = mapped_column(Enum(StageStatus), default=StageStatus.PENDING, nullable=False)
    parsing_status: Mapped[StageStatus] = mapped_column(Enum(StageStatus), default=StageStatus.PENDING, nullable=False)
    ai_status: Mapped[StageStatus] = mapped_column(Enum(StageStatus), default=StageStatus.PENDING, nullable=False)
    email_status: Mapped[EmailStatus] = mapped_column(Enum(EmailStatus), default=EmailStatus.PENDING, nullable=False)

    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    ats_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100, deterministic keyword match
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-10, AI matching judgment — drives the decision
    matched_skills: Mapped[list | None] = mapped_column(JSON, nullable=True)
    missing_skills: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Set only when a recruiter manually overrides the decision (never on a normal
    # pipeline-driven status change) — lets the UI show "this was overridden from X".
    status_before_override: Mapped[ApplicationStatus | None] = mapped_column(Enum(ApplicationStatus), nullable=True)
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    candidate: Mapped["Candidate"] = relationship(back_populates="applications")
    job: Mapped["Job"] = relationship(back_populates="applications")
    notes: Mapped[list["Note"]] = relationship(back_populates="application", order_by="Note.created_at")


class Note(Base):
    """A recruiter's own running commentary on a candidate, separate from ai_reason
    (the AI's reasoning) so the two voices never get mixed together."""

    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(String(36), ForeignKey("applications.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    application: Mapped["Application"] = relationship(back_populates="notes")
