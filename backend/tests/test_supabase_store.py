from unittest.mock import MagicMock, patch

import pytest

from backend.app.config import get_settings
from backend.app.schemas import BusinessCardFields
from backend.app.supabase_store import (
    _fields_to_scanned_cards_payload,
    _job_row_to_scan_jobs_payload,
    insert_scanned_card,
    upsert_scan_job,
)

JOB_ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "owner_id": "22222222-2222-2222-2222-222222222222",
    "status": "completed",
    "image_gcs_uri": "gs://card-scan-uploads/test.jpg",
    "raw_ocr_text": "Jane Doe\nAcme Corp",
    "error": None,
    "created_at": "2026-06-07T12:00:00+00:00",
    "updated_at": "2026-06-07T12:00:05+00:00",
    "completed_at": "2026-06-07T12:00:05+00:00",
}

RESULT = BusinessCardFields(
    Name="Jane Doe",
    Company="Acme Corp",
    Title="CEO",
    Phone="+1 555-0100",
    Email="jane@acme.com",
    Website="https://acme.com",
    Address="123 Main St",
    BusinessCategory="Technology",
    Others="LinkedIn: jane",
)


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_job_row_to_scan_jobs_payload():
    payload = _job_row_to_scan_jobs_payload(JOB_ROW)
    assert payload["id"] == JOB_ROW["id"]
    assert payload["user_id"] == JOB_ROW["owner_id"]
    assert payload["status"] == "completed"
    assert payload["image_gcs_uri"] == JOB_ROW["image_gcs_uri"]
    assert payload["raw_ocr_text"] == JOB_ROW["raw_ocr_text"]
    assert payload["created_at"] == "2026-06-07T12:00:00+00:00"


def test_fields_to_scanned_cards_payload():
    payload = _fields_to_scanned_cards_payload(JOB_ROW, RESULT)
    assert payload["scan_job_id"] == JOB_ROW["id"]
    assert payload["user_id"] == JOB_ROW["owner_id"]
    assert payload["name"] == "Jane Doe"
    assert payload["business_category"] == "Technology"
    assert payload["others"] == "LinkedIn: jane"


def test_upsert_scan_job_skips_without_owner(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    get_settings.cache_clear()

    with patch("backend.app.supabase_store.httpx.Client") as client_cls:
        upsert_scan_job({**JOB_ROW, "owner_id": None})
        client_cls.assert_not_called()


def test_upsert_scan_job_skips_without_service_role(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()

    with patch("backend.app.supabase_store.httpx.Client") as client_cls:
        upsert_scan_job(JOB_ROW)
        client_cls.assert_not_called()


def test_upsert_scan_job_posts_to_postgrest(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    get_settings.cache_clear()

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_response

    with patch("backend.app.supabase_store.httpx.Client", return_value=mock_client):
        upsert_scan_job(JOB_ROW)

    mock_client.post.assert_called_once()
    url, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args[1]
    assert url == "https://example.supabase.co/rest/v1/scan_jobs?on_conflict=id"
    assert kwargs["json"]["user_id"] == JOB_ROW["owner_id"]
    assert kwargs["headers"]["Authorization"] == "Bearer service-key"
    assert "resolution=merge-duplicates" in kwargs["headers"]["Prefer"]


def test_insert_scanned_card_posts_to_postgrest(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    get_settings.cache_clear()

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_response

    with patch("backend.app.supabase_store.httpx.Client", return_value=mock_client):
        insert_scanned_card(JOB_ROW, RESULT)

    mock_client.post.assert_called_once()
    url, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args[1]
    assert url == "https://example.supabase.co/rest/v1/scanned_cards?on_conflict=scan_job_id"
    assert kwargs["json"]["scan_job_id"] == JOB_ROW["id"]
    assert kwargs["json"]["email"] == "jane@acme.com"


def test_completion_flow_order(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    get_settings.cache_clear()

    calls: list[str] = []

    def _post(url, **kwargs):
        calls.append(url)
        response = MagicMock()
        response.is_success = True
        return response

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.side_effect = _post

    with patch("backend.app.supabase_store.httpx.Client", return_value=mock_client):
        upsert_scan_job(JOB_ROW)
        insert_scanned_card(JOB_ROW, RESULT)

    assert len(calls) == 2
    assert "scan_jobs" in calls[0]
    assert "scanned_cards" in calls[1]
