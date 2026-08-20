"""
api/settings.py

Configuration for the Fractality API, read from the environment.

Everything secret lives here and only here — Neo4j credentials, provider API
keys. None of it is ever sent to the browser. The frontend's own config lives in
src/config/deploy.js and may only contain public values.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Both filenames, with .env.local winning — the same precedence Vite uses, so
    # the two halves of the project do not disagree about which file is the more
    # specific one.
    #
    # `.env` alone was a trap: .env.example tells you to copy it to `.env.local`
    # (correct for the frontend, which is what that file was written for), and doing
    # so produced a file the API never read. Nothing reported this; the values were
    # simply absent.
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- service ----------------------------------------------------------
    app_name: str = "Fractality API"
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # --- CORS -------------------------------------------------------------
    # Comma-separated list. Must be explicit origins, not "*", because the
    # frontend sends credentials and browsers reject wildcard + credentials.
    cors_origin: str = Field(default="http://localhost:3000,http://localhost:5173")

    # --- Neo4j ------------------------------------------------------------
    # AuraDB uses the neo4j+s:// scheme (TLS). A local instance uses bolt://.
    neo4j_uri: str = Field(default="")

    # Aura's downloaded credentials file spells this NEO4J_USERNAME, so accept
    # both spellings — pasting the file's own variable names must work.
    #
    # Do NOT assume the username is "neo4j". Current Aura issues the instance ID
    # as the username (e.g. 1efeea86, matching the URI subdomain and
    # AURA_INSTANCEID). Older instances used "neo4j", hence the fallback, but
    # treating that as the norm is wrong.
    neo4j_user: str = Field(
        default="neo4j",
        validation_alias=AliasChoices("NEO4J_USER", "NEO4J_USERNAME"),
    )
    neo4j_password: str = Field(default="")

    # Empty means "let the server pick the default database for this user".
    #
    # This is deliberately NOT defaulted to "neo4j". Hardcoding that name and
    # passing it to every session makes each query fail with DatabaseNotFound on
    # any instance whose default database is named differently — which is a real
    # configuration Aura hands out. Only set this if you specifically need a
    # non-default database; scripts/check_neo4j.py will list what exists.
    neo4j_database: str = Field(default="")

    # --- auth (Clerk) -----------------------------------------------------
    # The issuer is shown in the Clerk dashboard, e.g.
    #   https://your-app-12.clerk.accounts.dev
    # JWKS is discovered from it, so no key material is configured here.
    clerk_issuer: str = Field(default="")
    clerk_audience: str = Field(default="")
    # Escape hatch for local development ONLY: accept a fake bearer token of the
    # form "dev:<user_id>". Refused outright when environment == "production".
    allow_dev_auth: bool = Field(default=False)

    # --- limits -----------------------------------------------------------
    max_nodes_per_map: int = Field(default=10_000)
    max_maps_per_user: int = Field(default=500)

    # Feed posting rate limit, per user per hour. Counted from stored pulses
    # rather than in memory, because Render runs more than one instance and a
    # per-process counter would give each of them its own allowance.
    max_pulses_per_hour: int = Field(default=20)

    #: More generous than posting, because a conversation is many short turns and
    #: a limit tuned for broadcasting would throttle a discussion. Still a limit:
    #: the failure it guards against is a script, not an enthusiastic person.
    max_comments_per_hour: int = Field(default=120)

    #: How long startup waits for Neo4j before booting without it.
    #:
    #: Bounded because an unreachable host does not raise, it blocks — so the
    #: "boot anyway and let /health report it" behaviour needs a deadline to be real.
    #: 20s is generous for a cold Aura instance waking up and short enough that a
    #: deploy is not held open by a database that is never coming back.
    startup_db_timeout_seconds: float = Field(default=20.0, gt=0)

    @field_validator("environment")
    @classmethod
    def _normalize_env(cls, v: str) -> str:
        return v.strip().lower()

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origin.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment in {"production", "prod"}

    @property
    def neo4j_configured(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)

    @property
    def database_or_default(self) -> Optional[str]:
        """
        The database to open sessions against, or None to accept the server's
        default. Always use this rather than reading neo4j_database directly:
        passing an empty string to the driver is not the same as passing None.
        """
        return self.neo4j_database or None

    @property
    def database_label(self) -> str:
        """Human-readable database name, for logs and health output."""
        return self.neo4j_database or "<server default>"

    @property
    def auth_configured(self) -> bool:
        return bool(self.clerk_issuer)

    @property
    def jwks_url(self) -> str:
        return f"{self.clerk_issuer.rstrip('/')}/.well-known/jwks.json"

    def validate_for_production(self) -> List[str]:
        """
        Problems that must not ship. Returned rather than raised so the caller
        can log them all at once.
        """
        problems: List[str] = []

        if not self.neo4j_configured:
            problems.append("NEO4J_URI/NEO4J_PASSWORD are not set")
        if not self.auth_configured:
            problems.append("CLERK_ISSUER is not set; every write would be unauthenticated")
        if self.allow_dev_auth:
            problems.append("ALLOW_DEV_AUTH is enabled, which accepts forged identities")
        if "*" in self.cors_origins:
            problems.append("CORS_ORIGIN is a wildcard, which cannot be used with credentials")

        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
