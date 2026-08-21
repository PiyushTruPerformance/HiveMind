import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from app.core.config import get_settings

_jwks_client: PyJWKClient | None = None


def _get_jwks_client(issuer: str) -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(f"{issuer}/.well-known/jwks.json")
    return _jwks_client


def require_auth(authorization: str | None = Header(default=None)) -> dict:
    """Verifies the Clerk session JWT on every request.

    Dev-bypass: when CLERK_ISSUER isn't configured, auth is skipped entirely —
    mirrors the frontend's dev-bypass so local testing without a Clerk app works.
    """
    settings = get_settings()
    if settings.clerk_dev_bypass or not settings.clerk_issuer:
        return {}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ")

    try:
        signing_key = _get_jwks_client(settings.clerk_issuer).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["exp", "iat"]},
            leeway=10,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {exc}") from exc

    azp = payload.get("azp")
    if azp is not None and azp not in settings.cors_allow_origins:
        raise HTTPException(status_code=401, detail="Token issued for an unrecognized origin")

    return payload
