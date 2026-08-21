from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.models import Application, Job, StageStatus
from app.db.session import get_db
from app.schemas.job import ExtractJDPreviewOut, JobCreate, JobOut, JobUpdate
from app.services.jd_extraction_service import ExtractedJD, extract_jd
from app.services.llm_client import LLMError
from app.services.ocr_service import get_ocr_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _apply_extraction(job: Job, extracted: ExtractedJD) -> None:
    for field, value in extracted.model_dump().items():
        setattr(job, field, value)
    job.jd_extraction_status = StageStatus.SUCCESS
    job.jd_extraction_error = None
    job.jd_extracted_at = datetime.now(timezone.utc)


def _run_extraction(db: Session, job: Job) -> None:
    job.jd_extraction_status = StageStatus.PROCESSING
    db.commit()
    try:
        extracted = extract_jd(job.jd)
        _apply_extraction(job, extracted)
    except LLMError as exc:
        job.jd_extraction_status = StageStatus.FAILED
        job.jd_extraction_error = str(exc)
    db.commit()
    db.refresh(job)


@router.post("/extract-jd", response_model=ExtractJDPreviewOut)
async def extract_jd_preview(
    jd_text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
) -> ExtractJDPreviewOut:
    """Stateless preview for the job-creation wizard — analyzes a pasted or uploaded JD
    without saving anything, so the recruiter can review/edit before a job is created."""
    if file is not None:
        raw_bytes = await file.read()
        jd_text = get_ocr_service().extract_text(raw_bytes, file.filename or "jd", file.content_type)
    if not jd_text or not jd_text.strip():
        raise HTTPException(status_code=400, detail="Provide jd_text or a file with extractable text")

    try:
        extracted = extract_jd(jd_text)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ExtractJDPreviewOut(jd_text=jd_text, extracted=extracted)


@router.post("", response_model=JobOut, status_code=201)
def create_job(payload: JobCreate, db: Session = Depends(get_db)) -> Job:
    job = Job(**payload.model_dump())
    if payload.required_skills is not None:
        # Wizard already ran extraction and the recruiter approved/edited the result —
        # don't re-extract, just record that this job's requirements are already settled.
        job.jd_extraction_status = StageStatus.SUCCESS
        job.jd_extracted_at = datetime.now(timezone.utc)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[Job]:
    return db.query(Job).order_by(Job.created_at.desc()).all()


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)) -> Job:
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}", response_model=JobOut)
def update_job(job_id: str, payload: JobUpdate, db: Session = Depends(get_db)) -> Job:
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str, db: Session = Depends(get_db)) -> None:
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    application_count = db.query(Application).filter(Application.job_id == job_id).count()
    if application_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Job has {application_count} application(s) — set it to ARCHIVED instead of deleting",
        )

    db.delete(job)
    db.commit()


@router.post("/{job_id}/extract", response_model=JobOut)
def retry_extraction(job_id: str, db: Session = Depends(get_db)) -> Job:
    """Re-runs AI extraction against the job's already-stored `jd` text — used to retry
    after a failure, or to re-extract after the recruiter edits the raw JD."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    _run_extraction(db, job)
    return job
