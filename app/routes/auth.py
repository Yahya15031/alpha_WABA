"""Auth-related routes.

  GET /me        — the authenticated user + their tenant memberships
  GET /tenants   — platform admin only, list every tenant
  GET /branches  — list branches for the active tenant
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    PlatformIdentity,
    TenantContext,
    get_active_tenant_context,
    get_current_user,
    get_platform_admin_session,
    get_tenant_scoped_session,
    get_user_memberships,
    require_platform_admin,
)
from app.models import Branch, Tenant

router = APIRouter(tags=["auth"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class Membership(BaseModel):
    tenant_id: str
    tenant_name: str
    role: str


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    is_platform_admin: bool
    memberships: list[Membership]


class TenantResponse(BaseModel):
    id: str
    name: str
    status: str
    created_at: str


class TenantsListResponse(BaseModel):
    data: list[TenantResponse]


class BranchResponse(BaseModel):
    id: str
    name: str
    branch_type: str


class BranchesListResponse(BaseModel):
    data: list[BranchResponse]


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    """Authenticated user + their tenant memberships.

    Requires `Authorization: Bearer <supabase-jwt>`. Does NOT require
    X-Tenant-Id (the frontend calls this to *learn* which tenants to offer).
    """
    memberships = await get_user_memberships(current_user.id)
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_platform_admin=current_user.is_platform_admin,
        memberships=[Membership(**m) for m in memberships],
    )


# ---------------------------------------------------------------------------
# GET /tenants  (platform admin only)
# ---------------------------------------------------------------------------


@router.get("/tenants", response_model=TenantsListResponse)
async def list_all_tenants(
    _: PlatformIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_platform_admin_session),
) -> TenantsListResponse:
    """List every tenant. Platform admin only.

    Frontend uses this for the platform-admin tenant switcher (Alex Kim-style
    super-admin who can act on any tenant's behalf).
    """
    result = await session.execute(select(Tenant).order_by(Tenant.name))
    return TenantsListResponse(
        data=[
            TenantResponse(
                id=str(t.id),
                name=t.name,
                status=t.status.value,
                created_at=t.created_at.isoformat(),
            )
            for t in result.scalars().all()
        ]
    )


# ---------------------------------------------------------------------------
# GET /branches
# ---------------------------------------------------------------------------


@router.get("/branches", response_model=BranchesListResponse)
async def list_branches(
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> BranchesListResponse:
    """Branches belonging to the active tenant.

    Feeds every 'filter by branch' dropdown in the UI.
    """
    result = await session.execute(select(Branch).order_by(Branch.name))
    return BranchesListResponse(
        data=[
            BranchResponse(
                id=str(b.id),
                name=b.name,
                branch_type=b.branch_type.value,
            )
            for b in result.scalars().all()
        ]
    )
