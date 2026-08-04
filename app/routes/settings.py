"""Tenant settings: per-tenant feature flags.

Contract §9. Phase 1 has exactly one flag: `allow_freeform_message_edit`.
When false (the default), campaign body text must map cleanly to the
selected template's placeholders — no arbitrary substitutions.

A tenant without a settings row simply uses the schema defaults; we don't
force-create a row at tenant creation time.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import TenantContext, get_active_tenant_context, get_tenant_scoped_session
from app.models import TenantSetting

router = APIRouter(prefix="/settings", tags=["settings"])


class TenantSettingsOut(BaseModel):
    allow_freeform_message_edit: bool


class TenantSettingsUpdate(BaseModel):
    allow_freeform_message_edit: bool | None = None


@router.get("/tenant", response_model=TenantSettingsOut)
async def get_tenant_settings(
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TenantSettingsOut:
    row = await session.get(TenantSetting, tenant_context.tenant_id)
    if row is None:
        # No row yet — return schema defaults rather than 404. A tenant
        # that never touched settings still has a well-defined config.
        return TenantSettingsOut(allow_freeform_message_edit=False)
    return TenantSettingsOut(allow_freeform_message_edit=row.allow_freeform_message_edit)


@router.patch("/tenant", response_model=TenantSettingsOut)
async def update_tenant_settings(
    payload: TenantSettingsUpdate,
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> TenantSettingsOut:
    if tenant_context.role not in ("tenant_admin", "platform_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a tenant admin can change settings",
        )

    row = await session.get(TenantSetting, tenant_context.tenant_id)
    if row is None:
        row = TenantSetting(tenant_id=tenant_context.tenant_id)
        session.add(row)

    if payload.allow_freeform_message_edit is not None:
        row.allow_freeform_message_edit = payload.allow_freeform_message_edit

    await session.flush()
    return TenantSettingsOut(allow_freeform_message_edit=row.allow_freeform_message_edit)
