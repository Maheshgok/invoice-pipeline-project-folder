#!/usr/bin/env bash

# Validation script for Safe Fail Handler implementation
# Run this to verify all components are in place

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED_DIR="$PROJECT_DIR/shared"
SERVICES_DIR="$PROJECT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Safe Fail Handler - Implementation Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $description"
        ((passed++))
    else
        echo -e "${RED}❌${NC} $description (not found: $file)"
        ((failed++))
    fi
}

# Function to check file contains string
check_content() {
    local file=$1
    local string=$2
    local description=$3
    if grep -q "$string" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $description"
        ((passed++))
    else
        echo -e "${RED}❌${NC} $description"
        ((failed++))
    fi
}

echo "📋 Checking core files..."
check_file "$SHARED_DIR/safe_fail_handler.py" "Safe fail handler module"
check_file "$SHARED_DIR/job_schema_migration.py" "Job schema migration script"
check_file "$SHARED_DIR/SAFE_FAIL_QUICK_REFERENCE.py" "Quick reference guide"
echo ""

echo "📋 Checking documentation..."
check_file "$PROJECT_DIR/.github/SAFE_FAIL_MECHANISM.md" "Safe fail mechanism documentation"
check_file "$PROJECT_DIR/.github/IMPLEMENTATION_SUMMARY.md" "Implementation summary"
check_file "$PROJECT_DIR/.github/AI_AGENT_GUIDE.md" "AI agent guide"
check_file "$PROJECT_DIR/.github/copilot-instructions.md" "Copilot instructions"
echo ""

echo "📋 Checking service integrations..."
check_content "$PROJECT_DIR/data-extractor-v2/main.py" "SafeFailHandler" "Data extractor imports safe fail handler"
check_content "$PROJECT_DIR/data-extractor-v2/main.py" "ErrorType.ZERO_ITEMS" "Data extractor checks for zero items"
check_content "$PROJECT_DIR/enrichment-worker/main.py" "SafeFailHandler" "Enrichment worker imports safe fail handler"
check_content "$PROJECT_DIR/enrichment-worker/main.py" "ErrorType.EXTRACTION_EMPTY" "Enrichment worker checks for empty extraction"
check_content "$PROJECT_DIR/orchestrator-service/main.py" "/jobs.*retry" "Orchestrator has retry endpoint"
check_content "$PROJECT_DIR/orchestrator-service/main.py" "/process-retries" "Orchestrator has process-retries endpoint"
echo ""

echo "📋 Checking scheduler setup..."
check_file "$PROJECT_DIR/orchestrator-service/setup-scheduler.sh" "Cloud Scheduler setup script"
check_content "$PROJECT_DIR/orchestrator-service/setup-scheduler.sh" "cloudscheduler" "Scheduler script enables Cloud Scheduler API"
echo ""

echo "📋 Checking error handling patterns..."
check_content "$PROJECT_DIR/data-extractor-v2/main.py" "RETRYING" "Data extractor uses RETRYING status"
check_content "$PROJECT_DIR/data-extractor-v2/main.py" "should_retry" "Data extractor checks should_retry"
check_content "$PROJECT_DIR/enrichment-worker/main.py" "RETRYING" "Enrichment worker uses RETRYING status"
check_content "$PROJECT_DIR/orchestrator-service/main.py" "RETRYING" "Orchestrator tracks RETRYING status"
echo ""

echo "📋 Checking critical rules documentation..."
check_content "$PROJECT_DIR/.github/AI_AGENT_GUIDE.md" "ALWAYS Handle Job Failures at FULL INVOICE Level" "Full invoice level rule documented"
check_content "$PROJECT_DIR/.github/copilot-instructions.md" "SAFE_FAIL_MECHANISM" "Safe fail mechanism referenced in instructions"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Validation Results:"
echo "  ${GREEN}Passed: $passed${NC}"
echo "  ${RED}Failed: $failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Safe fail handler is properly implemented.${NC}"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Deploy updated services:"
    echo "     gcloud run deploy data-extractor-v2 --source=data-extractor-v2 ..."
    echo "     gcloud run deploy enrichment-worker --source=enrichment-worker ..."
    echo "     gcloud run deploy orchestrator-service --source=orchestrator-service ..."
    echo ""
    echo "  2. Setup Cloud Scheduler:"
    echo "     bash orchestrator-service/setup-scheduler.sh"
    echo ""
    echo "  3. Test with a new invoice upload:"
    echo "     Should see RETRYING status if extraction yields 0 items"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the implementation.${NC}"
    exit 1
fi
