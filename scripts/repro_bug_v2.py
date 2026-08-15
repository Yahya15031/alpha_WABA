"""Repro v2 — matches production's exact parameter binding style."""
from __future__ import annotations
import asyncio, uuid
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import select
from app.db import AsyncSessionLocal
from app.models import User

USER_UUID = uuid.UUID("a66a1b7a-3a82-4a29-82ef-e7e485f655c7")

async def main() -> None:
    # Test 1: raw text query, string param  (what the previous repro did)
    print("[1] text() with str(UUID)...")
    async with AsyncSessionLocal() as s:
        async with s.begin():
            try:
                from sqlalchemy import text
                r = await s.execute(
                    text("SELECT id FROM users WHERE supabase_user_id = :uid"),
                    {"uid": str(USER_UUID)},
                )
                print(f"    OK: {r.first()}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {str(e)[:200]}")

    # Test 2: raw text, UUID object as param  (closer to production)
    print("[2] text() with UUID object...")
    async with AsyncSessionLocal() as s:
        async with s.begin():
            try:
                from sqlalchemy import text
                r = await s.execute(
                    text("SELECT id FROM users WHERE supabase_user_id = :uid"),
                    {"uid": USER_UUID},
                )
                print(f"    OK: {r.first()}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {str(e)[:200]}")

    # Test 3: ORM select with UUID  (what auth.py line 259 actually does)
    print("[3] ORM select().where(...==UUID)...")
    async with AsyncSessionLocal() as s:
        async with s.begin():
            try:
                r = await s.scalar(
                    select(User).where(User.supabase_user_id == USER_UUID)
                )
                print(f"    OK: {r}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {str(e)[:200]}")

    # Test 4: same ORM query, but pass a string
    print("[4] ORM select with str(UUID)...")
    async with AsyncSessionLocal() as s:
        async with s.begin():
            try:
                r = await s.scalar(
                    select(User).where(User.supabase_user_id == str(USER_UUID))
                )
                print(f"    OK: {r}")
            except Exception as e:
                print(f"    FAIL: {type(e).__name__}: {str(e)[:200]}")

if __name__ == "__main__":
    import sys
    import selectors

    if sys.platform == "win32":
        # Force the Selector event loop specifically for Windows + Psycopg
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())
    else:
        asyncio.run(main())