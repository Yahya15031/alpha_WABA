"""Minimal API surface.

Just enough to prove the stack is live over HTTP:
  GET /healthz  — public liveness + DB ping. Render uses this.
  GET /me       — authenticated user's own record. Requires Supabase JWT.

Everything else (contacts, campaigns, templates, etc) lands in later turns.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import CurrentUser, get_current_user
from app.db import ping

router = APIRouter(tags=["core"])


class HealthResponse(BaseModel):
    status: str
    db: bool


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    is_platform_admin: bool


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Public liveness probe. Render pings this to verify the service is up."""
    return HealthResponse(status="ok", db=await ping())


@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    """Return the authenticated user's own record.

    Requires `Authorization: Bearer <supabase-jwt>`. On first call for a new
    Supabase user, the internal `users` row is created automatically.

    Useful smoke test after deployment: hit this with a valid Supabase JWT
    and confirm you get your own record back — that proves JWT verify + DB
    connection + user upsert + tenant-safe session are all working.
    """
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_platform_admin=current_user.is_platform_admin,
    )
