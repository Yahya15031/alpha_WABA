"""SQLAlchemy 2.0 models — matches the 0001_phase1_baseline migration.

Design notes
------------
- Every model uses the typed `Mapped[]` / `mapped_column()` API (SQLAlchemy 2.0).
- Postgres enum types are declared with `create_type=False` because the migration
  creates them explicitly.
- We define a shared naming convention on the metadata so Alembic autogenerate
  (if we ever use it) produces predictable constraint names.
- Relationships are declared but lazy-loaded by default. Use `selectinload` in
  queries where you need eager loading.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    MetaData,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

_NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=_NAMING_CONVENTION)


# ---------------------------------------------------------------------------
# Python enums (values match the Postgres enum type members)
# ---------------------------------------------------------------------------


class TenantStatus(str, Enum):
    active = "active"
    suspended = "suspended"
    archived = "archived"


class BranchType(str, Enum):
    physical = "physical"
    virtual = "virtual"


class BranchStatus(str, Enum):
    active = "active"
    archived = "archived"


class UserRole(str, Enum):
    tenant_admin = "tenant_admin"
    tenant_user = "tenant_user"  # reserved for Phase 2


class MembershipStatus(str, Enum):
    active = "active"
    invited = "invited"
    suspended = "suspended"


class WabaType(str, Enum):
    shared_platform = "shared_platform"
    byow = "byow"
    sandbox_test = "sandbox_test"


class WabaStatus(str, Enum):
    active = "active"
    pending = "pending"
    disconnected = "disconnected"


class PhoneNumberStatus(str, Enum):
    active = "active"
    throttled = "throttled"
    disconnected = "disconnected"


class TemplateCategory(str, Enum):
    marketing = "marketing"
    utility = "utility"
    authentication = "authentication"


class TemplateStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    paused = "paused"


class ContactOptInStatus(str, Enum):
    opted_in = "opted_in"
    opted_out = "opted_out"
    pending = "pending"


class ContactSource(str, Enum):
    manual = "manual"
    csv_import = "csv_import"
    api = "api"


class CsvImportStatus(str, Enum):
    pending = "pending"
    validating = "validating"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class AudienceType(str, Enum):
    all_contacts = "all_contacts"
    branch_group = "branch_group"
    csv_upload = "csv_upload"


class CampaignLane(str, Enum):
    transactional = "transactional"
    bulk = "bulk"


class CampaignStatus(str, Enum):
    draft = "draft"
    scheduled = "scheduled"
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


class RecipientStatus(str, Enum):
    pending = "pending"
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    failed = "failed"


# ---------------------------------------------------------------------------
# Shared column helpers
# ---------------------------------------------------------------------------


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )


def _created_at() -> Mapped[datetime]:
    return mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


def _updated_at() -> Mapped[datetime]:
    return mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    status: Mapped[TenantStatus] = mapped_column(
        PgEnum(TenantStatus, name="tenant_status", create_type=False),
        nullable=False,
        server_default=TenantStatus.active.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    branches: Mapped[list["Branch"]] = relationship(back_populates="tenant", cascade="all")
    memberships: Mapped[list["UserTenantMembership"]] = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    supabase_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    full_name: Mapped[Optional[str]] = mapped_column(Text)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    memberships: Mapped[list["UserTenantMembership"]] = relationship(back_populates="user")


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="branches_unique_name_per_tenant"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    branch_type: Mapped[BranchType] = mapped_column(
        PgEnum(BranchType, name="branch_type", create_type=False),
        nullable=False,
        server_default=BranchType.physical.value,
    )
    status: Mapped[BranchStatus] = mapped_column(
        PgEnum(BranchStatus, name="branch_status", create_type=False),
        nullable=False,
        server_default=BranchStatus.active.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    tenant: Mapped[Tenant] = relationship(back_populates="branches")


class UserTenantMembership(Base):
    __tablename__ = "user_tenant_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="memberships_unique_user_tenant"),
        # Enforced at Phase 1: no branch-pinned users yet.
        CheckConstraint("branch_id IS NULL", name="memberships_branch_belongs_to_tenant"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name="user_role", create_type=False),
        nullable=False,
        server_default=UserRole.tenant_admin.value,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL")
    )
    status: Mapped[MembershipStatus] = mapped_column(
        PgEnum(MembershipStatus, name="membership_status", create_type=False),
        nullable=False,
        server_default=MembershipStatus.active.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    user: Mapped[User] = relationship(back_populates="memberships")
    tenant: Mapped[Tenant] = relationship(back_populates="memberships")


class Waba(Base):
    __tablename__ = "wabas"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    meta_waba_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    waba_type: Mapped[WabaType] = mapped_column(
        PgEnum(WabaType, name="waba_type", create_type=False), nullable=False
    )
    status: Mapped[WabaStatus] = mapped_column(
        PgEnum(WabaStatus, name="waba_status", create_type=False),
        nullable=False,
        server_default=WabaStatus.pending.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    waba_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wabas.id", ondelete="CASCADE"), nullable=False
    )
    meta_phone_number_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_phone_number: Mapped[str] = mapped_column(Text, nullable=False)
    is_test_number: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[PhoneNumberStatus] = mapped_column(
        PgEnum(PhoneNumberStatus, name="phone_number_status", create_type=False),
        nullable=False,
        server_default=PhoneNumberStatus.active.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "waba_id", "name", "language_code", name="templates_unique_name_lang"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    waba_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wabas.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    language_code: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[TemplateCategory] = mapped_column(
        PgEnum(TemplateCategory, name="template_category", create_type=False), nullable=False
    )
    status: Mapped[TemplateStatus] = mapped_column(
        PgEnum(TemplateStatus, name="template_status", create_type=False),
        nullable=False,
        server_default=TemplateStatus.pending.value,
    )
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    variable_definitions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    meta_template_id: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "phone_e164", name="contacts_unique_phone_per_tenant"),
        CheckConstraint(r"phone_e164 ~ '^\+[1-9][0-9]{6,14}$'", name="contacts_phone_e164_format"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False
    )
    phone_e164: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(Text)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    opt_in_status: Mapped[ContactOptInStatus] = mapped_column(
        PgEnum(ContactOptInStatus, name="contact_opt_in_status", create_type=False),
        nullable=False,
        server_default=ContactOptInStatus.pending.value,
    )
    source: Mapped[ContactSource] = mapped_column(
        PgEnum(ContactSource, name="contact_source", create_type=False),
        nullable=False,
        server_default=ContactSource.manual.value,
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class CsvImport(Base):
    __tablename__ = "csv_imports"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[CsvImportStatus] = mapped_column(
        PgEnum(CsvImportStatus, name="csv_import_status", create_type=False),
        nullable=False,
        server_default=CsvImportStatus.pending.value,
    )
    total_rows: Mapped[Optional[int]] = mapped_column(Integer)
    valid_rows: Mapped[Optional[int]] = mapped_column(Integer)
    invalid_rows: Mapped[Optional[int]] = mapped_column(Integer)
    error_report: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        CheckConstraint(
            "(status = 'scheduled' AND scheduled_for IS NOT NULL) OR (status != 'scheduled')",
            name="campaigns_schedule_matches_status",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False
    )
    waba_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wabas.id", ondelete="RESTRICT"), nullable=False
    )
    phone_number_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phone_numbers.id", ondelete="RESTRICT"), nullable=False
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    variable_mappings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    audience_type: Mapped[AudienceType] = mapped_column(
        PgEnum(AudienceType, name="audience_type", create_type=False), nullable=False
    )
    audience_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    lane: Mapped[CampaignLane] = mapped_column(
        PgEnum(CampaignLane, name="campaign_lane", create_type=False),
        nullable=False,
        server_default=CampaignLane.bulk.value,
    )
    status: Mapped[CampaignStatus] = mapped_column(
        PgEnum(CampaignStatus, name="campaign_status", create_type=False),
        nullable=False,
        server_default=CampaignStatus.draft.value,
    )
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (
        UniqueConstraint("campaign_id", "contact_id", name="recipients_unique_per_campaign"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="RESTRICT"), nullable=False
    )
    phone_e164: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_variables: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    status: Mapped[RecipientStatus] = mapped_column(
        PgEnum(RecipientStatus, name="recipient_status", create_type=False),
        nullable=False,
        server_default=RecipientStatus.pending.value,
    )
    meta_message_id: Mapped[Optional[str]] = mapped_column(Text)
    error_code: Mapped[Optional[int]] = mapped_column(Integer)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    queued_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    sent_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    delivered_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    read_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    failed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class WebhookEvent(Base):
    """Staging table for raw Meta webhook payloads.

    Deliberately NOT RLS-protected: the receiver writes here before knowing
    the tenant. The processor resolves tenant from meta_waba_id / meta_message_id
    and updates the RLS-protected tables using a tenant-scoped session.
    """

    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    resolved_tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL")
    )
    meta_waba_id: Mapped[Optional[str]] = mapped_column(Text)
    meta_message_id: Mapped[Optional[str]] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    signature_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )


# ---------------------------------------------------------------------------
# Analytics + settings (migration 0002)
# ---------------------------------------------------------------------------


class CampaignStats(Base):
    """Precomputed per-campaign aggregation. One row per campaign.

    Written by the worker whenever a campaign_recipient status changes.
    Read by the dashboard endpoints (KPI cards, activity chart, campaign
    status donut) to avoid GROUP BY over campaign_recipients on every load.

    Kept in the same tenant scope as campaigns via the tenant_id column
    and the same RLS pattern.
    """

    __tablename__ = "campaign_stats"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    total_recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    p95_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    last_updated: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )


class TenantSetting(Base):
    """Per-tenant feature flags. One row per tenant.

    Phase 1 has one flag (`allow_freeform_message_edit`, default False).
    The row is optional — a tenant without a row uses the schema defaults.
    """

    __tablename__ = "tenant_settings"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    allow_freeform_message_edit: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
