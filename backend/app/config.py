from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_ADMIN_SECRET = "dev-admin-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App auth (/scan, /status)
    auth_mode: Literal["disabled", "required"] = "disabled"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    scan_api_key: str = ""

    # API
    api_base_url: str = "http://localhost:8080"
    sqlite_path: str = "data/jobs.sqlite"
    upload_dir: str = "data/uploads"
    gcs_bucket: str = ""
    use_gcs: bool = False

    # Processing
    sync_process: bool = False
    vision_url: str = "http://localhost:11434"
    vision_model: str = "llama3.2-vision:11b"
    paddleocr_lang: str = "en"
    skip_paddleocr: bool = False
    skip_vision: bool = False

    # Cloud Tasks (production)
    gcp_project: str = ""
    tasks_location: str = "us-central1"
    tasks_queue: str = "card-scan-queue"
    tasks_service_account: str = ""
    tasks_processor_secret: str = ""

    # Admin
    admin_purge_secret: str = DEV_ADMIN_SECRET

    # Retention defaults for purge endpoint
    purge_completed_days: int = 30
    purge_failed_days: int = 7


@lru_cache
def get_settings() -> Settings:
    return Settings()
