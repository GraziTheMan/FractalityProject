"""
Token verification tests.

These sign real RS256 tokens with a locally generated RSA key and serve the
matching JWKS, so signature verification is genuinely exercised rather than
mocked away. Each test targets a specific way JWT verification is commonly got
wrong.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from api.auth import JwksVerifier, Principal, optional_user
from api.settings import Settings

ISSUER = "https://example-app.clerk.accounts.dev"


@pytest.fixture(scope="module")
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key, key.public_key()


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        clerk_issuer=ISSUER,
        allow_dev_auth=True,
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
    )


class StubSigningKey:
    def __init__(self, key):
        self.key = key


class StubJwkClient:
    """Stands in for PyJWKClient, returning our public key for any kid."""

    def __init__(self, public_key, fail_first=False):
        self.public_key = public_key
        self.fail_first = fail_first
        self.calls = 0

    def get_signing_key_from_jwt(self, token):
        self.calls += 1
        if self.fail_first and self.calls == 1:
            raise jwt.PyJWKClientError("kid not found")
        return StubSigningKey(self.public_key)


def make_token(private_key, **overrides):
    claims = {
        "sub": "user_abc123",
        "iss": ISSUER,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "email": "someone@example.com",
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-kid"})


def verifier_for(settings, public_key, **kwargs):
    v = JwksVerifier(settings)
    v._client = StubJwkClient(public_key, **kwargs)
    v._fetched_at = time.monotonic()
    return v


# --- signature and claim verification -------------------------------------


def test_valid_token_verifies(settings, keypair):
    private_key, public_key = keypair
    token = make_token(private_key)

    claims = verifier_for(settings, public_key).verify(token)
    assert claims["sub"] == "user_abc123"


def test_expired_token_rejected(settings, keypair):
    private_key, public_key = keypair
    token = make_token(private_key, exp=int(time.time()) - 10)

    with pytest.raises(jwt.ExpiredSignatureError):
        verifier_for(settings, public_key).verify(token)


def test_wrong_issuer_rejected(settings, keypair):
    private_key, public_key = keypair
    token = make_token(private_key, iss="https://attacker.example.com")

    with pytest.raises(jwt.InvalidIssuerError):
        verifier_for(settings, public_key).verify(token)


def test_token_signed_by_a_different_key_rejected(settings, keypair):
    _, public_key = keypair
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = make_token(attacker_key)

    with pytest.raises(jwt.InvalidSignatureError):
        verifier_for(settings, public_key).verify(token)


def test_unsigned_alg_none_token_rejected(settings, keypair):
    """
    The classic JWT downgrade: re-sign the payload with alg=none. Verification
    pins algorithms to RS256, so this must fail rather than be trusted.
    """
    _, public_key = keypair
    token = jwt.encode({"sub": "attacker", "iss": ISSUER}, key="", algorithm="none")

    with pytest.raises(jwt.InvalidAlgorithmError):
        verifier_for(settings, public_key).verify(token)


def test_audience_enforced_when_configured(keypair):
    private_key, public_key = keypair
    settings = Settings(
        environment="development",
        clerk_issuer=ISSUER,
        clerk_audience="fractality-api",
        neo4j_uri="bolt://x",
        neo4j_password="p",
    )

    ok = make_token(private_key, aud="fractality-api")
    assert verifier_for(settings, public_key).verify(ok)["sub"] == "user_abc123"

    wrong = make_token(private_key, aud="some-other-api")
    with pytest.raises(jwt.InvalidAudienceError):
        verifier_for(settings, public_key).verify(wrong)


def test_jwks_refetched_once_on_unknown_kid(settings, keypair):
    """Key rotation must recover, not fail permanently."""
    private_key, public_key = keypair
    token = make_token(private_key)

    v = JwksVerifier(settings)
    stub = StubJwkClient(public_key, fail_first=True)
    v._client = stub
    v._fetched_at = time.monotonic()
    # Keep returning the same stub across the forced refresh
    v._get_client = lambda force_refresh=False: stub

    assert v.verify(token)["sub"] == "user_abc123"
    assert stub.calls == 2  # failed once, then succeeded


# --- the dev-auth escape hatch --------------------------------------------


class FakeCreds:
    def __init__(self, token):
        self.credentials = token
        self.scheme = "Bearer"


@pytest.mark.asyncio
async def test_no_credentials_yields_none(settings, keypair):
    _, public_key = keypair
    result = await optional_user(
        request=None,
        credentials=None,
        settings=settings,
        verifier=verifier_for(settings, public_key),
    )
    assert result is None


@pytest.mark.asyncio
async def test_dev_token_accepted_in_development(settings, keypair):
    _, public_key = keypair
    principal = await optional_user(
        request=None,
        credentials=FakeCreds("dev:alice"),
        settings=settings,
        verifier=verifier_for(settings, public_key),
    )
    assert principal.subject == "dev:alice"
    assert principal.is_dev_identity is True


@pytest.mark.asyncio
async def test_dev_token_refused_in_production(keypair):
    """
    The important one: a forged identity must never be accepted in production,
    even if ALLOW_DEV_AUTH was left switched on.
    """
    _, public_key = keypair
    settings = Settings(
        environment="production",
        clerk_issuer=ISSUER,
        allow_dev_auth=True,
        neo4j_uri="bolt://x",
        neo4j_password="p",
    )

    with pytest.raises(HTTPException) as exc:
        await optional_user(
            request=None,
            credentials=FakeCreds("dev:attacker"),
            settings=settings,
            verifier=verifier_for(settings, public_key),
        )
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_dev_token_refused_when_flag_disabled(keypair):
    _, public_key = keypair
    settings = Settings(
        environment="development",
        clerk_issuer=ISSUER,
        allow_dev_auth=False,
        neo4j_uri="bolt://x",
        neo4j_password="p",
    )

    with pytest.raises(HTTPException) as exc:
        await optional_user(
            request=None,
            credentials=FakeCreds("dev:alice"),
            settings=settings,
            verifier=verifier_for(settings, public_key),
        )
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_malformed_token_gives_401_not_500(settings, keypair):
    _, public_key = keypair

    with pytest.raises(HTTPException) as exc:
        await optional_user(
            request=None,
            credentials=FakeCreds("not-a-jwt"),
            settings=settings,
            verifier=verifier_for(settings, public_key),
        )
    assert exc.value.status_code == 401


# --- production configuration guards -------------------------------------


def test_production_config_flags_missing_pieces():
    problems = Settings(
        environment="production", neo4j_uri="", neo4j_password="", clerk_issuer=""
    ).validate_for_production()

    joined = " ".join(problems)
    assert "NEO4J" in joined
    assert "CLERK_ISSUER" in joined


def test_production_config_flags_dev_auth_and_wildcard_cors():
    problems = Settings(
        environment="production",
        neo4j_uri="neo4j+s://x",
        neo4j_password="p",
        clerk_issuer=ISSUER,
        allow_dev_auth=True,
        cors_origin="*",
    ).validate_for_production()

    joined = " ".join(problems)
    assert "ALLOW_DEV_AUTH" in joined
    assert "wildcard" in joined


def test_healthy_production_config_has_no_problems():
    assert Settings(
        environment="production",
        neo4j_uri="neo4j+s://x.databases.neo4j.io",
        neo4j_password="secret",
        clerk_issuer=ISSUER,
        allow_dev_auth=False,
        cors_origin="https://fractiverse.com",
    ).validate_for_production() == []
