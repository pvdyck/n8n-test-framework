import { MockConfig } from '../types';

export interface NodeMockPreset {
  pattern: RegExp;
  category: string;
  generateMock: (nodeName: string, scenario: 'success' | 'error') => any;
}

export class MockGenerator {
  private presets: NodeMockPreset[] = [
    // HTTP Requests
    {
      pattern: /httpRequest/i,
      category: 'http',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { status: 500, body: { error: 'Internal Server Error' } };
        }
        return { status: 200, body: { success: true, id: `generated-${Date.now()}` } };
      }
    },
    // Databases
    {
      pattern: /postgres|mysql|mariadb/i,
      category: 'sql',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { error: 'Database connection failed' };
        }
        return { 
          rows: [{ id: 1, created_at: new Date().toISOString() }], 
          rowCount: 1 
        };
      }
    },
    {
      pattern: /mongodb/i,
      category: 'nosql',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { error: 'MongoDB operation failed' };
        }
        return { 
          acknowledged: true, 
          insertedId: `mongo-id-${Date.now()}` 
        };
      }
    },
    // Email
    {
      pattern: /email|gmail|smtp|mail/i,
      category: 'email',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { error: 'Failed to send email' };
        }
        return { 
          success: true, 
          messageId: `msg-${Date.now()}@example.com` 
        };
      }
    },
    // Messaging
    {
      pattern: /slack/i,
      category: 'messaging',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { ok: false, error: 'channel_not_found' };
        }
        return { 
          ok: true, 
          ts: Date.now().toString(),
          channel: 'C1234567890' 
        };
      }
    },
    // Storage
    {
      pattern: /s3|aws/i,
      category: 'storage',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { error: 'Access Denied' };
        }
        return { 
          ETag: '"abc123"',
          Location: `https://bucket.s3.amazonaws.com/file-${Date.now()}`,
          Key: `file-${Date.now()}`
        };
      }
    },
    // Generic API
    {
      pattern: /.*/,
      category: 'generic',
      generateMock: (nodeName, scenario) => {
        if (scenario === 'error') {
          return { error: 'Operation failed' };
        }
        return { success: true, data: {} };
      }
    }
  ];

  generateMock(nodeType: string, nodeName: string, scenario: 'success' | 'error' = 'success'): any {
    const preset = this.presets.find(p => p.pattern.test(nodeType));
    if (preset) {
      return preset.generateMock(nodeName, scenario);
    }
    
    // Fallback
    return scenario === 'error' 
      ? { error: 'Unknown error' }
      : { success: true };
  }

  generateMockConfig(
    nodeType: string, 
    nodeName: string, 
    customResponse?: any,
    scenario: 'success' | 'error' = 'success'
  ): MockConfig {
    const response = customResponse || this.generateMock(nodeType, nodeName, scenario);
    
    return {
      nodeType,
      nodeName,
      response
    };
  }

  generateMocksForWorkflow(externalServices: any[], scenario: 'success' | 'error' = 'success'): MockConfig[] {
    return externalServices.map(service => 
      this.generateMockConfig(service.nodeType, service.nodeName, undefined, scenario)
    );
  }

  // Smart mock generation based on input data
  generateSmartMocks(externalServices: any[], inputData: any): MockConfig[] {
    const mocks: MockConfig[] = [];
    
    for (const service of externalServices) {
      let scenario: 'success' | 'error' = 'success';
      let customResponse: any = undefined;
      
      // Check for error indicators in input
      if (inputData.error || inputData.fail || inputData.invalid) {
        scenario = 'error';
      }
      
      // Check for specific mock data in input
      const mockKey = `mock_${service.nodeName}`;
      if (inputData[mockKey]) {
        customResponse = inputData[mockKey];
      }
      
      mocks.push(this.generateMockConfig(
        service.nodeType,
        service.nodeName,
        customResponse,
        scenario
      ));
    }
    
    return mocks;
  }
}