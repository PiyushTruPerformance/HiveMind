from app.db.models import ApplicationStatus

_FONT = "font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;"


def _wrap(greeting_name: str, body_html: str, company_name: str) -> str:
    name = greeting_name or "there"
    return f"""
    <div style="{_FONT} max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi {name},</p>
      {body_html}
      <p style="margin-top: 24px;">Best regards,<br>{company_name}</p>
    </div>
    """.strip()


def _shortlisted(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"You've been shortlisted for {job_title}"
    body = f"""
      <p>Good news — your application for <strong>{job_title}</strong> has been
      shortlisted. Your background is a strong match for what we're looking for,
      and a member of our team will be in touch soon to discuss next steps.</p>
      <p>Thanks for your interest in joining us.</p>
    """
    return subject, _wrap(name, body, company_name)


def _review(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"Your application for {job_title} is under review"
    body = f"""
      <p>Thank you for applying for <strong>{job_title}</strong>. Your application
      has been received and is currently being reviewed by our team.</p>
      <p>We'll follow up with an update as soon as a decision is made — no action
      is needed from you in the meantime.</p>
    """
    return subject, _wrap(name, body, company_name)


def _rejected(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"Update on your application for {job_title}"
    body = f"""
      <p>Thank you for taking the time to apply for <strong>{job_title}</strong>
      and for your interest in joining us.</p>
      <p>After careful review, we've decided to move forward with other candidates
      for this particular role. This isn't a reflection of your qualifications —
      we encourage you to apply for future openings that match your background.</p>
      <p>We wish you the best in your search.</p>
    """
    return subject, _wrap(name, body, company_name)


def _interview(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"You're invited to interview for {job_title}"
    body = f"""
      <p>Great news — we'd like to invite you to interview for
      <strong>{job_title}</strong>. A member of our team will reach out shortly
      to schedule a time that works for you.</p>
      <p>We're looking forward to speaking with you.</p>
    """
    return subject, _wrap(name, body, company_name)


def _selected(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"You've been selected for {job_title}"
    body = f"""
      <p>Congratulations — you've been selected to move forward for
      <strong>{job_title}</strong>. We'll be in touch shortly with the details and
      next steps.</p>
      <p>We're excited about the possibility of you joining us.</p>
    """
    return subject, _wrap(name, body, company_name)


def _hired(name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"Welcome aboard — {job_title}"
    body = f"""
      <p>Congratulations and welcome — you've officially been hired for
      <strong>{job_title}</strong>. We'll follow up shortly with everything you
      need to get started.</p>
      <p>We're thrilled to have you join the team.</p>
    """
    return subject, _wrap(name, body, company_name)


def _generic(name: str, job_title: str, company_name: str, status: ApplicationStatus) -> tuple[str, str]:
    subject = f"Update on your application for {job_title}"
    body = f"""
      <p>There's an update on your application for <strong>{job_title}</strong>:
      status is now <strong>{status.value.replace("_", " ").title()}</strong>.</p>
      <p>We'll be in touch with further details.</p>
    """
    return subject, _wrap(name, body, company_name)


_BUILDERS = {
    ApplicationStatus.SHORTLISTED: _shortlisted,
    ApplicationStatus.REVIEW: _review,
    ApplicationStatus.REJECTED: _rejected,
    ApplicationStatus.INTERVIEW: _interview,
    ApplicationStatus.SELECTED: _selected,
    ApplicationStatus.HIRED: _hired,
}


def build_status_email(status: ApplicationStatus, candidate_name: str | None, job_title: str, company_name: str) -> tuple[str, str]:
    """Returns (subject, html) for the candidate-facing status email — never exposes
    raw enum values, internal AI scores, or missing-skill reasoning to the candidate."""
    builder = _BUILDERS.get(status)
    if builder is None:
        return _generic(candidate_name or "", job_title, company_name, status)
    return builder(candidate_name or "", job_title, company_name)
