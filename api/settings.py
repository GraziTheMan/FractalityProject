"""
api/settings.py

Configuration for the Fractality API, read from the environment.

Everything secret lives here and only here — Neo4j credentials, provider API
keys. None of it is ever sent to the browser. The frontend's own config lives in
src/config/deploy.js and may only contain public values.
"""

from functools import lru_cache
from typing import List

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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
    # both spellings rather than silently defaulting to "neo4j" when someone
    # pastes the file's variable names verbatim.
    neo4j_user: str = Field(default="neo4j", validation_alias=AliasChoices("NEO4J_USER", "NEO4J_USERNAME"))
    neo4j_password: str = Field(default="")
    # Aura's default database is "neo4j". Override only if SHOW DATABASES says
    # otherwise — see scripts/check_neo4j.py.
    neo4j_database: str = Field(default="neo4j")

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
