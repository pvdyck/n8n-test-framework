# Test Suites Organization

This directory contains organized test suites for the n8n test framework, categorized by complexity and purpose.

## Directory Structure

### `/simple/`
Contains simplified test cases that demonstrate basic testing concepts with minimal complexity.
- Files ending with `-simple.test.yaml`
- Files ending with `-ultra-simple.test.yaml`
- Ideal for learning and quick validation

### `/full/`
Contains comprehensive test suites with extensive coverage and edge cases.
- Files ending with `-full.test.yaml`
- Includes multiple test scenarios and thorough validation

### `/stress/`
Contains stress tests designed to validate workflows under high load.
- Files ending with `-100.test.yaml`
- Typically contain 100+ test cases
- Used for performance and reliability testing

### `/examples/`
Contains standard example test files demonstrating various workflow testing patterns.
- All other test files
- Covers diverse use cases and integration scenarios

## Running Tests

To run tests from a specific category:

```bash
# Run all simple tests
n8n-test run examples/test-suites/simple/**/*.test.yaml

# Run all stress tests
n8n-test run examples/test-suites/stress/**/*.test.yaml

# Run specific test file
n8n-test run examples/test-suites/examples/user-registration.test.yaml
```

## Test Naming Conventions

- `*-simple.test.yaml`: Simplified version with basic test cases
- `*-ultra-simple.test.yaml`: Minimal version for quick testing
- `*-full.test.yaml`: Comprehensive test suite with edge cases
- `*-100.test.yaml`: Stress test with 100+ test cases
- `*.test.yaml`: Standard test file