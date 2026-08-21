import re

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Application, ApplicationStatus, Candidate, EmailStatus, StageStatus
from app.services import ats_screening_service, decision_engine
from app.services.ai_matching_service import get_ai_matching_service
from app.services.dedup_service import find_existing_candidate
from app.services.email_service import EmailError, get_email_service
from app.services.email_templates import build_status_email
from app.services.identity_extraction_service import extract_identity, extract_identity_via_llm
from app.services.llm_client import LLMError
from app.services.ocr_service import get_ocr_service
from app.services.parsing_service import parse_resume
from app.services.storage_service import StorageError, get_storage_service


def _normalize(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def append_failure(application: Application, note: str) -> None:
    """Accumulates failure notes instead of overwriting — a later stage's failure
    shouldn't silently erase an earlier one (e.g. blob storage, then email). Skips
    appending if the most recent note is an exact repeat — a retry or resend hitting
    the same persistent error (e.g. an unverified email domain) shouldn't pile up the
    identical message every time it's clicked."""
    if application.failure_reason:
        last_note = application.failure_reason.rsplit("; ", 1)[-1]
        if last_note == note:
            return
        application.failure_reason = f"{application.failure_reason}; {note}"
    else:
        application.failure_reason = note


def clear_stage_failure(application: Application, stage_status_field: str) -> None:
    """Drops this stage's old note(s) from failure_reason on a successful retry —
    otherwise a fixed AI/OCR failure leaves a stale 'failed' message sitting next to
    the now-successful result, which reads as a bug to whoever's looking at it."""
    if not application.failure_reason:
        return
    remaining = [note for note in application.failure_reason.split("; ") if not note.startswith(f"{stage_status_field}:")]
    application.failure_reason = "; ".join(remaining) or None


def _fail(db: Session, application: Application, stage_status_field: str, error: Exception) -> None:
    setattr(application, stage_status_field, StageStatus.FAILED)
    append_failure(application, f"{stage_status_field}: {error}")
    application.retry_count += 1
    db.commit()


def _run_ocr(db: Session, application: Application, raw_bytes: bytes, filename: str, content_type: str) -> str | None:
    application.ocr_status = StageStatus.PROCESSING
    db.commit()
    try:
        ocr_text = get_ocr_service().extract_text(raw_bytes, filename, content_type)
        application.ocr_text = ocr_text
        application.ocr_status = StageStatus.SUCCESS
        clear_stage_failure(application, "ocr_status")
        db.commit()
        return ocr_text
    except Exception as exc:
        _fail(db, application, "ocr_status", exc)
        return None


def _run_identity_and_dedup(db: Session, application: Application, candidate: Candidate, normalized_text: str) -> Candidate | None:
    """Returns the candidate to proceed with, or None if this turned out to be a
    duplicate application (pipeline should stop — see the DUPLICATE branch below)."""
    identity = extract_identity(normalized_text)
    if identity.name is None or (identity.email is None and identity.phone is None):
        # Regex came up short on name and/or contact info — most real-world resumes
        # without a "Name:" header fall here (validation run, 2026-06-25). Worth an LLM
        # call since dedup, email delivery, and the recruiter-facing name all depend on it.
        try:
            llm_identity = extract_identity_via_llm(normalized_text)
            identity.name = identity.name or llm_identity.name
            identity.email = identity.email or llm_identity.email
            identity.phone = identity.phone or llm_identity.phone
        except LLMError as exc:
            # Best-effort enhancement — a failure here shouldn't kill the pipeline,
            # but it must be visible (was silently swallowed before, 2026-06-25 —
            # showed up as an unexplained "Unknown" candidate name).
            append_failure(application, f"identity_extraction: {exc}")

    candidate.name = identity.name
    candidate.email = identity.email
    candidate.phone = identity.phone
    db.commit()

    existing = find_existing_candidate(db, identity.email, identity.phone, exclude_id=candidate.id)
    if existing is None:
        return candidate

    duplicate_application = (
        db.query(Application)
        .filter(Application.candidate_id == existing.id, Application.job_id == application.job_id)
        .filter(Application.id != application.id)
        .first()
    )
    placeholder_candidate_id = candidate.id
    application.candidate_id = existing.id
    if duplicate_application is not None:
        application.application_status = ApplicationStatus.DUPLICATE
        db.commit()
        db.query(Candidate).filter(Candidate.id == placeholder_candidate_id).delete()
        db.commit()
        return None
    db.commit()
    db.query(Candidate).filter(Candidate.id == placeholder_candidate_id).delete()
    db.commit()
    return existing


def _send_decision_email(db: Session, application: Application, candidate: Candidate) -> None:
    try:
        if candidate.email:
            subject, html = build_status_email(
                application.application_status, candidate.name, application.job.title, get_settings().company_name
            )
            get_email_service().send(to=candidate.email, subject=subject, html=html)
        application.email_status = EmailStatus.SENT
    except EmailError as exc:
        application.email_status = EmailStatus.FAILED
        append_failure(application, f"email_status: {exc}")
    db.commit()


def _run_scoring(db: Session, application: Application, candidate: Candidate, normalized_text: str) -> None:
    """Parsing -> ATS -> AI matching -> decision -> email. Resumable on its own: every
    input it needs (ocr_text, candidate identity) is already persisted by this point,
    so a retry can re-enter here directly without redoing OCR/identity/dedup."""
    job = application.job

    application.parsing_status = StageStatus.PROCESSING
    db.commit()
    try:
        parsed = parse_resume(normalized_text)
        application.parsing_status = StageStatus.SUCCESS
        application.application_status = ApplicationStatus.PARSED
        clear_stage_failure(application, "parsing_status")
        db.commit()
    except Exception as exc:
        _fail(db, application, "parsing_status", exc)
        return

    ats_result = ats_screening_service.screen(
        normalized_text, job.required_skills or [], parsed.experience_years, job.experience_min
    )
    application.ats_score = ats_result.ats_score
    application.application_status = ApplicationStatus.SCREENED
    db.commit()

    if not ats_result.passes:
        # Hard ATS filter failed — never reaches the paid AI matching step (design doc Section 3).
        application.ai_reason = "Did not meet minimum ATS requirements — skipped AI matching."
        application.application_status = decision_engine.reject_or_review()
        db.commit()
    else:
        application.ai_status = StageStatus.PROCESSING
        db.commit()
        try:
            ai_result = get_ai_matching_service().score(normalized_text, job.jd)
            application.ai_status = StageStatus.SUCCESS
            application.ai_score = ai_result.score
            application.matched_skills = ai_result.matched_skills
            application.missing_skills = ai_result.missing_skills
            application.ai_reason = ai_result.reason
            clear_stage_failure(application, "ai_status")
            db.commit()
        except Exception as exc:
            _fail(db, application, "ai_status", exc)
            return

        application.application_status = decision_engine.decide(ai_result)
        db.commit()

    _send_decision_email(db, application, candidate)


def process_application(
    session_factory, application_id: str, raw_bytes: bytes, filename: str, content_type: str, pathname: str
) -> None:
    """Runs storage upload -> OCR -> identity -> dedup -> parsing -> ATS -> AI matching -> decision -> email.

    Takes a session factory rather than a session because this runs inside a
    BackgroundTask, after the request-scoped session from get_db() has closed.
    Storage upload lives here (not in the request handler) so a batch of N
    files doesn't block the event loop with N sequential blob uploads.
    """
    db = session_factory()
    try:
        application = db.query(Application).filter(Application.id == application_id).one()
        candidate = application.candidate

        try:
            candidate.blob_url = get_storage_service().upload(pathname, raw_bytes, content_type)
            db.commit()
        except StorageError as exc:
            append_failure(application, f"blob_storage: {exc}")
            db.commit()

        ocr_text = _run_ocr(db, application, raw_bytes, filename, content_type)
        if ocr_text is None:
            return

        normalized_text = _normalize(ocr_text)
        candidate = _run_identity_and_dedup(db, application, candidate, normalized_text)
        if candidate is None:
            return

        _run_scoring(db, application, candidate, normalized_text)
    finally:
        db.close()


def retry_application(session_factory, application_id: str) -> None:
    """Re-runs the pipeline for one application that previously failed a stage,
    without needing the original file re-uploaded. Resumes from whichever stage
    actually failed: re-downloads the stored resume and redoes OCR (+ identity/dedup,
    which only ever ran after a successful OCR) only if OCR itself never succeeded;
    otherwise jumps straight to scoring, reusing the already-persisted `ocr_text`.
    """
    db = session_factory()
    try:
        application = db.query(Application).filter(Application.id == application_id).one()
        candidate = application.candidate

        if application.ocr_status == StageStatus.SUCCESS and application.ocr_text:
            normalized_text = _normalize(application.ocr_text)
        else:
            if not candidate.blob_url:
                append_failure(application, "retry: no stored resume file to retry OCR against")
                db.commit()
                return
            try:
                blob = get_storage_service().download(candidate.blob_url)
            except StorageError as exc:
                append_failure(application, f"retry: {exc}")
                db.commit()
                return

            filename = candidate.blob_url.rsplit("/", 1)[-1]
            ocr_text = _run_ocr(db, application, blob.content, filename, blob.content_type or "application/octet-stream")
            if ocr_text is None:
                return

            normalized_text = _normalize(ocr_text)
            candidate = _run_identity_and_dedup(db, application, candidate, normalized_text)
            if candidate is None:
                return

        _run_scoring(db, application, candidate, normalized_text)
    finally:
        db.close()
