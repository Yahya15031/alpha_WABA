"""campaign_stats and tenant_settings

Revision ID: 0002_campaign_stats
Revises: 0001_phase1_baseline
Create Date: 2026-07-31

Two additive tables per PM's Migration 3 & 4 reconciliation:

- `campaign_stats` — precomputed per-campaign aggregation for dashboard/chart
  reads. Worker writes here on every recipient status change. Reading from
  this avoids GROUP BY over campaign_recipients on every page load.

- `tenant_settings` — key-value-ish per-tenant flags. Phase 1 uses one flag:
  `allow_freeform_message_edit` (default false), which application code checks
  before allowing a campaign body that doesn't strictly match its template.
  Schema-level enforcement (campaigns.template_id FK) already exists from
  the baseline.

Both tables use the same RLS pattern as the rest of the app:
`current_setting('app.current_tenant_id')::uuid`. `auth.uid()` is NOT used —
our backend connects directly via app_role, not through PostgREST.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_campaign_stats"
down_revision: Union[str, None] = "0001_phase1_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # campaign_stats
    # ------------------------------------------------------------------
    op.create_table(
        "campaign_stats",
        sa.Column(
            "campaign_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("total_recipients", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_sent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_delivered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_read", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_failed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_latency_ms", sa.Integer),  # nullable — no reads yet, no data
        sa.Column("p95_latency_ms", sa.Integer),
        sa.Column(
            "last_updated",
            sa.dialects.postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "total_recipients >= 0 AND total_sent >= 0 AND total_delivered >= 0 "
            "AND total_read >= 0 AND total_failed >= 0",
            name="campaign_stats_counts_nonneg",
        ),
    )
    op.create_index(
        "ix_campaign_stats_tenant_id",
        "campaign_stats",
        ["tenant_id"],
    )

    op.execute("ALTER TABLE campaign_stats ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY campaign_stats_tenant_isolation ON campaign_stats
            USING (
                tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
        """
    )

    # ------------------------------------------------------------------
    # tenant_settings
    # ------------------------------------------------------------------
    op.create_table(
        "tenant_settings",
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "allow_freeform_message_edit",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "updated_at",
            sa.dialects.postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.execute("ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
            USING (
                tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
            WITH CHECK (
                tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
                OR current_setting('app.is_platform_admin', TRUE) = 'true'
            )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_settings_tenant_isolation ON tenant_settings")
    op.drop_table("tenant_settings")

    op.execute(
        "DROP POLICY IF EXISTS campaign_stats_tenant_isolation ON campaign_stats"
    )
    op.drop_index("ix_campaign_stats_tenant_id", table_name="campaign_stats")
    op.drop_table("campaign_stats")
