from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./cv_analyzer.db"

    blob_read_write_token: str | None = None

    resend_api_key: str | None = None
    resend_from_email: str = "no-reply@example.com"
    company_name: str = "the hiring team"

    clerk_secret_key: str | None = None
    clerk_issuer: str | None = None
    clerk_dev_bypass: bool = False

    tesseract_cmd: str = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    ai_provider: str = "openai"  # primary: "openai" (gpt-4o-mini). "gemini" is the automatic fallback if openai fails — see llm_client.py.
    openai_api_key: str | None = None
    gemini_api_key: str | None = None

    # localhost:3005 is the HiveX platform (hivex/), which is now the only
    # frontend for this service. 5173 remains for the standalone Vite app.
    # This list is also the allow-list for a Clerk token's `azp` claim
    # (see clerk_auth.require_auth) — an origin missing here is rejected even
    # though the CORS regex below would have let the request through.
    cors_allow_origins: list[str] = [
        "http://localhost:3005",
        "http://127.0.0.1:3005",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    max_retry_count: int = 3

    # Gate item #3 (auto-rejection policy) is still open with the manager — default safe:
    # low-scoring applications route to REVIEW, never an automatic REJECTED.
    auto_reject_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
