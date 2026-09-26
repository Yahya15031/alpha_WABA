"""flexible audience: nullable branch, combined type, inline contacts

Revision ID: 0007_flexible_audience
Revises: 0006_contacts_archive
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_flexible_audience"
down_revision = "0006_contacts_archive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Make campaigns.branch_id nullable (Path A)
    op.alter_column(
        "campaigns",
        "branch_id",
        existing_type=postgresql.UUID(),
        nullable=True,
    )

    # 2. Add 'combined' to audience type enum
    # NOTE: Run this manually in Supabase SQL editor if Alembic complains about running inside a transaction:
    # ALTER TYPE campaign_audience_type ADD VALUE IF NOT EXISTS 'combined';
    op.execute(
        "ALTER TYPE campaign_audience_type ADD VALUE IF NOT EXISTS 'combined'"
    )

    # 3. Inline contacts table (paste-list recipients scoped to a single campaign)
    op.create_table(
        "campaign_inline_contacts",
        sa.Column(
            "id",
            postgresql.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(), nullable=False),
        sa.Column("phone_e164", sa.String(32), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["campaign_id"], ["campaigns.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "campaign_id", "phone_e164", name="uq_inline_campaign_phone"
        ),
    )
    op.create_index(
        "ix_inline_contacts_tenant_campaign",
        "campaign_inline_contacts",
        ["tenant_id", "campaign_id"],
    )
    op.create_index(
        "ix_inline_contacts_phone",
        "campaign_inline_contacts",
        ["phone_e164"],
    )

    # 4. RLS on inline contacts
    op.execute("ALTER TABLE campaign_inline_contacts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY campaign_inline_contacts_tenant_isolation
        ON campaign_inline_contacts
        USING (
            tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
        )
        WITH CHECK (
            tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
        )
        """
    )

    # 5. Recipient can be sourced from an inline paste (no Contact row)
    op.alter_column(
        "campaign_recipients",
        "contact_id",
        existing_type=postgresql.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "campaign_recipients",
        "contact_id",
        existing_type=postgresql.UUID(),
        nullable=False,
    )
    op.execute("DROP POLICY IF EXISTS campaign_inline_contacts_tenant_isolation ON campaign_inline_contacts")
    op.drop_index("ix_inline_contacts_phone", table_name="campaign_inline_contacts")
    op.drop_index(
        "ix_inline_contacts_tenant_campaign", table_name="campaign_inline_contacts"
    )
    op.drop_table("campaign_inline_contacts")

    op.alter_column(
        "campaigns",
        "branch_id",
        existing_type=postgresql.UUID(),
        nullable=False,
    )