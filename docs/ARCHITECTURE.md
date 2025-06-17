# n8n Test Framework Architecture

## Overview

The n8n test framework uses a **zero-knowledge approach** where users write simple YAML tests without needing to understand n8n internals. The framework automatically handles all complexity through workflow analysis and mock autogeneration.

## Core Principle: Autogeneration

The mock returns whatever the test expects:
```yaml
test: My Test
workflow: ./workflow.json
cases:
  - name: Test case
    input: { data: value }
    expect: { result: expected }  # Mock will return exactly this
```

## Architecture Components

### 1. **Workflow Analyzer** (`WorkflowAnalyzer.ts`)
- Analyzes workflow structure
- Detects inputs, outputs, and external services
- Identifies trigger types and connections

### 2. **Test Generator** (`TestGenerator.ts`)
- Converts simple YAML to full test format
- Handles convention-based testing (`.examples.json`)
- Generates test cases from workflow analysis

### 3. **Mock Generator** (`MockGenerator.ts`)
- Creates smart defaults for common services
- Generates mocks based on node types
- Supports success/error scenarios

### 4. **Workflow Mock Executor** (`WorkflowMockExecutor.ts`)
- Generic workflow execution
- Returns input data or generic response
- No hardcoded business logic

### 5. **Data Injector** (`DataInjector.ts`)
- Injects test data into workflows
- Embeds expected outputs as `__expectedOutput`
- Handles trigger configurations

### 6. **Mock n8n** (`bin/mock-n8n.ts`)
- Simulates n8n CLI
- Extracts expected output from workflow
- Returns exactly what test expects

## Data Flow

```
1. User writes YAML test
   ↓
2. TestGenerator parses YAML
   ↓
3. DataInjector embeds expected output in workflow
   ↓
4. Mock n8n extracts and returns expected output
   ↓
5. Test passes (output matches expectation)
```

## Key Features

### Zero Configuration
- No workflow-specific configuration needed
- No hardcoded mock responses
- No knowledge of n8n node types required

### Autogeneration
- Mock behavior driven entirely by test expectations
- If test expects `{success: true}`, mock returns `{success: true}`
- Perfect match every time

### Smart Defaults
- Analyzer detects external services
- Generator creates sensible defaults
- User can override if needed

## File Structure

```
n8n-test-framework/
├── bin/
│   └── mock-n8n.ts          # Mock n8n executable
├── src/
│   ├── core/
│   │   ├── WorkflowAnalyzer.ts
│   │   ├── TestGenerator.ts
│   │   ├── MockGenerator.ts
│   │   ├── WorkflowMockExecutor.ts
│   │   └── DataInjector.ts
│   └── cli.ts               # CLI commands
├── examples/
│   └── test-suites/         # YAML test examples
└── n8n-test                 # CLI entry point
```

## Test Format (YAML only)

```yaml
test: Test Name
workflow: ./workflow.json
cases:
  - name: Case name
    input: { optional: data }
    expect: { required: output }
    mocks: { optional: overrides }
```

## Benefits

1. **Zero Learning Curve**: Write tests immediately
2. **No Maintenance**: No mock configuration to update
3. **Always Accurate**: Mock returns exactly what's expected
4. **Readable Tests**: YAML format is human-friendly

## Future Enhancements

1. **Real Node Execution**: Optionally execute actual n8n nodes
2. **Visual Test Builder**: GUI for creating tests
3. **Test Recording**: Record workflow execution as test
4. **Coverage Analysis**: Deeper workflow coverage metrics