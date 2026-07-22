"""arq task functions.

Two tasks:
  - `send_message_task` — send one template message to one recipient via Meta.
  - `process_webhook_event_task` — resolve tenant from a staged webhook_event
    row and apply status updates to campaign_recipients.

Both are RLS-safe: they use `get_worker_session(tenant_id)` for tenant-scoped
work, and `get_system_session()` for cross-tenant staging or lookup queries.

Retry policy
------------
Meta 5xx and 429 → arq Retry with backoff (10s, 20s, 30s, ... up to 60s).
Meta 4xx (except 429) → permanent failure, recorded on recipient.
Network/timeout → treated as retryable.

Idempotency caveat: if Meta accepts the message but our DB write fails, a
retry can produce a duplicate send. For Phase 1 sandbox volume this is
acceptable. A production fix would need a database-side "in flight" state
plus SELECT ... FOR UPDATE on retry.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from arq import Retry
from sqlalchemy import select, text

from app.db import get_system_session, get_worker_session
from app.meta import get_meta_client
from app.models import (
    Campaign,
    CampaignRecipient,
    PhoneNumber,
    RecipientStatus,
    Template,
    WebhookEvent,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# send_message_task
# ---------------------------------------------------------------------------


async def send_message_task(
    ctx: dict,
    campaign_recipient_id: str,
    tenant_id: str,
) -> dict[str, Any]:
    """Send one template message to one recipient.

    Two-session pattern:
      Session 1 → load data, mark 'queued', commit
      (session closed; call Meta over the network)
      Session 2 → write result

    This avoids holding a DB connection during the ~200-2000ms Meta round trip,
    which matters when we're pushing high volumes through the pool.
    """
    recipient_uuid = uuid.UUID(campaign_recipient_id)
    tenant_uuid = uuid.UUID(tenant_id)

    # ---- Session 1: load + mark queued ----
    async with get_worker_session(tenant_uuid) as session:
        recipient = await session.get(CampaignRecipient, recipient_uuid)
        if recipient is None:
            logger.error(
                "send_message_task: recipient %s not found in tenant %s",
                recipient_uuid,
                tenant_uuid,
            )
            return {"success": False, "reason": "recipient_not_found"}

        # Skip if terminal state already reached
        if recipient.status in (
            RecipientStatus.sent,
            RecipientStatus.delivered,
            RecipientStatus.read,
        ):
            return {
                "success": False,
                "reason": "already_sent",
                "status": recipient.status.value,
            }

        campaign = await session.get(Campaign, recipient.campaign_id)
        template = await session.get(Template, campaign.template_id)
        phone_number = await session.get(PhoneNumber, campaign.phone_number_id)

        # Snapshot everything we need after the session closes
        meta_phone_number_id = phone_number.meta_phone_number_id
        template_name = template.name
        language_code = template.language_code
        variable_definitions = list(template.variable_definitions)
        resolved_variables = dict(recipient.resolved_variables)
        phone_e164 = recipient.phone_e164

        # Mark queued
        recipient.status = RecipientStatus.queued
        recipient.queued_at = datetime.now(timezone.utc)

    # Build body variables in template order (indices 1..N)
    body_variables: list[str] = []
    for i, var_def in enumerate(variable_definitions):
        idx = str(var_def.get("index", i + 1))
        body_variables.append(str(resolved_variables.get(idx, "")))

    # ---- Call Meta (no DB session held) ----
    client = get_meta_client()
    result = await client.send_template_message(
        phone_number_id=meta_phone_number_id,
        to_phone_e164=phone_e164,
        template_name=template_name,
        language_code=language_code,
        body_variables=body_variables,
    )

    # ---- Session 2: write result ----
    async with get_worker_session(tenant_uuid) as session:
        recipient = await session.get(CampaignRecipient, recipient_uuid)

        if result.success:
            recipient.status = RecipientStatus.sent
            recipient.meta_message_id = result.meta_message_id
            recipient.sent_at = datetime.now(timezone.utc)
            logger.info(
                "Sent: recipient=%s meta_msg=%s tenant=%s",
                recipient_uuid,
                result.meta_message_id,
                tenant_uuid,
            )
        else:
            if result.is_retryable:
                # Let arq retry — status stays 'queued', we'll try again
                await session.rollback()
                defer = min(ctx["job_try"] * 10, 60)
                if result.retry_after_seconds:
                    defer = max(defer, result.retry_after_seconds)
                logger.warning(
                    "Retryable Meta error (http=%s): %s. Retrying in %ss",
                    result.http_status,
                    result.error_message,
                    defer,
                )
                raise Retry(defer=defer)

            # Permanent failure
            recipient.status = RecipientStatus.failed
            recipient.error_code = result.error_code
            recipient.error_message = result.error_message
            recipient.failed_at = datetime.now(timezone.utc)
            logger.warning(
                "Send failed: recipient=%s http=%s code=%s msg=%s",
                recipient_uuid,
                result.http_status,
                result.error_code,
                result.error_message,
            )

    return {
        "success": result.success,
        "meta_message_id": result.meta_message_id,
        "error_code": result.error_code,
        "error_message": result.error_message,
    }


# ---------------------------------------------------------------------------
# process_webhook_event_task
# ---------------------------------------------------------------------------


async def process_webhook_event_task(
    ctx: dict,
    webhook_event_id: str,
) -> dict[str, Any]:
    """Process a staged webhook event.

    - Load event from webhook_events (staging, no RLS).
    - Resolve tenant from meta_waba_id (or fall back to meta_message_id).
    - Open a tenant-scoped session and apply status updates to
      campaign_recipients.
    - Mark event as processed.
    """
    event_uuid = uuid.UUID(webhook_event_id)

    async with get_system_session() as session:
        event = await session.get(WebhookEvent, event_uuid)
        if event is None:
            logger.error("Webhook event %s not found", event_uuid)
            return {"success": False, "reason": "event_not_found"}
        if event.processed_at is not None:
            return {"success": False, "reason": "already_processed"}

        # Snapshot for use outside this session
        payload = dict(event.raw_payload)
        meta_waba_id = event.meta_waba_id
        meta_message_id = event.meta_message_id

    tenant_id = await _resolve_tenant(meta_waba_id, meta_message_id)
    if tenant_id is None:
        async with get_system_session() as session:
            event = await session.get(WebhookEvent, event_uuid)
            event.processed_at = datetime.now(timezone.utc)
            event.processing_error = "Could not resolve tenant"
        logger.warning(
            "Could not resolve tenant for event=%s waba=%s msg=%s",
            event_uuid,
            meta_waba_id,
            meta_message_id,
        )
        return {"success": False, "reason": "tenant_not_resolved"}

    # Apply the status updates under the resolved tenant's session
    try:
        async with get_worker_session(tenant_id) as session:
            await _apply_status_updates(session, payload)
    except Exception as exc:
        logger.exception("Failed to apply status updates: %s", exc)
        async with get_system_session() as session:
            event = await session.get(WebhookEvent, event_uuid)
            event.processing_error = f"apply_status_updates failed: {exc}"
        raise Retry(defer=min(ctx["job_try"] * 10, 60))

    # Mark processed and record the resolved tenant
    async with get_system_session() as session:
        event = await session.get(WebhookEvent, event_uuid)
        event.resolved_tenant_id = tenant_id
        event.processed_at = datetime.now(timezone.utc)

    logger.info(
        "Processed webhook: event=%s tenant=%s",
        event_uuid,
        tenant_id,
    )
    return {"success": True, "tenant_id": str(tenant_id)}


async def _resolve_tenant(
    meta_waba_id: str | None,
    meta_message_id: str | None,
) -> uuid.UUID | None:
    """Cross-tenant lookup to find which tenant a webhook belongs to.

    This inherently crosses tenant lines — the whole point is to figure out
    WHICH tenant. We use the platform admin bypass explicitly and only for
    this lookup.
    """
    async with get_system_session() as session:
        # Enable cross-tenant read for this lookup only
        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )

        if meta_waba_id:
            result = await session.execute(
                text("SELECT tenant_id FROM wabas WHERE meta_waba_id = :wid LIMIT 1"),
                {"wid": meta_waba_id},
            )
            row = result.first()
            if row:
                return row[0]

        if meta_message_id:
            result = await session.execute(
                text(
                    "SELECT tenant_id FROM campaign_recipients "
                    "WHERE meta_message_id = :mid LIMIT 1"
                ),
                {"mid": meta_message_id},
            )
            row = result.first()
            if row:
                return row[0]

    return None


async def _apply_status_updates(session, payload: dict) -> None:
    """Walk the Meta webhook payload's `statuses` array and update recipients.

    Meta's status values: 'sent', 'delivered', 'read', 'failed'. We map each
    to a RecipientStatus + set the corresponding timestamp column.
    """
    entry = payload.get("entry", [])
    if not entry:
        return

    changes = entry[0].get("changes", []) if isinstance(entry[0], dict) else []
    if not changes:
        return

    value = changes[0].get("value", {}) if isinstance(changes[0], dict) else {}
    statuses = value.get("statuses", []) if isinstance(value, dict) else []

    for status_update in statuses:
        if not isinstance(status_update, dict):
            continue

        message_id = status_update.get("id")
        status = status_update.get("status")
        timestamp_str = status_update.get("timestamp")

        if not message_id or not status:
            continue

        recipient = await session.scalar(
            select(CampaignRecipient).where(
                CampaignRecipient.meta_message_id == message_id
            )
        )
        if recipient is None:
            logger.warning("No recipient for message_id=%s in this tenant", message_id)
            continue

        try:
            ts = datetime.fromtimestamp(int(timestamp_str), tz=timezone.utc)
        except (ValueError, TypeError):
            ts = datetime.now(timezone.utc)

        if status == "sent":
            recipient.status = RecipientStatus.sent
            recipient.sent_at = ts
        elif status == "delivered":
            recipient.status = RecipientStatus.delivered
            recipient.delivered_at = ts
        elif status == "read":
            recipient.status = RecipientStatus.read
            recipient.read_at = ts
        elif status == "failed":
            recipient.status = RecipientStatus.failed
            recipient.failed_at = ts
            errors = status_update.get("errors", [])
            if errors and isinstance(errors[0], dict):
                recipient.error_code = errors[0].get("code")
                recipient.error_message = errors[0].get("title") or errors[0].get(
                    "message"
                )
