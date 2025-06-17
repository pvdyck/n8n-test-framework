import * as fs from 'fs/promises';

interface WorkflowNode {
  name: string;
  type: string;
  parameters?: any;
  position?: number[];
}

interface WorkflowConnection {
  [key: string]: {
    main: Array<Array<{ node: string; type: string; index: number }>>;
  };
}

interface Workflow {
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection;
}

interface InputRequirement {
  source: 'manual' | 'webhook' | 'schedule' | 'email' | 'form';
  nodeId: string;
  nodeName: string;
  parameters?: any;
  dataStructure?: any;
}

interface ExternalService {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  category: string;
  mockable: boolean;
  defaultMock?: any;
}

interface OutputStructure {
  nodeId: string;
  nodeName: string;
  dataPath: string[];
  structure?: any;
}

interface WorkflowAnalysis {
  workflowName: string;
  inputs: InputRequirement[];
  externalServices: ExternalService[];
  outputs: OutputStructure[];
  triggers: any[];
  dataFlow: string[];
}

export class WorkflowAnalyzer {
  private nodeCategories = {
    http: ['httpRequest', 'webhook', 'graphql'],
    database: ['postgres', 'mysql', 'mongodb', 'redis'],
    email: ['emailSend', 'gmail', 'emailReadImap'],
    storage: ['s3', 'googleDrive', 'dropbox', 'ftp'],
    messaging: ['slack', 'discord', 'telegram', 'twilio'],
    api: ['api', 'oauth2', 'jwt'],
    internal: ['function', 'set', 'if', 'switch', 'merge', 'code']
  };

  async analyzeWorkflow(workflowPath: string): Promise<WorkflowAnalysis> {
    const content = await fs.readFile(workflowPath, 'utf8');
    const workflow: Workflow = JSON.parse(content);

    const inputs = this.detectInputs(workflow);
    const externalServices = this.detectExternalServices(workflow);
    const outputs = this.detectOutputs(workflow);
    const triggers = this.detectTriggers(workflow);
    const dataFlow = this.traceDataFlow(workflow);

    return {
      workflowName: workflow.name,
      inputs,
      externalServices,
      outputs,
      triggers,
      dataFlow
    };
  }

  private detectInputs(workflow: Workflow): InputRequirement[] {
    const inputs: InputRequirement[] = [];
    
    for (const node of workflow.nodes) {
      // Manual/Start nodes
      if (node.type.includes('start') || node.type.includes('manualTrigger')) {
        inputs.push({
          source: 'manual',
          nodeId: node.name,
          nodeName: node.name,
          parameters: node.parameters
        });
      }
      // Webhook triggers
      else if (node.type.includes('webhook')) {
        inputs.push({
          source: 'webhook',
          nodeId: node.name,
          nodeName: node.name,
          parameters: node.parameters,
          dataStructure: this.extractWebhookStructure(node)
        });
      }
      // Schedule triggers
      else if (node.type.includes('scheduleTrigger') || node.type.includes('cron')) {
        inputs.push({
          source: 'schedule',
          nodeId: node.name,
          nodeName: node.name,
          parameters: node.parameters
        });
      }
      // Email triggers
      else if (node.type.includes('emailReadImap') || node.type.includes('emailTrigger')) {
        inputs.push({
          source: 'email',
          nodeId: node.name,
          nodeName: node.name,
          parameters: node.parameters
        });
      }
      // Form triggers
      else if (node.type.includes('form')) {
        inputs.push({
          source: 'form',
          nodeId: node.name,
          nodeName: node.name,
          parameters: node.parameters,
          dataStructure: this.extractFormStructure(node)
        });
      }
    }

    return inputs;
  }

  private detectExternalServices(workflow: Workflow): ExternalService[] {
    const services: ExternalService[] = [];
    
    for (const node of workflow.nodes) {
      const nodeTypeName = node.type.split('.').pop() || '';
      const category = this.categorizeNode(nodeTypeName);
      
      // Skip internal processing nodes
      if (category === 'internal') continue;
      
      const isExternal = this.isExternalService(node.type);
      if (isExternal) {
        services.push({
          nodeId: node.name,
          nodeName: node.name,
          nodeType: node.type,
          category: category,
          mockable: true,
          defaultMock: this.generateDefaultMock(node)
        });
      }
    }

    return services;
  }

  private detectOutputs(workflow: Workflow): OutputStructure[] {
    const outputs: OutputStructure[] = [];
    const connections = workflow.connections;
    
    // Find nodes with no outgoing connections (end nodes)
    const endNodes = workflow.nodes.filter(node => {
      const hasOutgoing = connections[node.name]?.main?.[0]?.length > 0;
      return !hasOutgoing;
    });

    // Also check for explicit output nodes
    const outputNodes = workflow.nodes.filter(node => 
      node.type.includes('respond') || 
      node.type.includes('output') ||
      node.name.toLowerCase().includes('output')
    );

    const allOutputNodes = [...new Set([...endNodes, ...outputNodes])];

    for (const node of allOutputNodes) {
      outputs.push({
        nodeId: node.name,
        nodeName: node.name,
        dataPath: this.tracePathToNode(workflow, node.name),
        structure: this.inferOutputStructure(workflow, node)
      });
    }

    return outputs;
  }

  private detectTriggers(workflow: Workflow): any[] {
    return workflow.nodes
      .filter(node => 
        node.type.includes('Trigger') || 
        node.type.includes('webhook') ||
        node.type.includes('cron')
      )
      .map(node => ({
        nodeId: node.name,
        nodeType: node.type,
        parameters: node.parameters
      }));
  }

  private traceDataFlow(workflow: Workflow): string[] {
    const flow: string[] = [];
    const visited = new Set<string>();
    const connections = workflow.connections;

    // Start from trigger/start nodes
    const startNodes = workflow.nodes.filter(node => 
      this.isStartNode(node.type)
    );

    for (const startNode of startNodes) {
      this.dfs(startNode.name, connections, workflow.nodes, flow, visited);
    }

    return flow;
  }

  private dfs(
    nodeName: string, 
    connections: WorkflowConnection, 
    nodes: WorkflowNode[], 
    flow: string[], 
    visited: Set<string>
  ): void {
    if (visited.has(nodeName)) return;
    
    visited.add(nodeName);
    flow.push(nodeName);

    const nodeConnections = connections[nodeName]?.main?.[0] || [];
    for (const conn of nodeConnections) {
      this.dfs(conn.node, connections, nodes, flow, visited);
    }
  }

  private categorizeNode(nodeType: string): string {
    for (const [category, patterns] of Object.entries(this.nodeCategories)) {
      if (patterns.some(pattern => nodeType.includes(pattern))) {
        return category;
      }
    }
    return 'other';
  }

  private isExternalService(nodeType: string): boolean {
    const internalPatterns = [
      'start', 'function', 'set', 'if', 'switch', 'merge', 
      'code', 'filter', 'sort', 'limit', 'aggregate'
    ];
    
    const nodeTypeName = nodeType.split('.').pop() || '';
    return !internalPatterns.some(pattern => nodeTypeName.includes(pattern));
  }

  private isStartNode(nodeType: string): boolean {
    return nodeType.includes('start') || 
           nodeType.includes('Trigger') || 
           nodeType.includes('webhook');
  }

  private generateDefaultMock(node: WorkflowNode): any {
    const nodeType = node.type.split('.').pop() || '';
    
    // HTTP requests
    if (nodeType.includes('httpRequest')) {
      return {
        status: 200,
        body: { success: true, id: 'mock-id' }
      };
    }
    
    // Email
    if (nodeType.includes('email')) {
      return {
        success: true,
        messageId: 'mock-message-id'
      };
    }
    
    // Database
    if (nodeType.includes('postgres') || nodeType.includes('mysql')) {
      return {
        rows: [{ id: 1, created: true }],
        rowCount: 1
      };
    }
    
    // MongoDB
    if (nodeType.includes('mongo')) {
      return {
        acknowledged: true,
        insertedId: 'mock-id'
      };
    }
    
    // Default
    return { success: true };
  }

  private extractWebhookStructure(_node: WorkflowNode): any {
    // Try to infer from parameters or return generic structure
    return {
      body: {},
      headers: {},
      query: {}
    };
  }

  private extractFormStructure(node: WorkflowNode): any {
    if (node.parameters?.formFields) {
      return node.parameters.formFields;
    }
    return {};
  }

  private tracePathToNode(_workflow: Workflow, _targetNode: string): string[] {
    // Simple BFS to find path from start to target
    const path: string[] = [];
    // Implementation would trace back from target to start
    return path;
  }

  private inferOutputStructure(workflow: Workflow, outputNode: WorkflowNode): any {
    // Analyze node type and parameters to infer structure
    if (outputNode.type.includes('respond')) {
      return { response: {} };
    }
    return {};
  }
}