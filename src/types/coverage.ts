export interface NodeCoverage {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executed: boolean;
  executionCount: number;
  errorCount: number;
}

export interface ConnectionCoverage {
  from: string;
  to: string;
  executed: boolean;
  executionCount: number;
}

export interface WorkflowCoverage {
  workflowId: string;
  workflowName: string;
  workflowPath: string;
  nodes: Map<string, NodeCoverage>;
  connections: Map<string, ConnectionCoverage>;
  totalNodes: number;
  executedNodes: number;
  totalConnections: number;
  executedConnections: number;
  testCount: number;
}

export interface CoverageReport {
  workflows: Map<string, WorkflowCoverage>;
  summary: {
    totalWorkflows: number;
    totalNodes: number;
    executedNodes: number;
    totalConnections: number;
    executedConnections: number;
    nodeTypeCoverage: Map<string, { total: number; executed: number }>;
    testCount: number;
    timestamp: Date;
  };
}

export interface LcovRecord {
  sourceFile: string;
  functionName?: string;
  lineNumber: number;
  executionCount: number;
}