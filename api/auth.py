"""
api/auth.py

Identity verification.

The provider is Clerk, but everything provider-specific is confined to
JwksVerifier and the settings it reads. Swapping to Auth0 or another OIDC issuer
means changing the issuer URL, not the routers.

How it works: Clerk signs session JWTs with RS256 and publishes the public keys
at {issuer}/.well-known/jwks.json. We fetch that key set, cache it, and verify
signatures locally. No network call per request, and the API never sees a
password or holds any secret key material.

Security properties that matter and are easy to get wrong:
  * signature is verified against the JWKS key matching the token's `kid`
  * `iss` must equal the configured issuer
  * `aud` is checked when an audience is configured
  * `exp`/`nbf` are enforced by PyJWT
  * an unknown `kid` triggers exactly one JWKS refetch, then fails
  * `alg` is pinned to RS256, so a token cannot downgrade itself to `none`
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .settings import Settings, get_settings

logger = logging.getLogger(__name__)

# auto_error=False so we can distinguish "no token" from "bad token" and support
# optional authentication on share-link routes.
bearer_scheme = HTTPBearer(auto_error=False)

ALLOWED_ALGORITHMS = ["RS256"]


@dataclass(frozen=True)
class Principal:
    """An authenticated caller."""

    subject: str          # provider's stable user id (Clerk `sub`)
    email: Optional[str] = None
    username: Optional[str] = None
    claims: Optional[Dict[str, Any]] = None

    @property
    def is_dev_identity(self) -> bool:
        return self.subject.startswith("dev:")


class JwksVerifier:
    """Caches the issuer's JWKS and verifies tokens against it."""

    def __init__(self, settings: Settings, cache_seconds: int = 3600):
        self._settings = settings
        self._cache_seconds = cache_seconds
        self._client: Optional[PyJWKClient] = None
        self._fetched_at: float = 0.0

    def _get_client(self, force_refresh: bool = False) -> PyJWKClient:
        stale = (time.monotonic() - self._fetched_at) > self._cache_seconds
        if self._client is None or force_refresh or stale:
            self._client = PyJWKClient(self._settings.jwks_url, cache_keys=True)
            self._fetched_at = time.monotonic()
        return self._client

    def verify(self, token: str) -> Dict[str, Any]:
        """
        Verify a JWT and return its claims. Raises jwt exceptions on failure.
        """
        options = {"verify_aud": bool(self._settings.clerk_audience)}
        audience = self._settings.clerk_audience or None

        def _decode(refresh: bool) -> Dict[str, Any]:
            signing_key = self._get_client(force_refresh=refresh).get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=ALLOWED_ALGORITHMS,
                issuer=self._settings.clerk_issuer,
                audience=audience,
                options=options,
            )

        try:
            return _decode(refresh=False)
        except jwt.PyJWKClientError:
            # Key rotation: the kid is not in our cached set. Refetch once.
            logger.info("JWKS miss, refreshing key set")
            return _decode(refresh=True)


_verifier: Optional[JwksVerifier] = None


def get_verifier(settings: Settings = Depends(get_settings)) -> JwksVerifier:
    global _verifier
    if _verifier is None:
        _verifier = JwksVerifier(settings)
    return _verifier


def _principal_from_claims(claims: Dict[str, Any]) -> Principal:
    return Principal(
        subject=claims["sub"],
        email=claims.get("email") or claims.get("email_address"),
        username=claims.get("username") or claims.get("name"),
        claims=claims,
    )


async def optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
    verifier: JwksVerifier = Depends(get_verifier),
) -> Optional[Principal]:
    """
    Resolve the caller if a valid token is present, otherwise None.

    Used by routes that serve both authenticated users and anonymous visitors
    following a share link.
    """
    if credentials is None or not credentials.credentials:
        return None

    token = credentials.credentials

    # Local development shortcut. Never available in production, and the
    # resulting Principal is marked so it cannot be mistaken for a real one.
    if token.startswith("dev:"):
        if settings.is_production or not settings.allow_dev_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Dev tokens are not accepted",
            )
        subject = token.strip()
        if subject == "dev:":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Dev token must be of the form dev:<user_id>",
            )
        return Principal(subject=subject, username=subject.split(":", 1)[1])

    if not settings.auth_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured on this server",
        )

    try:
        claims = verifier.verify(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
        )
    except jwt.InvalidTokenError as exc:
        # Deliberately vague to the client, detailed in the log
        logger.info("Rejected token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    except httpx.HTTPError as exc:
        logger.warning("JWKS fetch failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot reach the identity provider",
        )

    return _principal_from_claims(claims)


async def current_user(
    principal: Optional[Principal] = Depends(optional_user),
) -> Principal:
    """Require an authenticated caller."""
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal
