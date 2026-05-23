from fastapi import APIRouter, Header, HTTPException, Query

from backend.app.config import DEV_ADMIN_SECRET, get_settings
from backend.app.jobs import purge_old_jobs
from backend.app.schemas import PurgeResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/purge-jobs", response_model=PurgeResponse)
def purge_jobs(
    days: int | None = Query(default=None, description="Completed job retention days"),
    failed_days: int | None = Query(default=None),
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
    settings = get_settings()
    if settings.auth_mode == "required" and settings.admin_purge_secret == DEV_ADMIN_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Admin secret not configured for production",
        )
    if x_admin_secret != settings.admin_purge_secret:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    completed_days = days if days is not None else settings.purge_completed_days
    failed_retention = (
        failed_days if failed_days is not None else settings.purge_failed_days
    )
    deleted_completed, deleted_failed = purge_old_jobs(
        completed_days, failed_retention
    )
    return PurgeResponse(
        deleted_completed=deleted_completed,
        deleted_failed=deleted_failed,
    )
