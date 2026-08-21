from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import Candidate


def find_existing_candidate(db: Session, email: str | None, phone: str | None, exclude_id: str) -> Candidate | None:
    """Global match on email OR phone, per design doc Section 4 (not scoped to a job)."""
    if not email and not phone:
        return None

    filters = []
    if email:
        filters.append(Candidate.email == email)
    if phone:
        filters.append(Candidate.phone == phone)

    return (
        db.query(Candidate)
        .filter(Candidate.id != exclude_id)
        .filter(or_(*filters))
        .first()
    )
