"""Database engine, session factory, and worker/system session helpers.

This module is the SINGLE point of DB engine access in the app. Every code
path that needs a session gets one from a helper here — either via the FastAPI
deps in `auth.py` (which stitch this together with the auth chain) or via one
of the context managers here for arq workers and system operations.

Session variety
---------------
1. `get_tenant_scoped_session` (in `auth.py`) — FastAPI dependency, sets
   `app.current_tenant_id` from the authenticated user + active tenant.

2. `get_platform_admin_session` (in `auth.py`) — FastAPI dependency, sets
   `app.is_platform_admin = 'true'`.

3. `get_worker_session(tenant_id)` — context manager for arq workers. Takes
   an explicit tenant_id from the job payload.

4. `get_system_session()` — context manager for the webhook receiver and
   other cross-tenant staging operations. Does NOT set any tenant context —
   only used for tables that aren't RLS-protected (webhook_events).

All four use `SET LOCAL` inside a transaction — settings are cleared when the
transaction ends. No leakage between requests, even with connection pooling.
"""
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------
_db_url = settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg://", 1
)

engine = create_async_engine(
    _db_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_pre_ping=True,
    echo=settings.db_echo_sql,
    connect_args={"prepare_threshold": None},
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession,
)


# ---------------------------------------------------------------------------
# Internal: apply tenant scope on a session's transaction
# ---------------------------------------------------------------------------


async def apply_tenant_context(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    is_platform_admin: bool,
) -> None:
    """Set Postgres session variables that RLS policies key off.

    Uses `set_config(name, value, is_local=true)` — the SQL function form of
    SET LOCAL. Settings are transaction-scoped (is_local=true), cleared
    automatically when the transaction commits or rolls back. Caller must
    have an active transaction (typical pattern: `async with session.begin()`).

    Notes on unset settings
    -----------------------
    We only set variables that have real values. Unset settings return the
    empty string from `current_setting(name, TRUE)`, which is fine because
    every RLS policy in the schema uses `NULLIF(current_setting(...), '')`
    to convert empty strings to NULL before casting (see migration 0004).

    This is the same pattern used before the mid-diagnosis nil-UUID bandaid
    — reverted here now that the RLS policies handle unset settings
    correctly on their own.
    """
    if is_platform_admin:
        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )
    if tenant_id is not None:
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
    if user_id is not None:
        await session.execute(
            text("SELECT set_config('app.current_user_id', :uid, true)"),
            {"uid": str(user_id)},
        )


# ---------------------------------------------------------------------------
# Worker helpers
# ---------------------------------------------------------------------------


@asynccontextmanager
async def get_worker_session(
    tenant_id: uuid.UUID | str,
) -> AsyncIterator[AsyncSession]:
    """Context manager for arq worker functions.

    Every worker job carries a tenant_id in its payload — the dispatcher sets
    it when enqueuing. Workers must use this to get a scoped session:

        async def send_bulk_message(ctx, recipient_id, tenant_id):
            async with get_worker_session(tenant_id) as session:
                recipient = await session.get(CampaignRecipient, recipient_id)
                ...
    """
    if isinstance(tenant_id, str):
        tenant_id = uuid.UUID(tenant_id)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await apply_tenant_context(
                session,
                tenant_id=tenant_id,
                user_id=None,  # workers are not user-attributed
                is_platform_admin=False,
            )
            yield session


@asynccontextmanager
async def get_system_session() -> AsyncIterator[AsyncSession]:
    """Context manager for cross-tenant staging operations.

    Only use for tables NOT protected by RLS:
      - webhook_events (raw Meta webhook payloads before tenant resolution)

    Never query tenant-scoped tables from this session — RLS will return zero
    rows because no tenant context is set.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session


# ---------------------------------------------------------------------------
# Startup / shutdown hooks
# ---------------------------------------------------------------------------


async def dispose_engine() -> None:
    """Call this from FastAPI's shutdown event to close the pool cleanly."""
    await engine.dispose()
    logger.info("Database engine disposed")


async def ping() -> bool:
    """Health check — is the DB reachable?"""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.exception("Database ping failed: %s", exc)
        return False
