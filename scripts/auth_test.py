"""Prove the auth chain end to end.

Steps:
  1. Log in to Supabase with an existing user's credentials → get a JWT.
  2. Call the backend /me endpoint with that JWT.
  3. Print the /me response.

Requires:
  - The user already exists in Supabase (create in dashboard → Authentication
    → Users → Add user; skip email confirmation)
  - .env at the repo root contains SUPABASE_URL and SUPABASE_ANON_KEY
  - Backend is deployed and reachable

Usage (from repo root, venv active):
  python scripts/auth_test.py <email> <password>

Example:
  python scripts/auth_test.py yahya.something@gmail.com SomePassword123
"""
from __future__ import annotations

import asyncio
import os
import sys

import httpx
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(r"C:\Users\Home\GitHub\alpha_WABA\.env", raise_error_if_not_found=True))


DEFAULT_BACKEND_URL = "https://alpha-waba-api.onrender.com"


async def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python scripts/auth_test.py <email> <password>")
        sys.exit(1)

    email, password = sys.argv[1], sys.argv[2]

    supabase_url = os.environ.get("SUPABASE_URL")
    anon_key = os.environ.get("SUPABASE_ANON_KEY")
    backend_url = os.environ.get("BACKEND_URL", DEFAULT_BACKEND_URL)

    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not anon_key:
        missing.append("SUPABASE_ANON_KEY")
    if missing:
        print(f"Missing in .env: {', '.join(missing)}")
        print("Supabase Dashboard → Project Settings → API to get both values.")
        sys.exit(1)

    print("=" * 60)
    print("Auth chain test")
    print("=" * 60)
    print(f"Supabase: {supabase_url}")
    print(f"Backend:  {backend_url}")
    print(f"User:     {email}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # ---- Step 1: Supabase login ----
        print("\n[1/2] Logging in to Supabase...")
        login_response = await client.post(
            f"{supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={
                "apikey": anon_key,
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password},
        )

        if login_response.status_code != 200:
            print(f"  FAILED: HTTP {login_response.status_code}")
            print(f"  Response body: {login_response.text}")
            print("\nCommon causes:")
            print("  - Wrong email/password")
            print("  - User exists but email confirmation is required")
            print("    (Supabase → Auth → Providers → Email → turn OFF 'Confirm email')")
            print("  - SUPABASE_URL or SUPABASE_ANON_KEY wrong")
            sys.exit(1)

        login_data = login_response.json()
        jwt = login_data.get("access_token")
        if not jwt:
            print("  FAILED: no access_token in response")
            print(f"  Response: {login_data}")
            sys.exit(1)

        print(f"  OK. JWT (first 40 chars): {jwt[:40]}...")
        print(f"  Token expires in: {login_data.get('expires_in')} seconds")

        # ---- Step 2: Backend /me ----
        print(f"\n[2/2] Calling {backend_url}/me...")
        me_response = await client.get(
            f"{backend_url}/me",
            headers={"Authorization": f"Bearer {jwt}"},
        )

        print(f"  HTTP {me_response.status_code}")
        print(f"  Response body: {me_response.text}")

        if me_response.status_code == 200:
            print("\n" + "=" * 60)
            print("AUTH CHAIN WORKS END TO END.")
            print("=" * 60)
            print("Supabase login → JWT → backend verify → user upsert → response.")
            print("Every link in the chain is live.")
        else:
            print("\nAuth chain broken — see response above.")
            print("If HTTP 401: SUPABASE_JWT_SECRET in Render env doesn't match")
            print("             the JWT secret in Supabase → Settings → API.")
            print("If HTTP 500: check Render logs for a stack trace.")
            sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
