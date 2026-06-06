from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

import time

from backend.app import jobs
from backend.app.auth import ScanCaller, assert_job_owner, require_scan_caller
from backend.app.schemas import JobStatusResponse, ScanResponse
from backend.app.scan_timing import print_scan_accept_timing
from backend.app.storage import save_upload
from backend.app.tasks_client import enqueue_process_job

router = APIRouter(tags=["scan"])


@router.post("/scan", response_model=ScanResponse)
async def scan_card(
    file: UploadFile = File(...),
    caller: ScanCaller = Depends(require_scan_caller),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Expected an image file")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    upload_started = time.perf_counter()
    image_uri = save_upload(content, file.filename or "card.jpg")
    upload_ms = int((time.perf_counter() - upload_started) * 1000)

    owner_id = caller.user_id if caller.user_id != "anonymous" else None
    job_id = jobs.create_job(image_uri, owner_id=owner_id)

    try:
        enqueue_started = time.perf_counter()
        enqueue_process_job(job_id)
        enqueue_ms = int((time.perf_counter() - enqueue_started) * 1000)
        print_scan_accept_timing(job_id, upload_ms, enqueue_ms)
    except Exception as exc:
        jobs.fail_job(job_id, f"Failed to enqueue: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ScanResponse(job_id=job_id)


@router.get("/status/{job_id}", response_model=JobStatusResponse)
def get_status(
    job_id: str,
    caller: ScanCaller = Depends(require_scan_caller),
):
    row = jobs.get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    assert_job_owner(row, caller)

    hint = None
    status = row["status"]
    if status == "queued":
        hint = "Waiting in queue (GPU processes one scan at a time)"
    elif status == "processing":
        hint = "Extracting text and structuring fields"

    return JobStatusResponse(
        job_id=job_id,
        status=status,
        result=jobs.parse_result(row),
        raw_ocr_text=row.get("raw_ocr_text"),
        error=row.get("error"),
        progress_hint=hint,
    )
