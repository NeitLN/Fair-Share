FROM python:3.14-slim

WORKDIR /app

# Dependencies change less often
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source code changes more often
COPY . .

# Render sets PORT at run time; 8000 is the local default
ENV PORT=8000
EXPOSE 8000

# exec: uvicorn (not the shell) receives the stop signal
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]