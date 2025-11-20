# Use the official Python image as a base
FROM python:3.11-slim-buster

# Set the working directory
WORKDIR /app

# Copy only requirements first (better caching)
COPY requirements.txt .

# Install dependencies without cache
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the rest of the app
COPY . .

# Cloud Run expects app to listen on $PORT
ENV PORT=8080

# Use Gunicorn to serve the app
# main:app → means "from main.py, load object app"
CMD ["gunicorn", "--bind", "0.0.0.0:${PORT}", "main:app"]
