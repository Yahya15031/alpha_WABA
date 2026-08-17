"""System-level routes (auth required, but not tenant-scoped).

  GET /queue/status  — live Redis queue depths + worker heartbeat check.

Reads directly from Upstash: ZCARD for queue depth, EXISTS on arq's
health-check keys for worker liveness. Cheap — sub-10ms per call.

Auth: any authenticated user can see queue status. There is no per-tenant
queue — both queues are shared across all tenants. Not exposing this to
unauthenticated callers because queue depth leaks broadcast volume info.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import CurrentUser, get_current_user
from app.workers.router import get_arq_pool

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])


@router.get("/deploy-info")
async def deploy_info() -> dict:
    """Which git commit is this service actually running?"""
    import os
    import subprocess

    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd="/opt/render/project/src"
        ).decode().strip()
    except Exception:
        sha = os.getenv("RENDER_GIT_COMMIT", "unknown")
    return {
        "commit": sha[:12],
        "python_version": os.getenv("PYTHON_VERSION", "unknown"),
        "service": os.getenv("RENDER_SERVICE_NAME", "unknown"),
    }


class LaneStatus(BaseModel):
    depth: int
    active: bool


class QueueStatusResponse(BaseModel):
    transactional: LaneStatus
    bulk: LaneStatus


_QUEUE_TRANSACTIONAL = "q:transactional"
_QUEUE_BULK = "q:bulk"


async def _lane_status(pool: Any, queue_name: str) -> LaneStatus:
    """One lane's depth + active flag.

    depth: ZCARD on the queue key (arq stores pending jobs in a sorted set
    keyed by `queue_name`).
    active: EXISTS on `<queue_name>:health-check`, which arq refreshes with
    a TTL every ~30s while the worker is running. If the key is absent, the
    worker isn't sending heartbeats — either not started, or crashed.

    Errors returning either value → treat as depth=0, active=False rather
    than 500-ing the whole request.
    """
    try:
        depth = await pool.zcard(queue_name)
    except Exception as exc:
        logger.warning("queue_status: ZCARD %s failed: %s", queue_name, exc)
        depth = 0

    try:
        exists = await pool.exists(f"{queue_name}:health-check")
        active = bool(exists)
    except Exception as exc:
        logger.warning("queue_status: EXISTS health-check %s failed: %s", queue_name, exc)
        active = False

    return LaneStatus(depth=depth, active=active)


@router.get("/queue/status", response_model=QueueStatusResponse)
async def queue_status(
    _: CurrentUser = Depends(get_current_user),
) -> QueueStatusResponse:
    """Live queue depth + worker heartbeat per lane."""
    pool = await get_arq_pool()
    return QueueStatusResponse(
        transactional=await _lane_status(pool, _QUEUE_TRANSACTIONAL),
        bulk=await _lane_status(pool, _QUEUE_BULK),
    )
