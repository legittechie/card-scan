import json
import uuid
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.db import get_connection
from backend.app.job_gcs import gcs_jobs_enabled, read_job as gcs_read_job, write_job as gcs_write_job
from backend.app.schemas import BusinessCardFields, JobStatus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sqlite_get(job_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def _sqlite_upsert(row: dict) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, status, image_gcs_uri, owner_id, raw_ocr_text,
                result_json, error, created_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                image_gcs_uri = excluded.image_gcs_uri,
                owner_id = excluded.owner_id,
                raw_ocr_text = excluded.raw_ocr_text,
                result_json = excluded.result_json,
                error = excluded.error,
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at
            """,
            (
                row["id"],
                row["status"],
                row["image_gcs_uri"],
                row.get("owner_id"),
                row.get("raw_ocr_text"),
                row.get("result_json"),
                row.get("error"),
                row["created_at"],
                row["updated_at"],
                row.get("completed_at"),
            ),
        )


def _persist(row: dict) -> None:
    _sqlite_upsert(row)
    if gcs_jobs_enabled():
        gcs_write_job(row)


def create_job(image_uri: str, owner_id: str | None = None) -> str:
    job_id = str(uuid.uuid4())
    now = _now()
    row = {
        "id": job_id,
        "status": "queued",
        "image_gcs_uri": image_uri,
        "owner_id": owner_id,
        "raw_ocr_text": None,
        "result_json": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }
    _persist(row)
    return job_id


def get_job(job_id: str) -> dict | None:
    if gcs_jobs_enabled():
        row = gcs_read_job(job_id)
        if row is not None:
            return row
    return _sqlite_get(job_id)


def set_status(job_id: str, status: JobStatus) -> None:
    row = get_job(job_id)
    if not row:
        return
    row["status"] = status
    row["updated_at"] = _now()
    _persist(row)


def complete_job(
    job_id: str,
    raw_ocr_text: str,
    result: BusinessCardFields,
) -> None:
    row = get_job(job_id)
    if not row:
        return
    now = _now()
    row.update(
        {
            "status": "completed",
            "raw_ocr_text": raw_ocr_text,
            "result_json": result.model_dump_json(),
            "error": None,
            "updated_at": now,
            "completed_at": now,
        }
    )
    _persist(row)


def fail_job(job_id: str, error: str) -> None:
    row = get_job(job_id)
    if not row:
        return
    now = _now()
    row.update(
        {
            "status": "failed",
            "error": error,
            "updated_at": now,
            "completed_at": now,
        }
    )
    _persist(row)


def parse_result(row: dict) -> BusinessCardFields | None:
    if not row.get("result_json"):
        return None
    return BusinessCardFields.model_validate_json(row["result_json"])


def purge_old_jobs(completed_days: int, failed_days: int) -> tuple[int, int]:
    with get_connection() as conn:
        cur1 = conn.execute(
            """
            DELETE FROM jobs
            WHERE status = 'completed'
              AND completed_at < datetime('now', ?)
            """,
            (f"-{completed_days} days",),
        )
        cur2 = conn.execute(
            """
            DELETE FROM jobs
            WHERE status = 'failed'
              AND created_at < datetime('now', ?)
            """,
            (f"-{failed_days} days",),
        )
    return cur1.rowcount, cur2.rowcount
