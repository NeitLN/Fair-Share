# Same Python minor version as CI (.github/workflows/ci-cd.yml) and ruff's target
FROM python:3.12-slim

# No .pyc files, logs straight to stdout, no pip cache in the image
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Unprivileged user, created early so this layer is always cached
RUN useradd --create-home --uid 10001 appuser

# Dependencies change less often
COPY requirements.txt .
RUN pip install -r requirements.txt

# Source code changes more often; only what the API needs at run time
COPY app/ app/
COPY db/ db/

# Never run the server as root
USER appuser

# Render sets PORT at run time; 8000 is the local default
ENV PORT=8000
EXPOSE 8000

# exec: uvicorn (not the shell) receives the stop signal
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
