"""Meta Cloud API async client.

Thin async httpx wrapper around Meta's Graph API. Currently exposes one
method: `send_template_message`. Template sync (pulling approved templates
from Meta) lands in a later turn.

Design notes
------------
- The client does not retry. Retry policy is a task-level concern (arq's
  Retry mechanism). This lets the send task decide backoff based on the
  error class it sees.
- Each call opens a new httpx.AsyncClient. Connection pooling would be a
  perf win at scale but adds lifecycle complexity — we're on sandbox
  volumes for Phase 1.
- The `Retry-After` header on 429 responses is exposed on the result so
  the task can honor it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class MetaSendResult:
    """Outcome of one send. Uniform shape regardless of success or error class."""

    success: bool
    meta_message_id: str | None
    error_code: int | None
    error_message: str | None
    http_status: int
    retry_after_seconds: int | None
    raw_response: dict[str, Any]

    @property
    def is_retryable(self) -> bool:
        """5xx and 429 are transient; caller may retry with backoff."""
        return self.http_status >= 500 or self.http_status == 429


class MetaCloudAPIClient:
    """Async client for Meta Cloud API's WhatsApp Business messaging endpoints."""

    def __init__(
        self,
        access_token: str,
        graph_api_base_url: str = "https://graph.facebook.com",
        api_version: str = "v25.0",
        timeout_seconds: float = 15.0,
    ) -> None:
        self._access_token = access_token
        self._base_url = f"{graph_api_base_url.rstrip('/')}/{api_version}"
        self._timeout = timeout_seconds

    async def send_template_message(
        self,
    *,
    phone_number_id: str,
    to_phone_e164: str,
    template_name: str,
    language_code: str,
    body_parameters: list[dict[str, Any]],   # changed from body_variables
) -> MetaSendResult:
        """POST /{phone_number_id}/messages with a template payload.

        Meta expects `to` without the leading `+`. We strip it here so the
        rest of the codebase can keep E.164 consistently.
        """
        url = f"{self._base_url}/{phone_number_id}/messages"

        payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to_phone_e164.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
        if body_parameters:
            payload["template"]["components"] = [
                {
                    "type": "body",
                    "parameters": body_parameters,
                }
            ]

        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code != 200:
                    try:
                        text = response.text
                    except Exception:
                        text = "<unreadable>"
                    logger.warning(
                        "Meta send failed status=%d body=%s payload_sent=%s",
                        response.status_code,
                        (text[:500] if text else ""),
                        {
                            "to": to_phone_e164,
                            "template": template_name,
                            "language": language_code,
                            "variables": body_variables,
                        },
                    )
                return self._parse_response(response)
        except httpx.TimeoutException:
            logger.warning("Meta API timeout: phone=%s", phone_number_id)
            return MetaSendResult(
                success=False,
                meta_message_id=None,
                error_code=None,
                error_message="Request timeout",
                http_status=0,
                retry_after_seconds=None,
                raw_response={},
            )
        except httpx.RequestError as exc:
            logger.warning("Meta API network error: %s", exc)
            return MetaSendResult(
                success=False,
                meta_message_id=None,
                error_code=None,
                error_message=f"Network error: {exc}",
                http_status=0,
                retry_after_seconds=None,
                raw_response={},
            )

    @staticmethod
    def _parse_response(response: httpx.Response) -> MetaSendResult:
        try:
            data = response.json()
        except Exception:
            data = {}

        retry_after = None
        if "Retry-After" in response.headers:
            try:
                retry_after = int(response.headers["Retry-After"])
            except (ValueError, TypeError):
                retry_after = None

        if response.status_code == 200:
            messages = data.get("messages", [])
            if messages:
                return MetaSendResult(
                    success=True,
                    meta_message_id=messages[0].get("id"),
                    error_code=None,
                    error_message=None,
                    http_status=200,
                    retry_after_seconds=None,
                    raw_response=data,
                )
            return MetaSendResult(
                success=False,
                meta_message_id=None,
                error_code=None,
                error_message="Missing 'messages' array in 200 response",
                http_status=200,
                retry_after_seconds=None,
                raw_response=data,
            )

        # _parse_response should remain pure and not reference caller locals

        error = data.get("error", {}) if isinstance(data, dict) else {}
        return MetaSendResult(
            success=False,
            meta_message_id=None,
            error_code=error.get("code"),
            error_message=error.get("message", f"HTTP {response.status_code}"),
            http_status=response.status_code,
            retry_after_seconds=retry_after,
            raw_response=data if isinstance(data, dict) else {},
        )


def get_meta_client() -> MetaCloudAPIClient:
    """Build a Meta client from env-driven settings.

    Raises RuntimeError if META_ACCESS_TOKEN isn't set — callers should not
    reach this in a healthy config. arq tasks will surface the error and
    fail the job cleanly.
    """
    if settings.meta_access_token is None:
        raise RuntimeError("META_ACCESS_TOKEN is not configured")
    return MetaCloudAPIClient(
        access_token=settings.meta_access_token.get_secret_value(),
        graph_api_base_url=settings.meta_graph_api_base_url,
        api_version=settings.meta_graph_api_version,
    )
