#!/bin/bash
set -e

PROJECT_ID="ocrinvoice-466611"
NOTIFICATION_CHANNEL="email" # Update with your notification channel ID

# Function to create alert policies
create_alert_policy() {
    local name=$1
    local filter=$2
    local threshold=$3
    local duration=$4
    local alignment_period=$5

    gcloud alpha monitoring policies create \
        --project="$PROJECT_ID" \
        --display-name="$name" \
        --condition-filter="$filter" \
        --condition-threshold-value="$threshold" \
        --condition-threshold-duration="$duration" \
        --condition-aggregations-alignment-period="$alignment_period" \
        --condition-aggregations-per-series-aligner="ALIGN_RATE" \
        --notification-channels="$NOTIFICATION_CHANNEL" \
        --documentation-content="Alert for $name exceeded threshold"
}

# Create Error Rate Alert
create_alert_policy \
    "Invoice Processor Error Rate High" \
    'metric.type="custom.googleapis.com/invoice_processor/processing_errors" resource.type="cloud_run_revision"' \
    "0.1" \
    "300s" \
    "60s"

# Create Latency Alert
create_alert_policy \
    "Invoice Processing Latency High" \
    'metric.type="custom.googleapis.com/invoice_processor/invoice_processing_duration" resource.type="cloud_run_revision"' \
    "30000" \
    "300s" \
    "60s"

# Create OpenAI API Error Rate Alert
create_alert_policy \
    "OpenAI API Error Rate High" \
    'metric.type="custom.googleapis.com/invoice_processor/openai_request_duration" resource.type="cloud_run_revision" metric.label.status="error"' \
    "0.05" \
    "300s" \
    "60s"

echo "Alert policies created successfully"