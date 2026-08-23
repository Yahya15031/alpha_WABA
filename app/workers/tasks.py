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
    AudienceType,
    Campaign,
    CampaignLane,
    CampaignRecipient,
    CampaignStatus,
    Contact,
    ContactOptInStatus,
    PhoneNumber,
    RecipientStatus,
    Template,
    Tenant,
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

    logger.info(
        "send_message_task START recipient=%s tenant=%s attempt=%d",
        campaign_recipient_id,
        tenant_id,
        ctx.get("job_try", 1),
    )

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

        # Guard: if the recipient was canceled/updated out from under us
        # between enqueue and execution, skip the send. This prevents a
        # race where a user cancels a campaign while a job is in flight.
        if recipient.status != RecipientStatus.pending:
            logger.info(
                "Skipping send for %s — status is %s, not pending",
                recipient_uuid,
                recipient.status.value,
            )
            return {
                "success": False,
                "reason": "skipped_not_pending",
                "status": recipient.status.value,
            }

        # Skip if terminal state already reached (defensive; covered above)
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

    
# Build body parameters in template order, preserving names for named
    # templates. Meta requires parameter_name in the payload for {{name}}
    # templates; for positional {{1}} templates parameter_name is optional
    # but harmless to omit.
    body_params: list[dict[str, str]] = []
    for i, var_def in enumerate(variable_definitions):
        var_name = var_def.get("name")
        idx_key = str(var_name) if var_name else str(var_def.get("index", i + 1))
        value = str(resolved_variables.get(idx_key, ""))
        param: dict[str, str] = {"type": "text", "text": value}
        if var_name:
            param["parameter_name"] = str(var_name)
        body_params.append(param)

    # ---- Call Meta (no DB session held) ----
    client = get_meta_client()
    result = await client.send_template_message(
        phone_number_id=meta_phone_number_id,
        to_phone_e164=phone_e164,
        template_name=template_name,
        language_code=language_code,
        body_parameters=body_params,
    )

    # ---- Session 2: write result ----
    async with get_worker_session(tenant_uuid) as session:
        recipient = await session.get(CampaignRecipient, recipient_uuid)

        if result.success:
            recipient.status = RecipientStatus.sent
            recipient.meta_message_id = result.meta_message_id
            recipient.sent_at = datetime.now(timezone.utc)
            # Bump stats — total_sent counter for the campaign
            await session.execute(
                text(
                    "UPDATE campaign_stats "
                    "SET total_sent = total_sent + 1, last_updated = now() "
                    "WHERE campaign_id = :cid"
                ),
                {"cid": str(recipient.campaign_id)},
            )
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
            # Bump stats — total_failed counter for the campaign
            await session.execute(
                text(
                    "UPDATE campaign_stats "
                    "SET total_failed = total_failed + 1, last_updated = now() "
                    "WHERE campaign_id = :cid"
                ),
                {"cid": str(recipient.campaign_id)},
            )
            logger.warning(
                "Send failed: recipient=%s http=%s code=%s msg=%s",
                recipient_uuid,
                result.http_status,
                result.error_code,
                result.error_message,
            )
        await session.flush()    
        await _maybe_mark_campaign_completed(session, recipient.campaign_id)
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

        old_status = recipient.status
        new_status: RecipientStatus | None = None

        if status == "sent":
            recipient.status = RecipientStatus.sent
            recipient.sent_at = ts
            new_status = RecipientStatus.sent
        elif status == "delivered":
            recipient.status = RecipientStatus.delivered
            recipient.delivered_at = ts
            new_status = RecipientStatus.delivered
        elif status == "read":
            recipient.status = RecipientStatus.read
            recipient.read_at = ts
            new_status = RecipientStatus.read
        elif status == "failed":
            recipient.status = RecipientStatus.failed
            recipient.failed_at = ts
            new_status = RecipientStatus.failed
            errors = status_update.get("errors", [])
            if errors and isinstance(errors[0], dict):
                recipient.error_code = errors[0].get("code")
                recipient.error_message = errors[0].get("title") or errors[0].get(
                    "message"
                )

        if new_status is not None:
            await _bump_campaign_stats(
                session, recipient.campaign_id, old_status, new_status
            )
async def _maybe_mark_campaign_completed(session, campaign_id: uuid.UUID) -> None:
    """If no recipients remain pending/queued, the campaign has finished
    sending — flip it to completed. Delivery/read status can keep updating
    after this via webhooks; that doesn't block completion, only "has
    everything been attempted" does.
    """
    result = await session.execute(
        text(
            "SELECT COUNT(*) FROM campaign_recipients "
            "WHERE campaign_id = :cid AND status IN ('pending', 'queued')"
        ),
        {"cid": str(campaign_id)},
    )
    remaining = result.scalar()
    if remaining == 0:
        campaign = await session.get(Campaign, campaign_id)
        if campaign and campaign.status == CampaignStatus.running:
            campaign.status = CampaignStatus.completed

# ---------------------------------------------------------------------------
# campaign_stats bump helper
# ---------------------------------------------------------------------------


# Success ladder — each level implies all lower levels were reached.
# `failed` is a separate terminal state and doesn't sit on this ladder.
_STATUS_LEVEL: dict[RecipientStatus, int] = {
    RecipientStatus.pending: 0,
    RecipientStatus.queued: 1,
    RecipientStatus.sent: 2,
    RecipientStatus.delivered: 3,
    RecipientStatus.read: 4,
    RecipientStatus.failed: -1,  # sentinel — off the ladder
}


async def _bump_campaign_stats(
    session,
    campaign_id: uuid.UUID,
    old_status: RecipientStatus,
    new_status: RecipientStatus,
) -> None:
    """Atomically increment campaign_stats counters based on the transition.

    Rules:
      - Terminal `failed` bumps total_failed only (once per recipient lifetime).
      - Success ladder: transitioning from level A to level B increments
        every counter for levels in (A, B]. Ex: pending→delivered bumps
        total_sent AND total_delivered.
      - Idempotent when old == new (nothing to increment).

    Uses a single UPDATE with `= col + 1` clauses so concurrent updates on
    different recipients of the same campaign don't clobber each other.
    """
    if old_status == new_status:
        return

    increments: list[str] = []

    if new_status == RecipientStatus.failed:
        if old_status != RecipientStatus.failed:
            increments.append("total_failed = total_failed + 1")
    else:
        old_level = _STATUS_LEVEL.get(old_status, 0)
        new_level = _STATUS_LEVEL.get(new_status, 0)
        if new_level >= 2 and old_level < 2:
            increments.append("total_sent = total_sent + 1")
        if new_level >= 3 and old_level < 3:
            increments.append("total_delivered = total_delivered + 1")
        if new_level >= 4 and old_level < 4:
            increments.append("total_read = total_read + 1")

    if not increments:
        return

    sql = (
        "UPDATE campaign_stats SET "
        + ", ".join(increments)
        + ", last_updated = now() WHERE campaign_id = :cid"
    )
    await session.execute(text(sql), {"cid": str(campaign_id)})


# ---------------------------------------------------------------------------
# materialize_campaign_task
# ---------------------------------------------------------------------------


def _resolve_variable(path: str, contact: Contact, tenant: Tenant) -> str:
    """Resolve one variable_mapping value → concrete string.

    Supported paths:
      - `$literal:<text>`     — use the text after the colon verbatim
      - `contact.<field>`     — read a field off the Contact row
      - `custom.<key>`        — read from Contact.custom_fields JSON
      - `tenant.<field>`      — read a field off the Tenant row
    Unknown paths resolve to "" so the send doesn't crash — better an empty
    variable than a failed campaign.
    """
    if not path:
        return ""
    if path.startswith("$literal:"):
        return path[len("$literal:"):]
    if path.startswith("contact."):
        return str(getattr(contact, path[len("contact."):], "") or "")
    if path.startswith("custom."):
        return str((contact.custom_fields or {}).get(path[len("custom."):], ""))
    if path.startswith("tenant."):
        return str(getattr(tenant, path[len("tenant."):], "") or "")
    return ""


async def materialize_campaign_task(
    ctx: dict,
    campaign_id: str,
    tenant_id: str,
) -> dict[str, Any]:
    """Expand a queued campaign into recipient rows + enqueue individual sends.

    Runs on the bulk lane (one task per broadcast). Flow:

      1. Load campaign under tenant scope.
      2. Reject if not in `queued` state (defensive against re-runs).
      3. Resolve audience → list of contacts.
      4. Batch INSERT campaign_recipients with resolved_variables.
      5. Set campaign_stats.total_recipients = N.
      6. Flip campaign.status = running.
      7. Fan out send_message_task per recipient on the campaign's lane.
    """
    campaign_uuid = uuid.UUID(campaign_id)
    tenant_uuid = uuid.UUID(tenant_id)

    logger.info(
        "materialize_campaign_task START campaign=%s tenant=%s",
        campaign_id,
        tenant_id,
    )

    # ---- Session: load, materialize, mark running ----
    lane_for_sends: CampaignLane = CampaignLane.bulk
    recipient_ids: list[uuid.UUID] = []

    async with get_worker_session(tenant_uuid) as session:
        campaign = await session.get(Campaign, campaign_uuid)
        if campaign is None:
            logger.error("materialize: campaign %s not found", campaign_uuid)
            return {"success": False, "reason": "campaign_not_found"}

        if campaign.status != CampaignStatus.queued:
            logger.warning(
                "materialize: campaign %s in status %s (expected queued); skipping",
                campaign_uuid,
                campaign.status.value,
            )
            return {
                "success": False,
                "reason": f"invalid_status:{campaign.status.value}",
            }

        tenant = await session.get(Tenant, tenant_uuid)
        template = await session.get(Template, campaign.template_id)
        if tenant is None or template is None:
            logger.error(
                "materialize: tenant %s or template %s missing",
                tenant_uuid,
                campaign.template_id,
            )
            return {"success": False, "reason": "tenant_or_template_missing"}

        variable_mappings = dict(campaign.variable_mappings)
        template_variables = list(template.variable_definitions or [])
        audience_type = campaign.audience_type
        audience_config = dict(campaign.audience_config)
        branch_id = campaign.branch_id
        lane_for_sends = campaign.lane

        # ---- Resolve audience ----
        stmt = select(Contact).where(
            Contact.opt_in_status == ContactOptInStatus.opted_in
        )
        if audience_type == AudienceType.all_contacts:
            stmt = stmt.where(Contact.branch_id == branch_id)
        elif audience_type == AudienceType.branch_group:
            # Phase 1: branch_group behaves like all_contacts for this branch.
            # Extend later to multi-branch groups.
            stmt = stmt.where(Contact.branch_id == branch_id)
        elif audience_type == AudienceType.csv_upload:
            upload_id_raw = audience_config.get("upload_id")
            if not upload_id_raw:
                logger.error(
                    "materialize: csv_upload audience missing audience_config.upload_id"
                )
                return {"success": False, "reason": "missing_upload_id"}
            try:
                upload_uuid = uuid.UUID(upload_id_raw)
            except (ValueError, TypeError):
                return {"success": False, "reason": "invalid_upload_id"}
            stmt = stmt.where(Contact.csv_import_id == upload_uuid)
        else:
            return {"success": False, "reason": "unknown_audience_type"}

        contacts_result = await session.execute(stmt)
        contacts = list(contacts_result.scalars().all())

        if not contacts:
            campaign.status = CampaignStatus.completed
            await session.execute(
                text(
                    "UPDATE campaign_stats SET total_recipients = 0, last_updated = now() "
                    "WHERE campaign_id = :cid"
                ),
                {"cid": str(campaign_uuid)},
            )
            logger.info("materialize: no recipients for campaign %s", campaign_uuid)
            return {"success": True, "recipient_count": 0}

        # ---- Build recipient rows with resolved template variables ----
        for contact in contacts:
            resolved: dict[str, str] = {}
            for var_def in template_variables:
                idx = str(var_def.get("name") or var_def.get("index") or "")

                if not idx:
                    continue
                path = variable_mappings.get(idx, "")
                resolved[idx] = _resolve_variable(path, contact, tenant)

            recipient = CampaignRecipient(
                tenant_id=tenant_uuid,
                campaign_id=campaign_uuid,
                contact_id=contact.id,
                phone_e164=contact.phone_e164,
                resolved_variables=resolved,
                status=RecipientStatus.pending,
            )
            session.add(recipient)

        await session.flush()

        # Grab the just-inserted IDs
        id_result = await session.execute(
            select(CampaignRecipient.id).where(
                CampaignRecipient.campaign_id == campaign_uuid
            )
        )
        recipient_ids = [rid for (rid,) in id_result.all()]

        # ---- Stats + campaign status ----
        await session.execute(
            text(
                "UPDATE campaign_stats SET total_recipients = :n, last_updated = now() "
                "WHERE campaign_id = :cid"
            ),
            {"n": len(recipient_ids), "cid": str(campaign_uuid)},
        )
        campaign.status = CampaignStatus.running

        

    # ---- Fan out send tasks (outside the DB transaction) ----
    from app.workers.router import enqueue_send

    enqueued = 0
    for rid in recipient_ids:
        try:
            await enqueue_send(
                campaign_recipient_id=rid,
                tenant_id=tenant_uuid,
                lane=lane_for_sends,
            )
            enqueued += 1
        except Exception as exc:
            # One failed enqueue shouldn't abort the whole broadcast — log and
            # move on. The recipient row is still there and can be retried
            # by a maintenance job later.
            logger.exception(
                "materialize: failed to enqueue send for recipient %s: %s",
                rid,
                exc,
            )

    logger.info(
        "materialize: campaign %s → %d recipients enqueued on %s",
        campaign_uuid,
        enqueued,
        lane_for_sends.value,
    )
    return {"success": True, "recipient_count": enqueued}
