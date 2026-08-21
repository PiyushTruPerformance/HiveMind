import re
from dataclasses import dataclass

from app.services.llm_client import call_structured_with_retry

_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
# Requires NANP-style 3-3-4 digit grouping rather than just "8+ digits with separators" —
# the looser version matched date ranges like "2000 - 2003" as phone numbers, which could
# falsely merge two unrelated candidates whose resumes happen to share a date range (validation run, 2026-06-25).
_PHONE_RE = re.compile(r"(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
_NAME_LABEL_RE = re.compile(r"(?im)^\s*name\s*:\s*(.+)$")

_NON_NAME_HEADERS = {"resume", "curriculum vitae", "cv", "summary", "profile"}

_IDENTITY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": ["string", "null"], "description": "The candidate's full name, or null if not present"},
        "email": {"type": ["string", "null"], "description": "The candidate's email address, or null if not present"},
        "phone": {"type": ["string", "null"], "description": "The candidate's phone number, or null if not present"},
    },
    "required": ["name", "email", "phone"],
    "additionalProperties": False,
}

_IDENTITY_SYSTEM_PROMPT = (
    "Extract the candidate's name, email, and phone number from this resume text. "
    "The resume may use unusual formatting — the name is a person's name, not a job "
    "title, company name, or section header. Return null for any field that isn't "
    "actually present in the text; do not guess or invent values."
)


@dataclass
class Identity:
    name: str | None
    email: str | None
    phone: str | None


def _looks_like_person_name(line: str) -> bool:
    if not line or line.lower() in _NON_NAME_HEADERS:
        return False
    if any(ch.isdigit() for ch in line) or "@" in line:
        return False
    if line.isupper():
        # Real resumes generally render the candidate's name in Title Case; an
        # all-caps first line is almost always a job title or section header
        # (confirmed against a 78-resume real-world sample, validation run 2026-06-25).
        return False
    words = line.split()
    return 2 <= len(words) <= 4


def extract_identity(text: str) -> Identity:
    email_match = _EMAIL_RE.search(text)
    phone_match = _PHONE_RE.search(text)

    name_match = _NAME_LABEL_RE.search(text)
    if name_match:
        name = name_match.group(1).strip()
    else:
        first_line = next((line.strip() for line in text.splitlines() if line.strip()), None)
        name = first_line if first_line and _looks_like_person_name(first_line) else None

    return Identity(
        name=name,
        email=email_match.group(0) if email_match else None,
        phone=phone_match.group(0).strip() if phone_match else None,
    )


def extract_identity_via_llm(text: str) -> Identity:
    """Fallback for resumes without a labeled header — regex can't tell a name from
    a job title without an explicit "Name:" field, so this asks the configured LLM
    directly. Only worth calling when the cheap regex pass found nothing (see pipeline.py).

    Raises LLMError on failure rather than swallowing it — a quota/rate-limit failure
    here used to silently leave the candidate's name blank with zero record of why
    (caught via real user testing, 2026-06-25). Retries on transient errors (e.g. the
    503 "model overloaded" hit during real testing, 2026-06-25) with backoff."""
    data = call_structured_with_retry(_IDENTITY_SYSTEM_PROMPT, text, _IDENTITY_SCHEMA, "candidate_identity")
    return Identity(name=data.get("name"), email=data.get("email"), phone=data.get("phone"))
