import * as fs from 'fs/promises';
import * as path from 'path';
import { MockConfig } from '../types';

export class DataInjector {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), '.n8n-test-temp');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async prepareTestWorkflow(
    workflowPath: string,
    testInputs?: Record<string, any>,
    mocks?: MockConfig[],
    triggerConfig?: any,
    expectedOutput?: any[],
    testName?: string
  ): Promise<string> {
    // Load the original workflow
    let workflowContent: string;
    try {
      workflowContent = await fs.readFile(workflowPath, 'utf8');
    } catch (error: any) {
      throw new Error(`Failed to read workflow file ${workflowPath}: ${error.message}`);
    }
    
    if (!workflowContent || workflowContent.trim() === '') {
      throw new Error(`Workflow file is empty: ${workflowPath}`);
    }
    
    let workflow: any;
    try {
      workflow = JSON.parse(workflowContent);
    } catch (error: any) {
      throw new Error(`Failed to parse workflow JSON from ${workflowPath}: ${error.message}`);
    }

    // Create a modified version for testing
    const testWorkflow = { ...workflow };
    
    // Add test metadata
    if (testName) {
      testWorkflow.__testName = testName;
    }

    // If test inputs or expected outputs are provided, inject them into the workflow
    if (testInputs || expectedOutput) {
      // Add a Function node at the beginning to inject test data
      const testDataNode = {
        parameters: {
          functionCode: `// Injected test data
const testData = ${JSON.stringify(testInputs)};
return [{json: testData}];`,
          __testData: testInputs,
          __mocks: mocks || [],
          __expectedOutput: expectedOutput
        },
        name: 'Test Data Injection',
        type: 'n8n-nodes-base.function',
        typeVersion: 1,
        position: [250, 200],
        id: 'test-data-injection'
      };

      // Add the test data node
      testWorkflow.nodes = [testDataNode, ...testWorkflow.nodes];

      // Update connections to start from test data node
      const startNode = this.findStartNode(testWorkflow.nodes);
      if (startNode && testWorkflow.connections[startNode.name]) {
        testWorkflow.connections['Test Data Injection'] = testWorkflow.connections[startNode.name];
        delete testWorkflow.connections[startNode.name];
      }
    }

    // Inject trigger data for email and schedule triggers
    if (triggerConfig && triggerConfig.type) {
      testWorkflow.nodes = testWorkflow.nodes.map((node: any) => {
        if (triggerConfig.type === 'email' && node.type === 'n8n-nodes-base.emailReadImap') {
          return {
            ...node,
            parameters: {
              ...node.parameters,
              __triggerData: triggerConfig.config || triggerConfig
            }
          };
        } else if (triggerConfig.type === 'schedule' && node.type === 'n8n-nodes-base.scheduleTrigger') {
          return {
            ...node,
            parameters: {
              ...node.parameters,
              __triggerData: triggerConfig.config || triggerConfig
            }
          };
        }
        return node;
      });
    }

    // Apply mocks by replacing certain nodes
    if (mocks) {
      testWorkflow.nodes = testWorkflow.nodes.map((node: any) => {
        // Only mock nodes that access external resources
        if (!this.shouldMockNode(node.type)) {
          return node; // Keep internal logic nodes as-is
        }

        const mock = mocks.find(m => 
          m.nodeType === node.type && 
          (!m.nodeName || m.nodeName === node.name)
        );

        if (mock) {
          // Replace the node with a Function node that returns mock data
          return {
            ...node,
            type: 'n8n-nodes-base.function',
            typeVersion: 1,
            parameters: {
              functionCode: `// Mock for ${node.type} - ${node.name}
const mockResponse = ${JSON.stringify(mock.response)};
${mock.delay ? `await new Promise(resolve => setTimeout(resolve, ${mock.delay}));` : ''}
// Return mock response
return Array.isArray(mockResponse) ? mockResponse : [{json: mockResponse}];`
            }
          };
        }

        return node;
      });
    }

    // Save the modified workflow to a temporary file
    // Add random suffix to prevent concurrent access conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const tempWorkflowPath = path.join(this.tempDir, `test-workflow-${timestamp}-${random}.json`);
    await fs.writeFile(tempWorkflowPath, JSON.stringify(testWorkflow, null, 2));

    return tempWorkflowPath;
  }

  private findStartNode(nodes: any[]): any {
    // Priority order for start nodes
    const startNodeTypes = [
      'n8n-nodes-base.executeWorkflowTrigger',
      '@n8n/n8n-nodes-langchain.manualChatTrigger',
      'n8n-nodes-base.start',
      'n8n-nodes-base.manualTrigger'
    ];

    for (const nodeType of startNodeTypes) {
      const node = nodes.find(n => n.type === nodeType);
      if (node) return node;
    }

    return null;
  }


  private shouldMockNode(nodeType: string): boolean {
    // Internal nodes that should NEVER be mocked (they contain business logic)
    const internalNodePatterns = [
      // Core data processing
      'code',
      'function',
      'functionItem',
      'set',
      'itemLists',
      'merge',
      'splitInBatches',
      'splitOut',
      'aggregate',
      'summarize',
      'compareDatasets',
      'removeDuplicates',
      'sort',
      'limit',
      'renameKeys',
      
      // Control flow
      'if',
      'switch',
      'filter',
      'errorTrigger',
      'stopAndError',
      'noOp',
      'wait',
      
      // Data transformation
      'dateTime',
      'crypto',
      'html',
      'htmlExtract',
      'markdown',
      'xml',
      'compression',
      'moveBinaryData',
      'convertToFile',
      'extractFromFile',
      'editImage',
      'jwt',
      
      // Workflow control
      'start',
      'manualTrigger',
      'scheduleTrigger',
      'interval',
      'executeWorkflow',
      'executeWorkflowTrigger',
      'stickyNote',
      'form',
      'formTrigger',
      'respondToWebhook', // Special case: usually paired with webhook trigger
      
      // File processing (when working with in-memory data)
      'spreadsheetFile',
      'readPDF',
      'ics'
    ];

    // Check if it's an internal node
    const nodeName = nodeType.split('.').pop() || '';
    if (internalNodePatterns.some(pattern => 
      nodeName === pattern || 
      nodeName.startsWith(pattern)
    )) {
      return false;
    }

    // External node patterns that SHOULD be mocked
    const externalNodePrefixes = [
      // HTTP/Webhooks
      'httpRequest',
      'webhook',
      'graphql',
      
      // Databases
      'postgres',
      'mySql',
      'mongoDb',
      'redis',
      'elasticsearch',
      'crateDb',
      'questDb',
      'timescaleDb',
      'microsoftSql',
      'snowflake',
      'supabase',
      
      // Cloud Storage
      'awsS3',
      'googleDrive',
      'dropbox',
      'box',
      'googleCloudStorage',
      'azureStorage',
      'microsoftOneDrive',
      'nextCloud',
      
      // Communication
      'emailSend',
      'emailReadImap',
      'gmail',
      'microsoftOutlook',
      'slack',
      'discord',
      'telegram',
      'whatsApp',
      'twilio',
      
      // File System (external)
      'ftp',
      'ssh',
      'readBinaryFile',
      'readBinaryFiles',
      'writeBinaryFile',
      'localFileTrigger',
      
      // APIs and Services (anything with Trigger suffix)
      'Trigger'
    ];

    // Check if it matches external patterns
    const isExternal = externalNodePrefixes.some(prefix => 
      nodeName.includes(prefix)
    );

    if (isExternal) {
      return true;
    }

    // Default approach: if it's not in the internal list and appears to be a service integration
    // Most third-party service nodes don't follow a specific pattern but are external
    const isLikelyExternal = 
      // Not a core n8n node
      !nodeType.startsWith('n8n-nodes-base.') ||
      // Or is a known integration pattern
      nodeName.includes('api') ||
      nodeName.includes('cloud') ||
      nodeName.includes('send') ||
      nodeName.includes('read') ||
      nodeName.includes('write') ||
      nodeName.includes('get') ||
      nodeName.includes('post') ||
      nodeName.includes('update') ||
      nodeName.includes('delete') ||
      nodeName.includes('create');

    return isLikelyExternal;
  }

  async saveWorkflow(workflow: any): Promise<string> {
    const tempWorkflowPath = path.join(this.tempDir, `workflow-${Date.now()}.json`);
    await fs.writeFile(tempWorkflowPath, JSON.stringify(workflow, null, 2));
    return tempWorkflowPath;
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}