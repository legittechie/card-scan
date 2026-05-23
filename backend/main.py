from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.db import init_db
from backend.app.routers import admin, process, scan


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Card Scan API",
    description="Async business card scanner (PaddleOCR + Llama 3.2 Vision 11B)",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(scan.router)
app.include_router(process.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
