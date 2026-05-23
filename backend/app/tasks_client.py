import base64
import json

from backend.app.config import get_settings


def enqueue_process_job(job_id: str) -> None:
    settings = get_settings()

    if settings.sync_process:
        from backend.app.pipeline import run_process_pipeline

        run_process_pipeline(job_id)
        return

    if not settings.gcp_project:
        raise RuntimeError(
            "Cloud Tasks requires GCP_PROJECT. Set SYNC_PROCESS=true for local dev."
        )

    from google.cloud import tasks_v2

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(
        settings.gcp_project,
        settings.tasks_location,
        settings.tasks_queue,
    )
    body = base64.b64encode(
        json.dumps({"job_id": job_id}).encode("utf-8")
    ).decode("utf-8")

    http_request: dict = {
        "http_method": tasks_v2.HttpMethod.POST,
        "url": f"{settings.api_base_url.rstrip('/')}/process",
        "headers": {"Content-Type": "application/json"},
        "body": body,
    }

    if settings.tasks_processor_secret:
        http_request["headers"]["X-Tasks-Secret"] = settings.tasks_processor_secret

    if settings.tasks_service_account:
        http_request["oidc_token"] = {
            "service_account_email": settings.tasks_service_account
        }

    task = {"http_request": http_request, "name": f"{parent}/tasks/card-scan-{job_id}"}

    try:
        client.create_task(request={"parent": parent, "task": task})
    except Exception as exc:
        if "ALREADY_EXISTS" not in str(exc) and "409" not in str(exc):
            raise
