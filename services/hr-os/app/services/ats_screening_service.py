from dataclasses import dataclass

from app.services.skill_normalizer import appears_in


@dataclass
class ATSResult:
    passes: bool
    ats_score: int
    matched_required: list[str]
    missing_required: list[str]


def screen(
    resume_text: str,
    required_skills: list[str],
    experience_years: int | None = None,
    experience_min: int | None = None,
) -> ATSResult:
    """Deterministic, no-LLM filter — runs before the paid AI matching call.

    Matches directly against the resume text rather than a fixed vocabulary, since each
    job now carries its own LLM-extracted `required_skills` (jd_extraction_service).
    Education requirements are intentionally left to AI matching — degree-equivalence
    ("B.Tech" vs "Bachelor of Engineering") is exactly the kind of fuzzy judgment this
    deterministic stage isn't well-suited for.
    """
    if not required_skills:
        return ATSResult(passes=True, ats_score=100, matched_required=[], missing_required=[])

    matched = [skill for skill in required_skills if appears_in(skill, resume_text)]
    missing = [skill for skill in required_skills if skill not in matched]

    ats_score = round(100 * len(matched) / len(required_skills))
    passes = ats_score > 0

    if experience_min is not None and experience_years is not None and experience_years < experience_min:
        passes = False

    return ATSResult(passes=passes, ats_score=ats_score, matched_required=matched, missing_required=missing)
