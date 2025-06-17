import * as fs from 'fs/promises';
import * as path from 'path';
import { CoverageReport, WorkflowCoverage } from '../types/coverage';

export class LcovReporter {
  /**
   * Generate LCOV report from coverage data
   * LCOV format specification: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
   */
  async generateReport(coverage: CoverageReport, outputPath: string): Promise<void> {
    const lcovContent = this.generateLcovContent(coverage);
    await fs.writeFile(outputPath, lcovContent);
  }

  private generateLcovContent(coverage: CoverageReport): string {
    const lines: string[] = [];

    // Handle both array and Map formats
    const workflows = Array.isArray(coverage.workflows) 
      ? coverage.workflows 
      : Array.from(coverage.workflows.values());

    for (const workflow of workflows) {
      lines.push(this.generateWorkflowCoverage(workflow));
    }

    return lines.join('\n');
  }

  private generateWorkflowCoverage(workflow: WorkflowCoverage): string {
    const lines: string[] = [];
    
    // Convert workflow path to relative path
    const relativePath = path.relative(process.cwd(), workflow.workflowPath);
    
    // TN: Test name (optional)
    lines.push(`TN:${workflow.workflowName}`);
    
    // SF: Source file
    lines.push(`SF:${relativePath}`);
    
    // Function coverage (treating nodes as functions)
    let functionIndex = 0;
    const nodeToLine = new Map<string, number>();
    
    // FN: Function start line, function name
    for (const [nodeId, node] of workflow.nodes) {
      functionIndex++;
      const lineNumber = functionIndex * 10; // Assign virtual line numbers
      nodeToLine.set(nodeId, lineNumber);
      lines.push(`FN:${lineNumber},${node.nodeName}_${node.nodeType}`);
    }
    
    // FNDA: Function execution count
    for (const [, node] of workflow.nodes) {
      lines.push(`FNDA:${node.executionCount},${node.nodeName}_${node.nodeType}`);
    }
    
    // FNF: Functions found
    lines.push(`FNF:${workflow.totalNodes}`);
    
    // FNH: Functions hit
    lines.push(`FNH:${workflow.executedNodes}`);
    
    // Branch coverage (treating connections as branches)
    let branchIndex = 0;
    
    // BRDA: Branch data
    for (const [, conn] of workflow.connections) {
      branchIndex++;
      const fromLine = nodeToLine.get(conn.from) || 1;
      const executed = conn.executed ? conn.executionCount : '-';
      lines.push(`BRDA:${fromLine},${branchIndex},0,${executed}`);
    }
    
    // BRF: Branches found
    lines.push(`BRF:${workflow.totalConnections}`);
    
    // BRH: Branches hit
    lines.push(`BRH:${workflow.executedConnections}`);
    
    // Line coverage (using node execution as line coverage)
    const executedLines: Map<number, number> = new Map();
    
    for (const [nodeId, node] of workflow.nodes) {
      const lineNumber = nodeToLine.get(nodeId)!;
      
      // DA: Line data
      lines.push(`DA:${lineNumber},${node.executionCount}`);
      
      if (node.executed) {
        executedLines.set(lineNumber, node.executionCount);
      }
    }
    
    // LF: Lines found
    lines.push(`LF:${workflow.totalNodes}`);
    
    // LH: Lines hit
    lines.push(`LH:${workflow.executedNodes}`);
    
    // End of record
    lines.push('end_of_record');
    
    return lines.join('\n');
  }

  /**
   * Generate coverage summary in LCOV format
   */
  generateSummary(coverage: CoverageReport): string {
    const summary = coverage.summary;
    const lines: string[] = [];
    
    // Overall statistics
    const nodeCoverage = summary.totalNodes > 0 
      ? (summary.executedNodes / summary.totalNodes * 100).toFixed(2)
      : '0.00';
    
    const connectionCoverage = summary.totalConnections > 0
      ? (summary.executedConnections / summary.totalConnections * 100).toFixed(2)
      : '0.00';
    
    lines.push('Coverage Summary:');
    lines.push(`Workflows: ${summary.totalWorkflows}`);
    lines.push(`Nodes: ${summary.executedNodes}/${summary.totalNodes} (${nodeCoverage}%)`);
    lines.push(`Connections: ${summary.executedConnections}/${summary.totalConnections} (${connectionCoverage}%)`);
    lines.push(`Tests run: ${summary.testCount}`);
    lines.push('');
    lines.push('Node Type Coverage:');
    
    // Handle both array and Map formats for nodeTypeCoverage
    const nodeTypeCoverage = Array.isArray(summary.nodeTypeCoverage)
      ? summary.nodeTypeCoverage
      : Array.from(summary.nodeTypeCoverage);
      
    for (const [nodeType, stats] of nodeTypeCoverage) {
      const percentage = stats.total > 0 
        ? (stats.executed / stats.total * 100).toFixed(2)
        : '0.00';
      lines.push(`  ${nodeType}: ${stats.executed}/${stats.total} (${percentage}%)`);
    }
    
    return lines.join('\n');
  }

  /**
   * Generate HTML coverage report
   */
  async generateHtmlReport(coverage: CoverageReport, outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate index.html
    const indexHtml = this.generateIndexHtml(coverage);
    await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
    
    // Generate workflow-specific pages
    const workflows = Array.isArray(coverage.workflows) 
      ? coverage.workflows 
      : Array.from(coverage.workflows.values());
      
    for (const workflow of workflows) {
      const workflowHtml = this.generateWorkflowHtml(workflow);
      const fileName = `${workflow.workflowId}.html`;
      await fs.writeFile(path.join(outputDir, fileName), workflowHtml);
    }
    
    // Generate CSS
    const css = this.generateCss();
    await fs.writeFile(path.join(outputDir, 'style.css'), css);
  }

  private generateIndexHtml(coverage: CoverageReport): string {
    const summary = coverage.summary;
    const nodeCoverage = summary.totalNodes > 0 
      ? (summary.executedNodes / summary.totalNodes * 100).toFixed(2)
      : '0.00';
    
    const connectionCoverage = summary.totalConnections > 0
      ? (summary.executedConnections / summary.totalConnections * 100).toFixed(2)
      : '0.00';

    const workflows = Array.isArray(coverage.workflows) 
      ? coverage.workflows 
      : Array.from(coverage.workflows.values());
      
    const workflowRows = workflows.map(workflow => {
      const nodePercentage = workflow.totalNodes > 0
        ? (workflow.executedNodes / workflow.totalNodes * 100).toFixed(2)
        : '0.00';
      
      const connPercentage = workflow.totalConnections > 0
        ? (workflow.executedConnections / workflow.totalConnections * 100).toFixed(2)
        : '0.00';
      
      return `
        <tr>
          <td><a href="${workflow.workflowId}.html">${workflow.workflowName}</a></td>
          <td>${workflow.executedNodes}/${workflow.totalNodes} (${nodePercentage}%)</td>
          <td>${workflow.executedConnections}/${workflow.totalConnections} (${connPercentage}%)</td>
          <td>${workflow.testCount}</td>
        </tr>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>n8n Workflow Coverage Report</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>n8n Workflow Coverage Report</h1>
  
  <div class="summary">
    <h2>Overall Coverage</h2>
    <div class="metrics">
      <div class="metric">
        <div class="label">Node Coverage</div>
        <div class="value">${nodeCoverage}%</div>
        <div class="bar">
          <div class="fill" style="width: ${nodeCoverage}%"></div>
        </div>
        <div class="details">${summary.executedNodes} of ${summary.totalNodes} nodes</div>
      </div>
      
      <div class="metric">
        <div class="label">Connection Coverage</div>
        <div class="value">${connectionCoverage}%</div>
        <div class="bar">
          <div class="fill" style="width: ${connectionCoverage}%"></div>
        </div>
        <div class="details">${summary.executedConnections} of ${summary.totalConnections} connections</div>
      </div>
      
      <div class="metric">
        <div class="label">Tests Run</div>
        <div class="value">${summary.testCount}</div>
      </div>
    </div>
  </div>
  
  <div class="workflows">
    <h2>Workflow Coverage</h2>
    <table>
      <thead>
        <tr>
          <th>Workflow</th>
          <th>Node Coverage</th>
          <th>Connection Coverage</th>
          <th>Tests</th>
        </tr>
      </thead>
      <tbody>
        ${workflowRows}
      </tbody>
    </table>
  </div>
  
  <div class="footer">
    Generated on ${new Date().toLocaleString()}
  </div>
</body>
</html>
    `;
  }

  private generateWorkflowHtml(workflow: WorkflowCoverage): string {
    const nodeRows = Array.from(workflow.nodes.values()).map(node => {
      const status = node.executed ? 'covered' : 'uncovered';
      const errorClass = node.errorCount > 0 ? 'has-errors' : '';
      
      return `
        <tr class="${status} ${errorClass}">
          <td>${node.nodeName}</td>
          <td>${node.nodeType}</td>
          <td>${node.executionCount}</td>
          <td>${node.errorCount}</td>
          <td><span class="status-${status}">${status}</span></td>
        </tr>
      `;
    }).join('');

    const connectionRows = Array.from(workflow.connections.values()).map(conn => {
      const status = conn.executed ? 'covered' : 'uncovered';
      
      return `
        <tr class="${status}">
          <td>${conn.from}</td>
          <td>${conn.to}</td>
          <td>${conn.executionCount}</td>
          <td><span class="status-${status}">${status}</span></td>
        </tr>
      `;
    }).join('');

    const nodePercentage = workflow.totalNodes > 0
      ? (workflow.executedNodes / workflow.totalNodes * 100).toFixed(2)
      : '0.00';
    
    const connPercentage = workflow.totalConnections > 0
      ? (workflow.executedConnections / workflow.totalConnections * 100).toFixed(2)
      : '0.00';

    return `
<!DOCTYPE html>
<html>
<head>
  <title>${workflow.workflowName} - Coverage Report</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>${workflow.workflowName}</h1>
  <p class="breadcrumb"><a href="index.html">← Back to summary</a></p>
  
  <div class="summary">
    <div class="metrics">
      <div class="metric">
        <div class="label">Node Coverage</div>
        <div class="value">${nodePercentage}%</div>
        <div class="bar">
          <div class="fill" style="width: ${nodePercentage}%"></div>
        </div>
        <div class="details">${workflow.executedNodes} of ${workflow.totalNodes} nodes</div>
      </div>
      
      <div class="metric">
        <div class="label">Connection Coverage</div>
        <div class="value">${connPercentage}%</div>
        <div class="bar">
          <div class="fill" style="width: ${connPercentage}%"></div>
        </div>
        <div class="details">${workflow.executedConnections} of ${workflow.totalConnections} connections</div>
      </div>
    </div>
  </div>
  
  <div class="details-section">
    <h2>Node Coverage</h2>
    <table>
      <thead>
        <tr>
          <th>Node Name</th>
          <th>Type</th>
          <th>Executions</th>
          <th>Errors</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${nodeRows}
      </tbody>
    </table>
  </div>
  
  <div class="details-section">
    <h2>Connection Coverage</h2>
    <table>
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>Executions</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${connectionRows}
      </tbody>
    </table>
  </div>
  
  <div class="footer">
    Generated on ${new Date().toLocaleString()}
  </div>
</body>
</html>
    `;
  }

  private generateCss(): string {
    return `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
  color: #333;
}

h1, h2 {
  color: #2c3e50;
}

.breadcrumb {
  margin: 10px 0;
}

.breadcrumb a {
  color: #3498db;
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

.summary {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.metric {
  text-align: center;
}

.metric .label {
  font-size: 14px;
  color: #666;
  margin-bottom: 5px;
}

.metric .value {
  font-size: 36px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 10px;
}

.metric .bar {
  height: 10px;
  background: #ecf0f1;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 5px;
}

.metric .bar .fill {
  height: 100%;
  background: #27ae60;
  transition: width 0.3s ease;
}

.metric .details {
  font-size: 12px;
  color: #95a5a6;
}

.workflows, .details-section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

th {
  background: #ecf0f1;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}

td {
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;
}

tr:hover {
  background: #f8f9fa;
}

tr.covered {
  background: #d4edda;
}

tr.uncovered {
  background: #f8d7da;
}

tr.has-errors {
  background: #fff3cd;
}

.status-covered {
  color: #27ae60;
  font-weight: 600;
}

.status-uncovered {
  color: #e74c3c;
  font-weight: 600;
}

a {
  color: #3498db;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.footer {
  text-align: center;
  color: #95a5a6;
  font-size: 12px;
  margin-top: 40px;
}
    `;
  }
}