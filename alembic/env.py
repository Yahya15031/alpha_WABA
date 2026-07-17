"""Alembic environment (Supabase-safe).

Fixes vs. the original version:
  1. Loads .env explicitly via python-dotenv — no need to pre-load env from
     PowerShell / shell profile.
  2. Does NOT pass the URL through Alembic's ConfigParser. ConfigParser treats
     `%` as interpolation and Supabase passwords often contain `%`. We build
     the engine directly from the URL instead.
  3. Passes `ssl='require'` via connect_args because the Supabase pooler
     enforces TLS and asyncpg needs it explicit for pooler hostnames.

Uses MIGRATION_DATABASE_URL (the `postgres` role via the Session Pooler on
port 5432, not the direct db.<project>.supabase.co URL which is IPv6-only).
"""
from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from dotenv import find_dotenv, load_dotenv
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

# ---- Load .env from repo root ----
_dotenv_path = find_dotenv(usecwd=True)
if _dotenv_path:
    load_dotenv(_dotenv_path, override=False)

# ---- Import models AFTER env is loaded ----
from app.models import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---- Read the migration URL ----
migration_url = os.environ.get("MIGRATION_DATABASE_URL")
if not migration_url:
    raise RuntimeError(
        "MIGRATION_DATABASE_URL is not set. Put it in .env at the repo root, "
        "or set it in the shell before running alembic. Use the Supabase "
        "Session Pooler URL (port 5432), not the direct db.<project>.supabase.co URL."
    )

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting."""
    context.configure(
        url=migration_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Build the engine directly from the URL — no ConfigParser in the way,
    # so `%` in the password doesn't get interpolated.
    connectable = create_async_engine(
        migration_url,
        poolclass=pool.NullPool,
        connect_args={
            # Supabase pooler enforces TLS. asyncpg needs this explicit for
            # pooler hostnames — without it the handshake fails and asyncpg
            # bundles the failure as `TargetServerAttributeNotMatched`.
            "ssl": "require",
        },
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
