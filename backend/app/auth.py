"""Application auth for /scan and /status (Supabase JWT or API key)."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Literal

import httpx
from fastapi import Depends, Header, HTTPException

from backend.app.config import get_settings

API_KEY_OWNER_ID = "api-key"


@dataclass(frozen=True)
class ScanCaller:
    user_id: str
    auth_method: Literal["jwt", "api_key"]


async def _validate_supabase_jwt(token: str) -> str:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=503,
            detail="Supabase auth is not configured on the server",
        )

    url = settings.supabase_url.rstrip("/") + "/auth/v1/user"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Supabase auth unavailable: {exc}",
        ) from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    data = resp.json()
    user = data.get("user") if isinstance(data, dict) else None
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return str(user_id)


def _validate_api_key(provided: str | None) -> ScanCaller | None:
    if not provided:
        return None
    settings = get_settings()
    if not settings.scan_api_key:
        raise HTTPException(
            status_code=503,
            detail="API key auth is not configured on the server",
        )
    if not secrets.compare_digest(provided, settings.scan_api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return ScanCaller(user_id=API_KEY_OWNER_ID, auth_method="api_key")


async def require_scan_caller(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> ScanCaller:
    settings = get_settings()
    if settings.auth_mode != "required":
        return ScanCaller(user_id="anonymous", auth_method="jwt")

    api_caller = _validate_api_key(x_api_key)
    if api_caller is not None:
        return api_caller

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")

    user_id = await _validate_supabase_jwt(parts[1].strip())
    return ScanCaller(user_id=user_id, auth_method="jwt")


def assert_job_owner(row: dict, caller: ScanCaller) -> None:
    settings = get_settings()
    if settings.auth_mode != "required":
        return

    owner_id = row.get("owner_id")
    if not owner_id or owner_id != caller.user_id:
        raise HTTPException(status_code=403, detail="Not allowed to access this job")
