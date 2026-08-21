from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.services.llm_client import LLMError, LLMTransientError, call_structured_with_retry

AIMatchingError = LLMError
AIMatchingTransientError = LLMTransientError

_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "depth_assessment": {
            "type": "string",
            "description": (
                "For each required skill: is it backed by real evidence (specific projects, "
                "duration, complexity, outcomes) or just named with no substantiating detail? "
                "Also assess whether overall seniority/years of experience fit the role. Write "
                "this out before deciding the score."
            ),
        },
        "score": {
            "type": "integer",
            "description": (
                "Fit score from 1 (poor fit) to 10 (excellent, well-evidenced fit). Base this on "
                "depth_assessment, not keyword presence — reserve 9-10 for candidates who are both "
                "keyword-matched AND clearly demonstrate real depth. A resume that merely lists "
                "matching keywords with no substantiating detail should score in the low-to-middle "
                "range even if every required skill is technically 'present'."
            ),
        },
        "matched_skills": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Required/preferred skills backed by credible, demonstrated evidence — not just named.",
        },
        "missing_skills": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Required/preferred skills that are absent, or only superficially named with no real evidence.",
        },
        "reason": {"type": "string", "description": "One-sentence summary of the depth assessment, for a recruiter to read directly"},
    },
    "required": ["depth_assessment", "score", "matched_skills", "missing_skills", "reason"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "You are a rigorous technical recruiter screening a candidate's resume against a job "
    "description. Do not score on keyword presence alone — a resume that merely lists a "
    "required skill without any evidence of real, substantive experience using it (specific "
    "projects, duration, complexity, measurable outcomes) is weak evidence for that skill, "
    "even if the keyword literally appears in the text. Resumes that read as a list of "
    "buzzwords with no backing detail are a common resume-optimization tactic — score them "
    "low, don't reward them. The free deterministic ATS keyword filter already happens "
    "before you're called; your job is the judgment a keyword search can't do."
)


def _user_prompt(resume_text: str, jd_text: str) -> str:
    return f"Resume:\n{resume_text}\n\nJob description:\n{jd_text}"


@dataclass
class AIMatchResult:
    score: int
    matched_skills: list[str]
    missing_skills: list[str]
    reason: str


class AIMatchingService(ABC):
    @abstractmethod
    def score(self, resume_text: str, jd_text: str) -> AIMatchResult:
        """Score a resume against a job description, with an explainable reason."""


class LLMMatcher(AIMatchingService):
    """Real AI matching per design doc Section 3/6 — provider picked by AI_PROVIDER."""

    def score(self, resume_text: str, jd_text: str) -> AIMatchResult:
        data = call_structured_with_retry(_SYSTEM_PROMPT, _user_prompt(resume_text, jd_text), _RESULT_SCHEMA, "ats_match_result")
        # depth_assessment is a forcing function — making the model reason about evidence
        # before committing to a score — not something we persist or show separately.
        data.pop("depth_assessment", None)
        return AIMatchResult(**data)


def get_ai_matching_service() -> AIMatchingService:
    return LLMMatcher()
