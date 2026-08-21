from abc import ABC, abstractmethod

import resend

from app.core.config import get_settings


class EmailError(RuntimeError):
    pass


class EmailService(ABC):
    @abstractmethod
    def send(self, to: str, subject: str, html: str) -> str:
        """Send an email and return the provider's message id."""


class ResendEmailService(EmailService):
    def send(self, to: str, subject: str, html: str) -> str:
        settings = get_settings()
        if not settings.resend_api_key:
            raise EmailError("RESEND_API_KEY is not configured — set it in backend/.env to enable email sending.")

        resend.api_key = settings.resend_api_key
        try:
            result = resend.Emails.send(
                {
                    "from": settings.resend_from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                }
            )
        except resend.exceptions.ResendError as exc:
            raise EmailError(str(exc)) from exc
        return result["id"]


def get_email_service() -> EmailService:
    return ResendEmailService()
