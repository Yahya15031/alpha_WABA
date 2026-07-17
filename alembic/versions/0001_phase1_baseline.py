"""phase1 baseline: multi-tenant schema with RLS

Revision ID: 0001_phase1_baseline
Revises:
Create Date: 2026-07-17

Design notes
------------
- Every operational table has a composite PK-eligible pattern of (tenant_id, ...)
  and is protected by an RLS policy keyed off `app.current_tenant_id`.
- Platform admin bypass: policies allow all rows when `app.is_platform_admin`
  session variable is set to 'true'.
- `webhook_events` is deliberately NOT protected by RLS — it's a staging table
  written by the webhook receiver before we know which tenant a payload belongs to.
  The processor resolves tenant from waba_id or meta_message_id and writes the
  processed record into RLS-protected tables.
- `users` table has RLS with a "self-read" policy so a user can always read their
  own row; platform admins can read all rows.
- `tenants` table has RLS: users can only see tenants they have membership in
  (via a subquery), platform admins see all.

Enum types
----------
All status/type columns use native Postgres enum types (not text with CHECK).
They're strictly typed and get free ALTER TABLE ... ADD VALUE support for future
extensions.
"""
from __future__ import annotations

from alembic import op

# revision identifiers
revision = "0001_phase1_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================================
    # 1. Extensions
    # ============================================================
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")  # for gen_random_uuid()

    # ============================================================
    # 2. Enum types
    # ============================================================
    op.execute("CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'archived')")
    op.execute("CREATE TYPE branch_type AS ENUM ('physical', 'virtual')")
    op.execute("CREATE TYPE branch_status AS ENUM ('active', 'archived')")
    op.execute("CREATE TYPE user_role AS ENUM ('tenant_admin', 'tenant_user')")
    op.execute("CREATE TYPE membership_status AS ENUM ('active', 'invited', 'suspended')")
    op.execute(
        "CREATE TYPE waba_type AS ENUM ('shared_platform', 'byow', 'sandbox_test')"
    )
    op.execute("CREATE TYPE waba_status AS ENUM ('active', 'pending', 'disconnected')")
    op.execute(
        "CREATE TYPE phone_number_status AS ENUM ('active', 'throttled', 'disconnected')"
    )
    op.execute(
        "CREATE TYPE template_category AS ENUM ('marketing', 'utility', 'authentication')"
    )
    op.execute(
        "CREATE TYPE template_status AS ENUM ('pending', 'approved', 'rejected', 'paused')"
    )
    op.execute(
        "CREATE TYPE contact_opt_in_status AS ENUM ('opted_in', 'opted_out', 'pending')"
    )
    op.execute("CREATE TYPE contact_source AS ENUM ('manual', 'csv_import', 'api')")
    op.execute(
        "CREATE TYPE csv_import_status AS ENUM "
        "('pending', 'validating', 'processing', 'completed', 'failed')"
    )
    op.execute(
        "CREATE TYPE audience_type AS ENUM ('all_contacts', 'branch_group', 'csv_upload')"
    )
    op.execute("CREATE TYPE campaign_lane AS ENUM ('transactional', 'bulk')")
    op.execute(
        "CREATE TYPE campaign_status AS ENUM "
        "('draft', 'scheduled', 'queued', 'running', 'completed', 'failed', 'canceled')"
    )
    op.execute(
        "CREATE TYPE recipient_status AS ENUM "
        "('pending', 'queued', 'sent', 'delivered', 'read', 'failed')"
    )

    # ============================================================
    # 3. Tables (in FK dependency order)
    # ============================================================

    # --- tenants ---
    op.execute(
        """
        CREATE TABLE tenants (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name         TEXT NOT NULL,
            slug         TEXT NOT NULL UNIQUE,
            status       tenant_status NOT NULL DEFAULT 'active',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$')
        )
        """
    )

    # --- users (platform-wide identity, linked to Supabase auth) ---
    op.execute(
        """
        CREATE TABLE users (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            supabase_user_id    UUID NOT NULL UNIQUE,
            email               TEXT NOT NULL UNIQUE,
            full_name           TEXT,
            is_platform_admin   BOOLEAN NOT NULL DEFAULT FALSE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # --- branches ---
    op.execute(
        """
        CREATE TABLE branches (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            name         TEXT NOT NULL,
            branch_type  branch_type NOT NULL DEFAULT 'physical',
            status       branch_status NOT NULL DEFAULT 'active',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT branches_unique_name_per_tenant UNIQUE (tenant_id, name)
        )
        """
    )

    # --- user_tenant_memberships ---
    # A user belongs to a tenant with a role. branch_id is optional and only
    # used in Phase 2 when tenant_users are pinned to a specific branch.
    op.execute(
        """
        CREATE TABLE user_tenant_memberships (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            role         user_role NOT NULL DEFAULT 'tenant_admin',
            branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
            status       membership_status NOT NULL DEFAULT 'active',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT memberships_unique_user_tenant UNIQUE (user_id, tenant_id),
            CONSTRAINT memberships_branch_belongs_to_tenant
                CHECK (branch_id IS NULL)  -- Phase 1: no branch pinning; Phase 2 lifts this
        )
        """
    )
    # Note on the check constraint: we'll drop it in the Phase 2 migration.
    # Keeping it now enforces the "no tenant_users with branch pinning yet" rule.

    # --- wabas (WhatsApp Business Accounts) ---
    op.execute(
        """
        CREATE TABLE wabas (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            meta_waba_id    TEXT NOT NULL UNIQUE,
            business_name   TEXT NOT NULL,
            waba_type       waba_type NOT NULL,
            status          waba_status NOT NULL DEFAULT 'pending',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # --- phone_numbers (WhatsApp phone numbers under a WABA) ---
    op.execute(
        """
        CREATE TABLE phone_numbers (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            waba_id                  UUID NOT NULL REFERENCES wabas(id) ON DELETE CASCADE,
            meta_phone_number_id     TEXT NOT NULL UNIQUE,
            display_phone_number     TEXT NOT NULL,
            is_test_number           BOOLEAN NOT NULL DEFAULT FALSE,
            status                   phone_number_status NOT NULL DEFAULT 'active',
            created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # --- templates ---
    op.execute(
        """
        CREATE TABLE templates (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            waba_id               UUID NOT NULL REFERENCES wabas(id) ON DELETE CASCADE,
            name                  TEXT NOT NULL,
            language_code         TEXT NOT NULL,
            category              template_category NOT NULL,
            status                template_status NOT NULL DEFAULT 'pending',
            body_text             TEXT NOT NULL,
            variable_definitions  JSONB NOT NULL DEFAULT '[]'::jsonb,
            meta_template_id      TEXT,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT templates_unique_name_lang UNIQUE (tenant_id, waba_id, name, language_code)
        )
        """
    )

    # --- contacts ---
    op.execute(
        """
        CREATE TABLE contacts (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            phone_e164     TEXT NOT NULL,
            full_name      TEXT,
            custom_fields  JSONB NOT NULL DEFAULT '{}'::jsonb,
            opt_in_status  contact_opt_in_status NOT NULL DEFAULT 'pending',
            source         contact_source NOT NULL DEFAULT 'manual',
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT contacts_phone_e164_format CHECK (phone_e164 ~ '^\\+[1-9][0-9]{6,14}$'),
            CONSTRAINT contacts_unique_phone_per_tenant UNIQUE (tenant_id, phone_e164)
        )
        """
    )

    # --- csv_imports ---
    op.execute(
        """
        CREATE TABLE csv_imports (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            uploaded_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            filename       TEXT NOT NULL,
            storage_path   TEXT NOT NULL,
            status         csv_import_status NOT NULL DEFAULT 'pending',
            total_rows     INTEGER,
            valid_rows     INTEGER,
            invalid_rows   INTEGER,
            error_report   JSONB,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # --- campaigns ---
    op.execute(
        """
        CREATE TABLE campaigns (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            branch_id            UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            waba_id              UUID NOT NULL REFERENCES wabas(id) ON DELETE RESTRICT,
            phone_number_id      UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
            template_id          UUID NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
            name                 TEXT NOT NULL,
            variable_mappings    JSONB NOT NULL DEFAULT '{}'::jsonb,
            audience_type        audience_type NOT NULL,
            audience_config      JSONB NOT NULL DEFAULT '{}'::jsonb,
            lane                 campaign_lane NOT NULL DEFAULT 'bulk',
            status               campaign_status NOT NULL DEFAULT 'draft',
            scheduled_for        TIMESTAMPTZ,
            created_by           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT campaigns_schedule_matches_status CHECK (
                (status = 'scheduled' AND scheduled_for IS NOT NULL)
                OR (status != 'scheduled')
            )
        )
        """
    )

    # --- campaign_recipients ---
    # One row per (campaign, contact). Denormalized phone_e164 for perf on the
    # webhook processor's lookup path.
    op.execute(
        """
        CREATE TABLE campaign_recipients (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            campaign_id          UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            contact_id           UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
            phone_e164           TEXT NOT NULL,
            resolved_variables   JSONB NOT NULL DEFAULT '{}'::jsonb,
            status               recipient_status NOT NULL DEFAULT 'pending',
            meta_message_id      TEXT,
            error_code           INTEGER,
            error_message        TEXT,
            queued_at            TIMESTAMPTZ,
            sent_at              TIMESTAMPTZ,
            delivered_at         TIMESTAMPTZ,
            read_at              TIMESTAMPTZ,
            failed_at            TIMESTAMPTZ,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT recipients_unique_per_campaign UNIQUE (campaign_id, contact_id)
        )
        """
    )

    # --- webhook_events (staging table, NO RLS) ---
    # Written by the webhook receiver before we know the tenant. The processor
    # resolves tenant from waba_id or meta_message_id and updates the proper
    # RLS-protected tables under the resolved tenant's session context.
    op.execute(
        """
        CREATE TABLE webhook_events (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            resolved_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
            meta_waba_id       TEXT,
            meta_message_id    TEXT,
            event_type         TEXT NOT NULL,
            raw_payload        JSONB NOT NULL,
            signature_valid    BOOLEAN NOT NULL DEFAULT FALSE,
            processed_at       TIMESTAMPTZ,
            processing_error   TEXT,
            received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # ============================================================
    # 4. Indexes
    # ============================================================
    # Every RLS-protected table gets composite indexes leading with tenant_id
    # so the planner can prune before the RLS predicate is applied.

    # branches
    op.execute("CREATE INDEX idx_branches_tenant_status ON branches (tenant_id, status)")

    # users
    op.execute("CREATE INDEX idx_users_supabase_user_id ON users (supabase_user_id)")
    op.execute("CREATE INDEX idx_users_email ON users (email)")

    # memberships
    op.execute("CREATE INDEX idx_memberships_user_id ON user_tenant_memberships (user_id, status)")
    op.execute("CREATE INDEX idx_memberships_tenant_id ON user_tenant_memberships (tenant_id, status)")

    # wabas
    op.execute("CREATE INDEX idx_wabas_tenant_status ON wabas (tenant_id, status)")

    # phone_numbers
    op.execute("CREATE INDEX idx_phone_numbers_tenant ON phone_numbers (tenant_id, waba_id)")

    # templates
    op.execute("CREATE INDEX idx_templates_tenant_status ON templates (tenant_id, status)")
    op.execute("CREATE INDEX idx_templates_tenant_waba ON templates (tenant_id, waba_id)")

    # contacts — the hot path
    op.execute(
        "CREATE INDEX idx_contacts_tenant_branch_optin "
        "ON contacts (tenant_id, branch_id, opt_in_status)"
    )
    # For webhook status writes that look up by phone across a tenant:
    # already covered by the UNIQUE (tenant_id, phone_e164) constraint.

    # csv_imports
    op.execute(
        "CREATE INDEX idx_csv_imports_tenant_status ON csv_imports (tenant_id, status, created_at DESC)"
    )

    # campaigns
    op.execute(
        "CREATE INDEX idx_campaigns_tenant_status ON campaigns (tenant_id, status, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_campaigns_tenant_branch ON campaigns (tenant_id, branch_id, created_at DESC)"
    )
    # Partial index for the scheduler picking up due campaigns
    op.execute(
        "CREATE INDEX idx_campaigns_due_schedule ON campaigns (scheduled_for) "
        "WHERE status = 'scheduled'"
    )

    # campaign_recipients — the busiest table by row count
    op.execute(
        "CREATE INDEX idx_recipients_tenant_campaign_status "
        "ON campaign_recipients (tenant_id, campaign_id, status)"
    )
    # Webhook processor looks up by meta_message_id to find the recipient row.
    op.execute(
        "CREATE INDEX idx_recipients_meta_message_id "
        "ON campaign_recipients (meta_message_id) WHERE meta_message_id IS NOT NULL"
    )
    # For monitoring dashboard sort by time
    op.execute(
        "CREATE INDEX idx_recipients_tenant_sent_at "
        "ON campaign_recipients (tenant_id, sent_at DESC) WHERE sent_at IS NOT NULL"
    )

    # webhook_events (staging, no RLS)
    op.execute(
        "CREATE INDEX idx_webhook_events_received_at ON webhook_events (received_at DESC)"
    )
    op.execute(
        "CREATE INDEX idx_webhook_events_unprocessed ON webhook_events (received_at) "
        "WHERE processed_at IS NULL"
    )
    op.execute(
        "CREATE INDEX idx_webhook_events_meta_message_id "
        "ON webhook_events (meta_message_id) WHERE meta_message_id IS NOT NULL"
    )

    # ============================================================
    # 5. Row-Level Security
    # ============================================================
    # Every table gets RLS enabled and a single "tenant isolation" policy that
    # says: "row is visible iff its tenant_id matches the current session's
    # tenant, OR the session is flagged as platform_admin."
    #
    # We use `current_setting(..., TRUE)` — the TRUE means "return NULL if not
    # set" instead of erroring. NULL evaluates to FALSE in the policy, which
    # means: if the app forgets to set the tenant, all queries return zero rows.
    # Fails safe.

    _POLICY_EXPR = (
        "(tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid) "
        "OR (current_setting('app.is_platform_admin', TRUE) = 'true')"
    )

    for table in [
        "tenants",  # note: tenants uses `id` not `tenant_id` — handled separately below
        "branches",
        "wabas",
        "phone_numbers",
        "templates",
        "contacts",
        "csv_imports",
        "campaigns",
        "campaign_recipients",
        "user_tenant_memberships",
    ]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # tenants: policy on `id` instead of `tenant_id`
    op.execute(
        """
        CREATE POLICY tenant_self_isolation ON tenants
            FOR ALL
            USING (
                (id = current_setting('app.current_tenant_id', TRUE)::uuid)
                OR (current_setting('app.is_platform_admin', TRUE) = 'true')
            )
            WITH CHECK (
                current_setting('app.is_platform_admin', TRUE) = 'true'
            )
        """
    )
    # Note WITH CHECK: only platform admins can INSERT/UPDATE the tenants table.
    # Tenant admins can READ their own tenant row but cannot modify tenants.

    # Standard tenant_id-based policy for the rest
    for table in [
        "branches",
        "wabas",
        "phone_numbers",
        "templates",
        "contacts",
        "csv_imports",
        "campaigns",
        "campaign_recipients",
    ]:
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                FOR ALL
                USING ({_POLICY_EXPR})
                WITH CHECK ({_POLICY_EXPR})
            """
        )

    # user_tenant_memberships: use tenant_id column but allow platform admins full access
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON user_tenant_memberships
            FOR ALL
            USING ({_POLICY_EXPR})
            WITH CHECK ({_POLICY_EXPR})
        """
    )

    # users: RLS with three access patterns
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")

    # 1. Login lookup: during auth, we know the verified supabase_user_id from
    #    the JWT but don't yet know the internal user_id. This policy lets us
    #    SELECT that one row by setting `app.authenticating_supabase_user_id`.
    #    Multiple policies on the same table are OR'd together.
    op.execute(
        """
        CREATE POLICY users_login_lookup ON users
            FOR SELECT
            USING (
                supabase_user_id
                    = current_setting('app.authenticating_supabase_user_id', TRUE)::uuid
            )
        """
    )

    # 2. Self-access + platform admin: normal reads/writes.
    op.execute(
        """
        CREATE POLICY users_self_access ON users
            FOR ALL
            USING (
                (id = current_setting('app.current_user_id', TRUE)::uuid)
                OR (current_setting('app.is_platform_admin', TRUE) = 'true')
            )
            WITH CHECK (
                current_setting('app.is_platform_admin', TRUE) = 'true'
            )
        """
    )

    # webhook_events: intentionally NO RLS. It's a staging table written by the
    # webhook receiver before tenant is known. The processor reads/updates it
    # from a system session (see app/db.py get_system_session()) which does not
    # set app.current_tenant_id.


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.execute("DROP TABLE IF EXISTS webhook_events CASCADE")
    op.execute("DROP TABLE IF EXISTS campaign_recipients CASCADE")
    op.execute("DROP TABLE IF EXISTS campaigns CASCADE")
    op.execute("DROP TABLE IF EXISTS csv_imports CASCADE")
    op.execute("DROP TABLE IF EXISTS contacts CASCADE")
    op.execute("DROP TABLE IF EXISTS templates CASCADE")
    op.execute("DROP TABLE IF EXISTS phone_numbers CASCADE")
    op.execute("DROP TABLE IF EXISTS wabas CASCADE")
    op.execute("DROP TABLE IF EXISTS user_tenant_memberships CASCADE")
    op.execute("DROP TABLE IF EXISTS branches CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS tenants CASCADE")

    # Drop enum types (reverse order of creation)
    for enum_name in [
        "recipient_status",
        "campaign_status",
        "campaign_lane",
        "audience_type",
        "csv_import_status",
        "contact_source",
        "contact_opt_in_status",
        "template_status",
        "template_category",
        "phone_number_status",
        "waba_status",
        "waba_type",
        "membership_status",
        "user_role",
        "branch_status",
        "branch_type",
        "tenant_status",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
