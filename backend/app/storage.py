import uuid
from pathlib import Path

from backend.app.config import get_settings


def save_upload(content: bytes, filename: str) -> str:
    """Save image locally or to GCS; return URI (file:// or gs://)."""
    settings = get_settings()
    ext = Path(filename).suffix or ".jpg"
    object_name = f"{uuid.uuid4()}{ext}"

    if settings.use_gcs and settings.gcs_bucket:
        return _upload_gcs(content, object_name)

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    path = upload_dir / object_name
    path.write_bytes(content)
    return f"file://{path.resolve()}"


def read_image(uri: str) -> bytes:
    if uri.startswith("gs://"):
        return _download_gcs(uri)
    if uri.startswith("file://"):
        return Path(uri.removeprefix("file://")).read_bytes()
    return Path(uri).read_bytes()


def _upload_gcs(content: bytes, object_name: str) -> str:
    from google.cloud import storage

    settings = get_settings()
    client = storage.Client(project=settings.gcp_project or None)
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(object_name)
    blob.upload_from_string(content)
    return f"gs://{settings.gcs_bucket}/{object_name}"


def _download_gcs(uri: str) -> bytes:
    from google.cloud import storage

    settings = get_settings()
    path = uri.removeprefix("gs://")
    bucket_name, _, object_name = path.partition("/")
    client = storage.Client(project=settings.gcp_project or None)
    blob = client.bucket(bucket_name).blob(object_name)
    return blob.download_as_bytes()
