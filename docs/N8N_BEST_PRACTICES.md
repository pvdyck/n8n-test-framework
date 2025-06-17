# n8n Best Practices - Based on Production Research

This document summarizes the best practices discovered through extensive research of n8n production deployments and community patterns.

## 1. Workflow Design Principles

### Modular Architecture
- **Break Down Complexity**: Use sub-workflows for reusable components
- **Single Responsibility**: Each workflow should do one thing well
- **Clear Interfaces**: Define clear inputs/outputs for sub-workflows

```yaml
# Example: Modular sub-workflow pattern
parameters:
  workflowInputs:
    mappingMode: defineBelow
    value:
      customerName: "={{ $json.name }}"
      orderAmount: "={{ $json.amount }}"
```

### Error Handling First
- **Design for Failure**: Assume external services will fail
- **Graceful Degradation**: Use `continueOnFail: true` strategically
- **Error Isolation**: Separate error handling paths

```javascript
// Split valid and error streams
return [
  validRecords.map(r => ({json: r})),
  errors.map(e => ({json: e}))
];
```

## 2. Performance Optimization

### Batch Processing
Process data in chunks to prevent memory exhaustion:
```yaml
parameters:
  batchSize: 100
  options:
    queryBatching: transaction
```

### Parallel Execution
Run independent tasks simultaneously:
```json
"connections": {
  "Start": {
    "main": [[
      { "node": "Task1", "type": "main", "index": 0 },
      { "node": "Task2", "type": "main", "index": 0 },
      { "node": "Task3", "type": "main", "index": 0 }
    ]]
  }
}
```

### Queue Mode
For high-volume processing:
- Use multiple worker instances
- Implement rate limiting
- Fire-and-forget for non-critical tasks

## 3. Security Best Practices

### Data Encryption
Always encrypt sensitive data:
```javascript
const encrypted = {
  name: encrypt(patient.name),
  ssn: encrypt(patient.ssn),
  address: encrypt(patient.address)
};
```

### Authentication Headers
Include proper authentication:
```yaml
headers:
  X-Audit-User: service-account
  X-Purpose-Of-Use: TREATMENT
  Authorization: Bearer {{ $credentials.apiKey }}
```

### Audit Logging
Track all data access:
```javascript
auditLog.piiAccessed.push({
  resourceId: record.id,
  fieldsAccessed: ['name', 'ssn'],
  timestamp: new Date().toISOString(),
  purpose: 'sync'
});
```

## 4. Rate Limiting Implementation

### In-Memory Rate Limiting
```javascript
// Track requests per client
if (!global.rateLimits[clientId]) {
  global.rateLimits[clientId] = {
    requests: [],
    blocked: false,
    blockUntil: 0
  };
}

// Check limits
if (requestsPerSecond > 10) {
  return { status: 429, retryAfter: 60 };
}
```

### Production Rate Limiting
- Use Redis for distributed rate limiting
- Implement exponential backoff
- Return proper 429 status codes

## 5. Data Validation

### Schema Validation
```javascript
const requiredFields = ['event_type', 'event_id', 'timestamp'];
for (const field of requiredFields) {
  if (!payload[field]) {
    errors.push(`Missing required field: ${field}`);
  }
}
```

### Timestamp Validation
```javascript
// Reject old events
if (Date.now() - eventTime > 300000) {
  errors.push('Event timestamp too old (> 5 minutes)');
}
```

### Duplicate Detection
```javascript
if (global.processedEvents.has(eventId)) {
  errors.push('Duplicate event detected');
}
```

## 6. AI Integration Patterns

### Multi-Agent Architecture
```yaml
agents:
  - intent_classifier: Routes queries to specialists
  - technical_support: Handles troubleshooting
  - billing_agent: Manages financial queries
  - complaint_resolution: Handles escalations
```

### Quality Assurance
```javascript
const qualityChecks = {
  hasResponse: response.length > 0,
  isPolite: !containsProfanity(response),
  hasActionableInfo: containsActionVerbs(response),
  lengthAppropriate: response.length > 50 && response.length < 1000
};
```

### Context Management
- Use scratchpad memory for conversation state
- Pass session IDs through workflows
- Implement conversation history

## 7. Database Patterns

### Multi-Database Sync
```yaml
databases:
  - PostgreSQL: Transactional data
  - MongoDB: Document storage
  - Elasticsearch: Search indexing
  - Redis: Caching and rate limiting
```

### Transaction Management
```yaml
options:
  queryBatching: transaction
  isolation: READ_COMMITTED
```

### Connection Pooling
- Reuse database connections
- Implement connection limits
- Handle connection failures gracefully

## 8. Monitoring & Alerting

### Comprehensive Logging
```javascript
logger.info({
  workflowId: $workflow.id,
  executionId: $execution.id,
  duration: Date.now() - startTime,
  recordsProcessed: totalCount,
  errors: errorCount
});
```

### Alert Escalation
1. Log to monitoring system (Elasticsearch)
2. Send Slack notification for warnings
3. Page on-call for critical errors
4. Email compliance reports

### Metrics to Track
- Execution duration
- Success/failure rates
- Resource usage
- API response times
- Queue depths

## 9. Compliance Patterns

### HIPAA Compliance
```javascript
complianceChecks: {
  encryption: true,
  authentication: true,
  authorization: true,
  dataMinimization: true,
  auditTrailComplete: true
}
```

### Data Retention
- Define retention policies
- Implement automatic purging
- Maintain audit logs separately

### Access Control
- Role-based permissions
- Purpose-based access
- Consent verification

## 10. Testing Strategies

### Comprehensive Test Coverage
- Unit tests for individual nodes
- Integration tests for workflows
- End-to-end tests for processes
- Performance tests for scale

### Test Data Management
```yaml
test:
  input: { realistic: data }
  expect: { accurate: results }
  mocks: { external: services }
```

### Continuous Testing
- Run tests on every change
- Monitor test coverage
- Update tests with new scenarios

## Real-World Success Stories

### Delivery Hero
- Saved 200 hours/month with automation
- Processes millions of orders
- Zero-downtime deployments

### Stepstone
- 200+ mission-critical workflows
- Multi-region deployment
- Advanced monitoring

### Healthcare Providers
- HIPAA-compliant workflows
- Real-time patient data sync
- Audit trail for compliance

## Key Takeaways

1. **Start Simple**: Build incrementally
2. **Plan for Scale**: Design for 10x growth
3. **Monitor Everything**: You can't fix what you can't see
4. **Test Thoroughly**: Catch issues before production
5. **Document Well**: Future you will thank you
6. **Secure by Default**: Never compromise on security
7. **Optimize Gradually**: Measure, then optimize

These best practices come from real production deployments handling millions of executions daily across various industries.