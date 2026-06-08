FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt is pip-compile output from requirements.in (see docs/DEPENDENCIES.md).
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY data /app/data

ENV PYTHONPATH=/app
ENV SQLITE_PATH=/app/data/jobs.sqlite
ENV UPLOAD_DIR=/app/data/uploads
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
ENV FLAGS_use_mkldnn=0

EXPOSE 8080

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
