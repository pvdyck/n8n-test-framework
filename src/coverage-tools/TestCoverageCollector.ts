import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowCoverage,
  CoverageReport
} from '../types/coverage';
import { logger } from '../utils/Logger';

interface TestScenario {
  testName: string;
  workflow: string;
  testedNodes: Set<string>;
  testedConnections: Set<string>;
  testedPaths: string[];
}

export class TestCoverageCollector {
  private coverage: CoverageReport;
  private currentWorkflow: WorkflowCoverage | null = null;
  private testScenarios: Map<string, TestScenario[]> = new Map();
  private logger = logger.child('TestCoverageCollector');
  
  constructor() {
    this.coverage = {
      workflows: new Map(),
      summary: {
        totalWorkflows: 0,
        totalNodes: 0,
        executedNodes: 0,
        totalConnections: 0,
        executedConnections: 0,
        nodeTypeCoverage: new Map(),
        testCount: 0,
        timestamp: new Date()
      }
    };
  }

  async analyzeTestCoverage(
    workflowPath: string,
    testName: string,
    testInputs: any,
    testExpectations: any,
    testMocks: any[]
  ): Promise<void> {
    try {
      // Load and parse workflow
      const workflowContent = await fs.readFile(workflowPath, 'utf8');
      const workflow = JSON.parse(workflowContent);
      const workflowId = workflow.id || path.basename(workflowPath, '.json');

      // Initialize workflow coverage if needed
      if (!this.coverage.workflows.has(workflowId)) {
        await this.initializeWorkflowCoverage(workflowPath, workflow);
      }

      const workflowCoverage = this.coverage.workflows.get(workflowId)!;
      const testedNodes = new Set<string>();
      const testedConnections = new Set<string>();

      // 1. Mark start/trigger nodes as tested
      const startNodes = workflow.nodes.filter((n: any) => 
        n.type === 'n8n-nodes-base.start' ||
        n.type === 'n8n-nodes-base.webhook' ||
        n.type === 'n8n-nodes-base.scheduleTrigger' ||
        n.type === 'n8n-nodes-base.emailReadImap'
      );
      
      for (const node of startNodes) {
        this.markNodeAsTested(workflowCoverage, node.name || node.id, testedNodes);
      }

      // 2. Analyze which nodes would be executed based on test data
      const executionPath = this.simulateExecutionPath(workflow, testInputs, testExpectations);
      for (const nodeName of executionPath) {
        this.markNodeAsTested(workflowCoverage, nodeName, testedNodes);
      }

      // 3. Mark nodes that have mocks as tested
      for (const mock of testMocks || []) {
        if (mock.nodeName) {
          this.markNodeAsTested(workflowCoverage, mock.nodeName, testedNodes);
        }
        // For sub-workflows
        if (mock.workflowId) {
          const subWorkflowNodes = workflow.nodes.filter((n: any) => 
            n.type === 'n8n-nodes-base.executeWorkflow' &&
            n.parameters?.workflowId?.value === mock.workflowId
          );
          for (const node of subWorkflowNodes) {
            this.markNodeAsTested(workflowCoverage, node.name || node.id, testedNodes);
          }
        }
      }

      // 4. Mark nodes referenced in expectations as tested
      const expectedNodes = this.extractNodesFromExpectations(testExpectations, workflow);
      for (const nodeName of expectedNodes) {
        this.markNodeAsTested(workflowCoverage, nodeName, testedNodes);
      }

      // 5. Trace connections between tested nodes
      this.traceTestedConnections(workflow, testedNodes, testedConnections, workflowCoverage);

      // 6. Update test count
      workflowCoverage.testCount++;

      // 7. Store test scenario
      if (!this.testScenarios.has(workflowId)) {
        this.testScenarios.set(workflowId, []);
      }
      this.testScenarios.get(workflowId)!.push({
        testName,
        workflow: workflowPath,
        testedNodes,
        testedConnections,
        testedPaths: Array.from(testedNodes)
      });

      // Update summary
      this.updateSummary();
      
    } catch (error) {
      this.logger.error('Error analyzing test coverage:', error);
    }
  }

  private async initializeWorkflowCoverage(workflowPath: string, workflow: any): Promise<void> {
    const workflowId = workflow.id || path.basename(workflowPath, '.json');
    
    const workflowCoverage: WorkflowCoverage = {
      workflowId,
      workflowName: workflow.name || workflowId,
      workflowPath,
      nodes: new Map(),
      connections: new Map(),
      totalNodes: 0,
      executedNodes: 0,
      totalConnections: 0,
      executedConnections: 0,
      testCount: 0
    };

    // Initialize nodes
    for (const node of workflow.nodes || []) {
      const nodeId = node.name || node.id;
      workflowCoverage.nodes.set(nodeId, {
        nodeId,
        nodeName: node.name,
        nodeType: node.type,
        executed: false,
        executionCount: 0,
        errorCount: 0
      });
      workflowCoverage.totalNodes++;

      // Track node types
      if (!this.coverage.summary.nodeTypeCoverage.has(node.type)) {
        this.coverage.summary.nodeTypeCoverage.set(node.type, { total: 0, executed: 0 });
      }
      this.coverage.summary.nodeTypeCoverage.get(node.type)!.total++;
    }

    // Initialize connections
    for (const [fromNode, connections] of Object.entries(workflow.connections || {})) {
      for (const [, destinations] of Object.entries(connections as any)) {
        for (const destArray of destinations as any[]) {
          for (const dest of destArray) {
            const connectionId = `${fromNode}->${dest.node}`;
            workflowCoverage.connections.set(connectionId, {
              from: fromNode,
              to: dest.node,
              executed: false,
              executionCount: 0
            });
            workflowCoverage.totalConnections++;
          }
        }
      }
    }

    this.coverage.workflows.set(workflowId, workflowCoverage);
  }

  private markNodeAsTested(
    workflowCoverage: WorkflowCoverage,
    nodeName: string,
    testedNodes: Set<string>
  ): void {
    const node = workflowCoverage.nodes.get(nodeName);
    if (node && !node.executed) {
      node.executed = true;
      node.executionCount++;
      workflowCoverage.executedNodes++;
      
      // Update node type coverage
      const typeStats = this.coverage.summary.nodeTypeCoverage.get(node.nodeType);
      if (typeStats) {
        typeStats.executed++;
      }
    } else if (node) {
      node.executionCount++;
    }
    testedNodes.add(nodeName);
  }

  private simulateExecutionPath(workflow: any, _testInputs: any, _testExpectations: any): string[] {
    const executionPath: string[] = [];
    const visited = new Set<string>();
    const connections = workflow.connections || {};

    // Start from entry points
    const startNodes = workflow.nodes.filter((n: any) => 
      n.type === 'n8n-nodes-base.start' ||
      n.type.includes('Trigger') ||
      n.type.includes('webhook')
    );

    // Trace execution path
    const visit = (nodeName: string) => {
      if (visited.has(nodeName)) return;
      visited.add(nodeName);
      executionPath.push(nodeName);

      const nodeConnections = connections[nodeName]?.main || [];
      for (const outputs of nodeConnections) {
        for (const conn of outputs || []) {
          // Simulate conditional execution based on node type
          const node = workflow.nodes.find((n: any) => n.name === nodeName);
          if (node?.type === 'n8n-nodes-base.if') {
            // For IF nodes, trace both paths in tests
            visit(conn.node);
          } else if (node?.type === 'n8n-nodes-base.switch') {
            // For Switch nodes, trace all possible paths
            visit(conn.node);
          } else {
            // Regular nodes
            visit(conn.node);
          }
        }
      }
    };

    for (const startNode of startNodes) {
      visit(startNode.name || startNode.id);
    }

    return executionPath;
  }

  private extractNodesFromExpectations(expectations: any, workflow: any): string[] {
    const nodes: string[] = [];
    
    // Look for node references in expectations
    // This is a simplified version - could be enhanced
    const findNodeReferences = (obj: any, depth = 0): void => {
      if (depth > 10) return; // Prevent infinite recursion
      
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          // Check if key matches a node name
          const matchingNode = workflow.nodes.find((n: any) => 
            n.name === key || n.name?.toLowerCase() === key.toLowerCase()
          );
          if (matchingNode) {
            nodes.push(matchingNode.name || matchingNode.id);
          }
          
          // Recurse into nested objects
          findNodeReferences(value, depth + 1);
        }
      }
    };

    findNodeReferences(expectations);
    return nodes;
  }

  private traceTestedConnections(
    workflow: any,
    testedNodes: Set<string>,
    testedConnections: Set<string>,
    workflowCoverage: WorkflowCoverage
  ): void {
    const connections = workflow.connections || {};

    for (const fromNode of testedNodes) {
      const nodeConnections = connections[fromNode]?.main || [];
      for (const outputs of nodeConnections) {
        for (const conn of outputs || []) {
          if (testedNodes.has(conn.node)) {
            const connectionId = `${fromNode}->${conn.node}`;
            testedConnections.add(connectionId);
            
            const connection = workflowCoverage.connections.get(connectionId);
            if (connection && !connection.executed) {
              connection.executed = true;
              connection.executionCount++;
              workflowCoverage.executedConnections++;
            } else if (connection) {
              connection.executionCount++;
            }
          }
        }
      }
    }
  }

  private updateSummary(): void {
    const summary = this.coverage.summary;
    
    summary.totalWorkflows = this.coverage.workflows.size;
    summary.totalNodes = 0;
    summary.executedNodes = 0;
    summary.totalConnections = 0;
    summary.executedConnections = 0;
    summary.testCount = 0;

    for (const workflow of this.coverage.workflows.values()) {
      summary.totalNodes += workflow.totalNodes;
      summary.executedNodes += workflow.executedNodes;
      summary.totalConnections += workflow.totalConnections;
      summary.executedConnections += workflow.executedConnections;
      summary.testCount += workflow.testCount;
    }
  }

  getCoverage(): CoverageReport {
    this.updateSummary();
    return this.coverage;
  }

  getTestScenarios(): Map<string, TestScenario[]> {
    return this.testScenarios;
  }

  generateDetailedReport(): any {
    const report: any = {
      summary: {
        totalWorkflows: this.coverage.summary.totalWorkflows,
        totalNodes: this.coverage.summary.totalNodes,
        testedNodes: this.coverage.summary.executedNodes,
        nodeCoverage: this.coverage.summary.totalNodes > 0 
          ? ((this.coverage.summary.executedNodes / this.coverage.summary.totalNodes) * 100).toFixed(2) + '%'
          : '0%',
        totalConnections: this.coverage.summary.totalConnections,
        testedConnections: this.coverage.summary.executedConnections,
        connectionCoverage: this.coverage.summary.totalConnections > 0
          ? ((this.coverage.summary.executedConnections / this.coverage.summary.totalConnections) * 100).toFixed(2) + '%'
          : '0%',
        totalTests: this.coverage.summary.testCount
      },
      workflows: [],
      nodeTypes: []
    };

    // Workflow details
    for (const [workflowId, workflow] of this.coverage.workflows) {
      const scenarios = this.testScenarios.get(workflowId) || [];
      report.workflows.push({
        id: workflowId,
        name: workflow.workflowName,
        nodeCoverage: workflow.totalNodes > 0
          ? ((workflow.executedNodes / workflow.totalNodes) * 100).toFixed(2) + '%'
          : '0%',
        connectionCoverage: workflow.totalConnections > 0
          ? ((workflow.executedConnections / workflow.totalConnections) * 100).toFixed(2) + '%'
          : '0%',
        totalNodes: workflow.totalNodes,
        testedNodes: workflow.executedNodes,
        totalConnections: workflow.totalConnections,
        testedConnections: workflow.executedConnections,
        testCount: workflow.testCount,
        testScenarios: scenarios.map(s => s.testName)
      });
    }

    // Node type coverage
    for (const [nodeType, stats] of this.coverage.summary.nodeTypeCoverage) {
      if (stats.total > 0) {
        report.nodeTypes.push({
          type: nodeType,
          total: stats.total,
          tested: stats.executed,
          coverage: ((stats.executed / stats.total) * 100).toFixed(2) + '%'
        });
      }
    }

    report.nodeTypes.sort((a: any, b: any) => b.total - a.total);

    return report;
  }

  async saveCoverage(outputPath: string): Promise<void> {
    const report = this.generateDetailedReport();
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  }
}