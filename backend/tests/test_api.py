import io

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import API_KEY_OWNER_ID, ScanCaller, require_scan_caller
from backend.app.config import get_settings
from backend.app.db import init_db
from backend.app import jobs
from backend.main import app

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def _settings(monkeypatch, tmp_path):
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "test.sqlite"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("SYNC_PROCESS", "true")
    monkeypatch.setenv("SKIP_PADDLEOCR", "true")
    monkeypatch.setenv("SKIP_VISION", "true")
    monkeypatch.setenv("AUTH_MODE", "disabled")
    monkeypatch.setenv("ADMIN_PURGE_SECRET", "dev-admin-secret")
    get_settings.cache_clear()
    init_db()
    yield
    get_settings.cache_clear()
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _png_files():
    return {"file": ("card.png", io.BytesIO(PNG_BYTES), "image/png")}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_scan_and_status(client):
    scan = client.post("/scan", files=_png_files())
    assert scan.status_code == 200
    job_id = scan.json()["job_id"]

    status = client.get(f"/status/{job_id}")
    assert status.status_code == 200
    body = status.json()
    assert body["status"] in ("completed", "failed")
    if body["status"] == "completed":
        assert body["result"] is not None


def test_purge_jobs(client):
    resp = client.post(
        "/admin/purge-jobs",
        headers={"X-Admin-Secret": "dev-admin-secret"},
    )
    assert resp.status_code == 200
    assert "deleted_completed" in resp.json()


@pytest.fixture
def auth_required_client(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTH_MODE", "required")
    monkeypatch.setenv("SCAN_API_KEY", "test-scan-key")
    monkeypatch.setenv("TASKS_PROCESSOR_SECRET", "")
    get_settings.cache_clear()
    init_db()
    yield TestClient(app)
    get_settings.cache_clear()
    app.dependency_overrides.clear()


def test_scan_requires_auth_when_enabled(auth_required_client):
    resp = auth_required_client.post("/scan", files=_png_files())
    assert resp.status_code == 401


def test_scan_with_api_key(auth_required_client):
    headers = {"X-API-Key": "test-scan-key"}
    scan = auth_required_client.post("/scan", files=_png_files(), headers=headers)
    assert scan.status_code == 200
    job_id = scan.json()["job_id"]

    status = auth_required_client.get(f"/status/{job_id}", headers=headers)
    assert status.status_code == 200


def test_status_wrong_owner_forbidden(auth_required_client):
    job_id = jobs.create_job("file:///tmp/card.jpg", owner_id="user-a")
    headers = {"X-API-Key": "test-scan-key"}
    resp = auth_required_client.get(f"/status/{job_id}", headers=headers)
    assert resp.status_code == 403


def test_status_jwt_owner_allowed(auth_required_client, monkeypatch):
    job_id = jobs.create_job("file:///tmp/card.jpg", owner_id="user-jwt-1")

    async def fake_caller():
        return ScanCaller(user_id="user-jwt-1", auth_method="jwt")

    app.dependency_overrides[require_scan_caller] = fake_caller
    resp = auth_required_client.get(f"/status/{job_id}")
    assert resp.status_code == 200


def test_process_fails_closed_without_secret(auth_required_client):
    resp = auth_required_client.post("/process", json={"job_id": "any"})
    assert resp.status_code == 503


def test_api_key_job_not_readable_by_jwt_user(auth_required_client):
    job_id = jobs.create_job("file:///tmp/card.jpg", owner_id=API_KEY_OWNER_ID)

    async def fake_caller():
        return ScanCaller(user_id="other-user", auth_method="jwt")

    app.dependency_overrides[require_scan_caller] = fake_caller
    resp = auth_required_client.get(f"/status/{job_id}")
    assert resp.status_code == 403
