import time

from backend.app import jobs
from backend.app.paddle_ocr import extract_text
from backend.app.scan_timing import ScanTimingReport, iso_to_ms, print_scan_timing
from backend.app.storage import read_image
from backend.app.vision_client import extract_fields


def run_process_pipeline(job_id: str) -> None:
    row = jobs.get_job(job_id)
    if not row:
        raise ValueError(f"Job not found: {job_id}")

    if row["status"] in ("completed", "failed"):
        return

    jobs.set_status(job_id, "processing")
    pipeline_started = time.perf_counter()
    process_started_ms = int(time.time() * 1000)

    try:
        created_ms = iso_to_ms(row["created_at"])
        read_started = time.perf_counter()
        image_bytes = read_image(row["image_gcs_uri"])
        read_image_ms = int((time.perf_counter() - read_started) * 1000)

        raw_ocr_text, ocr_timings = extract_text(image_bytes)
        result, vision_timings = extract_fields(image_bytes, raw_ocr_text)
        jobs.complete_job(job_id, raw_ocr_text, result)

        pipeline_ms = int((time.perf_counter() - pipeline_started) * 1000)
        completed_row = jobs.get_job(job_id)
        completed_ms = (
            iso_to_ms(completed_row["completed_at"])
            if completed_row and completed_row.get("completed_at")
            else int(time.time() * 1000)
        )
        end_to_end_ms = max(0, completed_ms - created_ms)
        queue_wait_ms = max(0, process_started_ms - created_ms)

        ocr_cold = ocr_timings.cold_start
        vision_cold = vision_timings.cold_start
        scan_kind = "cold" if (ocr_cold or vision_cold) else "warm"

        print_scan_timing(
            ScanTimingReport(
                job_id=job_id,
                scan_kind=scan_kind,
                end_to_end_ms=end_to_end_ms,
                queue_wait_ms=queue_wait_ms,
                read_image_ms=read_image_ms,
                ocr_init_ms=ocr_timings.init_ms,
                ocr_infer_ms=ocr_timings.infer_ms,
                ocr_cold=ocr_cold,
                vision_pull_ms=vision_timings.pull_ms,
                vision_request_ms=vision_timings.request_ms,
                vision_load_ms=vision_timings.load_ms,
                vision_cold=vision_cold,
                pipeline_ms=pipeline_ms,
                upload_ms=None,
                enqueue_ms=None,
                benchmark_cold_overall_ms=None,
                benchmark_warm_overall_ms=None,
            )
        )
    except Exception as exc:
        jobs.fail_job(job_id, str(exc))
        raise
