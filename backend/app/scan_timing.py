"""Scan latency measurement: cold vs warm overall times (Cloud Run logs)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

VISION_LOAD_COLD_THRESHOLD_MS = 1_000

_ocr_warmed = False
_vision_warmed = False
_last_cold_overall_ms: int | None = None
_last_warm_overall_ms: int | None = None


@dataclass(frozen=True)
class OcrTimings:
    init_ms: int
    infer_ms: int
    cold_start: bool


@dataclass(frozen=True)
class VisionTimings:
    pull_ms: int
    request_ms: int
    load_ms: int | None
    cold_start: bool


@dataclass(frozen=True)
class ScanTimingReport:
    job_id: str
    scan_kind: str
    end_to_end_ms: int
    queue_wait_ms: int
    read_image_ms: int
    ocr_init_ms: int
    ocr_infer_ms: int
    ocr_cold: bool
    vision_pull_ms: int
    vision_request_ms: int
    vision_load_ms: int | None
    vision_cold: bool
    pipeline_ms: int
    upload_ms: int | None
    enqueue_ms: int | None
    benchmark_cold_overall_ms: int | None
    benchmark_warm_overall_ms: int | None


def reset_warm_state() -> None:
    """Reset instance warm flags (tests)."""
    global _ocr_warmed, _vision_warmed, _last_cold_overall_ms, _last_warm_overall_ms
    _ocr_warmed = False
    _vision_warmed = False
    _last_cold_overall_ms = None
    _last_warm_overall_ms = None


def mark_ocr_warmed() -> bool:
    """Return True if OCR was already warm on this instance."""
    global _ocr_warmed
    was_warm = _ocr_warmed
    _ocr_warmed = True
    return was_warm


def mark_vision_warmed() -> bool:
    """Return True if vision was already warm on this instance."""
    global _vision_warmed
    was_warm = _vision_warmed
    _vision_warmed = True
    return was_warm


def iso_to_ms(iso: str) -> int:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def print_scan_accept_timing(
    job_id: str,
    upload_ms: int,
    enqueue_ms: int,
) -> None:
    print(
        "scan_accept_timing "
        + json.dumps(
            {
                "job_id": job_id,
                "upload_ms": upload_ms,
                "enqueue_ms": enqueue_ms,
                "accept_total_ms": upload_ms + enqueue_ms,
            }
        )
    )


def print_scan_timing(report: ScanTimingReport) -> None:
    global _last_cold_overall_ms, _last_warm_overall_ms

    if report.scan_kind == "cold":
        _last_cold_overall_ms = report.end_to_end_ms
    else:
        _last_warm_overall_ms = report.end_to_end_ms

    payload = asdict(report)
    payload["benchmark_cold_overall_ms"] = _last_cold_overall_ms
    payload["benchmark_warm_overall_ms"] = _last_warm_overall_ms
    print(f"scan_timing {json.dumps(payload)}")
