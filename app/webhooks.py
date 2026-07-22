"""Meta webhook receiver.

Two endpoints under /webhooks/meta:

  GET  — verification handshake. Meta hits this once when you save the
         Callback URL in the App Dashboard. We echo back the challenge if
         the verify token matches.

  POST — event ingestion. Meta hits this for every delivery status update
         (and every inbound message once Phase 2 lands). We verify the
         HMAC-SHA256 signature and stage the raw payload in webhook_events.
         A background worker (later turn) processes the staged rows and
         updates campaign_recipients under the resolved tenant's session.

Why staging, not inline processing? Meta expects 200 within a few seconds
or they'll retry. Doing DB work on RLS-scoped tables inline can stall.
Staging is O(1) — one INSERT — and always fast. The worker path is where
tenant resolution and status updates happen.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from app.config import settings
from app.db import get_system_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/meta", tags=["webhooks"])


# ---------------------------------------------------------------------------
# HMAC signature verification
# ---------------------------------------------------------------------------


def verify_meta_signature(
    raw_body: bytes,
    signature_header: str | None,
    app_secret: str,
) -> bool:
    """Meta signs the raw body with HMAC-SHA256 using the App Secret.

    The header looks like: `X-Hub-Signature-256: sha256=<hex-digest>`.
    We recompute the HMAC and compare in constant time. Any mismatch,
    missing header, or wrong prefix returns False — never trust the payload.
    """
    if not signature_header:
        return False
    if not signature_header.startswith("sha256="):
        return False

    expected_hex = signature_header[len("sha256="):]
    computed = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, expected_hex)


# ---------------------------------------------------------------------------
# GET — verification handshake
# ---------------------------------------------------------------------------


@router.get("")
async def verify_webhook(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
) -> PlainTextResponse:
    """Meta's initial handshake. Returns the challenge as plaintext on match."""
    if hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")

    if settings.meta_webhook_verify_token is None:
        logger.error("META_WEBHOOK_VERIFY_TOKEN not configured — cannot verify")
        raise HTTPException(status_code=500, detail="Webhook not configured")

    expected = settings.meta_webhook_verify_token.get_secret_value()
    if hub_verify_token != expected:
        logger.warning("Verify token mismatch on GET handshake")
        raise HTTPException(status_code=403, detail="Invalid verify token")

    if not hub_challenge:
        raise HTTPException(status_code=400, detail="Missing hub.challenge")

    logger.info("Webhook verified by Meta")
    return PlainTextResponse(hub_challenge)


# ---------------------------------------------------------------------------
# POST — event ingestion
# ---------------------------------------------------------------------------


@router.post("")
async def receive_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
) -> dict:
    """Receive an event. Verify HMAC, stage raw payload, return 200."""
    raw_body = await request.body()

    if settings.meta_app_secret is None:
        logger.error("META_APP_SECRET not configured — cannot verify signature")
        raise HTTPException(status_code=500, detail="Webhook not configured")

    if not verify_meta_signature(
        raw_body,
        x_hub_signature_256,
        settings.meta_app_secret.get_secret_value(),
    ):
        logger.warning("Rejected webhook: invalid HMAC signature")
        raise HTTPException(status_code=401, detail="Signature verification failed")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    meta_waba_id, meta_message_id, event_type = _extract_routing_hints(payload)

    async with get_system_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO webhook_events
                    (meta_waba_id, meta_message_id, event_type,
                     raw_payload, signature_valid)
                VALUES
                    (:waba_id, :msg_id, :event_type, CAST(:payload AS JSONB), TRUE)
                RETURNING id
                """
            ),
            {
                "waba_id": meta_waba_id,
                "msg_id": meta_message_id,
                "event_type": event_type,
                "payload": json.dumps(payload),
            },
        )
        row = result.first()
        webhook_event_id = row[0] if row else None

    logger.info(
        "Webhook staged: type=%s waba=%s msg=%s event_id=%s",
        event_type,
        meta_waba_id,
        meta_message_id,
        webhook_event_id,
    )

    # Best-effort: enqueue processing. If Redis is unavailable, we log and
    # move on — the row is staged and can be picked up by a cron sweep
    # (once we add one) or a manual reprocess script.
    if webhook_event_id is not None and settings.redis_url is not None:
        try:
            from app.workers.router import enqueue_webhook_process

            await enqueue_webhook_process(webhook_event_id=webhook_event_id)
        except Exception as exc:
            logger.warning(
                "Failed to enqueue webhook processing for event %s: %s",
                webhook_event_id,
                exc,
            )

    return {"status": "received"}


def _extract_routing_hints(
    payload: dict,
) -> tuple[str | None, str | None, str]:
    """Pull the WABA id, message id, and event type from a Meta webhook.

    Payload shape:
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "id": "<WABA_ID>",
            "changes": [{
              "value": { "messages" | "statuses": [...] },
              "field": "messages"
            }]
          }]
        }

    If anything is missing we return Nones and event_type='unknown' — the
    processing worker still gets the raw payload staged and can handle it.
    """
    entry = payload.get("entry", [])
    if not entry:
        return None, None, "unknown"

    first_entry = entry[0] if isinstance(entry[0], dict) else {}
    meta_waba_id = first_entry.get("id")

    changes = first_entry.get("changes", [])
    if not changes:
        return meta_waba_id, None, "unknown"

    first_change = changes[0] if isinstance(changes[0], dict) else {}
    event_type = first_change.get("field", "unknown")
    value = first_change.get("value", {})

    meta_message_id: str | None = None
    if "statuses" in value:
        statuses = value.get("statuses") or []
        if statuses:
            meta_message_id = statuses[0].get("id")
    elif "messages" in value:
        messages = value.get("messages") or []
        if messages:
            meta_message_id = messages[0].get("id")

    return meta_waba_id, meta_message_id, event_type
