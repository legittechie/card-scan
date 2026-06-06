"""Shared job records in GCS (required for multi-instance Cloud Run)."""

from __future__ import annotations

import json

from backend.app.config import get_settings


def _object_name(job_id: str) -> str:
    return f"jobs/{job_id}.json"


def _client_and_bucket():
    from google.cloud import storage

    settings = get_settings()
    client = storage.Client(project=settings.gcp_project or None)
    return client, client.bucket(settings.gcs_bucket)


def gcs_jobs_enabled() -> bool:
    settings = get_settings()
    return bool(settings.use_gcs and settings.gcs_bucket.strip())


def read_job(job_id: str) -> dict | None:
    if not gcs_jobs_enabled():
        return None
    _, bucket = _client_and_bucket()
    blob = bucket.blob(_object_name(job_id))
    if not blob.exists():
        return None
    return json.loads(blob.download_as_text(encoding="utf-8"))


def write_job(row: dict) -> None:
    if not gcs_jobs_enabled():
        return
    _, bucket = _client_and_bucket()
    blob = bucket.blob(_object_name(row["id"]))
    blob.upload_from_string(
        json.dumps(row, ensure_ascii=False),
        content_type="application/json",
    )
