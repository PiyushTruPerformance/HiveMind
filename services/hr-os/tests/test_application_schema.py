from datetime import datetime, timezone

from app.db.models import ApplicationStatus, EmailStatus, StageStatus
from app.schemas.application import ApplicationWithJobOut


class DummyCandidate:
    def __init__(self) -> None:
        self.id = "cand-1"
        self.name = "Ada"
        self.email = "ada@example.com"
        self.phone = None
        self.blob_url = None
        self.created_at = datetime.now(timezone.utc)


class DummyJob:
    def __init__(self) -> None:
        self.id = "job-1"
        self.title = "Senior Engineer"
        self.created_at = datetime.now(timezone.utc)


def test_application_with_job_out_defaults_notes_to_empty_list_when_missing() -> None:
    application = type(
        "DummyApplication",
        (),
        {
            "id": "app-1",
            "candidate_id": "cand-1",
            "job_id": "job-1",
            "application_status": ApplicationStatus.UPLOADED,
            "ocr_status": StageStatus.PENDING,
            "parsing_status": StageStatus.PENDING,
            "ai_status": StageStatus.PENDING,
            "email_status": EmailStatus.PENDING,
            "ocr_text": None,
            "ats_score": None,
            "ai_score": None,
            "matched_skills": None,
            "missing_skills": None,
            "ai_reason": None,
            "failure_reason": None,
            "retry_count": 0,
            "status_before_override": None,
            "overridden_at": None,
            "candidate": DummyCandidate(),
            "job": DummyJob(),
            "job_title": "Senior Engineer",
            "notes": None,
            "created_at": datetime.now(timezone.utc),
        },
    )()

    result = ApplicationWithJobOut.model_validate(application)

    assert result.notes == []
    assert result.job_title == "Senior Engineer"
