"""Best-effort mirror of scan jobs and extracted cards to Supabase Postgres."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import httpx

from backend.app.config import get_settings
from backend.app.schemas import BusinessCardFields

logger = logging.getLogger(__name__)


def _supabase_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.supabase_url.strip()
        and settings.supabase_service_role_key.strip()
    )


def _skip_job_row(row: dict | None) -> bool:
    if row is None:
        return True
    if not row.get("owner_id"):
        return True
    return not _supabase_configured()


def _supabase_headers() -> dict[str, str]:
    settings = get_settings()
    key = settings.supabase_service_role_key.strip()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def _parse_timestamp(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).isoformat()
    except ValueError:
        return value


def _job_row_to_scan_jobs_payload(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["owner_id"],
        "status": row["status"],
        "image_gcs_uri": row["image_gcs_uri"],
        "raw_ocr_text": row.get("raw_ocr_text"),
        "error": row.get("error"),
        "created_at": _parse_timestamp(row["created_at"]),
        "updated_at": _parse_timestamp(row["updated_at"]),
        "completed_at": _parse_timestamp(row.get("completed_at")),
    }


def _fields_to_scanned_cards_payload(
    row: dict, result: BusinessCardFields
) -> dict[str, Any]:
    return {
        "scan_job_id": row["id"],
        "user_id": row["owner_id"],
        "name": result.Name,
        "company": result.Company,
        "title": result.Title,
        "phone": result.Phone,
        "email": result.Email,
        "website": result.Website,
        "address": result.Address,
        "business_category": result.BusinessCategory,
        "others": result.Others,
    }


def _postgrest_url(table: str, *, on_conflict: str) -> str:
    settings = get_settings()
    base = settings.supabase_url.strip().rstrip("/")
    return f"{base}/rest/v1/{table}?on_conflict={on_conflict}"


def upsert_scan_job(row: dict | None) -> None:
    """Mirror a job row to public.scan_jobs (queued through failed)."""
    if _skip_job_row(row):
        return

    url = _postgrest_url("scan_jobs", on_conflict="id")
    payload = _job_row_to_scan_jobs_payload(row)

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=payload, headers=_supabase_headers())
            if not response.is_success:
                logger.warning(
                    "supabase_scan_jobs_upsert_failed status=%s body=%s job_id=%s",
                    response.status_code,
                    response.text[:300],
                    row.get("id"),
                )
    except Exception as exc:
        logger.warning(
            "supabase_scan_jobs_upsert_error job_id=%s error=%s",
            row.get("id"),
            exc,
        )


def insert_scanned_card(row: dict | None, result: BusinessCardFields) -> None:
    """Insert extracted fields into public.scanned_cards (successful scans only)."""
    if _skip_job_row(row):
        return

    url = _postgrest_url("scanned_cards", on_conflict="scan_job_id")
    payload = _fields_to_scanned_cards_payload(row, result)

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=payload, headers=_supabase_headers())
            if not response.is_success:
                logger.warning(
                    "supabase_scanned_cards_upsert_failed status=%s body=%s job_id=%s",
                    response.status_code,
                    response.text[:300],
                    row.get("id"),
                )
    except Exception as exc:
        logger.warning(
            "supabase_scanned_cards_upsert_error job_id=%s error=%s",
            row.get("id"),
            exc,
        )
