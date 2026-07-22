"""Application configuration.

All settings come from environment variables (or a .env file). Nothing is
hardcoded. This is deliberate — the same code image runs in dev, staging, and
prod with different env vars.

Import once at startup and reuse:

    from app.config import settings
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Environment ----
    app_env: Literal["development", "staging", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ---- Database ----
    # The app_role connection — used at runtime, RLS enforced.
    database_url: str = Field(
        ...,
        description=(
            "SQLAlchemy async URL for app_role. Must start with postgresql+asyncpg://. "
            "This role must NOT have BYPASSRLS."
        ),
    )
    # The postgres role connection — used by Alembic for migrations only.
    migration_database_url: str = Field(
        ...,
        description="SQLAlchemy async URL for the postgres role. Used by Alembic only.",
    )

    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_pool_timeout_seconds: int = 30
    db_echo_sql: bool = False

    # ---- Supabase Auth ----
    supabase_url: str = Field(..., description="e.g. https://xxxx.supabase.co")
    # Legacy — only used if you're on an old HS256 Supabase project. New
    # projects use asymmetric keys (ES256/RS256) and JWKS verification, which
    # doesn't need this secret. Kept for backward compat / manual override.
    supabase_jwt_secret: SecretStr | None = None
    supabase_jwt_algorithm: str = "ES256"  # informational; JWKS handles it
    supabase_jwt_audience: str = "authenticated"
    supabase_anon_key: SecretStr | None = None

    # ---- Redis (Upstash for arq queues) ----
    redis_url: str | None = None

    # ---- Meta Cloud API ----
    meta_graph_api_version: str = "v25.0"
    meta_graph_api_base_url: str = "https://graph.facebook.com"

    # Access token used by the backend to call Meta's Graph API. Dev: 24hr
    # token from the dashboard; prod: permanent System User token.
    meta_access_token: SecretStr | None = None

    # App Secret from Meta App Dashboard → Settings → Basic → App Secret.
    # Used to verify HMAC-SHA256 signatures on incoming webhooks.
    meta_app_secret: SecretStr | None = None

    # Verify token — a random string you choose. Same value goes into Meta's
    # webhook config and this env var. Used only during the initial GET
    # handshake when the webhook URL is saved.
    meta_webhook_verify_token: SecretStr | None = None

    # ---- CORS ----
    # Comma-separated list of frontend origins allowed to call the API.
    allowed_cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def allowed_cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings singleton. Call this once at startup, then import
    `settings` from this module for convenience."""
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
