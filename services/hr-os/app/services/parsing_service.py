import re
from dataclasses import dataclass

_EXPERIENCE_RE = re.compile(r"(\d+)\+?\s*years?", re.IGNORECASE)


@dataclass
class ParsedResume:
    experience_years: int | None


def parse_resume(text: str) -> ParsedResume:
    """Deterministic, no-LLM extraction — design doc Section 3, cuts AI spend by keeping
    the cheap stuff out of the paid step. Skill/education extraction moved to ATS
    screening (job.required_skills, direct text search) once the JD became the dynamic
    source of truth instead of a fixed SKILL_VOCABULARY."""
    experience_match = _EXPERIENCE_RE.search(text)
    return ParsedResume(experience_years=int(experience_match.group(1)) if experience_match else None)
