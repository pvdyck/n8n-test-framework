export function getIncidentManagementResponses(inputs: any, testName: string): any[] {
  const service = inputs.service || 'unknown-service';
  const severity = inputs.severity || 'medium';
  const description = inputs.description || 'Unknown issue';
  const affectedSystems = inputs.affectedSystems || [];
  
  // Determine if outside business hours based on test name
  const isOutsideHours = testName.toLowerCase().includes('outside hours') || 
                        testName.toLowerCase().includes('weekend') ||
                        testName.toLowerCase().includes('night');
  
  // Map severity to P-levels
  const severityMap: Record<string, string> = {
    'critical': 'P1',
    'high': 'P2',
    'medium': 'P3',
    'low': 'P4'
  };
  
  const pLevel = severityMap[severity.toLowerCase()] || 'P3';
  const severityNumeric = parseInt(pLevel.substring(1));
  
  // Generate incident ID
  const incidentId = `INC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  // Determine team assignment
  let assigneeTeam = 'support';
  let escalationLevel = 1;
  
  if (pLevel === 'P1') {
    assigneeTeam = 'engineering';
    escalationLevel = 3;
  } else if (pLevel === 'P2') {
    assigneeTeam = 'devops';
    escalationLevel = 2;
  }
  
  // Build response chain
  const responses: any[] = [];
  
  // 1. Process Incident Data
  responses.push({
    json: {
      incidentId,
      service,
      severity: pLevel,
      severityNumeric,
      description,
      affectedSystems,
      reportedBy: inputs.reportedBy || 'monitoring-system',
      escalationLevel,
      assigneeTeam,
      isBusinessHours: !isOutsideHours,
      createdAt: new Date().toISOString(),
      status: 'open',
      source: inputs.source || 'webhook',
      metrics: inputs.metrics || {},
      environment: inputs.environment || 'production'
    }
  });
  
  // 2. Create JIRA Ticket
  responses.push({
    json: {
      key: `OPS-${Math.floor(Math.random() * 9000) + 1000}`,
      id: String(Math.floor(Math.random() * 90000) + 10000),
      self: 'https://jira.example.com/rest/api/2/issue/10001'
    }
  });
  
  // 3. Create PagerDuty (only for P1/P2)
  if (severityNumeric <= 2) {
    responses.push({
      json: {
        id: `PINC${Math.floor(Math.random() * 900) + 100}`,
        incident_number: Math.floor(Math.random() * 900) + 100,
        status: 'triggered',
        html_url: 'https://company.pagerduty.com/incidents/PINC123'
      }
    });
  }
  
  // 4. Slack alerts (conditional based on severity)
  if (severityNumeric <= 2) {
    // Critical channel
    responses.push({
      json: {
        ok: true,
        ts: `${Date.now()}.123456`,
        channel: '#incidents-critical'
      }
    });
  } else {
    // General channel
    responses.push({
      json: {
        ok: true,
        ts: `${Date.now()}.123456`,
        channel: '#incidents'
      }
    });
  }
  
  // 5. Log to Database
  responses.push({
    json: {
      success: true,
      rowCount: 1
    }
  });
  
  // 6. SMS Alert (only outside business hours)
  if (isOutsideHours) {
    const toNumbers = pLevel === 'P1' ? ['+1987654321', '+1876543210'] : ['+1987654321'];
    responses.push({
      json: {
        sid: `SM${Math.random().toString(36).substr(2, 12).toUpperCase()}`,
        status: 'sent',
        to: toNumbers,
        body: `URGENT: ${pLevel} incident on ${service}. ID: ${incidentId}. Check Slack for details.`
      }
    });
  }
  
  // 7. Update Status Page (for P1/P2)
  if (severityNumeric <= 2) {
    responses.push({
      json: {
        id: `inc_${Math.floor(Math.random() * 900) + 100}`,
        status: 'investigating'
      }
    });
  }
  
  // 8. Setup Monitoring
  responses.push({
    json: {
      ...responses[0].json,
      monitoringEndpoint: `https://${service.replace('-service', '')}.example.com/health`,
      monitoringInterval: pLevel === 'P1' ? 30 : 60,
      autoResolveAfter: pLevel === 'P1' ? 3600 : 7200,
      runbookUrl: `https://wiki.example.com/runbooks/${service}`,
      metricsUrl: `https://grafana.example.com/d/${service}-dashboard`
    }
  });
  
  // 9. Final response
  responses.push({
    json: {
      success: true,
      incidentId,
      message: 'Incident created and teams notified',
      details: {
        severity: pLevel,
        service,
        status: 'active',
        jiraTicket: responses[1].json.key,
        pagerDutyId: severityNumeric <= 2 ? responses[2].json.id : null,
        assignedTeam: assigneeTeam,
        escalationLevel
      },
      nextSteps: [
        `Monitor status at: https://jira.example.com/browse/${responses[1].json.key}`,
        pLevel === 'P1' ? 'Join the war room immediately' : 'Await team assignment',
        'Check runbook for troubleshooting steps'
      ],
      urls: {
        jira: `https://jira.example.com/browse/${responses[1].json.key}`,
        runbook: `https://wiki.example.com/runbooks/${service}`,
        metrics: `https://grafana.example.com/d/${service}-dashboard`,
        statusPage: 'https://status.example.com'
      }
    }
  });
  
  return responses;
}