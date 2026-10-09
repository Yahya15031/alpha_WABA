"""Thin wrapper around Supabase's Admin API for inviting users."""
from __future__ import annotations
import os
import httpx


class SupabaseAdminError(Exception):
    pass


class SupabaseAdmin:
    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }

    async def invite_by_email(
        self,
        email: str,
        redirect_to: str,
        metadata: dict | None = None,
    ) -> dict:
        """Send invite. Returns the created user record from Supabase."""
        payload: dict = {"email": email, "redirect_to": redirect_to}
        if metadata:
            payload["data"] = metadata  # user_metadata
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.url}/auth/v1/invite",
                json=payload,
                headers=self._headers(),
            )
            if resp.status_code >= 400:
                raise SupabaseAdminError(f"{resp.status_code}: {resp.text}")
            return resp.json()

    async def delete_user(self, user_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{self.url}/auth/v1/admin/users/{user_id}",
                headers=self._headers(),
            )
            if resp.status_code >= 400 and resp.status_code != 404:
                raise SupabaseAdminError(f"{resp.status_code}: {resp.text}")


_singleton: SupabaseAdmin | None = None


def get_supabase_admin() -> SupabaseAdmin:
    global _singleton
    if _singleton is None:
        _singleton = SupabaseAdmin()
    return _singleton