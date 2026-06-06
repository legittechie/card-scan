"""Ensure Ollama vision model is present before /api/chat (survives GPU cold starts)."""

from __future__ import annotations

import threading
import time

import httpx

_PULL_LOCK = threading.Lock()
# Per vision base URL on this API instance — avoid duplicate concurrent pulls.
_pulling: set[str] = set()

PULL_TIMEOUT_SEC = 900.0


def _model_names(data: object) -> set[str]:
    if not isinstance(data, dict):
        return set()
    names: set[str] = set()
    for entry in data.get("models") or []:
        if isinstance(entry, dict):
            name = entry.get("name") or entry.get("model")
            if name:
                names.add(str(name))
    return names


def _model_is_present(present: set[str], model: str) -> bool:
    if model in present:
        return True
    base = model.split(":", 1)[0]
    return any(n == model or n.startswith(f"{base}:") for n in present)


def ensure_vision_model_loaded(
    client: httpx.Client,
    vision_base: str,
    headers: dict[str, str],
    model: str,
) -> int:
    """
    Return milliseconds spent pulling (0 if model was already loaded).
    Blocks until the model appears in /api/tags or raises RuntimeError.
    """
    tags_url = f"{vision_base}/api/tags"
    tags_resp = client.get(tags_url, headers=headers, timeout=30.0)
    tags_resp.raise_for_status()
    present = _model_names(tags_resp.json())
    is_present = _model_is_present(present, model)

    if is_present:
        return 0

    pull_key = f"{vision_base}|{model}"
    with _PULL_LOCK:
        if pull_key in _pulling:
            # Another thread is pulling; poll until ready.
            return _wait_for_model(client, vision_base, headers, model, pull_start=time.perf_counter())

        _pulling.add(pull_key)

    pull_started = time.perf_counter()
    try:
        pull_resp = client.post(
            f"{vision_base}/api/pull",
            json={"name": model},
            headers=headers,
            timeout=PULL_TIMEOUT_SEC,
        )
        if not pull_resp.is_success:
            detail = pull_resp.text[:300]
            try:
                detail = pull_resp.json().get("error", detail)
            except Exception:
                pass
            raise RuntimeError(
                f"Vision model pull failed ({pull_resp.status_code}): {detail}"
            )
        pull_ms = int((time.perf_counter() - pull_started) * 1000)
        _wait_for_model(client, vision_base, headers, model, pull_start=pull_started)
        return pull_ms
    finally:
        with _PULL_LOCK:
            _pulling.discard(pull_key)


def _wait_for_model(
    client: httpx.Client,
    vision_base: str,
    headers: dict[str, str],
    model: str,
    pull_start: float,
    deadline_sec: float = PULL_TIMEOUT_SEC,
) -> int:
    deadline = pull_start + deadline_sec
    while time.perf_counter() < deadline:
        tags_resp = client.get(f"{vision_base}/api/tags", headers=headers, timeout=30.0)
        tags_resp.raise_for_status()
        if _model_is_present(_model_names(tags_resp.json()), model):
            return int((time.perf_counter() - pull_start) * 1000)
        time.sleep(3)
    raise RuntimeError(f"Vision model '{model}' not available after {int(deadline_sec)}s")
