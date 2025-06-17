# Sub-Workflow Testing

The n8n test framework fully supports testing workflows that execute other workflows (sub-workflows).

## Overview

Sub-workflows in n8n allow you to:
- Modularize complex workflows
- Reuse common functionality
- Execute workflows in parallel or sequence
- Handle errors gracefully

## Test Structure

### Basic Sub-Workflow Test

```yaml
test: Sub-Workflow Test
workflow: ./parent-workflow.json
cases:
  - name: Test sub-workflow execution
    input: { data: value }
    expect: { result: expected }
    mocks:
      - workflowId: sub-workflow-id
        response: { result: expected }
```

### Key Concepts

1. **Mock by Workflow ID**: Instead of mocking by node type, sub-workflows are mocked by their workflow ID
2. **Response Handling**: The mock response is what the Execute Workflow node returns
3. **Data Flow**: Input data flows from parent to child, response flows back

## Test Examples

### 1. Simple Sub-Workflow Execution

```yaml
test: Parent calls child workflow
workflow: ./parent.json
cases:
  - name: Process data through sub-workflow
    input:
      userId: 123
      action: process
    expect:
      status: completed
      processedBy: sub-workflow
    mocks:
      - workflowId: data-processor
        response:
          status: completed
          processedBy: sub-workflow
```

### 2. Parallel Sub-Workflows

```yaml
test: Multiple sub-workflows in parallel
workflow: ./parallel-parent.json
cases:
  - name: Execute three workflows simultaneously
    input: { data: test }
    expect:
      processing: { status: done }
      validation: { isValid: true }
      notification: { sent: true }
    mocks:
      - workflowId: processor
        response: { status: done }
      - workflowId: validator
        response: { isValid: true }
      - workflowId: notifier
        response: { sent: true }
```

### 3. Error Handling

```yaml
test: Sub-workflow error handling
workflow: ./error-handler.json
cases:
  - name: Handle sub-workflow failure
    input: { trigger: error }
    expect:
      status: error_handled
      message: Sub-workflow failed
    mocks:
      - workflowId: error-prone
        response:
          error:
            message: Sub-workflow failed
            code: ERR_001
```

### 4. Nested Sub-Workflows

```yaml
test: Multi-level workflow execution
workflow: ./nested-parent.json
cases:
  - name: Three levels deep
    input: { level: 0 }
    expect:
      finalLevel: 3
      path: [level-1, level-2, level-3]
    mocks:
      - workflowId: level-1
        response:
          finalLevel: 3
          path: [level-1, level-2, level-3]
```

### 5. Schema-based Sub-Workflows (n8n 1.2+)

```yaml
test: Typed sub-workflow with schema
workflow: ./schema-parent.json
cases:
  - name: Execute with input mapping
    input:
      name: John
      amount: 100
    expect:
      orderId: ORD-123
      customer: { name: John, tier: gold }
    mocks:
      - workflowId: typed-processor
        response:
          orderId: ORD-123
          customer: { name: John, tier: gold }
```

## Execution Modes

### Run Once (Default)
All items are sent to sub-workflow in one execution:

```yaml
parameters:
  mode: once
```

### Run for Each Item
Sub-workflow is called once per item:

```yaml
parameters:
  mode: each
```

### Wait Options

```yaml
parameters:
  options:
    waitForSubWorkflow: true  # Parent waits (default)
    # or
    waitForSubWorkflow: false # Fire and forget
```

## Best Practices

1. **Mock at the Right Level**: Mock the sub-workflow response, not internal nodes
2. **Test Both Paths**: Test success and error scenarios
3. **Keep Mocks Simple**: Return only what the parent workflow needs
4. **Use Descriptive IDs**: Make workflow IDs meaningful for clarity

## Common Patterns

### Data Enrichment
```yaml
mocks:
  - workflowId: enricher
    response:
      original: "{{ $json }}"
      enriched:
        category: premium
        score: 95
```

### Validation Pattern
```yaml
mocks:
  - workflowId: validator
    response:
      isValid: true
      checks:
        - field: email
          status: passed
        - field: age
          status: passed
```

### Batch Processing
```yaml
mocks:
  - workflowId: batch-processor
    response:
      processed: 100
      failed: 0
      duration: 2500
```

## Limitations

1. **No Real Execution**: Sub-workflows aren't actually executed, only mocked
2. **Static Responses**: Mocks return predefined responses
3. **No State**: Sub-workflows can't maintain state between calls

## Future Enhancements

- Dynamic mock responses based on input
- Sub-workflow execution recording
- Visual sub-workflow test builder
- Automatic mock generation from sub-workflow definitions