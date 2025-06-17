import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import pLimit from 'p-limit';
import { 
  TestCase, 
  TestSuite, 
  TestResult, 
  TestResults, 
  TestConfig
} from '../types';
import { BaseTestRunner } from './BaseTestRunner';
import { DataInjector } from './DataInjector';
import { OutputValidator } from '../assertions/OutputValidator';
import { ConsoleReporter } from '../reporters/ConsoleReporter';
import { CoverageCollector } from '../coverage-tools/CoverageCollector';
import { TestCoverageCollector } from '../coverage-tools/TestCoverageCollector';
import { LcovReporter } from '../coverage-tools/LcovReporter';
import { CoverageReport } from '../types/coverage';
import { TestGenerator } from './TestGenerator';
import * as yaml from 'js-yaml';
import { logger } from '../utils/Logger';

export class TestRunner extends BaseTestRunner {
  protected dataInjector: DataInjector;
  protected validator: OutputValidator;
  protected coverageCollector: CoverageCollector;
  protected testCoverageCollector: TestCoverageCollector;
  protected coverageEnabled: boolean = false;
  protected config: TestConfig;
  
  constructor(config: TestConfig = {}) {
    super(config);
    this.config = config;
    this.logger = logger.child('TestRunner');
    this.dataInjector = new DataInjector();
    this.validator = new OutputValidator();
    this.coverageCollector = new CoverageCollector();
    this.testCoverageCollector = new TestCoverageCollector();
  }

  enableCoverage(enabled: boolean = true): void {
    this.coverageEnabled = enabled;
  }

  async runTestSuite(suite: TestSuite, testFileDir?: string): Promise<TestResults> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    
    this.emit('suite:start', suite);
    
    // Use the withMockServer helper to manage mock server lifecycle
    return await this.withMockServer(async () => {
      try {
        // Initialize data injector
        await this.dataInjector.init();
        
        // Run setup if defined
        if (suite.setup) {
          await suite.setup();
        }
        
        // Set up test environment
        await this.setupTestEnvironment(suite);
        
        // Run tests with concurrency control
        const limit = pLimit(suite.config?.concurrency || this.config.concurrency || 1);
        const testPromises = suite.tests.map(test => {
          const testWithWorkflow = { ...test };
          if (!testWithWorkflow.workflow && suite.workflow) {
            testWithWorkflow.workflow = suite.workflow;
          }
          // Resolve individual test workflow paths if testFileDir is provided
          if (testWithWorkflow.workflow && testFileDir && !path.isAbsolute(testWithWorkflow.workflow)) {
            testWithWorkflow.workflow = path.resolve(testFileDir, testWithWorkflow.workflow);
          }
          return limit(() => this.runSingleTest(testWithWorkflow, suite));
        });
        
        for (const promise of testPromises) {
          const result = await promise;
          results.push(result);
          
          if (this.config.bail && result.status === 'failed') {
            this.emit('suite:bail', suite);
            break;
          }
        }
        
        // Run teardown if defined
        if (suite.teardown) {
          await suite.teardown();
        }
        
        const testResults: TestResults = {
          suite: suite.name,
          tests: results,
          duration: Date.now() - startTime,
          passed: results.filter(r => r.status === 'passed').length,
          failed: results.filter(r => r.status === 'failed').length,
          errors: results.filter(r => r.status === 'error').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          timestamp: new Date()
        };
        
        this.emit('suite:complete', testResults);
        return testResults;
      } catch (error) {
        this.emit('suite:error', { suite, error });
        throw error;
      } finally {
        // Cleanup temp files
        await this.dataInjector.cleanup();
      }
    });
  }

  private async runSingleTest(test: TestCase, _suite: TestSuite): Promise<TestResult> {
    if (test.skip) {
      return {
        name: test.name,
        status: 'skipped',
        duration: 0
      };
    }
    
    this.emit('test:start', test);
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    const maxAttempts = (test.retries ?? this.config.retries ?? 0) + 1;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Use the withTestMocks helper to manage test-specific mocks
      try {
        const result = await this.withTestMocks(test.mocks, async () => {
          // Check if workflow path exists
          if (!test.workflow) {
            throw new Error('No workflow path specified for test');
          }
          // Start coverage tracking for this workflow
          if (this.coverageEnabled) {
            await this.coverageCollector.startWorkflow(test.workflow);
          }
          // Extract inputs from trigger if available and no explicit inputs
          let inputs = test.inputs;
          if (!inputs && test.trigger && test.trigger.config && test.trigger.config.body) {
            inputs = test.trigger.config.body;
          }
          // Inject test data
          const testWorkflowPath = await this.dataInjector.prepareTestWorkflow(
            test.workflow,
            inputs,
            test.mocks,
            test.trigger,
            test.expectedOutputs,  // Add the expected outputs here!
            test.name
          );
          // Execute workflow with coverage tracking
          const output = await this.executeWorkflow(testWorkflowPath, test.timeout);
          // Analyze test coverage based on the test scenario
          if (this.coverageEnabled) {
            await this.testCoverageCollector.analyzeTestCoverage(
              test.workflow,
              test.name,
              inputs,
              test.expectedOutputs,
              test.mocks || []
            );
            
            // End old coverage tracking
            this.coverageCollector.endWorkflow();
          }
          // Validate results
          const validation = test.expectedOutputs 
            ? await this.validator.validate(output, test.expectedOutputs)
            : { passed: true };
          const result: TestResult = {
            name: test.name,
            status: validation.passed ? 'passed' : 'failed',
            duration: Date.now() - startTime,
            output,
            validation,
            retries: attempt - 1
          };
        
          this.emit('test:complete', result);
          return result;
        });
        
        // If we get here, the test succeeded
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          this.emit('test:retry', { test, attempt, error });
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // All attempts failed
    const result: TestResult = {
      name: test.name,
      status: 'error',
      duration: Date.now() - startTime,
      error: lastError?.message || 'Unknown error',
      retries: maxAttempts - 1
    };
    
    this.emit('test:complete', result);
    return result;
  }

  private async executeWorkflow(workflowPath: string, timeout?: number): Promise<any> {
    // Generate coverage file path if coverage is enabled
    const coverageFile = this.coverageEnabled 
      ? path.join(process.cwd(), `.coverage-${Date.now()}.json`)
      : undefined;
    
    const env = {
      ...process.env,
      ...this.config.environment,
      N8N_TEST_MODE: 'true',
      MOCK_SERVER_URL: `http://localhost:${this.config.mockServerPort}`,
      ...(coverageFile && { N8N_COVERAGE_FILE: coverageFile })
    };

    // Use our mock n8n executable
    const mockN8nPath = path.join(__dirname, '../../bin/mock-n8n.ts');
    const n8nPath = process.env.N8N_PATH || `npx tsx ${mockN8nPath}`;
    const command = `${n8nPath} execute --file="${workflowPath}" --rawOutput`;
    const options = {
      env,
      encoding: 'utf8' as const,
      timeout: timeout || this.config.timeout
    };
    
    try {
      const output = execSync(command, options);
      
      // Process coverage data if available
      if (coverageFile && this.coverageEnabled) {
        try {
          const coverageData = JSON.parse(await fs.readFile(coverageFile, 'utf8'));
          
          // Record node executions
          for (const node of coverageData.executedNodes || []) {
            this.coverageCollector.recordNodeExecution(node.nodeId);
          }
          
          // Record connection executions
          for (const conn of coverageData.executedConnections || []) {
            this.coverageCollector.recordConnectionExecution(conn.from, conn.to);
          }
          
          // Clean up coverage file
          await fs.unlink(coverageFile).catch(() => {});
        } catch (error) {
          // Ignore coverage errors
          if (process.env.DEBUG === 'true') {
            this.logger.error('Coverage processing error:', error);
          }
        }
      }
      
      return JSON.parse(output);
    } catch (error: any) {
      if (error.status !== 0) {
        throw new Error(`Workflow execution failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async setupTestEnvironment(_suite: TestSuite): Promise<void> {
    // Set up any global test environment
    if (this.config.environment) {
      Object.entries(this.config.environment).forEach(([key, value]) => {
        process.env[key] = value;
      });
    }
  }

  async runAll(pattern: string = '**/*.test.{yaml,yml}'): Promise<TestResults> {
    let testFiles: string[];
    
    // Check if pattern contains comma-separated files (but not glob pattern)
    if (pattern.includes(',') && !pattern.includes('{')) {
      testFiles = pattern.split(',').map(f => f.trim());
    } else {
      const glob = await import('glob');
      testFiles = await glob.glob(pattern, {
        cwd: process.cwd(),
        absolute: false
      });
    }
    
    if (process.env.DEBUG === 'true') {
      this.logger.info('Current directory:', process.cwd());
      this.logger.info('Pattern:', pattern);
      this.logger.info('Found test files:', testFiles);
    }
    
    const allResults: TestResults = {
      suite: 'All Tests',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      timestamp: new Date()
    };
    
    const startTime = Date.now();
    
    for (const file of testFiles) {
      const fullPath = path.resolve(file);
      const content = await fs.readFile(fullPath, 'utf8');
      // Parse YAML
      yaml.load(content) as any;
      // Always use the generator for consistent format
      const generator = new TestGenerator();
      const suiteData = await generator.generateFromSimple(fullPath);
      
      // Suite data is already processed by generator
      const processedSuite = suiteData;
      
      // Resolve workflow path relative to test file
      if (processedSuite.workflow) {
        processedSuite.workflow = path.resolve(path.dirname(fullPath), processedSuite.workflow);
      }
      
      // Pass the test file directory for resolving relative paths
      const testFileDir = path.dirname(fullPath);
      const results = await this.runTestSuite(processedSuite, testFileDir);
      
      allResults.tests.push(...results.tests);
      allResults.passed += results.passed;
      allResults.failed += results.failed;
      allResults.errors += results.errors;
      allResults.skipped += results.skipped;
    }
    
    allResults.duration = Date.now() - startTime;
    
    // Generate report
    const reporter = new ConsoleReporter();
    await reporter.generateReport(allResults);
    
    return allResults;
  }

  getCoverage(): CoverageReport {
    return this.coverageCollector.getCoverage();
  }

  async saveCoverage(outputPath: string): Promise<void> {
    await this.coverageCollector.saveCoverage(outputPath);
  }

  async generateCoverageReports(outputDir: string = './coverage'): Promise<void> {
    // Get both old and new coverage data
    const oldCoverage = this.getCoverage();
    const detailedReport = this.testCoverageCollector.generateDetailedReport();
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate test-based coverage summary
    const summary = this.generateTestCoverageSummary(detailedReport);
    await fs.writeFile(path.join(outputDir, 'summary.txt'), summary);
    
    // Save detailed test coverage report
    await fs.writeFile(
      path.join(outputDir, 'test-coverage.json'), 
      JSON.stringify(detailedReport, null, 2)
    );
    
    // Generate HTML report for test coverage
    await this.generateTestCoverageHtml(detailedReport, path.join(outputDir, 'html'));
    
    // Still generate old reports for compatibility
    const lcovReporter = new LcovReporter();
    await lcovReporter.generateReport(oldCoverage, path.join(outputDir, 'lcov.info'));
    
    // Save raw coverage data
    await this.saveCoverage(path.join(outputDir, 'coverage.json'));
    
    this.logger.info(`\nCoverage reports generated in ${outputDir}/`);
    this.logger.info(summary);
  }
  
  private generateTestCoverageSummary(report: any): string {
    const lines: string[] = [];
    
    lines.push('Test Coverage Summary:');
    lines.push(`Workflows: ${report.summary.totalWorkflows}`);
    lines.push(`Nodes: ${report.summary.testedNodes}/${report.summary.totalNodes} (${report.summary.nodeCoverage})`);
    lines.push(`Connections: ${report.summary.testedConnections}/${report.summary.totalConnections} (${report.summary.connectionCoverage})`);
    lines.push(`Tests run: ${report.summary.totalTests}`);
    lines.push('');
    
    // Top workflows by coverage
    lines.push('Workflow Coverage:');
    const sortedWorkflows = report.workflows.sort((a: any, b: any) => 
      parseFloat(b.nodeCoverage) - parseFloat(a.nodeCoverage)
    );
    
    for (const workflow of sortedWorkflows) {
      lines.push(`  ${workflow.name}: ${workflow.testedNodes}/${workflow.totalNodes} nodes (${workflow.nodeCoverage}), ${workflow.testCount} tests`);
    }
    
    lines.push('');
    lines.push('Node Type Coverage:');
    
    // Show top 20 node types
    const topNodeTypes = report.nodeTypes.slice(0, 20);
    for (const nodeType of topNodeTypes) {
      lines.push(`  ${nodeType.type}: ${nodeType.tested}/${nodeType.total} (${nodeType.coverage})`);
    }
    
    return lines.join('\n');
  }
  
  private async generateTestCoverageHtml(report: any, outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate index.html
    const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <title>n8n Test Coverage Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .metric { display: inline-block; margin-right: 30px; }
    .metric-value { font-size: 24px; font-weight: bold; }
    .good { color: #22c55e; }
    .medium { color: #f59e0b; }
    .poor { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; }
    .progress-bar { width: 100px; height: 20px; background: #e0e0e0; border-radius: 3px; overflow: hidden; display: inline-block; }
    .progress-fill { height: 100%; background: #22c55e; }
  </style>
</head>
<body>
  <h1>n8n Test Coverage Report</h1>
  
  <div class="summary">
    <div class="metric">
      <div>Total Workflows</div>
      <div class="metric-value">${report.summary.totalWorkflows}</div>
    </div>
    <div class="metric">
      <div>Node Coverage</div>
      <div class="metric-value ${this.getCoverageClass(parseFloat(report.summary.nodeCoverage))}">${report.summary.nodeCoverage}</div>
    </div>
    <div class="metric">
      <div>Connection Coverage</div>
      <div class="metric-value ${this.getCoverageClass(parseFloat(report.summary.connectionCoverage))}">${report.summary.connectionCoverage}</div>
    </div>
    <div class="metric">
      <div>Total Tests</div>
      <div class="metric-value">${report.summary.totalTests}</div>
    </div>
  </div>
  
  <h2>Workflow Coverage</h2>
  <table>
    <tr>
      <th>Workflow</th>
      <th>Node Coverage</th>
      <th>Connection Coverage</th>
      <th>Tests</th>
      <th>Test Scenarios</th>
    </tr>
    ${report.workflows.map((w: any) => `
    <tr>
      <td><a href="${w.id}.html">${w.name}</a></td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${w.nodeCoverage}"></div>
        </div>
        ${w.testedNodes}/${w.totalNodes} (${w.nodeCoverage})
      </td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${w.connectionCoverage}"></div>
        </div>
        ${w.testedConnections}/${w.totalConnections} (${w.connectionCoverage})
      </td>
      <td>${w.testCount}</td>
      <td>${w.testScenarios.join(', ')}</td>
    </tr>
    `).join('')}
  </table>
  
  <h2>Node Type Coverage</h2>
  <table>
    <tr>
      <th>Node Type</th>
      <th>Coverage</th>
      <th>Tested/Total</th>
    </tr>
    ${report.nodeTypes.slice(0, 30).map((n: any) => `
    <tr>
      <td>${n.type}</td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${n.coverage}"></div>
        </div>
        ${n.coverage}
      </td>
      <td>${n.tested}/${n.total}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>`;
    
    await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
  }
  
  private getCoverageClass(percentage: number): string {
    if (percentage >= 80) return 'good';
    if (percentage >= 50) return 'medium';
    return 'poor';
  }
}