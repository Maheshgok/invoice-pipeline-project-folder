# New 3-Agent Invoice Processing System Deployment

## Architecture Overview

### Philosophy Change
Moving from single multi-phase processor to specialized agent architecture:

1. **Agent 1: Data Analyst**
   - Role: Pure data extraction specialist
   - Input: Invoice image 
   - Output: Structured raw data (header + tabular)
   - Token Budget: 6000 input, 3000 output
   - No accounting knowledge needed

2. **Agent 2: Accountant** 
   - Role: Financial expert for journal entries
   - Input: Extracted JSON data from Agent 1
   - Output: Double-entry journal entries (pure tabular)
   - Token Budget: 4000 input, 3000 output
   - NO header data in output

3. **Agent 3: Data Engineer**
   - Role: Format conversion specialist  
   - Input: Journal entries from Agent 2
   - Output: Required system JSON format
   - Token Budget: 4000 input, 2000 output
   - Technical data transformation only

## Key Benefits

### Multi-Key OpenAI Integration
- **Dedicated API Keys**: Each agent uses its own OpenAI API key
- **Rate Limit Isolation**: Each agent has independent rate limits
- **Cost Tracking**: Usage and costs tracked per agent type
- **Fault Tolerance**: If one key fails, other agents continue working
- **Fallback Support**: Auto-fallback to main OpenAI key if agent key unavailable

### Token Management
- **Distributed Processing**: Each agent has focused token budget
- **Input Optimization**: Reduced redundancy per phase  
- **Output Control**: Specialized outputs per agent
- **Continuity Policy**: Auto-retry with JSON repair
- **Safe Fail**: Graceful degradation to legacy system

### Role Separation
- **Clear Responsibilities**: Each agent has single purpose
- **Expertise Focus**: Agent-appropriate knowledge domains
- **Reduced Complexity**: Simpler prompts per phase
- **Better Debugging**: Clear failure points

## Deployment Files

### New Files
- `prompts/agent1_data_analyst_extraction.py` - Pure data extraction
- `prompts/agent2_accountant_journal.py` - Journal entry creation  
- `prompts/agent3_data_engineer_format.py` - Format conversion
- `three_agent_processor.py` - Main processing orchestrator

### Updated Files
- `openai_processor.py` - Integration with 3-agent system + fallback
- Multi-agent system becomes primary, legacy as fallback

## Token Management Features

### Continuity Policy
```python
# If output tokens run out:
1. Auto-retry with JSON repair (up to 3 attempts)
2. Truncate response while preserving JSON structure
3. Fall back to legacy system if all agents fail
4. Safe fail with partial results if everything fails
```

### Safe Fail Mechanism
```python
{
    'status': 'SAFE_FAIL',
    'message': 'Invoice processing failed after all retry attempts',
    'partial_results': [...],  # Any successful agent outputs
    'recommended_action': 'Manual review required'
}
```

## Deployment Commands

### Step 1: API Key Configuration (Pre-configured)
```bash
# API Key Assignment:
# Agent 1 (Data Analyst): DataAnalyst1 key - sk-proj-Dkxz7ol6dpGQbQ... (image processing)
# Agent 2 (Accountant): Current Secret Manager key - openai-api-key-secret (journal entries)  
# Agent 3 (Data Engineer): DataAnalyst2 key - sk-proj-fIem6C5nLHGbAo... (format conversion)

# No additional secret configuration needed - keys are hardcoded for agents 1&3
# Agent 2 continues using existing Secret Manager configuration
```

### Step 2: Deploy to Cloud Run
```bash
# Navigate to queue-processor
cd queue-processor

# Install any new dependencies (tiktoken for token counting)
pip install tiktoken

# Test locally (optional)
python -c "from three_agent_processor import ThreeAgentInvoiceProcessor; print('✅ Import successful')"

# Deploy to Cloud Run (no special environment variables needed)
gcloud run deploy queue-processor \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars PROJECT_ID=watch-mail-trial \
    --memory 2Gi \
    --timeout 900

# Or use existing deployment script
./deploy.sh
```

### Step 3: Verify Multi-Key Setup
```bash
# Check Cloud Run logs to verify key assignments
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=queue-processor" --limit=50 --format="value(textPayload)" | grep "Key Distribution"

# Expected log output:
# "Key Distribution: Agent1=DataAnalyst1, Agent2=Current, Agent3=DataAnalyst2"
```

## Testing Strategy

### Phase Testing
1. **Agent 1 Test**: Upload invoice, check extraction quality
2. **Agent 2 Test**: Verify journal entries balance (debits = credits)
3. **Agent 3 Test**: Validate final JSON format matches schema
4. **Continuity Test**: Test with large invoices to trigger token limits
5. **Safe Fail Test**: Force failures to verify graceful degradation

### Monitoring Points
- Token usage per agent
- Agent failure rates  
- Fallback activation frequency
- Processing time per phase
- JSON repair success rates

## Rollback Plan
If issues occur:
1. Legacy `multi_phase_processor.py` remains as fallback
2. Can disable 3-agent system by modifying `openai_processor.py` 
3. All existing functionality preserved

## Success Metrics
- **Token Efficiency**: Reduced total token usage per invoice
- **Failure Rate**: Lower Phase 2 termination incidents
- **Processing Speed**: Faster per-phase completion
- **JSON Quality**: Fewer malformed responses
- **Continuity Success**: Higher completion rates with token limits