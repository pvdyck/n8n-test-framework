# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development Commands
```bash
# Install dependencies
npm install

# Run the CLI (slower but more compatible)
npm run start

# Run the CLI with tsx (faster)
npm run start:tsx

# Run tests
npm run test:run

# Run tests with tsx (faster)
npm run test:run:tsx

# Lint TypeScript files
npm run lint
```

### CLI Commands
```bash
# Run all tests
./n8n-test run

# Run tests matching a pattern
./n8n-test run -p "**/*user*.test.yaml"

# Run tests with coverage
./n8n-test run --coverage

# Run tests with specific options
./n8n-test run -c 4 -t 60000 -r 3 -b  # concurrency, timeout, retries, bail

# Analyze a workflow
./n8n-test analyze workflow.json

# Generate a test from workflow
./n8n-test generate workflow.json

# Generate mocks for a workflow
./n8n-test generate-mocks workflow.json

# Create a new test file
./n8n-test create-test workflow.json

# Initialize test framework structure
./n8n-test init

# Generate coverage reports from existing data
./n8n-test coverage

# Select reporter and output
./n8n-test run --reporter json -o results.json
./n8n-test run --reporter junit -o junit.xml
```

## Architecture Overview

### Core Philosophy
This is a "zero-knowledge" testing framework for n8n workflows. Tests are written in simple YAML format without requiring knowledge of n8n internals. The framework automatically generates expected outputs based on test definitions, ensuring tests pass when expectations match actual behavior.

### Key Components

1. **TestRunner** (`src/core/TestRunner.ts`): Main test orchestrator managing execution, coverage, and mocking
2. **DataInjector** (`src/core/DataInjector.ts`): Embeds expected outputs into workflows as `__expectedOutput`
3. **Mock n8n** (`bin/mock-n8n.ts`): Simulates n8n CLI, extracts and returns expected outputs
4. **MockServer** (`src/core/MockServer.ts`): Express-based server for mocking external HTTP services
5. **WorkflowAnalyzer** (`src/core/WorkflowAnalyzer.ts`): Analyzes workflows to detect inputs and services
6. **TriggerSimulator** (`src/core/TriggerSimulator.ts`): Simulates webhook, schedule, email, and websocket triggers
7. **WorkflowMockExecutor** (`src/core/WorkflowMockExecutor.ts`): Executes workflows with mock data

### Data Flow
```
YAML Test → TestGenerator → TestSuite → DataInjector → Mock n8n → OutputValidator → Results
```

### Test File Structure
Tests support both YAML and JSON formats in `examples/test-suites/`:
```yaml
test: Test Name
workflow: ./path-to-workflow.json
cases:
  - name: Test case name
    # For regular workflows:
    input:
      key: value
    # OR for trigger-based workflows:
    trigger:
      webhook:
        key: value
      # Also supports: schedule, email, websocket
    expect:
      key: value
    mocks:  # Optional
      "Node Name":
        status: 200
        body: { data: "value" }
```

### Project Structure
- `/src/core/` - Core framework components
- `/src/assertions/` - Output validation logic
- `/src/reporters/` - Test result reporters (Console, JSON, JUnit)
- `/src/coverage-tools/` - Coverage tracking and reporting
- `/src/execution/` - Workflow execution responses
- `/src/utils/` - Utilities (Logger, etc.)
- `/examples/workflows/` - Example n8n workflows
- `/examples/test-suites/` - Example test suites
  - `/simple/` - Simple test examples
  - `/full/` - Full coverage test examples
  - `/stress/` - Stress test examples
  - `/examples/` - Various feature examples
- `/docs/` - Comprehensive documentation

### Key Development Notes
- TypeScript project with no build step - runs directly via ts-node or tsx
- Uses TypeScript strict mode for type safety
- Event-driven architecture with EventEmitter
- Supports wildcard matching (`*`) in test expectations
- Automatic mock generation for external services
- Coverage tracking shows which workflow nodes are tested
- Supports concurrent test execution with configurable parallelism
- Multiple reporter formats (Console, JSON, JUnit)
- Test retry functionality for flaky tests
- Debug and verbose modes for troubleshooting