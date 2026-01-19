# PDF Extractor - Native PDF Processing Service
# Lighter than data-extractor-v2 (no poppler/image conversion needed for text PDFs)

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (PyMuPDF needs some base libraries)
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Cloud Run expects PORT environment variable
ENV PORT=8080

# Run the application
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 600 main:app
