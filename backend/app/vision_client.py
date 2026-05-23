import base64
import json
import re
import time

import httpx

from backend.app.config import get_settings
from backend.app.schemas import BusinessCardFields

VISION_PROMPT = """You are an expert at reading business cards.

OCR text extracted from the image (may be incomplete):
{ocr_text}

Extract contact information from the business card image and OCR text.
Return ONLY a single JSON object with these keys (use null if not found):
- Name
- Company
- Title
- Phone
- Email
- Website
- Address
- BusinessCategory (use "Unknown" if not inferable)
- Others: any other visible text (fax, LinkedIn, department, QR hints, etc.)
  Put multiple extras on separate lines in one string.

Rules:
- Output ONLY valid JSON, no markdown or commentary.
- Put everything that does not fit the named fields into Others.
"""


def _vision_request_headers() -> dict[str, str]:
    """Attach OIDC token when calling authenticated Cloud Run (card-scan-vision)."""
    settings = get_settings()
    base = settings.vision_url.rstrip("/")
    if base.startswith("http://localhost") or base.startswith("http://127.0.0.1"):
        return {}
    try:
        import google.auth.transport.requests
        import google.oauth2.id_token

        request = google.auth.transport.requests.Request()
        token = google.oauth2.id_token.fetch_id_token(request, base)
        return {"Authorization": f"Bearer {token}"}
    except Exception as exc:
        print(f"vision_auth_warning={exc}")
        return {}


def extract_fields(image_bytes: bytes, ocr_text: str) -> BusinessCardFields:
    settings = get_settings()
    if settings.skip_vision:
        return _mock_from_ocr(ocr_text)

    prompt = VISION_PROMPT.format(ocr_text=ocr_text or "(none)")
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "model": settings.vision_model,
        "format": "json",
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [b64_image],
            }
        ],
    }

    started = time.perf_counter()
    headers = _vision_request_headers()
    with httpx.Client(timeout=300.0) as client:
        response = client.post(
            f"{settings.vision_url.rstrip('/')}/api/chat",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    print(f"vision_request_duration_ms={elapsed_ms}")

    content = data.get("message", {}).get("content", "")
    parsed = _parse_json_content(content)
    return BusinessCardFields.model_validate(parsed)


def _parse_json_content(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


def _mock_from_ocr(ocr_text: str) -> BusinessCardFields:
    """Fallback when vision is skipped (tests / offline)."""
    fields = BusinessCardFields(BusinessCategory="Unknown", Others=ocr_text or None)
    for line in (ocr_text or "").splitlines():
        lower = line.lower()
        if "@" in line and not fields.Email:
            fields.Email = line.strip()
        elif any(c.isdigit() for c in line) and not fields.Phone:
            fields.Phone = line.strip()
        elif not fields.Name:
            fields.Name = line.strip()
    return fields
