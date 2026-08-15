"""Minimal reproduction of the /me 500 bug — isolates whether it's in
apply_tenant_context (RLS setup) or in the query itself.
"""
from __future__ import annotations
import asyncio, os, sys, uuid, selectors
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import text
from app.db import AsyncSessionLocal, apply_tenant_context

USER_ID = uuid.UUID("1d9c1a4d-27b1-4039-b5d8-3be2a3101964")
TENANT_ID = uuid.UUID("d206b6b3-cc46-4d67-a1f2-ecb5399c9fdd")

async def main() -> None:
    # ---- Test A: raw query, NO tenant context ----
    print("[A] Raw query with no RLS context...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            try:
                r = await session.execute(
                    text("SELECT id FROM users WHERE supabase_user_id = :uid"),
                    {"uid": str(USER_ID)},
                )
                print(f"    OK: {r.first()}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {e}")

    # ---- Test B: apply platform admin context, then query ----
    print("[B] With platform_admin context...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            try:
                await apply_tenant_context(
                    session, tenant_id=None, user_id=USER_ID,
                    is_platform_admin=True,
                )
                r = await session.execute(
                    text("SELECT id FROM users WHERE supabase_user_id = :uid"),
                    {"uid": str(USER_ID)},
                )
                print(f"    OK: {r.first()}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {e}")

    # ---- Test C: apply tenant context with a real tenant, then query ----
    print("[C] With tenant_id context...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            try:
                await apply_tenant_context(
                    session, tenant_id=TENANT_ID, user_id=USER_ID,
                    is_platform_admin=False,
                )
                r = await session.execute(
                    text("""
                        SELECT id FROM user_tenant_memberships
                        WHERE user_id = :uid AND tenant_id = :tid AND status = 'active'
                    """),
                    {"uid": str(USER_ID), "tid": str(TENANT_ID)},
                )
                print(f"    OK: {r.first()}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {e}")

    # ---- Test D: inspect what actually landed in the session settings ----
    print("[D] Inspecting session settings after apply...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await apply_tenant_context(
                session, tenant_id=TENANT_ID, user_id=USER_ID,
                is_platform_admin=False,
            )
            for k in ("app.current_tenant_id", "app.current_user_id", "app.is_platform_admin"):
                r = await session.execute(
                    text(f"SELECT current_setting('{k}', TRUE) AS v")
                )
                print(f"    {k} = {r.scalar()!r}")

if __name__ == "__main__":
    if sys.platform == "win32":
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())
    else:
        asyncio.run(main())