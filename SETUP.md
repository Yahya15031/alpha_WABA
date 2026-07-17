# Meta Integration — Phase 1 Foundation

This is the base layer. Schema, models, tenant-scoped DB session, auth abstraction.
Once this runs cleanly and you can log in and list your tenants, the next turn
adds the send pipeline (Meta API client, arq workers, webhook receiver, CSV ingest).

---

## What's in this bundle

| File | Purpose |
|------|---------|
| `pyproject.toml` | Python dependencies |
| `alembic.ini` | Alembic migration config |
| `alembic/env.py` | Alembic runtime setup |
| `alembic/versions/0001_phase1_baseline.py` | The full schema — tables, enums, indexes, RLS policies |
| `app/config.py` | Env-var driven settings (pydantic-settings) |
| `app/models.py` | SQLAlchemy 2.0 typed models — one class per table |
| `app/db.py` | Engine, session factory, `TenantScopedSession` dependency |
| `app/auth.py` | Auth provider abstraction + Supabase implementation + FastAPI deps |

---

## Bootstrap — do this once

### 1. Create the Supabase project

- Go to supabase.com → New Project.
- Region: pick whichever is closest to Render's region (they should be in the same
  region or you'll pay in every request latency).
- Note the Project Ref, DB password, and the direct DB connection string
  (Settings → Database → Connection string → URI).
- Note the JWT secret (Settings → API → JWT Settings → JWT Secret).
- Note the anon key and service_role key (Settings → API).

### 2. Create the dedicated app role in Postgres

By default, the `postgres` role in Supabase has `BYPASSRLS`. If our backend
connects as `postgres`, RLS policies won't apply — we lose the safety net.

Fix: create a dedicated role without BYPASSRLS.

In Supabase → SQL Editor, run this once:

```sql
-- Create the application role
CREATE ROLE app_role WITH LOGIN PASSWORD 'CHOOSE_A_STRONG_PASSWORD';

-- Grant it access to the public schema
GRANT USAGE ON SCHEMA public TO app_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_role;

-- Make sure future tables also get access (before migration runs)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO app_role;

-- Confirm it does NOT have BYPASSRLS (it shouldn't by default,
-- but let's be explicit)
ALTER ROLE app_role NOBYPASSRLS;
```

Then build the app_role connection string by taking your Supabase DB URI and
replacing the user + password:

```
postgresql+asyncpg://app_role:nskjsFsWe23dfe9s@db.sleeldbtpkqysqyzjkza.supabase.co:5432/postgres
```

That's the `DATABASE_URL` env var below.

### 3. Set env vars

Create a `.env` at the repo root:

```
# Postgres — the app_role connection (RLS applies)
DATABASE_URL=postgresql+asyncpg://app_role:nskjsFsWe23dfe9s@db.sleeldbtpkqysqyzjkza.supabase.co:5432/postgres

# Postgres — the postgres role connection, used by Alembic only (RLS bypassed for migrations)
postgresql+asyncpg://postgres.sleeldbtpkqysqyzjkza:e%26GF%24Eg-6dW%24heS@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres


# Supabase auth
SUPABASE_JWT_SECRET=KOzlj8j2S8H8mhtrq94Zh3QbuN4mg2ta/uQuFRLXyRUw7quQWQ8OmWTfh1Jb2DvFITAwMHmI/CxuPMSJPai/gA==
SUPABASE_URL=hhttps://sleeldbtpkqysqyzjkza.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsZWVsZGJ0cGtxeXNxeXpqa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzMyMDMsImV4cCI6MjA5OTg0OTIwM30.sCSp26FZ41uSnPpUCNQ_yCQWaJRFF4rnn_TDfAVBmFI

# Environment
APP_ENV=development
LOG_LEVEL=INFO
```

### 4. Install deps and run the migration

```bash
# Install
pip install -e .
# or with uv:
uv pip install -e .

# Run the migration (uses MIGRATION_DATABASE_URL, connects as postgres, bypasses RLS)
alembic upgrade head
```

The migration creates:
- All Postgres enum types
- All tables with proper foreign keys
- Composite indexes on `(tenant_id, ...)` for every RLS-protected table
- RLS policies keyed off `app.current_tenant_id` and `app.is_platform_admin` session settings

### 5. Seed a platform admin manually (one-time)

You need at least one platform admin to bootstrap. Do this in Supabase SQL Editor:

```sql
-- Assumes you've already signed up a user via Supabase Auth
-- Copy the user's UUID from auth.users
INSERT INTO users (supabase_user_id, email, full_name, is_platform_admin)
VALUES (
    'PASTE_SUPABASE_USER_UUID_HERE',
    'you@example.com',
    'Your Name',
    TRUE
);
```

From that point on, that user can create tenants via the API (routes come in a later turn).

---

## Verifying the foundation works

Once the migration runs cleanly, verify:

```sql
-- These should all return rows (as postgres/admin)
SELECT * FROM pg_type WHERE typname = 'tenant_status';
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- RLS should be enabled on operational tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('branches', 'contacts', 'campaigns', 'campaign_recipients',
                    'templates', 'wabas', 'phone_numbers', 'csv_imports',
                    'tenants', 'user_tenant_memberships');
-- rowsecurity should be 't' for all of them.

-- Policies should exist
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
```

Then in Python (this uses `get_worker_session` because we don't have an HTTP
context — the FastAPI dep-based sessions are used from routes):

```python
import asyncio
from sqlalchemy import text
from app.db import get_worker_session

async def check_isolation():
    async with get_worker_session(tenant_id="<some-tenant-uuid>") as session:
        # RLS is scoped to that tenant; this only counts that tenant's contacts.
        result = await session.execute(text("SELECT COUNT(*) FROM contacts"))
        print(result.scalar())

asyncio.run(check_isolation())
```

To prove isolation actually works, seed two tenants with different contacts
via SQL, then run the snippet above for each tenant_id and confirm you only
see that tenant's count.

---

## What's next (later turns)

1. Meta API client (async httpx wrapper for Cloud API `/messages`, template sync, webhook signature verification)
2. arq worker configs — two lanes: `q:transactional` (low concurrency, low latency) and `q:bulk` (high throughput)
3. Webhook receiver route + processing worker
4. CSV ingestion service (upload → validate → normalize → insert with idempotency)
5. FastAPI route layer wiring everything together
6. Render deployment config (Dockerfile + render.yaml)
7. End-to-end sandbox test: seed 2 tenants, send from both concurrently, prove no cross-leak
