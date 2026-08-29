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
from app.workers.tasks import (
    materialize_campaign_task,
    process_webhook_event_task,
    send_message_task,
)


def _redis_settings() -> RedisSettings:
    if settings.redis_url is None:
        raise RuntimeError(
            "REDIS_URL is not configured. Set it in .env or the Render dashboard."
        )
    return RedisSettings.from_dsn(settings.redis_url)


# Shared function set — both lanes can process either kind of job. Routing
# happens at enqueue time via the queue_name argument.
_FUNCTIONS = [
    send_message_task,
    process_webhook_event_task,
    materialize_campaign_task,
]


class TransactionalWorkerSettings:
    """Low-concurrency, low-latency lane.

    Webhook processing, OTP-style sends, anything where end-to-end latency
    matters more than throughput.
    """

    queue_name = "q:transactional"
    functions = [
        send_message_task,
        process_webhook_event_task,
        materialize_campaign_task,
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    # Log the commit the worker was booted with (optional). If available,
    # this helps tie worker logs to a specific deploy. Keep minimal risk —
    # swallow failures.
    try:
        import subprocess, os

        _sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=os.getcwd()).decode().strip()
        boot_info = {"boot_commit": _sha[:12]}
    except Exception:
        boot_info = {"boot_commit": os.getenv("RENDER_GIT_COMMIT", "unknown")}
    worker_boot_info = boot_info
    # Reduce heartbeat frequency to 5 minutes (was ~30s default)
    health_check_interval = 300
    # When queue is empty, poll every 2 seconds (was ~0.5s default)
    poll_delay = 2.0
    max_jobs = 10
    job_timeout = 30  # seconds
    keep_result = 3600  # keep result rows for 1 hour for debugging
    max_tries = 2          # was default 5 — retry once on failure, then dead-letter
    retry_jobs = True      # explicit, don't rely on default

class BulkWorkerSettings:
    """High-throughput lane.

    Broadcast campaigns. Higher concurrency means we don't get blocked by
    slow Meta responses; retries and backoff still apply.
    """

    queue_name = "q:bulk"
    functions = [
        send_message_task,
        process_webhook_event_task,
        materialize_campaign_task,
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    try:
        import subprocess, os

        _sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=os.getcwd()).decode().strip()
        boot_info = {"boot_commit": _sha[:12]}
    except Exception:
        boot_info = {"boot_commit": os.getenv("RENDER_GIT_COMMIT", "unknown")}
    worker_boot_info = boot_info
    health_check_interval = 300
    poll_delay = 15.0
    max_jobs = 10
    job_timeout = 30
    keep_result = 3600
    max_tries = 2
    retry_jobs = True
