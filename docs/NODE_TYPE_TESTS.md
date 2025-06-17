# n8n Node Type Tests

This document describes the comprehensive test coverage for different n8n node types.

## Test Coverage

### 1. **HTTP & API Nodes** (`test-http-nodes.test.yaml`)
- **HTTP Request** (GET, POST)
- **GraphQL**
- Tests API interactions with expected responses

### 2. **Database Nodes** (`test-database-nodes.test.yaml`)
- **PostgreSQL** - Insert operations with returned IDs
- **MySQL** - Insert operations with affected rows
- **MongoDB** - Document creation with ObjectIDs
- **Redis** - Key-value operations
- **Elasticsearch** - Document indexing

### 3. **Communication Nodes** (`test-communication-nodes.test.yaml`)
- **Email Send** - SMTP email sending
- **Slack** - Message posting to channels
- **Discord** - Channel messaging
- **Telegram** - Bot messaging
- **Twilio** - SMS sending

### 4. **File Storage Nodes** (`test-file-storage-nodes.test.yaml`)
- **AWS S3** - File uploads to buckets
- **Google Drive** - File uploads with sharing
- **FTP** - File transfer operations
- **Local File Write** - Local filesystem operations
- **Dropbox** - Cloud file storage

### 5. **Data Transformation Nodes** (`test-data-transform-nodes.test.yaml`)
- **Set** - Data manipulation and transformation
- **Function** - JavaScript code execution
- **IF** - Conditional logic
- **Switch** - Multi-path routing
- **Merge** - Data combination

### 6. **Trigger Nodes** (`test-trigger-nodes.test.yaml`)
- **Webhook** - HTTP endpoint triggers
- **Schedule** - Time-based triggers
- **Email Trigger** - IMAP email monitoring
- **MQTT** - Message queue triggers
- **GitHub** - Repository event triggers

### 7. **Cloud Service Nodes** (`test-cloud-service-nodes.test.yaml`)
- **AWS Lambda** - Function invocation
- **Google Cloud** - Translation and NLP services
- **Azure Storage** - Blob storage operations
- **IBM Watson** - AI/ML services
- **DigitalOcean** - Cloud infrastructure

## Test Structure

Each test follows the zero-knowledge YAML format:

```yaml
test: Node Type Test Name
workflow: ../workflows/test-workflow.json
cases:
  - name: Test case name
    input: { optional: input data }
    expect: { required: expected output }
```

## Running Node Type Tests

Run all tests:
```bash
npm run test:run
```

Run specific category:
```bash
npx ts-node src/cli.ts run examples/test-suites/test-database-nodes.test.yaml
```

## Adding New Node Tests

1. Create a workflow in `examples/workflows/` that uses the nodes
2. Create a test suite in `examples/test-suites/` with expected outputs
3. The mock automatically returns the expected output

## Benefits

1. **Comprehensive Coverage** - Tests all major node categories
2. **Zero Configuration** - No mock setup required
3. **Realistic Responses** - Expected outputs match real node behavior
4. **Easy to Extend** - Simple YAML format for new tests