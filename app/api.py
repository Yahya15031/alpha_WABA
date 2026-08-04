"""Core API surface: auth identity, tenant list, branches.

  GET /healthz    — public liveness + DB ping (Render uses this)
  GET /me         — authenticated user + their tenant memberships
  GET /tenants    — platform-admin only, every tenant on the platform
  GET /branches   — branches for the active tenant (X-Tenant-Id required)
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    get_current_user,
    get_platform_admin_session,
    get_tenant_scoped_session,
    get_user_memberships,
)
from app.db import ping
from app.models import Branch, Tenant

router = APIRouter(tags=["core"])


# ---------------------------------------------------------------------------
# Response shapes
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str
    db: bool


class MembershipOut(BaseModel):
    tenant_id: str
    tenant_name: str
    role: str


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    is_platform_admin: bool
    memberships: list[MembershipOut]


class TenantOut(BaseModel):
    id: str
    name: str
    status: str
    created_at: str


class BranchOut(BaseModel):
    id: str
    name: str
    branch_type: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Public liveness probe. Render pings this to verify the service is up."""
    return HealthResponse(status="ok", db=await ping())


@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    """Return the authenticated user + every tenant they belong to.

    The frontend uses `memberships` to populate the tenant switcher. If the
    list has one entry, auto-select it. If more than one, show a picker.
    Platform admins may have zero memberships and still see every tenant via
    GET /tenants instead.
    """
    memberships = await get_user_memberships(current_user.id)
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_platform_admin=current_user.is_platform_admin,
        memberships=[MembershipOut(**m) for m in memberships],
    )


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants(
    session: AsyncSession = Depends(get_platform_admin_session),
) -> list[TenantOut]:
    """Platform-admin only. Every tenant on the platform, for the admin console."""
    result = await session.execute(select(Tenant).order_by(Tenant.name))
    tenants = result.scalars().all()
    return [
        TenantOut(
            id=str(t.id),
            name=t.name,
            status=t.status.value,
            created_at=t.created_at.isoformat(),
        )
        for t in tenants
    ]


@router.get("/branches", response_model=list[BranchOut])
async def list_branches(
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> list[BranchOut]:
    """Branches for the active tenant (from X-Tenant-Id). Feeds every branch
    filter dropdown across Dashboard, Broadcasts, and Message Logs screens.
    """
    result = await session.execute(select(Branch).order_by(Branch.name))
    branches = result.scalars().all()
    return [
        BranchOut(id=str(b.id), name=b.name, branch_type=b.branch_type.value)
        for b in branches
    ]
