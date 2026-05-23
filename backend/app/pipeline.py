from backend.app import jobs
from backend.app.paddle_ocr import extract_text
from backend.app.storage import read_image
from backend.app.vision_client import extract_fields


def run_process_pipeline(job_id: str) -> None:
    row = jobs.get_job(job_id)
    if not row:
        raise ValueError(f"Job not found: {job_id}")

    if row["status"] == "completed":
        return

    jobs.set_status(job_id, "processing")

    try:
        image_bytes = read_image(row["image_gcs_uri"])
        raw_ocr_text = extract_text(image_bytes)
        result = extract_fields(image_bytes, raw_ocr_text)
        jobs.complete_job(job_id, raw_ocr_text, result)
    except Exception as exc:
        jobs.fail_job(job_id, str(exc))
        raise
