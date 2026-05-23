import json
import uuid
from datetime import datetime, timezone

from backend.app.db import get_connection
from backend.app.schemas import BusinessCardFields, JobStatus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(image_uri: str, owner_id: str | None = None) -> str:
    job_id = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO jobs (id, status, image_gcs_uri, owner_id, created_at, updated_at)
            VALUES (?, 'queued', ?, ?, ?, ?)
            """,
            (job_id, image_uri, owner_id, _now(), _now()),
        )
    return job_id


def get_job(job_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def set_status(job_id: str, status: JobStatus) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
            (status, _now(), job_id),
        )


def complete_job(
    job_id: str,
    raw_ocr_text: str,
    result: BusinessCardFields,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = 'completed',
                raw_ocr_text = ?,
                result_json = ?,
                error = NULL,
                updated_at = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                raw_ocr_text,
                result.model_dump_json(),
                _now(),
                _now(),
                job_id,
            ),
        )


def fail_job(job_id: str, error: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = 'failed',
                error = ?,
                updated_at = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (error, _now(), _now(), job_id),
        )


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
