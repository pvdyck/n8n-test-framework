import { BaseTestRunner } from './BaseTestRunner';
import { DataInjector } from './DataInjector';
import { OutputValidator } from '../assertions/OutputValidator';
import { TriggerSimulator } from './TriggerSimulator';
import { 
  TriggerTest, 
  TriggerConfig, 
  WebhookTrigger,
  ScheduleTrigger,
  EmailTrigger,
  WebSocketTrigger,
  FileSystemTrigger,
  CustomTrigger
} from '../types/trigger';
import { TestResult, TestConfig } from '../types';
import * as fs from 'fs/promises';

export class TriggerTestRunner extends BaseTestRunner {
  private triggerSimulator: TriggerSimulator;
  protected dataInjector: DataInjector;
  protected validator: OutputValidator;
  
  constructor(config: TestConfig = {}) {
    super(config);
    this.triggerSimulator = new TriggerSimulator(
      `http://localhost:${config.mockServerPort || 3456}`
    );
    this.dataInjector = new DataInjector();
    this.validator = new OutputValidator();
  }
  
  async runTriggerTest(test: TriggerTest): Promise<TestResult> {
    this.emit('test:start', test);
    const startTime = Date.now();
    
    // Use the withMockServer helper to ensure mock server is running
    return await this.withMockServer(async () => {
      // Use the withTestMocks helper to manage test-specific mocks
      return await this.withTestMocks(test.mocks, async () => {
        try {
          // Load and prepare workflow
          const workflowPath = test.workflow;
          const workflowContent = await fs.readFile(workflowPath, 'utf8');
          const workflow = JSON.parse(workflowContent);
          // Find trigger node
          const triggerNode = this.findTriggerNode(workflow, test.trigger);
          if (!triggerNode) {
            throw new Error(`Trigger node not found: ${test.trigger.nodeName || test.trigger.nodeId}`);
          }
          // Start workflow in test mode (this would need n8n API support)
          const workflowExecution = await this.startWorkflowWithTrigger(
            workflow,
            triggerNode,
            test
          );
          // Execute trigger based on type
          await this.executeTrigger(test.trigger, workflow);
          // Wait for workflow execution to complete
          const executionResult = await this.waitForWorkflowExecution(
            workflowExecution.id,
            test.triggerTimeout || test.timeout || 30000
          );
          // Validate results
          const validation = test.expectedOutputs 
            ? await this.validator.validate(executionResult.output, test.expectedOutputs)
            : { passed: true };
          const result: TestResult = {
            name: test.name,
            status: validation.passed ? 'passed' : 'failed',
            duration: Date.now() - startTime,
            output: executionResult.output,
            validation
          };
      
          this.emit('test:complete', result);
          return result;
          
        } catch (error: any) {
          const result: TestResult = {
            name: test.name,
            status: 'error',
            duration: Date.now() - startTime,
            error: error.message
          };
          
          this.emit('test:complete', result);
          return result;
          
        } finally {
          // Cleanup
          if (test.autoCleanup !== false) {
            await this.triggerSimulator.cleanup();
          }
        }
      });
    });
  }
  
  private findTriggerNode(workflow: any, trigger: TriggerConfig): any {
    return workflow.nodes.find((node: any) => {
      if (trigger.nodeId && node.id === trigger.nodeId) return true;
      if (trigger.nodeName && node.name === trigger.nodeName) return true;
      
      // Auto-detect trigger nodes
      const triggerNodeTypes: Record<string, string[]> = {
        webhook: ['n8n-nodes-base.webhook', 'n8n-nodes-base.webhookTrigger'],
        schedule: ['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.cron'],
        email: ['n8n-nodes-base.emailReadImap', 'n8n-nodes-base.emailTrigger'],
        websocket: ['n8n-nodes-base.websocketTrigger'],
        filesystem: ['n8n-nodes-base.localFileTrigger'],
        custom: []
      };
      
      const nodeTypes = triggerNodeTypes[trigger.type] || [];
      return nodeTypes.includes(node.type);
    });
  }
  
  private async startWorkflowWithTrigger(
    workflow: any,
    triggerNode: any,
    test: TriggerTest
  ): Promise<{ id: string }> {
    // In a real implementation, this would use n8n's API to start
    // the workflow in a mode where it waits for triggers
    
    // For now, we'll simulate this by modifying the workflow
    // to start with our test data injection after the trigger
    const modifiedWorkflow = {
      ...workflow,
      nodes: workflow.nodes.map((node: any) => {
        if (node.id === triggerNode.id || node.name === triggerNode.name) {
          // Mark this as the trigger node
          return {
            ...node,
            parameters: {
              ...node.parameters,
              _testMode: true,
              _testId: test.name
            }
          };
        }
        return node;
      })
    };
    
    // Save modified workflow
    await this.dataInjector.saveWorkflow(modifiedWorkflow);
    
    // Return simulated execution ID
    return {
      id: `test-execution-${Date.now()}`
    };
  }
  
  private async executeTrigger(
    trigger: TriggerConfig,
    workflow: any
  ): Promise<any> {
    switch (trigger.type) {
      case 'webhook':
        return this.executeWebhookTrigger(trigger.config as WebhookTrigger, workflow);
        
      case 'schedule':
        return this.executeScheduleTrigger(trigger.config as ScheduleTrigger);
        
      case 'email':
        return this.executeEmailTrigger(trigger.config as EmailTrigger);
        
      case 'websocket':
        return this.executeWebSocketTrigger(trigger.config as WebSocketTrigger);
        
      case 'filesystem':
        return this.executeFileSystemTrigger(trigger.config as FileSystemTrigger);
        
      case 'custom':
        return this.executeCustomTrigger(trigger.config as CustomTrigger, workflow);
        
      default:
        throw new Error(`Unknown trigger type: ${trigger.type}`);
    }
  }
  
  private async executeWebhookTrigger(
    config: WebhookTrigger,
    workflow: any
  ): Promise<any> {
    // Build webhook URL based on workflow
    const webhookUrl = this.buildWebhookUrl(workflow, config.path);
    
    const result = await this.triggerSimulator.triggerWebhook({
      url: webhookUrl,
      method: config.method,
      headers: config.headers,
      body: config.body,
      query: config.query
    });
    
    // Validate response if expected
    if (config.expectedStatus && result.status !== config.expectedStatus) {
      throw new Error(
        `Webhook returned status ${result.status}, expected ${config.expectedStatus}`
      );
    }
    
    if (config.expectedResponse) {
      const validation = await this.validator.validate(
        result.data,
        config.expectedResponse
      );
      if (!validation.passed) {
        throw new Error(`Webhook response validation failed: ${validation.message}`);
      }
    }
    
    return result;
  }
  
  private async executeScheduleTrigger(config: ScheduleTrigger): Promise<any> {
    if (config.triggerNow) {
      // For testing, trigger immediately
      return this.triggerSimulator.triggerScheduleNow('schedule-trigger');
    }
    
    // Set up schedule and wait for triggers
    const triggers: any[] = [];
    const targetCount = config.triggerCount || 1;
    
    return new Promise((resolve, reject) => {
      this.triggerSimulator.triggerSchedule(
        'schedule-trigger',
        {
          cronExpression: config.cron,
          timezone: config.timezone
        },
        async () => {
          triggers.push({
            timestamp: new Date(),
            count: triggers.length + 1
          });
          
          if (triggers.length >= targetCount) {
            resolve(triggers);
          }
        }
      ).catch(reject);
    });
  }
  
  private async executeEmailTrigger(config: EmailTrigger): Promise<any> {
    return this.triggerSimulator.triggerEmail({
      from: config.from,
      to: config.to,
      subject: config.subject,
      body: config.body,
      attachments: config.attachments
    });
  }
  
  private async executeWebSocketTrigger(config: WebSocketTrigger): Promise<any> {
    return this.triggerSimulator.triggerWebSocket({
      url: config.url,
      messages: config.messages
    });
  }
  
  private async executeFileSystemTrigger(config: FileSystemTrigger): Promise<any> {
    return this.triggerSimulator.triggerFileSystem(
      'filesystem-trigger',
      config.event,
      config.path,
      config.content
    );
  }
  
  private async executeCustomTrigger(
    config: CustomTrigger,
    workflow: any
  ): Promise<any> {
    const context = {
      workflowId: workflow.id,
      nodeName: 'custom-trigger',
      mockServerUrl: `http://localhost:${this.config.mockServerPort}`,
      emit: (event: string, data: any) => {
        this.triggerSimulator.emit(event, data);
      },
      waitForExecution: (timeout?: number) => {
        return this.waitForWorkflowExecution('custom', timeout || 30000);
      }
    };
    
    return config.handler(context);
  }
  
  private buildWebhookUrl(workflow: any, path: string): string {
    // In real n8n, webhook URLs are generated based on instance URL
    // For testing, we'll use the mock server
    const baseUrl = process.env.N8N_WEBHOOK_BASE_URL || 
                   `http://localhost:${this.config.mockServerPort}`;
    
    // Handle both test and production webhook paths
    if (path.startsWith('http')) {
      return path;
    }
    
    const webhookPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}/webhook${webhookPath}`;
  }
  
  private async waitForWorkflowExecution(
    executionId: string,
    _timeout: number
  ): Promise<any> {
    // In a real implementation, this would poll n8n's API
    // to check execution status
    
    // For now, simulate execution completion
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: executionId,
          status: 'success',
          output: [{
            json: {
              triggered: true,
              timestamp: new Date().toISOString()
            }
          }]
        });
      }, 1000);
    });
  }
  
  async cleanup(): Promise<void> {
    await this.triggerSimulator.cleanup();
    await this.dataInjector.cleanup();
  }
}