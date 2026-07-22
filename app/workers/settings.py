"""arq worker configuration.

Two lanes, one task set. Run with:
    arq app.workers.settings.TransactionalWorkerSettings
    arq app.workers.settings.BulkWorkerSettings

Local dev tip: you only need one worker running to process anything. Run
TransactionalWorkerSettings — it handles webhooks (which the receiver
enqueues to transactional) and OTP-style sends. Add BulkWorkerSettings
once you're actually running broadcast campaigns.
"""
from __future__ import annotations

from arq.connections import RedisSettings

from app.config import settings
from app.workers.tasks import process_webhook_event_task, send_message_task


def _redis_settings() -> RedisSettings:
    if settings.redis_url is None:
        raise RuntimeError(
            "REDIS_URL is not configured. Set it in .env or the Render dashboard."
        )
    return RedisSettings.from_dsn(settings.redis_url)


# Shared function set — both lanes can process either kind of job. Routing
# happens at enqueue time via the queue_name argument.
_FUNCTIONS = [send_message_task, process_webhook_event_task]


class TransactionalWorkerSettings:
    """Low-concurrency, low-latency lane.

    Webhook processing, OTP-style sends, anything where end-to-end latency
    matters more than throughput.
    """

    queue_name = "q:transactional"
    functions = _FUNCTIONS
    max_jobs = 10
    job_timeout = 30  # seconds
    keep_result = 3600  # keep result rows for 1 hour for debugging
    max_tries = 5
    redis_settings = _redis_settings()


class BulkWorkerSettings:
    """High-throughput lane.

    Broadcast campaigns. Higher concurrency means we don't get blocked by
    slow Meta responses; retries and backoff still apply.
    """

    queue_name = "q:bulk"
    functions = _FUNCTIONS
    max_jobs = 100
    job_timeout = 30
    keep_result = 3600
    max_tries = 5
    redis_settings = _redis_settings()
