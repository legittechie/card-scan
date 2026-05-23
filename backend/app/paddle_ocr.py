import os

# Avoid OneDNN/PIR issues on generic Cloud Run CPUs
os.environ.setdefault("FLAGS_use_mkldnn", "0")

from backend.app.config import get_settings

_ocr_instance = None


def _get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR

        settings = get_settings()
        _ocr_instance = PaddleOCR(
            use_angle_cls=True,
            lang=settings.paddleocr_lang,
            show_log=False,
            use_gpu=False,
        )
    return _ocr_instance


def extract_text(image_bytes: bytes) -> str:
    settings = get_settings()
    if settings.skip_paddleocr:
        return ""

    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        ocr = _get_ocr()
        result = ocr.ocr(tmp_path, cls=True)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    lines: list[str] = []
    if result:
        for page in result:
            if not page:
                continue
            for line in page:
                if line and len(line) >= 2:
                    text = line[1][0]
                    if text:
                        lines.append(str(text).strip())

    return "\n".join(lines)
