"""Prove tenant isolation is working.

Usage (from repo root, with venv active):

    python scripts/check_isolation.py

Prerequisites:
  1. `alembic upgrade head` has been run.
  2. `scripts/seed_test_data.sql` has been executed in Supabase SQL Editor.
  3. `.env` at the repo root contains DATABASE_URL for the app_role user.

Expected output if RLS is enforcing scoping:

    Acme Corp        expected=3  actual=3    PASS
    Globex Corp      expected=2  actual=2    PASS
    Fake tenant      expected=0  actual=0    PASS

If any actual count differs (especially if all three show 5, the total),
RLS is NOT being applied and something is broken. Stop and investigate
before proceeding with the next foundation piece.
"""
from __future__ import annotations

import asyncio

from dotenv import find_dotenv, load_dotenv

# .env MUST load before app modules import — app.config reads env at module load.
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import text  # noqa: E402

from app.db import get_worker_session  # noqa: E402

TEST_CASES = [
    ("Acme Corp",   "11111111-1111-1111-1111-111111111111", 3),
    ("Globex Corp", "22222222-2222-2222-2222-222222222222", 2),
    ("Fake tenant", "99999999-9999-9999-9999-999999999999", 0),
]


async def main() -> None:
    print("Testing tenant isolation via RLS")
    print("=" * 60)
    all_pass = True

    for name, tenant_id, expected in TEST_CASES:
        async with get_worker_session(tenant_id=tenant_id) as session:
            result = await session.execute(text("SELECT COUNT(*) FROM contacts"))
            actual = result.scalar()
            status = "PASS" if actual == expected else "FAIL"
            if actual != expected:
                all_pass = False
            print(f"  [{status}] {name:<15} expected={expected}  actual={actual}")

    print("=" * 60)
    if all_pass:
        print("All isolation checks passed. RLS is enforcing tenant scoping.")
    else:
        print("ISOLATION BROKEN. One or more counts diverged from expected.")
        print("Do NOT proceed to next steps until this is understood.")


if __name__ == "__main__":
    asyncio.run(main())
