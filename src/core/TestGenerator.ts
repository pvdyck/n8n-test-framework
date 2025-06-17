import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WorkflowAnalyzer, WorkflowAnalysis } from './WorkflowAnalyzer';
import { TestSuite, TestCase, MockConfig } from '../types';

interface SimpleTestCase {
  name: string;
  input?: any;
  trigger?: {
    webhook?: any;
    schedule?: any;
    [key: string]: any;
  };
  expect?: any;
  mocks?: { [nodeName: string]: any };
}

interface SimpleTestSuite {
  test: string;
  workflow: string;
  cases: SimpleTestCase[];
}

export class TestGenerator {
  private workflowAnalyzer: WorkflowAnalyzer;

  constructor() {
    this.workflowAnalyzer = new WorkflowAnalyzer();
  }

  async generateFromSimple(testPath: string): Promise<TestSuite> {
    const content = await fs.readFile(testPath, 'utf8');
    const ext = path.extname(testPath).toLowerCase();
    
    let simpleTest: SimpleTestSuite;
    if (ext === '.yaml' || ext === '.yml') {
      simpleTest = yaml.load(content) as SimpleTestSuite;
    } else {
      simpleTest = JSON.parse(content);
    }
    
    if (!simpleTest || typeof simpleTest !== 'object') {
      throw new Error(`Invalid test file format in ${testPath}`);
    }
    
    // Debug logging
    if (process.env.DEBUG === 'true') {
      console.error('Loaded test data:', JSON.stringify(simpleTest, null, 2));
    }

    // Analyze the workflow
    const workflowPath = path.resolve(path.dirname(testPath), simpleTest.workflow);
    const analysis = await this.workflowAnalyzer.analyzeWorkflow(workflowPath);

    // Convert to full test suite
    return this.convertToFullFormat(simpleTest, analysis);
  }

  async generateFromWorkflow(workflowPath: string): Promise<TestSuite> {
    const analysis = await this.workflowAnalyzer.analyzeWorkflow(workflowPath);
    
    // Look for example files
    const examplesPath = workflowPath.replace('.json', '.examples.json');
    const mocksPath = workflowPath.replace('.json', '.mocks.json');
    
    let examples: any[] = [];
    let defaultMocks: any = {};
    
    try {
      const examplesContent = await fs.readFile(examplesPath, 'utf8');
      examples = JSON.parse(examplesContent);
    } catch (e) {
      // No examples file, generate defaults
      examples = this.generateDefaultExamples(analysis);
    }
    
    try {
      const mocksContent = await fs.readFile(mocksPath, 'utf8');
      defaultMocks = JSON.parse(mocksContent);
    } catch (e) {
      // No mocks file, use analyzer defaults
      defaultMocks = this.generateDefaultMocks(analysis);
    }

    // Create test cases from examples
    const testCases = this.createTestCases(examples, defaultMocks, analysis);

    return {
      name: `${analysis.workflowName} Tests`,
      workflow: workflowPath,
      tests: testCases
    };
  }

  private convertToFullFormat(simple: SimpleTestSuite, analysis: WorkflowAnalysis): TestSuite {
    if (!simple.cases) {
      throw new Error(`Test suite "${simple.test}" has no test cases defined`);
    }
    const tests: TestCase[] = simple.cases.map(testCase => {
      const test: TestCase = {
        name: testCase.name,
        inputs: testCase.input || {},
        expectedOutputs: testCase.expect ? this.formatExpectedOutput(testCase.expect) : [],
        mocks: []
      };

      // Handle trigger-based tests
      if (testCase.trigger) {
        // Convert trigger to inputs
        if (testCase.trigger.webhook) {
          test.inputs = testCase.trigger.webhook;
        } else if (testCase.trigger.schedule) {
          test.inputs = { trigger: 'schedule', ...testCase.trigger.schedule };
        }
        // Mark as trigger test
        test.trigger = {
          type: Object.keys(testCase.trigger)[0] as any,
          nodeName: analysis.triggers[0]?.nodeId || 'Incident Alert Webhook',
          config: testCase.trigger[Object.keys(testCase.trigger)[0]]
        };
      }

      // Generate mocks
      if (testCase.mocks) {
        test.mocks = this.generateMocksFromSimple(testCase.mocks, analysis);
      } else {
        // Auto-generate mocks based on workflow analysis
        test.mocks = this.autoGenerateMocks(analysis, testCase.input || test.inputs);
      }

      return test;
    });

    return {
      name: simple.test,
      workflow: simple.workflow,
      tests
    };
  }

  private formatExpectedOutput(expect: any): any[] {
    // Handle simple format
    if (!Array.isArray(expect)) {
      return [{
        json: expect
      }];
    }
    
    // Already in correct format
    if (expect[0]?.json !== undefined) {
      return expect;
    }
    
    // Array of simple objects
    return expect.map(item => ({ json: item }));
  }

  private generateMocksFromSimple(
    simpleMocks: { [nodeName: string]: any }, 
    analysis: WorkflowAnalysis
  ): MockConfig[] {
    const mocks: MockConfig[] = [];
    
    for (const [nodeName, mockData] of Object.entries(simpleMocks)) {
      const service = analysis.externalServices.find(s => s.nodeName === nodeName);
      if (!service) continue;

      const mock = this.createMockForNode(service, mockData);
      if (mock) mocks.push(mock);
    }

    return mocks;
  }

  private createMockForNode(service: any, mockData: any): MockConfig | null {
    // For all node types, just pass through the mock data
    // The mock executor will return the expected output anyway
    return {
      nodeType: service.nodeType,
      nodeName: service.nodeName,
      response: mockData
    };
  }

  private autoGenerateMocks(analysis: WorkflowAnalysis, inputs: any): MockConfig[] {
    const mocks: MockConfig[] = [];
    
    for (const service of analysis.externalServices) {
      const mock: MockConfig = {
        nodeType: service.nodeType,
        nodeName: service.nodeName,
        response: service.defaultMock || { success: true }
      };
      
      // Customize based on inputs
      if (inputs?.error || inputs?.fail) {
        mock.response = { error: 'Simulated error' };
      }
      
      mocks.push(mock);
    }

    return mocks;
  }

  private generateDefaultExamples(analysis: WorkflowAnalysis): any[] {
    const examples: any[] = [];
    
    // Success case
    const successExample: any = { scenario: 'success' };
    
    // Add fields based on input detection
    for (const input of analysis.inputs) {
      if (input.source === 'manual') {
        // Try to infer from workflow or use defaults
        successExample.email = 'test@example.com';
        successExample.name = 'Test User';
      } else if (input.source === 'webhook') {
        successExample.webhook = {
          body: { test: true }
        };
      }
    }
    
    examples.push(successExample);
    
    // Error case
    examples.push({
      scenario: 'error',
      ...successExample,
      error: true
    });

    return examples;
  }

  private generateDefaultMocks(analysis: WorkflowAnalysis): any {
    const mocks: any = {};
    
    for (const service of analysis.externalServices) {
      mocks[service.nodeName] = {
        success: service.defaultMock,
        error: { error: 'Service error' }
      };
    }

    return mocks;
  }

  private createTestCases(examples: any[], defaultMocks: any, analysis: WorkflowAnalysis): TestCase[] {
    return examples.map((example, index) => {
      const scenario = example.scenario || `Test ${index + 1}`;
      const isError = scenario.includes('error') || example.error;
      
      // Select appropriate mocks
      const mocks: MockConfig[] = [];
      for (const service of analysis.externalServices) {
        const mockData = defaultMocks[service.nodeName];
        const response = isError ? mockData?.error : mockData?.success;
        
        if (response) {
          mocks.push({
            nodeType: service.nodeType,
            nodeName: service.nodeName,
            response
          });
        }
      }

      // Create expected output
      const expectedOutputs = example.expect || 
        (isError ? [{ json: { error: true } }] : [{ json: { success: true } }]);

      // Remove metadata fields
      const inputs = { ...example };
      delete inputs.scenario;
      delete inputs.expect;
      delete inputs.error;

      return {
        name: scenario,
        inputs,
        mocks,
        expectedOutputs: Array.isArray(expectedOutputs) ? expectedOutputs : [{ json: expectedOutputs }]
      };
    });
  }
}