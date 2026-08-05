"""arq enqueue helpers.

Anything that wants to enqueue a job — the FastAPI webhook receiver, the
send-test script, the FastAPI campaign-launch route (later) — goes through
here. Two functions:

  enqueue_send            — routes to q:transactional or q:bulk based on lane
  enqueue_webhook_process — always routes to q:transactional (want fast turnaround)

The Redis pool is a module-level singleton. Each Python process gets its own,
lazily created on first use. Closed via `close_arq_pool()` on shutdown.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.config import settings
from app.models import CampaignLane

logger = logging.getLogger(__name__)

_QUEUE_TRANSACTIONAL = "q:transactional"
_QUEUE_BULK = "q:bulk"

_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """Return the singleton arq Redis pool, creating it if needed."""
    global _pool
    if _pool is None:
        if settings.redis_url is None:
            raise RuntimeError("REDIS_URL is not configured")
        _pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _pool


async def close_arq_pool() -> None:
    """Close the pool on app shutdown. Safe to call even if never opened."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _queue_for_lane(lane: CampaignLane) -> str:
    return _QUEUE_TRANSACTIONAL if lane == CampaignLane.transactional else _QUEUE_BULK


async def enqueue_send(
    *,
    campaign_recipient_id: uuid.UUID,
    tenant_id: uuid.UUID,
    lane: CampaignLane,
) -> Any:
    """Enqueue a send_message_task on the lane corresponding to the campaign."""
    pool = await get_arq_pool()
    queue = _queue_for_lane(lane)
    job = await pool.enqueue_job(
        "send_message_task",
        str(campaign_recipient_id),
        str(tenant_id),
        _queue_name=queue,
    )
    logger.info(
        "Enqueued send: recipient=%s tenant=%s queue=%s job=%s",
        campaign_recipient_id,
        tenant_id,
        queue,
        job.job_id if job else None,
    )
    return job


async def enqueue_webhook_process(
    *,
    webhook_event_id: uuid.UUID,
) -> Any:
    """Enqueue a process_webhook_event_task. Always transactional lane."""
    pool = await get_arq_pool()
    job = await pool.enqueue_job(
        "process_webhook_event_task",
        str(webhook_event_id),
        _queue_name=_QUEUE_TRANSACTIONAL,
    )
    logger.info(
        "Enqueued webhook processing: event=%s job=%s",
        webhook_event_id,
        job.job_id if job else None,
    )
    return job


async def enqueue_materialize(
    *,
    campaign_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> Any:
    """Enqueue materialize_campaign_task. Always bulk lane.

    Called by POST /broadcasts/:id/send. The task itself expands audience,
    inserts campaign_recipients, and fans out per-recipient send_message_task
    calls on the campaign's own lane (transactional or bulk).
    """
    pool = await get_arq_pool()
    job = await pool.enqueue_job(
        "materialize_campaign_task",
        str(campaign_id),
        str(tenant_id),
        _queue_name=_QUEUE_BULK,
    )
    logger.info(
        "Enqueued materialize: campaign=%s tenant=%s job=%s",
        campaign_id,
        tenant_id,
        job.job_id if job else None,
    )
    return job
