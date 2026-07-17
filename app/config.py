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
    supabase_jwt_secret: SecretStr = Field(
        ..., description="Symmetric JWT secret from Supabase → Settings → API"
    )
    supabase_jwt_algorithm: str = "HS256"
    supabase_jwt_audience: str = "authenticated"
    supabase_anon_key: SecretStr | None = None

    # ---- Redis (for arq queues, wired in next turn) ----
    redis_url: str | None = None

    # ---- Meta Cloud API (wired in next turn) ----
    meta_graph_api_version: str = "v25.0"
    meta_graph_api_base_url: str = "https://graph.facebook.com"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings singleton. Call this once at startup, then import
    `settings` from this module for convenience."""
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
