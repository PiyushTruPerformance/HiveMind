from pydantic import BaseModel

from app.services.llm_client import call_structured_with_retry

_SCHEMA = {
    "type": "object",
    "properties": {
        "department": {"type": ["string", "null"]},
        "employment_type": {"type": ["string", "null"], "description": "Full Time, Part Time, Contract, or Internship"},
        "work_mode": {"type": ["string", "null"], "description": "Remote, Hybrid, or On-site"},
        "location": {"type": ["string", "null"]},
        "openings": {"type": ["integer", "null"]},
        "experience_min": {"type": ["integer", "null"], "description": "Minimum years of experience required"},
        "experience_max": {"type": ["integer", "null"], "description": "Maximum years of experience, if a range is given"},
        "salary_min": {"type": ["integer", "null"]},
        "salary_max": {"type": ["integer", "null"]},
        "education_requirements": {"type": "array", "items": {"type": "string"}},
        "required_skills": {"type": "array", "items": {"type": "string"}},
        "preferred_skills": {"type": "array", "items": {"type": "string"}},
        "responsibilities": {"type": "array", "items": {"type": "string"}},
        "certifications": {"type": "array", "items": {"type": "string"}},
        "languages": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}, "description": "Other notable terms an ATS keyword search might use"},
        "nice_to_have": {"type": "array", "items": {"type": "string"}, "description": "Non-skill bonuses, e.g. prior startup experience"},
    },
    "required": [
        "department", "employment_type", "work_mode", "location", "openings", "experience_min", "experience_max",
        "salary_min", "salary_max", "education_requirements", "required_skills", "preferred_skills",
        "responsibilities", "certifications", "languages", "keywords", "nice_to_have",
    ],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Extract structured hiring requirements from this job description. The role can be "
    "anything — software, healthcare, hospitality, education, sales, manufacturing, "
    "anything — so identify whatever skills, qualifications, and requirements are actually "
    "relevant to THIS specific role, not a fixed list. Distinguish required vs preferred "
    "skills based on the JD's own wording (e.g. \"must have\" vs \"nice to have\"). "
    "Leave a field null or as an empty list if the JD doesn't mention it — never invent values."
)

class ExtractedJD(BaseModel):
    department: str | None = None
    employment_type: str | None = None
    work_mode: str | None = None
    location: str | None = None
    openings: int | None = None
    experience_min: int | None = None
    experience_max: int | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    education_requirements: list[str] = []
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    responsibilities: list[str] = []
    certifications: list[str] = []
    languages: list[str] = []
    keywords: list[str] = []
    nice_to_have: list[str] = []


def extract_jd(jd_text: str) -> ExtractedJD:
    """Calls the configured LLM and validates its response through Pydantic before it
    ever reaches the database — the model's raw JSON is never trusted/stored directly."""
    data = call_structured_with_retry(_SYSTEM_PROMPT, jd_text, _SCHEMA, "extracted_jd")
    return ExtractedJD.model_validate(data)
