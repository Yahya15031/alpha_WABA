"""Template routes.

  GET  /templates          — list active templates for the active tenant
  POST /templates          — create (tenant admin only)
  GET  /templates/:id      — one template
  PATCH /templates/:id     — update body/variables/status (tenant admin only)

DELETE is intentionally omitted for Phase 1: campaigns hold a FK to templates,
so hard delete would break history. Soft delete via a `is_active` column is a
Phase-2 add. For now, admins just don't use old templates.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    TenantContext,
    get_active_tenant_context,
    get_current_user,
    get_tenant_scoped_session,
)
from app.meta import get_meta_client
from app.models import Template, TemplateCategory, TemplateStatus, Waba, WabaStatus

router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# Request / response shapes
# ---------------------------------------------------------------------------


class TemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    language_code: str
    body_text: str
    variable_definitions: list[dict[str, Any]]
    status: str
    waba_id: str
    created_at: str
    updated_at: str


class TemplatesListResponse(BaseModel):
    data: list[TemplateResponse]


class TemplateCreateRequest(BaseModel):
    waba_id: str = Field(description="Which WABA this template lives under.")
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(description="One of: utility, marketing, authentication")
    language_code: str = Field(min_length=2, max_length=10, description="e.g. en, en_US")
    body_text: str = Field(min_length=1, description="Template body with {{1}}, {{2}} etc.")
    variable_definitions: list[dict[str, Any]] = Field(
        default_factory=list,
        description='e.g. [{"index":1,"type":"text","label":"Name"}]',
    )
    status: str = Field(
        default="approved",
        description="approved | pending | rejected. Default approved (admin added a Meta-approved template).",
    )


class TemplateUpdateRequest(BaseModel):
    body_text: str | None = None
    variable_definitions: list[dict[str, Any]] | None = None
    status: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_response(t: Template) -> TemplateResponse:
    return TemplateResponse(
        id=str(t.id),
        name=t.name,
        category=t.category.value,
        language_code=t.language_code,
        body_text=t.body_text,
        variable_definitions=list(t.variable_definitions or []),
        status=t.status.value,
        waba_id=str(t.waba_id),
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


def _parse_category(value: str) -> TemplateCategory:
    try:
        return TemplateCategory(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category '{value}'. Use one of: "
            + ", ".join(c.value for c in TemplateCategory),
        )


def _parse_status(value: str) -> TemplateStatus:
    try:
        return TemplateStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{value}'. Use one of: "
            + ", ".join(s.value for s in TemplateStatus),
        )


_STATUS_MAP = {
    "APPROVED": TemplateStatus.approved,
    "PENDING": TemplateStatus.pending,
    "REJECTED": TemplateStatus.rejected,
    "PAUSED": TemplateStatus.paused,
}

_CATEGORY_MAP = {
    "MARKETING": TemplateCategory.marketing,
    "UTILITY": TemplateCategory.utility,
    "AUTHENTICATION": TemplateCategory.authentication,
}


def _extract_body(components: list[dict[str, Any]]) -> str:
    for component in components or []:
        if component.get("type") == "BODY":
            return component.get("text") or ""
    return ""


def _extract_variables(components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Parse {{one}} / {{1}} tokens from the BODY component in template order."""
    text = _extract_body(components)
    if not text:
        return []
    tokens = re.findall(r"\{\{(\w+)\}\}", text)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        out.append({"index": int(token)} if token.isdigit() else {"name": token})
    return out


# ---------------------------------------------------------------------------
# GET /templates
# ---------------------------------------------------------------------------


@router.get("", response_model=TemplatesListResponse)
async def list_templates(
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplatesListResponse:
    result = await session.execute(select(Template).order_by(Template.name))
    return TemplatesListResponse(
        data=[_to_response(t) for t in result.scalars().all()]
    )


# ---------------------------------------------------------------------------
# POST /templates
# ---------------------------------------------------------------------------


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreateRequest,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateResponse:
    """Admin-only. Any active membership counts as admin for Phase 1
    (tenant_admin is the only tenant role we've enabled).
    """
    if ctx.role != "tenant_admin":
        raise HTTPException(status_code=403, detail="Tenant admin required")

    try:
        waba_uuid = uuid.UUID(body.waba_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="waba_id must be a UUID")

    template = Template(
        tenant_id=ctx.tenant_id,
        waba_id=waba_uuid,
        name=body.name,
        category=_parse_category(body.category),
        language_code=body.language_code,
        body_text=body.body_text,
        variable_definitions=body.variable_definitions,
        status=_parse_status(body.status),
    )
    session.add(template)
    await session.flush()
    await session.refresh(template)
    return _to_response(template)


# ---------------------------------------------------------------------------
# GET /templates/:id
# ---------------------------------------------------------------------------


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: str,
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateResponse:
    try:
        template_uuid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="template_id must be a UUID")

    template = await session.get(Template, template_uuid)
    if template is None:
        # RLS will hide templates from other tenants — same 404 either way.
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_response(template)


# ---------------------------------------------------------------------------
# PATCH /templates/:id
# ---------------------------------------------------------------------------


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str,
    body: TemplateUpdateRequest,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TemplateResponse:
    if ctx.role != "tenant_admin":
        raise HTTPException(status_code=403, detail="Tenant admin required")

    try:
        template_uuid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="template_id must be a UUID")

    template = await session.get(Template, template_uuid)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if body.body_text is not None:
        template.body_text = body.body_text
    if body.variable_definitions is not None:
        template.variable_definitions = body.variable_definitions
    if body.status is not None:
        template.status = _parse_status(body.status)

    await session.flush()
    await session.refresh(template)
    return _to_response(template)


@router.post("/sync")
async def sync_templates_from_meta(
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> dict[str, Any]:
    """Pull all templates from Meta for this tenant's active WABAs and upsert them."""
    wabas = (
        await session.execute(select(Waba).where(Waba.status == WabaStatus.active))
    ).scalars().all()

    if not wabas:
        raise HTTPException(status_code=404, detail="No active WABAs for this tenant")

    client = get_meta_client()
    summary: dict[str, Any] = {"created": 0, "updated": 0, "unchanged": 0, "errors": []}

    for waba in wabas:
        try:
            meta_templates = await client.list_templates(waba.meta_waba_id)
        except Exception as exc:
            summary["errors"].append(f"waba {waba.id}: {type(exc).__name__}: {exc}")
            continue

        for meta_template in meta_templates:
            name = meta_template.get("name")
            lang = meta_template.get("language")
            if not name or not lang:
                continue

            components = meta_template.get("components") or []
            body_text = _extract_body(components)
            var_defs = _extract_variables(components)
            status = _STATUS_MAP.get(str(meta_template.get("status", "")).upper(), TemplateStatus.pending)
            category = _CATEGORY_MAP.get(str(meta_template.get("category", "")).upper(), TemplateCategory.utility)
            meta_tpl_id = meta_template.get("id")

            existing = await session.scalar(
                select(Template).where(
                    Template.waba_id == waba.id,
                    Template.name == name,
                    Template.language_code == lang,
                )
            )

            if existing:
                changed = False
                if existing.status != status:
                    existing.status = status
                    changed = True
                if existing.body_text != body_text:
                    existing.body_text = body_text
                    changed = True
                if list(existing.variable_definitions or []) != var_defs:
                    existing.variable_definitions = var_defs
                    changed = True
                if existing.category != category:
                    existing.category = category
                    changed = True
                if meta_tpl_id and getattr(existing, "meta_template_id", None) != meta_tpl_id:
                    existing.meta_template_id = meta_tpl_id
                    changed = True
                summary["updated" if changed else "unchanged"] += 1
            else:
                session.add(
                    Template(
                        tenant_id=ctx.tenant_id,
                        waba_id=waba.id,
                        meta_template_id=meta_tpl_id,
                        name=name,
                        language_code=lang,
                        category=category,
                        status=status,
                        body_text=body_text,
                        variable_definitions=var_defs,
                    )
                )
                summary["created"] += 1

    await session.flush()
    return summary
