# Zero-Knowledge Testing for n8n Workflows

Write tests without knowing the n8n test framework internals!

## Quick Start

### 1. Simplest Test (YAML)

Create a file `my-workflow.test.yaml`:

```yaml
test: My Workflow Test
workflow: ./my-workflow.json
cases:
  - name: Happy path
    input:
      email: user@example.com
      name: Test User
    expect:
      success: true
      userId: "12345"
```

Run it:
```bash
n8n-test run --pattern="**/*.test.yaml"
```

### 2. Auto-Generate Tests

Analyze your workflow:
```bash
n8n-test analyze my-workflow.json
```

Generate tests automatically:
```bash
n8n-test generate my-workflow.json
```

### 3. Convention-Based Testing

Create `my-workflow.examples.json`:
```json
[
  {
    "scenario": "New user",
    "email": "new@example.com",
    "expect": {
      "created": true
    }
  }
]
```

Generate and run:
```bash
n8n-test generate my-workflow.json
n8n-test run
```

## Test Format

### Minimal YAML
```yaml
test: Test Name
workflow: ./workflow.json
cases:
  - name: Test case
    input: { key: value }
    expect: { result: expected }
```

### With Mocks (Optional)
```yaml
cases:
  - name: Test with mocks
    input: { data: test }
    expect: { success: true }
    mocks:
      "API Node Name":
        status: 200
        data: { id: 123 }
```

## How It Works

1. **Auto-Analysis**: The framework analyzes your workflow to detect:
   - Input requirements
   - External services that need mocking
   - Expected output structure

2. **Smart Defaults**: Generates sensible mock responses for common services:
   - HTTP APIs: `{ status: 200, body: { success: true } }`
   - Emails: `{ success: true, messageId: "msg-123" }`
   - Databases: `{ rows: [...], rowCount: 1 }`

3. **Autogeneration**: Since tests define expected outputs, the mock automatically returns what you expect!

## Examples

### Testing User Registration
```yaml
test: User Registration
workflow: ./user-registration.json
cases:
  - name: Valid signup
    input:
      email: john@example.com
      name: John Doe
    expect:
      userId: user-123
      emailSent: true
      
  - name: Invalid email
    input:
      email: not-an-email
    expect:
      error: "Invalid email"
```

### Testing Data Processing
```yaml
test: Data Processing
workflow: ./data-etl.json
cases:
  - name: Process CSV
    input:
      csvData: "name,age\\nJohn,30"
    expect:
      processed: 1
      records: [{ name: "John", age: 30 }]
```

### Testing with Triggers
```yaml
test: Webhook Handler
workflow: ./webhook.json
cases:
  - name: Handle webhook
    input:
      webhook:
        body: { event: "user.created" }
    expect:
      processed: true
```

## Advanced Features

### Using Examples Files

Create `workflow.examples.json`:
```json
[
  {
    "scenario": "Success case",
    "input": "data",
    "expect": { "result": "success" }
  },
  {
    "scenario": "Error case", 
    "error": true,
    "expect": { "error": "Failed" }
  }
]
```

### Generate Mocks

Generate default mocks for your workflow:
```bash
n8n-test generate-mocks workflow.json
```

Creates `workflow.mocks.json`:
```json
{
  "HTTP Request": {
    "success": { "status": 200, "body": {} },
    "error": { "status": 500, "error": "Server Error" }
  }
}
```

## Benefits

1. **No Framework Knowledge Required**: Just describe inputs and expected outputs
2. **Auto-Mocking**: External services are automatically mocked
3. **Readable Tests**: YAML format is human-friendly
4. **Convention Over Configuration**: Smart defaults for everything
5. **True Autogeneration**: Mock returns exactly what you expect

## Tips

- Use `"*"` for dynamic values like timestamps
- Name your nodes clearly - they become mock identifiers  
- Keep tests focused on business logic, not implementation
- Use examples files for reusable test data