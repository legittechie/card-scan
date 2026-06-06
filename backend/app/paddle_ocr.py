import os
import time

# Avoid OneDNN/PIR issues on generic Cloud Run CPUs
os.environ.setdefault("FLAGS_use_mkldnn", "0")

from backend.app.config import get_settings
from backend.app.scan_timing import OcrTimings, mark_ocr_warmed

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


def extract_text(image_bytes: bytes) -> tuple[str, OcrTimings]:
    settings = get_settings()
    if settings.skip_paddleocr:
        return "", OcrTimings(init_ms=0, infer_ms=0, cold_start=False)

    import tempfile
    from pathlib import Path

    ocr_was_warm = mark_ocr_warmed()
    ocr_cold = not ocr_was_warm

    init_ms = 0
    if ocr_cold:
        init_started = time.perf_counter()
        _get_ocr()
        init_ms = int((time.perf_counter() - init_started) * 1000)

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        infer_started = time.perf_counter()
        ocr = _get_ocr()
        result = ocr.ocr(tmp_path, cls=True)
        infer_ms = int((time.perf_counter() - infer_started) * 1000)
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

    timings = OcrTimings(init_ms=init_ms, infer_ms=infer_ms, cold_start=ocr_cold)
    return "\n".join(lines), timings
