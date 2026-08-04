"""Templates: the admin-managed library of approved Meta message templates.

Contract §5. Campaigns can only reference templates from this table — this
is where an admin enters a template's name, category, body text, and
variable definitions, matching what's already approved in Meta Business
Manager.

Routes:
  GET    /templates       — list (any tenant member)
  POST   /templates       — create (tenant_admin only)
  GET    /templates/:id   — detail (any tenant member)
  PATCH  /templates/:id   — update (tenant_admin only)
  DELETE /templates/:id   — soft delete via is_active=false (tenant_admin only)
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import TenantContext, get_active_tenant_context, get_tenant_scoped_session
from app.models import Template, TemplateCategory, TemplateStatus

router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# Shapes
# ---------------------------------------------------------------------------


class VariableDefinition(BaseModel):
    index: int
    type: str = "text"
    label: str


class TemplateOut(BaseModel):
    id: str
    name: str
    category: str
    language_code: str
    body_text: str
    variable_definitions: list[dict[str, Any]]
    status: str
    created_at: str


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    category: str  # must match TemplateCategory enum values
    language_code: str = Field(..., min_length=2, max_length=10)
    body_text: str = Field(..., min_length=1)
    variable_definitions: list[VariableDefinition] = Field(default_factory=list)
    status: str = "approved"  # must match TemplateStatus enum values
    waba_id: str  # which WABA this template belongs to


class TemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    language_code: str | None = None
    body_text: str | None = None
    variable_definitions: list[VariableDefinition] | None = None
    status: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_tenant_admin(tenant_context: TenantContext) -> None:
    """Templates writes are tenant_admin (or platform_admin) only."""
    if tenant_context.role not in ("tenant_admin", "platform_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a tenant admin can manage templates",
        )


def _to_out(t: Template) -> TemplateOut:
    return TemplateOut(
        id=str(t.id),
        name=t.name,
        category=t.category.value,
        language_code=t.language_code,
        body_text=t.body_text,
        variable_definitions=t.variable_definitions,
        status=t.status.value,
        created_at=t.created_at.isoformat(),
    )


def _parse_enum_or_400(enum_cls, value: str, field_name: str):
    try:
        return enum_cls(value)
    except ValueError:
        allowed = ", ".join(e.value for e in enum_cls)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name} '{value}'. Must be one of: {allowed}",
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> list[TemplateOut]:
    """List active templates for the active tenant (excludes paused/rejected).
    Any tenant member can read — the Broadcast Wizard's template picker
    calls this.
    """
    result = await session.execute(
        select(Template)
        .where(Template.status == TemplateStatus.approved)
        .order_by(Template.name)
    )
    return [_to_out(t) for t in result.scalars().all()]


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateOut:
    """Create a template. Tenant admin only.

    This does NOT call Meta — it records a template you've already had
    approved in Meta Business Manager. Enter the name and body exactly as
    approved, or sends using this template will be rejected by Meta.
    """
    _require_tenant_admin(tenant_context)

    category = _parse_enum_or_400(TemplateCategory, payload.category, "category")
    tpl_status = _parse_enum_or_400(TemplateStatus, payload.status, "status")

    try:
        waba_uuid = uuid.UUID(payload.waba_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed waba_id")

    template = Template(
        tenant_id=tenant_context.tenant_id,
        waba_id=waba_uuid,
        name=payload.name,
        language_code=payload.language_code,
        category=category,
        status=tpl_status,
        body_text=payload.body_text,
        variable_definitions=[v.model_dump() for v in payload.variable_definitions],
    )
    session.add(template)
    await session.flush()
    return _to_out(template)


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateOut:
    template = await session.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_out(template)


@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: uuid.UUID,
    payload: TemplateUpdate,
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateOut:
    _require_tenant_admin(tenant_context)

    template = await session.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if payload.name is not None:
        template.name = payload.name
    if payload.language_code is not None:
        template.language_code = payload.language_code
    if payload.body_text is not None:
        template.body_text = payload.body_text
    if payload.variable_definitions is not None:
        template.variable_definitions = [
            v.model_dump() for v in payload.variable_definitions
        ]
    if payload.category is not None:
        template.category = _parse_enum_or_400(
            TemplateCategory, payload.category, "category"
        )
    if payload.status is not None:
        template.status = _parse_enum_or_400(TemplateStatus, payload.status, "status")

    await session.flush()
    return _to_out(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> None:
    """Soft delete: sets status to 'paused' so it drops out of the picker.

    We never hard-delete templates — campaigns reference them via FK, and
    deleting the row would break historical campaign detail views. 'paused'
    is used (not 'rejected') because rejection is Meta's determination, not
    the tenant admin's — this is an admin choosing to deactivate.
    """
    _require_tenant_admin(tenant_context)

    template = await session.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    template.status = TemplateStatus.paused
    await session.flush()
