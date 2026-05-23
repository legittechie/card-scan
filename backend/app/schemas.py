from typing import Literal

from pydantic import BaseModel, Field


class BusinessCardFields(BaseModel):
    Name: str | None = None
    Company: str | None = None
    Title: str | None = None
    Phone: str | None = None
    Email: str | None = None
    Website: str | None = None
    Address: str | None = None
    BusinessCategory: str | None = None
    Others: str | None = Field(
        default=None,
        description="Any other text on the card (fax, social, dept, notes, etc.)",
    )


JobStatus = Literal["queued", "processing", "completed", "failed"]


class ScanResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    result: BusinessCardFields | None = None
    raw_ocr_text: str | None = None
    error: str | None = None
    progress_hint: str | None = None


class ProcessRequest(BaseModel):
    job_id: str


class PurgeResponse(BaseModel):
    deleted_completed: int
    deleted_failed: int
