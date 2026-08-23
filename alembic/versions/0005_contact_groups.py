"""Contact groups — cross-branch grouping (e.g., 'O-Level students', 'All managers').

Revision ID: 0005_contact_groups
Revises: 0004_rls_null_safe_casts
Create Date: 2026-08-18
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op

revision: str = "0005_contact_groups"
down_revision: Union[str, None] = "0004_rls_null_safe_casts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE contact_groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, name)
        );
    """)
    op.execute("""
        CREATE TABLE contact_group_members (
            group_id UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
            contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (group_id, contact_id)
        );
        CREATE INDEX ix_contact_group_members_contact ON contact_group_members(contact_id);
    """)

    # RLS — using NULLIF guard from day one, no repeat of the six-day saga
    op.execute("""
        ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON contact_groups
            USING (
                tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """)
    op.execute("""
        ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON contact_group_members
            USING (
                group_id IN (
                    SELECT id FROM contact_groups
                    WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
                )
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS contact_group_members;")
    op.execute("DROP TABLE IF EXISTS contact_groups;")