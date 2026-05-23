import sqlite3
from contextlib import contextmanager
from pathlib import Path

from backend.app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    image_gcs_uri TEXT NOT NULL,
    owner_id TEXT,
    raw_ocr_text TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id);
"""


def _migrate_schema(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
    if "owner_id" not in columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN owner_id TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id)"
        )


def _db_path() -> Path:
    path = Path(get_settings().sqlite_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def get_connection():
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        _migrate_schema(conn)
