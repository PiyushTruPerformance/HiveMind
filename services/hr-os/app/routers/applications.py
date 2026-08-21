import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.db.models import Application, ApplicationStatus, Candidate, EmailStatus, Job, JobStatus, Note, StageStatus
from app.db.session import get_db, new_session
from app.schemas.application import (
    ApplicationStatusUpdate,
    ApplicationWithCandidateOut,
    ApplicationWithJobOut,
    BulkApplicationStatusUpdate,
    BulkDeleteRequest,
    NoteCreate,
    NoteUpdate,
    UploadResult,
)
from app.services.email_service import EmailError, get_email_service
from app.services.email_templates import build_status_email
from app.services.pipeline import append_failure, clear_stage_failure, process_application, retry_application
from app.services.storage_service import StorageError, get_storage_service

router = APIRouter(tags=["applications"])

# A recruiter can only manually move an application to one of these — the AI's
# decision outcomes plus the later hiring-pipeline stages a recruiter advances
# someone through by hand — never a pipeline-internal stage like SCREENED or PARSED.
MANUAL_OVERRIDE_STATUSES = {
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REVIEW,
    ApplicationStatus.REJECTED,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.SELECTED,
    ApplicationStatus.HIRED,
}
MANUAL_OVERRIDE_STATUSES_DETAIL = "Status can only be manually set to SHORTLISTED, REVIEW, REJECTED, INTERVIEW, SELECTED, or HIRED"

# Every response that serializes a full Application (candidate + notes fields, and/or
# touches .job.title for an email) needs these eager-loaded — on a remote database each
# relationship would otherwise be its own lazy-load round trip, multiplying badly across
# a list endpoint (N applications -> 1 + N query round trips instead of a fixed handful).
_APPLICATION_LOAD_OPTIONS = (joinedload(Application.candidate), joinedload(Application.job), selectinload(Application.notes))


def _apply_status_override(db: Session, application: Application, status: ApplicationStatus) -> None:
    """Shared by the single and bulk override endpoints — sets the status and sends
    the candidate the same email the automated pipeline would for that outcome."""
    application.status_before_override = application.application_status
    application.overridden_at = datetime.now(timezone.utc)
    application.application_status = status
    db.commit()

    candidate = application.candidate
    if candidate.email:
        try:
            subject, html = build_status_email(status, candidate.name, application.job.title, get_settings().company_name)
            get_email_service().send(to=candidate.email, subject=subject, html=html)
            application.email_status = EmailStatus.SENT
        except EmailError as exc:
            application.email_status = EmailStatus.FAILED
            append_failure(application, f"email_status: {exc}")
        db.commit()


@router.post("/jobs/{job_id}/applications/upload", response_model=list[UploadResult], status_code=202)
async def upload_applications(
    job_id: str,
    files: list[UploadFile],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> list[UploadResult]:
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.OPEN:
        raise HTTPException(status_code=409, detail=f"Job is {job.status.value}, not OPEN — uploads are rejected")

    results: list[UploadResult] = []

    for file in files:
        raw_bytes = await file.read()
        content_type = file.content_type or "application/octet-stream"
        filename = file.filename or "upload"
        pathname = f"cvs/{job_id}/{uuid.uuid4()}-{filename}"

        candidate = Candidate()
        db.add(candidate)
        db.flush()

        application = Application(candidate_id=candidate.id, job_id=job_id)
        db.add(application)
        db.commit()

        # Storage upload, OCR, and everything downstream run in the background —
        # keeps the request fast for a batch of many files instead of doing each
        # file's blob upload (a blocking network call) on the event loop in turn.
        background_tasks.add_task(
            process_application, new_session, application.id, raw_bytes, filename, content_type, pathname
        )

        results.append(UploadResult(application_id=application.id, candidate_id=candidate.id))

    return results


@router.get("/jobs/{job_id}/applications", response_model=list[ApplicationWithCandidateOut])
def list_applications(job_id: str, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)) -> list[Application]:
    return (
        db.query(Application)
        .options(*_APPLICATION_LOAD_OPTIONS)
        .filter(Application.job_id == job_id)
        .order_by(Application.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/applications", response_model=list[ApplicationWithJobOut])
def list_all_applications(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)) -> list[ApplicationWithJobOut]:
    """Cross-job view for reporting/export — every candidate across every job, with the
    job's title attached so a recruiter can tell them apart without a separate lookup."""
    applications = (
        db.query(Application)
        .options(*_APPLICATION_LOAD_OPTIONS)
        .order_by(Application.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    result = []
    for application in applications:
        application.job_title = application.job.title  # transient attribute, not persisted — just for validation below
        try:
            notes = list(application.notes or [])
        except Exception:
            notes = []
        if not hasattr(application, "notes") or getattr(application, "notes", None) is None:
            notes = []
        application.notes = notes
        result.append(ApplicationWithJobOut.model_validate(application))
    return result


@router.get("/applications/{application_id}", response_model=ApplicationWithCandidateOut)
def get_application(application_id: str, db: Session = Depends(get_db)) -> Application:
    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.post("/applications/{application_id}/notes", response_model=ApplicationWithCandidateOut, status_code=201)
def add_note(application_id: str, payload: NoteCreate, db: Session = Depends(get_db)) -> Application:
    """A recruiter's own commentary, kept separate from ai_reason."""
    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")

    db.add(Note(application_id=application_id, text=payload.text.strip()))
    db.commit()
    db.refresh(application)
    return application


@router.patch("/applications/{application_id}/notes/{note_id}", response_model=ApplicationWithCandidateOut)
def update_note(application_id: str, note_id: str, payload: NoteUpdate, db: Session = Depends(get_db)) -> Application:
    note = db.query(Note).filter(Note.id == note_id, Note.application_id == application_id).first()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")

    note.text = payload.text.strip()
    note.updated_at = datetime.now(timezone.utc)
    db.commit()

    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.delete("/applications/{application_id}/notes/{note_id}", response_model=ApplicationWithCandidateOut)
def delete_note(application_id: str, note_id: str, db: Session = Depends(get_db)) -> Application:
    note = db.query(Note).filter(Note.id == note_id, Note.application_id == application_id).first()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()

    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.patch("/applications/{application_id}/status", response_model=ApplicationWithCandidateOut)
def override_application_status(
    application_id: str, payload: ApplicationStatusUpdate, db: Session = Depends(get_db)
) -> Application:
    """Recruiter override — e.g. reverse an auto-rejection. Sends the candidate the
    same status email the automated pipeline would, so they're notified either way."""
    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if payload.application_status not in MANUAL_OVERRIDE_STATUSES:
        raise HTTPException(status_code=400, detail=MANUAL_OVERRIDE_STATUSES_DETAIL)

    _apply_status_override(db, application, payload.application_status)
    return application


@router.patch("/applications/bulk-status", response_model=list[ApplicationWithCandidateOut])
def bulk_override_application_status(
    payload: BulkApplicationStatusUpdate, db: Session = Depends(get_db)
) -> list[Application]:
    """Same recruiter override as the single-application endpoint, applied to a batch
    (e.g. a page of selected candidates) — each gets its own status email."""
    if payload.application_status not in MANUAL_OVERRIDE_STATUSES:
        raise HTTPException(status_code=400, detail=MANUAL_OVERRIDE_STATUSES_DETAIL)
    if not payload.application_ids:
        raise HTTPException(status_code=400, detail="No application ids provided")

    applications = (
        db.query(Application)
        .options(*_APPLICATION_LOAD_OPTIONS)
        .filter(Application.id.in_(payload.application_ids))
        .all()
    )
    if not applications:
        raise HTTPException(status_code=404, detail="No matching applications found")

    for application in applications:
        _apply_status_override(db, application, payload.application_status)
    return applications


@router.post("/applications/{application_id}/retry", status_code=202)
def retry_application_endpoint(
    application_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
) -> dict[str, str]:
    """Re-runs the pipeline for one application that has a failed stage, resuming from
    wherever it actually failed instead of requiring the CV to be re-uploaded."""
    application = db.query(Application).filter(Application.id == application_id).first()
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    failed = any(
        status == StageStatus.FAILED
        for status in (application.ocr_status, application.parsing_status, application.ai_status)
    )
    if not failed:
        raise HTTPException(status_code=400, detail="No failed pipeline stage to retry")

    background_tasks.add_task(retry_application, new_session, application.id)
    return {"status": "retrying"}


@router.post("/applications/{application_id}/resend-email", response_model=ApplicationWithCandidateOut)
def resend_email(application_id: str, db: Session = Depends(get_db)) -> Application:
    """Resends the status email for whatever the application's current outcome
    already is — does not change application_status or re-run any scoring.
    Mainly for recovering from a one-off email failure (e.g. provider sandbox
    restrictions) without forcing a status override as a side effect."""
    application = (
        db.query(Application).options(*_APPLICATION_LOAD_OPTIONS).filter(Application.id == application_id).first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    candidate = application.candidate
    if not candidate.email:
        raise HTTPException(status_code=400, detail="No email address on file for this candidate")

    try:
        subject, html = build_status_email(
            application.application_status, candidate.name, application.job.title, get_settings().company_name
        )
        get_email_service().send(to=candidate.email, subject=subject, html=html)
        application.email_status = EmailStatus.SENT
        clear_stage_failure(application, "email_status")
    except EmailError as exc:
        application.email_status = EmailStatus.FAILED
        append_failure(application, f"email_status: {exc}")
    db.commit()
    return application


@router.delete("/applications/{application_id}", status_code=204)
def delete_application(application_id: str, db: Session = Depends(get_db)) -> None:
    application = db.query(Application).filter(Application.id == application_id).first()
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    candidate_id = application.candidate_id
    db.delete(application)
    db.commit()

    # The candidate row is global, not per-job — only remove it if this was their
    # last application anywhere, otherwise it'd delete a person still applied elsewhere.
    remaining = db.query(Application).filter(Application.candidate_id == candidate_id).count()
    if remaining == 0:
        db.query(Candidate).filter(Candidate.id == candidate_id).delete()
        db.commit()


@router.post("/applications/bulk-delete", status_code=204)
def bulk_delete_applications(payload: BulkDeleteRequest, db: Session = Depends(get_db)) -> None:
    """Same per-application delete semantics as the single endpoint, applied to a
    batch — POST rather than DELETE because a request body of ids on a DELETE isn't
    reliably supported across HTTP clients."""
    if not payload.application_ids:
        raise HTTPException(status_code=400, detail="No application ids provided")

    applications = db.query(Application).filter(Application.id.in_(payload.application_ids)).all()
    if not applications:
        raise HTTPException(status_code=404, detail="No matching applications found")

    candidate_ids = {application.candidate_id for application in applications}
    for application in applications:
        db.delete(application)
    db.commit()

    for candidate_id in candidate_ids:
        remaining = db.query(Application).filter(Application.candidate_id == candidate_id).count()
        if remaining == 0:
            db.query(Candidate).filter(Candidate.id == candidate_id).delete()
    db.commit()


@router.get("/applications/{application_id}/resume")
def get_application_resume(application_id: str, db: Session = Depends(get_db)) -> Response:
    application = db.query(Application).filter(Application.id == application_id).first()
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if not application.candidate.blob_url:
        raise HTTPException(status_code=404, detail="No resume file stored for this application")

    try:
        blob = get_storage_service().download(application.candidate.blob_url)
    except StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(
        content=blob.content,
        media_type=blob.content_type or "application/octet-stream",
        headers={"Cache-Control": "private, no-cache"},
    )
