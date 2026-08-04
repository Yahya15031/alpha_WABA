"""Tenant settings routes.

  GET   /settings/tenant  — read the tenant's flags. Returns defaults if no row yet.
  PATCH /settings/tenant  — admin-only. Updates flags.

Only flag in Phase 1: allow_freeform_message_edit (default False).
Backend read code (broadcast creation, etc.) checks this before permitting
campaigns that deviate from an approved template body.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    TenantContext,
    get_active_tenant_context,
    get_tenant_scoped_session,
)
from app.models import TenantSetting

router = APIRouter(prefix="/settings", tags=["settings"])


class TenantSettingsResponse(BaseModel):
    allow_freeform_message_edit: bool


class TenantSettingsUpdateRequest(BaseModel):
    allow_freeform_message_edit: bool | None = None


@router.get("/tenant", response_model=TenantSettingsResponse)
async def get_tenant_settings(
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TenantSettingsResponse:
    row = await session.get(TenantSetting, ctx.tenant_id)
    if row is None:
        # No row yet → defaults (matches the column defaults from the migration)
        return TenantSettingsResponse(allow_freeform_message_edit=False)
    return TenantSettingsResponse(
        allow_freeform_message_edit=row.allow_freeform_message_edit
    )


@router.patch("/tenant", response_model=TenantSettingsResponse)
async def update_tenant_settings(
    body: TenantSettingsUpdateRequest,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TenantSettingsResponse:
    if ctx.membership_role != "tenant_admin":
        raise HTTPException(status_code=403, detail="Tenant admin required")

    row = await session.get(TenantSetting, ctx.tenant_id)
    if row is None:
        row = TenantSetting(
            tenant_id=ctx.tenant_id,
            allow_freeform_message_edit=body.allow_freeform_message_edit or False,
        )
        session.add(row)
    else:
        if body.allow_freeform_message_edit is not None:
            row.allow_freeform_message_edit = body.allow_freeform_message_edit

    await session.flush()
    await session.refresh(row)
    return TenantSettingsResponse(
        allow_freeform_message_edit=row.allow_freeform_message_edit
    )
