import httpx
import pytest

from backend.app.vision_warmup import _model_is_present, ensure_vision_model_loaded


def test_model_is_present_exact_and_family():
    assert _model_is_present({"llama3.2-vision:11b"}, "llama3.2-vision:11b")
    assert _model_is_present({"llama3.2-vision:latest"}, "llama3.2-vision:11b")
    assert not _model_is_present(set(), "llama3.2-vision:11b")


def test_ensure_skips_pull_when_model_present():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(
                200,
                json={"models": [{"name": "llama3.2-vision:11b"}]},
            )
        raise AssertionError(f"unexpected request {request.url}")

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        pull_ms = ensure_vision_model_loaded(
            client, "https://vision.example", {}, "llama3.2-vision:11b"
        )
    assert pull_ms == 0


def test_ensure_pulls_when_model_missing():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/api/tags":
            if calls.count("/api/tags") == 1:
                return httpx.Response(200, json={"models": []})
            return httpx.Response(
                200,
                json={"models": [{"name": "llama3.2-vision:11b"}]},
            )
        if request.url.path == "/api/pull":
            return httpx.Response(200, json={"status": "success"})
        raise AssertionError(f"unexpected request {request.url}")

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        pull_ms = ensure_vision_model_loaded(
            client, "https://vision.example", {}, "llama3.2-vision:11b"
        )
    assert pull_ms >= 0
    assert "/api/pull" in calls
