import time
import logging
from typing import Any, Optional
from google.cloud import monitoring_v3
from google.cloud.monitoring_v3 import MetricServiceClient
from google.api_core import retry

logger = logging.getLogger(__name__)

class MetricsClient:
    """Centralized metrics collection for the invoice processor."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.client = monitoring_v3.MetricServiceClient()
        self.project_path = f"projects/{project_id}"

    @retry.Retry()
    def write_metric(self, metric_type: str, value: float, labels: Optional[dict] = None):
        """Write a metric to Cloud Monitoring."""
        try:
            series = monitoring_v3.TimeSeries()
            series.metric.type = f"custom.googleapis.com/invoice_processor/{metric_type}"
            
            if labels:
                series.metric.labels.update(labels)
            
            series.resource.type = "cloud_run_revision"
            series.resource.labels["project_id"] = self.project_id
            
            now = time.time()
            seconds = int(now)
            nanos = int((now - seconds) * 10**9)
            
            point = monitoring_v3.Point()
            point.value.double_value = value
            point.interval.end_time.seconds = seconds
            point.interval.end_time.nanos = nanos
            
            series.points = [point]
            
            self.client.create_time_series(
                request={"name": self.project_path, "time_series": [series]}
            )
            
            logger.debug(f"Wrote metric {metric_type}: {value}")
            
        except Exception as e:
            logger.error(f"Failed to write metric {metric_type}: {str(e)}")

class InvoiceProcessorMetrics:
    """Metrics specific to invoice processing."""
    
    def __init__(self, project_id: str):
        self.metrics_client = MetricsClient(project_id)
    
    def record_processing_time(self, duration_ms: float, status: str = "success"):
        """Record the total processing time for an invoice."""
        self.metrics_client.write_metric(
            "invoice_processing_duration",
            duration_ms,
            {"status": status}
        )
    
    def record_openai_request(self, duration_ms: float, status: str, model: str):
        """Record OpenAI API request metrics."""
        self.metrics_client.write_metric(
            "openai_request_duration",
            duration_ms,
            {
                "status": status,
                "model": model
            }
        )
    
    def record_file_size(self, size_bytes: int, file_type: str):
        """Record processed file size metrics."""
        self.metrics_client.write_metric(
            "processed_file_size",
            size_bytes,
            {"file_type": file_type}
        )
    
    def record_error(self, error_type: str):
        """Record processing errors by type."""
        self.metrics_client.write_metric(
            "processing_errors",
            1.0,
            {"error_type": error_type}
        )