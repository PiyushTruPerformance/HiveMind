import re

# canonical -> known variants/aliases. Keeps ATS matching deterministic (no LLM call per
# resume) while reducing false negatives from terminology differences like "Postgres" vs
# "PostgreSQL" — the exact gap flagged when the JD became a dynamic, LLM-extracted list.
_ALIASES: dict[str, list[str]] = {
    "postgresql": ["postgres"],
    "javascript": ["js"],
    "typescript": ["ts"],
    "csharp": ["c#", "c sharp"],
    "cplusplus": ["c++"],
    "kubernetes": ["k8s"],
    "nodejs": ["node.js", "node"],
    "amazon web services": ["aws"],
    "google cloud platform": ["gcp"],
    "microsoft azure": ["azure"],
    "continuous integration": ["ci/cd", "ci cd"],
    "machine learning": ["ml"],
    "artificial intelligence": ["ai"],
    "natural language processing": ["nlp"],
    "user interface": ["ui"],
    "user experience": ["ux"],
    "search engine optimization": ["seo"],
    "customer relationship management": ["crm"],
}

_PUNCT_RE = re.compile(r"[^a-z0-9+#. ]")


def _clean(term: str) -> str:
    return _PUNCT_RE.sub("", term.strip().lower()).strip()


def variants_for(term: str) -> set[str]:
    """All strings that should count as a match for `term`, including known aliases."""
    canonical = _clean(term)
    variants = {term.strip(), canonical}

    if canonical in _ALIASES:
        variants.update(_ALIASES[canonical])
    else:
        for canon, aliases in _ALIASES.items():
            if canonical in aliases or canonical == _clean(canon):
                variants.add(canon)
                variants.update(aliases)
                break

    return {v for v in variants if v}


def appears_in(term: str, text: str) -> bool:
    """Case-insensitive substring check for `term` or any of its known aliases in `text`."""
    lower_text = text.lower()
    return any(variant.lower() in lower_text for variant in variants_for(term))
