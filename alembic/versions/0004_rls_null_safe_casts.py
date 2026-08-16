"""RLS policies: NULL-safe UUID casts on all current_setting() references.

Revision ID: 0004_rls_null_safe_casts
Revises: 0003_contacts_csv_link
Create Date: 2026-08-15

Background
----------
Every RLS policy in the baseline cast `current_setting('app.x', TRUE)::uuid`
directly. When a session variable is unset, `current_setting(..., TRUE)`
returns an empty string (not NULL), and `''::uuid` raises
`InvalidTextRepresentationError: invalid input syntax for type uuid: ""`
— which kills the whole query, even when the *logically correct* policy
branch would have matched (e.g. the platform-admin bypass in an OR clause).

Postgres evaluates every permissive policy on a table before OR-ing them
together, and evaluates both sides of `OR` in each policy — so an unset
setting on a session that only cares about the other branch still throws.

This migration wraps every `current_setting(name, TRUE)::uuid` in
`NULLIF(current_setting(name, TRUE), '')::uuid`, converting the empty
string to NULL. NULL comparisons return NULL (falsy) — the policy branch
fails to match rather than erroring out. This preserves the original
semantics (unset tenant scope means no match) without the exception.

The upgrade is idempotent-friendly: uses DROP POLICY IF EXISTS + CREATE
so it's safe to run against databases that had these patches applied
manually before this migration existed.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004_rls_null_safe_casts"
down_revision: Union[str, None] = "0003_contacts_csv_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All tenant-scoped tables that use `tenant_id = current_setting(...)::uuid`.
# Names here are the policy names as they exist in the live baseline.
_TENANT_SCOPED_TABLES = [
    "branches",
    "contacts",
    "csv_imports",
    "templates",
    "wabas",
    "phone_numbers",
    "campaigns",
    "campaign_recipients",
    "user_tenant_memberships",
]

# Tables added in later migrations that already followed the qualified naming.
_TENANT_SCOPED_TABLES_QUALIFIED = [
    ("campaign_stats", "campaign_stats_tenant_isolation"),
    ("tenant_settings", "tenant_settings_tenant_isolation"),
]


def _tenant_scoped_policy_sql(table: str, policy_name: str) -> str:
    """Standard tenant-scoped policy with NULL-safe cast."""
    return f"""
        DROP POLICY IF EXISTS {policy_name} ON {table};
        CREATE POLICY {policy_name} ON {table}
            USING (
                tenant_id = NULLIF(
                    current_setting('app.current_tenant_id', TRUE), ''
                )::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                tenant_id = NULLIF(
                    current_setting('app.current_tenant_id', TRUE), ''
                )::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """


def upgrade() -> None:
    # --- Tenant-scoped tables (policy name = 'tenant_isolation') ---
    for table in _TENANT_SCOPED_TABLES:
        op.execute(_tenant_scoped_policy_sql(table, "tenant_isolation"))

    # --- Tables that use qualified policy names from prior migrations ---
    for table, policy_name in _TENANT_SCOPED_TABLES_QUALIFIED:
        op.execute(_tenant_scoped_policy_sql(table, policy_name))

    # --- tenants table (uses `id` not `tenant_id`, has two policies) ---
    op.execute("""
        DROP POLICY IF EXISTS tenant_self_isolation ON tenants;
        CREATE POLICY tenant_self_isolation ON tenants
            USING (
                id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """)
    op.execute("""
        DROP POLICY IF EXISTS tenants_tenant_isolation ON tenants;
        CREATE POLICY tenants_tenant_isolation ON tenants
            USING (
                id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """)

    # --- users table (two policies, different session variables) ---
    op.execute("""
        DROP POLICY IF EXISTS users_login_lookup ON users;
        CREATE POLICY users_login_lookup ON users
            FOR SELECT
            USING (
                supabase_user_id = NULLIF(
                    current_setting('app.authenticating_supabase_user_id', TRUE), ''
                )::uuid
            );
    """)
    op.execute("""
        DROP POLICY IF EXISTS users_self_access ON users;
        CREATE POLICY users_self_access ON users
            USING (
                id = NULLIF(current_setting('app.current_user_id', TRUE), '')::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """)


def downgrade() -> None:
    # Downgrade restores the original (broken) policies for consistency
    # with the baseline. Do not actually downgrade a live database — this
    # will re-introduce the empty-string cast bug.
    for table in _TENANT_SCOPED_TABLES:
        op.execute(f"""
            DROP POLICY IF EXISTS tenant_isolation ON {table};
            CREATE POLICY tenant_isolation ON {table}
                USING (
                    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                    OR current_setting('app.is_platform_admin', TRUE) = 'true'
                )
                WITH CHECK (
                    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                    OR current_setting('app.is_platform_admin', TRUE) = 'true'
                );
        """)
    # (Downgrade of tenants + users omitted — not worth the mechanical bulk
    # for a downgrade that shouldn't be used.)