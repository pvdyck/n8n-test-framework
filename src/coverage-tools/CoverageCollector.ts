import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowCoverage,
  CoverageReport
} from '../types/coverage';
import { logger } from '../utils/Logger';

export class CoverageCollector {
  private coverage: CoverageReport;
  private currentWorkflow: WorkflowCoverage | null = null;
  private logger = logger.child('CoverageCollector');

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

  async startWorkflow(workflowPath: string): Promise<void> {
    try {
      const workflowContent = await fs.readFile(workflowPath, 'utf8');
      const workflow = JSON.parse(workflowContent);

      const workflowId = workflow.id || path.basename(workflowPath, '.json');
      
      this.currentWorkflow = {
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

      // Initialize node coverage
      for (const node of workflow.nodes || []) {
        const nodeId = node.id || node.name;
        this.currentWorkflow.nodes.set(nodeId, {
          nodeId,
          nodeName: node.name,
          nodeType: node.type,
          executed: false,
          executionCount: 0,
          errorCount: 0
        });
        this.currentWorkflow.totalNodes++;

        // Track node types
        const nodeType = node.type;
        if (!this.coverage.summary.nodeTypeCoverage.has(nodeType)) {
          this.coverage.summary.nodeTypeCoverage.set(nodeType, { total: 0, executed: 0 });
        }
        const typeStats = this.coverage.summary.nodeTypeCoverage.get(nodeType)!;
        typeStats.total++;
      }

      // Initialize connection coverage
      for (const [fromNode, connections] of Object.entries(workflow.connections || {})) {
        for (const [, destinations] of Object.entries(connections as any)) {
          for (const destArray of destinations as any[]) {
            for (const dest of destArray) {
              const connectionId = `${fromNode}->${dest.node}`;
              this.currentWorkflow.connections.set(connectionId, {
                from: fromNode,
                to: dest.node,
                executed: false,
                executionCount: 0
              });
              this.currentWorkflow.totalConnections++;
            }
          }
        }
      }

      // Store or update workflow coverage
      if (this.coverage.workflows.has(workflowId)) {
        const existing = this.coverage.workflows.get(workflowId)!;
        this.currentWorkflow.testCount = existing.testCount;
        this.currentWorkflow.executedNodes = existing.executedNodes;
        this.currentWorkflow.executedConnections = existing.executedConnections;
        
        // Merge execution counts
        for (const [nodeId, node] of existing.nodes) {
          if (this.currentWorkflow.nodes.has(nodeId)) {
            const currentNode = this.currentWorkflow.nodes.get(nodeId)!;
            currentNode.executed = node.executed;
            currentNode.executionCount = node.executionCount;
            currentNode.errorCount = node.errorCount;
          }
        }
        
        for (const [connId, conn] of existing.connections) {
          if (this.currentWorkflow.connections.has(connId)) {
            const currentConn = this.currentWorkflow.connections.get(connId)!;
            currentConn.executed = conn.executed;
            currentConn.executionCount = conn.executionCount;
          }
        }
      }

      this.coverage.workflows.set(workflowId, this.currentWorkflow);
    } catch (error) {
      this.logger.error('Error starting workflow coverage:', error);
    }
  }

  recordNodeExecution(nodeId: string, error?: boolean): void {
    if (!this.currentWorkflow) return;

    const node = this.currentWorkflow.nodes.get(nodeId);
    if (node) {
      if (!node.executed) {
        node.executed = true;
        this.currentWorkflow.executedNodes++;
        
        // Update node type coverage
        const typeStats = this.coverage.summary.nodeTypeCoverage.get(node.nodeType);
        if (typeStats) {
          typeStats.executed++;
        }
      }
      node.executionCount++;
      if (error) {
        node.errorCount++;
      }
    }
  }

  recordConnectionExecution(fromNode: string, toNode: string): void {
    if (!this.currentWorkflow) return;

    const connectionId = `${fromNode}->${toNode}`;
    const connection = this.currentWorkflow.connections.get(connectionId);
    if (connection) {
      if (!connection.executed) {
        connection.executed = true;
        this.currentWorkflow.executedConnections++;
      }
      connection.executionCount++;
    }
  }

  endWorkflow(): void {
    if (this.currentWorkflow) {
      this.currentWorkflow.testCount++;
      this.updateSummary();
    }
    this.currentWorkflow = null;
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

  merge(other: CoverageReport): void {
    // Merge workflow coverage
    for (const [workflowId, otherWorkflow] of other.workflows) {
      if (this.coverage.workflows.has(workflowId)) {
        const thisWorkflow = this.coverage.workflows.get(workflowId)!;
        
        // Merge nodes
        for (const [nodeId, otherNode] of otherWorkflow.nodes) {
          if (thisWorkflow.nodes.has(nodeId)) {
            const thisNode = thisWorkflow.nodes.get(nodeId)!;
            thisNode.executed = thisNode.executed || otherNode.executed;
            thisNode.executionCount += otherNode.executionCount;
            thisNode.errorCount += otherNode.errorCount;
          }
        }
        
        // Merge connections
        for (const [connId, otherConn] of otherWorkflow.connections) {
          if (thisWorkflow.connections.has(connId)) {
            const thisConn = thisWorkflow.connections.get(connId)!;
            thisConn.executed = thisConn.executed || otherConn.executed;
            thisConn.executionCount += otherConn.executionCount;
          }
        }
        
        thisWorkflow.testCount += otherWorkflow.testCount;
      } else {
        this.coverage.workflows.set(workflowId, otherWorkflow);
      }
    }
    
    this.updateSummary();
  }

  reset(): void {
    this.coverage.workflows.clear();
    this.coverage.summary.nodeTypeCoverage.clear();
    this.updateSummary();
  }

  async saveCoverage(outputPath: string): Promise<void> {
    const coverageData = {
      workflows: Array.from(this.coverage.workflows.entries()).map(([id, workflow]) => ({
        id,
        ...workflow,
        nodes: Array.from(workflow.nodes.entries()),
        connections: Array.from(workflow.connections.entries())
      })),
      summary: {
        ...this.coverage.summary,
        nodeTypeCoverage: Array.from(this.coverage.summary.nodeTypeCoverage.entries())
      }
    };

    await fs.writeFile(outputPath, JSON.stringify(coverageData, null, 2));
  }

  async loadCoverage(inputPath: string): Promise<void> {
    try {
      const data = JSON.parse(await fs.readFile(inputPath, 'utf8'));
      
      this.coverage.workflows.clear();
      for (const workflow of data.workflows) {
        const workflowCoverage: WorkflowCoverage = {
          workflowId: workflow.id,
          workflowName: workflow.workflowName,
          workflowPath: workflow.workflowPath,
          nodes: new Map(workflow.nodes),
          connections: new Map(workflow.connections),
          totalNodes: workflow.totalNodes,
          executedNodes: workflow.executedNodes,
          totalConnections: workflow.totalConnections,
          executedConnections: workflow.executedConnections,
          testCount: workflow.testCount
        };
        this.coverage.workflows.set(workflow.id, workflowCoverage);
      }
      
      this.coverage.summary.nodeTypeCoverage = new Map(data.summary.nodeTypeCoverage);
      this.updateSummary();
    } catch (error) {
      this.logger.error('Error loading coverage:', error);
    }
  }
}