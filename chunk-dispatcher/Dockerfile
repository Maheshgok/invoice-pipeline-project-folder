# Chunk Dispatcher Service Dockerfile
FROM python:3.11-slim

WORKDIR /workspace

# Copy requirements first for caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared utilities
COPY shared/ ./shared/

# Copy main application
COPY main.py .

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Run the service with gunicorn
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 300 main:app
