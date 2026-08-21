from app.core.config import get_settings
from app.db.models import ApplicationStatus
from app.services.ai_matching_service import AIMatchResult

# AI matching score is on a 1-10 scale (see ai_matching_service._RESULT_SCHEMA).
# Explicit product decision, 2026-06-25: 9-10 Shortlisted, 7-8 Review, 1-6 Rejected —
# unconditional for candidates who actually reached AI matching, no manual gate needed.
SHORTLIST_THRESHOLD = 9
REVIEW_THRESHOLD = 7


def reject_or_review() -> ApplicationStatus:
    # For candidates who never reached AI matching at all (failed the deterministic
    # ATS gate, see pipeline.py) — gate item #3 (auto-rejection policy) is still
    # unanswered by the manager for THIS path, so default to recruiter-gated review.
    settings = get_settings()
    return ApplicationStatus.REJECTED if settings.auto_reject_enabled else ApplicationStatus.REVIEW


def decide(ai_result: AIMatchResult) -> ApplicationStatus:
    if ai_result.score >= SHORTLIST_THRESHOLD:
        return ApplicationStatus.SHORTLISTED
    if ai_result.score >= REVIEW_THRESHOLD:
        return ApplicationStatus.REVIEW
    return ApplicationStatus.REJECTED
