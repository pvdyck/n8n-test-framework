# Multi-Workflow Orchestration Testing

This document showcases advanced n8n patterns where a single workflow orchestrates multiple other workflows, creating complex execution chains and dependency management.

## Overview

True multi-workflow orchestration involves:
- **Parent workflows** that coordinate multiple child workflows
- **Workflow chains** where output from one workflow becomes input to another
- **Parallel execution** of multiple workflows with result aggregation
- **Error handling** across workflow boundaries
- **Deep nesting** with workflows calling other workflows that call more workflows

## Test Examples

### 1. Multi-Workflow Orchestrator (`multi-workflow-orchestration.test.yaml`)

**Pattern**: E-commerce order processing through 5 specialized workflows

```yaml
# Main workflow calls these sub-workflows in sequence/parallel:
- customer-validator    # Validates customer credentials and risk
- inventory-checker     # Checks product availability 
- payment-processor     # Processes payment
- order-fulfillment     # Handles shipping and tracking
- notification-sender   # Sends confirmations (async)
```

**Key Features:**
- **Parallel Validation**: Customer, inventory, and payment checked simultaneously
- **Conditional Routing**: Success path vs rejection path based on validation results
- **Async Notifications**: Fire-and-forget notification workflow
- **Error Aggregation**: Collects errors from all validation workflows

**Test Scenarios:**
```yaml
cases:
  - name: Complete order processing through 5 sub-workflows
    expect:
      totalWorkflowsExecuted: 5
      fulfillment: { status: fulfilled, trackingNumber: TRK-98765 }
      
  - name: Order rejection due to inventory shortage
    expect:
      totalWorkflowsExecuted: 4  # customer-validator, inventory-checker, payment-processor, order-rejection
      errors: { inventory: 'Insufficient stock: requested 100, available 5' }
      
  - name: Payment failure triggers rejection workflow chain
    expect:
      errors: { payment: 'Payment declined: insufficient funds' }
      rejection: { reason: payment_declined }
```

### 2. Complex Multi-Level Workflow Chain (`complex-workflow-chain.test.yaml`)

**Pattern**: 8-level deep data processing pipeline with batch operations

```yaml
# Workflow chain (each level calls the next):
1. data-extractor     → Extract raw data
2. data-transformer   → Transform and normalize  
3. data-validator     → Validate quality
4. ml-analyzer        → AI analysis and scoring
5. data-enricher      → External API enrichment
6. data-loader        → Load to data warehouse
7. index-builder      → Build search indices (async)
8. report-generator   → Generate reports (async)
```

**Advanced Features:**
- **Batch Processing**: Splits large datasets into manageable chunks
- **Per-Batch Workflow Execution**: Each batch goes through the entire 8-workflow chain
- **Error Recovery**: Failed batches are quarantined while successful ones continue
- **Result Aggregation**: Combines results from all batch processing

**Key Metrics:**
```yaml
expect:
  summary:
    workflowChainDepth: 8
    totalSubWorkflowsExecuted: 21  # 3 batches × 7 workflows each
    successRate: '100.00%'
    totalRecords: 2700  # 3 batches × 900 records each
```

## Workflow Orchestration Patterns

### 1. Parallel Fan-Out with Aggregation
```json
"connections": {
  "Start": {
    "main": [[
      { "node": "Workflow A", "type": "main", "index": 0 },
      { "node": "Workflow B", "type": "main", "index": 0 },
      { "node": "Workflow C", "type": "main", "index": 0 }
    ]]
  }
}
```

### 2. Sequential Workflow Chain
```yaml
Extract Data → Transform Batch → Validate Data → ML Analysis → Enrich Data → Load to DW
```

### 3. Conditional Workflow Routing
```javascript
if (validationPassed) {
  executeWorkflow('fulfillment-pipeline');
} else {
  executeWorkflow('rejection-handler');
}
```

### 4. Async Fire-and-Forget
```yaml
parameters:
  options:
    waitForSubWorkflow: false  # Don't wait for completion
```

## Testing Multi-Workflow Dependencies

### Mock Strategy
Each sub-workflow is mocked by its `workflowId`:

```yaml
mocks:
  - workflowId: customer-validator
    response: { valid: true, creditScore: 750 }
  - workflowId: inventory-checker  
    response: { available: true, items: [...] }
  - workflowId: payment-processor
    response: { success: true, transactionId: TXN-123 }
```

### Data Flow Testing
```yaml
# Parent workflow input
input: { customerId: CUST-123, amount: 209.97 }

# Child workflow receives transformed data
workflowInputs:
  customerId: "={{ $json.customerId }}"
  orderValue: "={{ $json.totalAmount }}"
```

### Error Propagation
```yaml
# Test how errors flow between workflows
mocks:
  - workflowId: payment-processor
    response:
      success: false
      error: 'Payment declined: insufficient funds'
      
expect:
  status: rejected
  errors: { payment: 'Payment declined: insufficient funds' }
```

## Complex Orchestration Features

### 1. Workflow Chain Depth Tracking
```javascript
workflowChainDepth: 8  // Number of workflow levels deep
totalSubWorkflowsExecuted: 21  // Total workflows called
```

### 2. Batch-Level Orchestration
```yaml
# Each batch of 100 records goes through entire workflow chain
batchSize: 100
workflowsPerBatch: 7
totalBatches: 3
```

### 3. Success/Failure Rate Calculation
```javascript
successRate: ((successful / total) * 100).toFixed(2) + '%'
```

### 4. Async Workflow Management
```yaml
# Some workflows don't block the main flow
- index-builder      # Async indexing
- notification-sender # Fire-and-forget notifications  
- report-generator   # Background reporting
```

## Real-World Applications

### 1. **E-commerce Order Processing**
- Customer validation → Inventory check → Payment → Fulfillment → Notifications
- **Benefits**: Parallel validation, graceful failures, async notifications

### 2. **Data Processing Pipelines**  
- Extract → Transform → Validate → Analyze → Enrich → Load → Index
- **Benefits**: Batch processing, error isolation, scalable architecture

### 3. **Document Processing Workflows**
- Upload → OCR → Classification → Validation → Enrichment → Storage → Indexing
- **Benefits**: Multi-stage processing, quality gates, search integration

### 4. **Customer Onboarding**
- Registration → Verification → Risk Assessment → Account Setup → Welcome Communication
- **Benefits**: Compliance checks, personalization, multi-channel communication

## Testing Best Practices

### 1. **Mock at Workflow Level**
```yaml
# Mock entire workflows, not individual nodes
- workflowId: data-processor
  response: { processed: true, recordCount: 1000 }
```

### 2. **Test All Execution Paths**
```yaml
# Test both success and failure scenarios
cases:
  - name: All validations pass
  - name: Customer validation fails  
  - name: Payment processing fails
```

### 3. **Verify Workflow Counts**
```yaml
# Ensure correct number of sub-workflows executed
expect:
  totalWorkflowsExecuted: 5
  workflowChainDepth: 8
```

### 4. **Test Async Behavior**
```yaml
# Verify async workflows are triggered but don't wait
mocks:
  - workflowId: notification-sender
    response: { queued: true, messageId: msg-123 }
```

## Key Metrics to Track

1. **Workflow Chain Depth**: How many levels deep
2. **Total Sub-Workflows**: Total number of workflow executions
3. **Success Rate**: Percentage of successful workflow chains
4. **Processing Time**: End-to-end execution duration
5. **Error Distribution**: Which workflows fail most often

## Conclusion

Multi-workflow orchestration enables:
- **Modular Design**: Each workflow has a single responsibility
- **Parallel Processing**: Independent workflows run simultaneously  
- **Error Isolation**: Failures in one workflow don't crash others
- **Scalability**: Individual workflows can be scaled independently
- **Reusability**: Workflows can be reused across different orchestrations

The test framework makes it easy to test these complex patterns with **zero configuration** - just define your expected outputs and the mocks handle the rest!