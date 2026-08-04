"""Minimal core API surface.

Only public/system endpoints stay here. Everything auth/tenant-scoped
lives under `app/routes/`. Kept separate because /healthz never needs auth.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import ping

router = APIRouter(tags=["core"])


class HealthResponse(BaseModel):
    status: str
    db: bool


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Public liveness probe. Render pings this to verify the service is up."""
    return HealthResponse(status="ok", db=await ping())
