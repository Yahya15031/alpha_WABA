"""add csv_import_id to contacts

Revision ID: 0003_contacts_csv_link
Revises: 0002_campaign_stats
Create Date: 2026-08-04

Adds `contacts.csv_import_id` as a nullable FK to csv_imports. Populated
when a contact is created via CSV upload; NULL for contacts added by other
means (API, future manual entry UI). Enables broadcasts with
`audience_type='csv_upload'` to target exactly the contacts from a specific
import.

Indexed on (tenant_id, csv_import_id) since the broadcast materialize task
queries contacts by import inside a tenant scope.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_contacts_csv_link"
down_revision: Union[str, None] = "0002_campaign_stats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "contacts",
        sa.Column(
            "csv_import_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("csv_imports.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_contacts_tenant_csv_import",
        "contacts",
        ["tenant_id", "csv_import_id"],
        postgresql_where=sa.text("csv_import_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_contacts_tenant_csv_import", table_name="contacts")
    op.drop_column("contacts", "csv_import_id")
