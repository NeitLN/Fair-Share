FROM python:3.14-slim

WORKDIR /app

# Dependencies change less often
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source code changes more often
COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
