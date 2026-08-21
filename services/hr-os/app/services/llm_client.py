import json
import time

from google import genai
from google.genai.errors import APIError as GeminiAPIError
from google.genai.errors import ServerError as GeminiServerError
from openai import APITimeoutError as OpenAITimeoutError
from openai import InternalServerError as OpenAIInternalServerError
from openai import OpenAI, OpenAIError
from openai import RateLimitError as OpenAIRateLimitError

from app.core.config import get_settings

_RETRY_DELAYS = (2.0, 4.0, 8.0)  # exponential backoff, design doc Section 7


class LLMError(RuntimeError):
    """Non-retryable failure: bad request, missing config, malformed response."""


class LLMTransientError(LLMError):
    """Retryable failure: rate limit, timeout, or provider overload."""


def call_structured(system_prompt: str, user_prompt: str, schema: dict, schema_name: str, provider: str | None = None) -> dict:
    """Calls the given provider (or whichever AI_PROVIDER selects, by default) and
    returns the parsed JSON response."""
    settings = get_settings()
    if (provider or settings.ai_provider) == "openai":
        return _call_openai(system_prompt, user_prompt, schema, schema_name)
    return _call_gemini(system_prompt, user_prompt, schema)


def call_structured_with_retry(system_prompt: str, user_prompt: str, schema: dict, schema_name: str) -> dict:
    """Tries the configured primary provider first, retrying on transient failures
    (rate limit, timeout, provider overload) with exponential backoff. If the primary
    is still unavailable after retries — or fails outright with a non-transient error —
    falls back to the other configured provider before giving up entirely, so one
    provider's outage or exhausted quota doesn't take down AI matching altogether."""
    settings = get_settings()
    primary = settings.ai_provider
    fallback = "gemini" if primary == "openai" else "openai"

    try:
        return _call_with_retry(primary, system_prompt, user_prompt, schema, schema_name)
    except LLMError as primary_error:
        if not _is_configured(fallback, settings):
            raise
        try:
            return _call_with_retry(fallback, system_prompt, user_prompt, schema, schema_name)
        except LLMError:
            raise primary_error from None


def _is_configured(provider: str, settings) -> bool:
    return bool(settings.openai_api_key if provider == "openai" else settings.gemini_api_key)


def _call_with_retry(provider: str, system_prompt: str, user_prompt: str, schema: dict, schema_name: str) -> dict:
    last_error: LLMTransientError | None = None
    for delay in (0.0, *_RETRY_DELAYS):
        if delay:
            time.sleep(delay)
        try:
            return call_structured(system_prompt, user_prompt, schema, schema_name, provider=provider)
        except LLMTransientError as exc:
            last_error = exc
    raise last_error


def _call_openai(system_prompt: str, user_prompt: str, schema: dict, schema_name: str) -> dict:
    settings = get_settings()
    if not settings.openai_api_key:
        raise LLMError("OPENAI_API_KEY is not configured — set it in backend/.env to enable this.")

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": True},
            },
        )
    except (OpenAIRateLimitError, OpenAIInternalServerError, OpenAITimeoutError) as exc:
        raise LLMTransientError(str(exc)) from exc
    except OpenAIError as exc:
        raise LLMError(str(exc)) from exc

    return json.loads(response.choices[0].message.content)


def _call_gemini(system_prompt: str, user_prompt: str, schema: dict) -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise LLMError("GEMINI_API_KEY is not configured — set it in backend/.env to enable this.")

    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{system_prompt}\n\n{user_prompt}",
            config={"response_mime_type": "application/json", "response_json_schema": schema},
        )
    except GeminiServerError as exc:
        raise LLMTransientError(str(exc)) from exc
    except GeminiAPIError as exc:
        if exc.code == 429:
            raise LLMTransientError(str(exc)) from exc
        raise LLMError(str(exc)) from exc

    return json.loads(response.text)
