import json

import pytest

from backend.app.scan_timing import (
    ScanTimingReport,
    print_scan_timing,
    reset_warm_state,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_warm_state()
    yield
    reset_warm_state()


def test_print_scan_timing_tracks_cold_and_warm_benchmarks(capsys):
    cold = ScanTimingReport(
        job_id="job-cold",
        scan_kind="cold",
        end_to_end_ms=90_000,
        queue_wait_ms=5_000,
        read_image_ms=120,
        ocr_init_ms=45_000,
        ocr_infer_ms=2_000,
        ocr_cold=True,
        vision_pull_ms=120_000,
        vision_request_ms=30_000,
        vision_load_ms=8_000,
        vision_cold=True,
        pipeline_ms=77_000,
        upload_ms=None,
        enqueue_ms=None,
        benchmark_cold_overall_ms=None,
        benchmark_warm_overall_ms=None,
    )
    warm = ScanTimingReport(
        job_id="job-warm",
        scan_kind="warm",
        end_to_end_ms=9_500,
        queue_wait_ms=500,
        read_image_ms=80,
        ocr_init_ms=0,
        ocr_infer_ms=1_800,
        ocr_cold=False,
        vision_pull_ms=0,
        vision_request_ms=6_500,
        vision_load_ms=50,
        vision_cold=False,
        pipeline_ms=8_400,
        upload_ms=None,
        enqueue_ms=None,
        benchmark_cold_overall_ms=None,
        benchmark_warm_overall_ms=None,
    )

    print_scan_timing(cold)
    print_scan_timing(warm)

    lines = [line for line in capsys.readouterr().out.splitlines() if line.startswith("scan_timing ")]
    assert len(lines) == 2

    cold_payload = json.loads(lines[0].removeprefix("scan_timing "))
    warm_payload = json.loads(lines[1].removeprefix("scan_timing "))

    assert cold_payload["scan_kind"] == "cold"
    assert cold_payload["end_to_end_ms"] == 90_000
    assert cold_payload["benchmark_cold_overall_ms"] == 90_000
    assert cold_payload["benchmark_warm_overall_ms"] is None

    assert warm_payload["scan_kind"] == "warm"
    assert warm_payload["end_to_end_ms"] == 9_500
    assert warm_payload["benchmark_cold_overall_ms"] == 90_000
    assert warm_payload["benchmark_warm_overall_ms"] == 9_500
