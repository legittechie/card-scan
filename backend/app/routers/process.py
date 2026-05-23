from fastapi import APIRouter, Header, HTTPException, Request

from backend.app.config import get_settings
from backend.app.pipeline import run_process_pipeline
from backend.app.schemas import ProcessRequest

router = APIRouter(tags=["process"])


def _verify_processor(request: Request, x_tasks_secret: str | None) -> None:
    settings = get_settings()
    if not settings.tasks_processor_secret:
        if settings.auth_mode != "disabled":
            raise HTTPException(
                status_code=503,
                detail="Processor secret not configured",
            )
        return
    if x_tasks_secret != settings.tasks_processor_secret:
        raise HTTPException(status_code=403, detail="Invalid processor secret")


@router.post("/process")
async def process_job(
    body: ProcessRequest,
    request: Request,
    x_tasks_secret: str | None = Header(default=None, alias="X-Tasks-Secret"),
):
    _verify_processor(request, x_tasks_secret)

    try:
        run_process_pipeline(body.job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True, "job_id": body.job_id}
