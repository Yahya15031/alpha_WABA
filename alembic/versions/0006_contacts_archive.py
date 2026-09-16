"""Soft delete for contacts — add is_archived flag.

Revision ID: 0006_contacts_archive
Revises: 0005_contact_groups
Create Date: 2026-09-16
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_contacts_archive"
down_revision: Union[str, None] = "0005_contact_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "contacts",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_contacts_tenant_archived", "contacts", ["tenant_id", "is_archived"])


def downgrade() -> None:
    op.drop_index("ix_contacts_tenant_archived", table_name="contacts")
    op.drop_column("contacts", "is_archived")