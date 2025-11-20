import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"
backlog = 2048

# Worker processes
workers = 1  # Single worker for Cloud Run
worker_class = 'sync'
worker_connections = 1000
timeout = 0  # No timeout
keepalive = 2

# Logging
accesslog = '-'
errorlog = '-'
loglevel = os.getenv('LOG_LEVEL', 'info').lower()

# Process naming
proc_name = 'invoice-processor'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL
keyfile = None
certfile = None

# Debugging
reload = False
reload_engine = 'auto'
spew = False

# Server hooks
def when_ready(server):
    server.log.info("Server is ready. Spawning workers")