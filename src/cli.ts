#!/usr/bin/env npx ts-node

import { Command } from 'commander';
import { TestRunner } from './core/TestRunner';
import { TriggerTestRunner } from './core/TriggerTestRunner';
import { ConsoleReporter } from './reporters/ConsoleReporter';
import { JUnitReporter } from './reporters/JUnitReporter';
import { JsonReporter } from './reporters/JsonReporter';
import { WorkflowAnalyzer } from './core/WorkflowAnalyzer';
import { TestGenerator } from './core/TestGenerator';
import { MockGenerator } from './core/MockGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { logger } from './utils/Logger';

const program = new Command();
const cliLogger = logger.child('CLI');

program
  .name('n8n-test')
  .description('Test framework for n8n workflows')
  .version('1.0.0');

// Run tests command
program
  .command('run [files...]')
  .description('Run n8n workflow tests')
  .option('-p, --pattern <pattern>', 'Test file pattern', '**/*.test.{yaml,yml}')
  .option('-c, --concurrency <number>', 'Number of concurrent tests', '1')
  .option('-t, --timeout <ms>', 'Test timeout in milliseconds', '30000')
  .option('-r, --retries <number>', 'Number of retries for failed tests', '0')
  .option('-b, --bail', 'Stop on first test failure')
  .option('--reporter <type>', 'Test reporter (console, json, junit)', 'console')
  .option('-o, --output <file>', 'Output file for reports')
  .option('--verbose', 'Verbose output')
  .option('--debug', 'Debug mode')
  .option('--coverage', 'Enable coverage tracking')
  .option('--coverage-dir <dir>', 'Coverage output directory', './coverage')
  .option('--trigger', 'Run trigger tests')
  .action(async (files, options) => {
    if (options.debug) {
      process.env.DEBUG = 'true';
    }

    const config = {
      concurrency: parseInt(options.concurrency),
      timeout: parseInt(options.timeout),
      retries: parseInt(options.retries),
      bail: options.bail
    };

    let runner;
    if (options.trigger) {
      runner = new TriggerTestRunner(config);
    } else {
      runner = new TestRunner(config);
    }

    if (options.coverage) {
      runner.enableCoverage(true);
    }

    // Add event listeners for verbose output
    if (options.verbose) {
      runner.on('suite:start', (suite) => {
        cliLogger.info(`\nStarting suite: ${suite.name}`);
      });

      runner.on('test:start', (test) => {
        cliLogger.info(`  Running: ${test.name}`);
      });

      runner.on('test:complete', (result) => {
        const icon = result.status === 'passed' ? '✓' : '✗';
        cliLogger.info(`  ${icon} ${result.name} (${result.duration}ms)`);
      });
    }

    try {
      // Use specific files if provided, otherwise use pattern
      const testPattern = files && files.length > 0 ? files.join(',') : options.pattern;
      const results = await runner.runAll(testPattern);

      // Generate coverage reports if enabled
      if (options.coverage) {
        await runner.generateCoverageReports(options.coverageDir);
      }

      // Generate test report
      let reporter;
      switch (options.reporter) {
        case 'json':
          reporter = new JsonReporter();
          break;
        case 'junit':
          reporter = new JUnitReporter();
          break;
        default:
          reporter = new ConsoleReporter();
      }

      const report = await reporter.generateReport(results);

      if (options.output && options.reporter !== 'console') {
        await fs.writeFile(options.output, report as string);
        cliLogger.info(`\nReport written to: ${options.output}`);
      }

      // Exit with error code if tests failed
      if (results.failed > 0 || results.errors > 0) {
        process.exit(1);
      }
    } catch (error) {
      cliLogger.error('Error running tests:', error);
      process.exit(1);
    }
  });

// Create test command
program
  .command('create-test <name>')
  .description('Create a new test file')
  .option('-w, --workflow <file>', 'Workflow file to test')
  .option('--trigger', 'Create trigger test')
  .action(async (name, options) => {
    const testName = name.endsWith('.test.json') ? name : `${name}.test.json`;
    const testPath = path.join('tests', testName);

    let testContent;
    if (options.trigger) {
      testContent = {
        name: name.replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        tests: [
          {
            name: "Test webhook trigger",
            workflow: options.workflow || "./workflows/my-workflow.json",
            trigger: {
              type: "webhook",
              config: {
                type: "webhook",
                path: "test-webhook",
                method: "POST",
                body: {
                  test: "data"
                },
                expectedStatus: 200
              }
            },
            mocks: [],
            expectedOutputs: {
              success: true
            }
          }
        ]
      };
    } else {
      testContent = {
        name: name.replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        workflow: options.workflow || "./workflows/my-workflow.json",
        tests: [
          {
            name: "Test case 1",
            inputs: {
              testData: "value"
            },
            mocks: [],
            expectedOutputs: {
              result: "expected"
            }
          }
        ]
      };
    }

    await fs.mkdir(path.dirname(testPath), { recursive: true });
    await fs.writeFile(testPath, JSON.stringify(testContent, null, 2));

    cliLogger.info(`Test file created: ${testPath}`);
  });

// Init command
program
  .command('init')
  .description('Initialize test framework structure')
  .action(async () => {
    const dirs = ['tests', 'workflows', 'coverage'];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
      cliLogger.info(`Created directory: ${dir}`);
    }

    // Create sample test
    const sampleTest = {
      name: "Sample Test Suite",
      workflow: "./workflows/sample.json",
      tests: [
        {
          name: "Should process data correctly",
          inputs: {
            message: "Hello, n8n!"
          },
          expectedOutputs: {
            processed: true,
            message: "Hello, n8n!"
          }
        }
      ]
    };

    await fs.writeFile(
      'tests/sample.test.json',
      JSON.stringify(sampleTest, null, 2)
    );

    // Create sample workflow
    const sampleWorkflow = {
      name: "Sample Workflow",
      nodes: [
        {
          parameters: {},
          name: "Start",
          type: "n8n-nodes-base.start",
          typeVersion: 1,
          position: [250, 300]
        },
        {
          parameters: {
            functionCode: "return [{json: {processed: true, ...items[0].json}}];"
          },
          name: "Process",
          type: "n8n-nodes-base.function",
          typeVersion: 1,
          position: [450, 300]
        }
      ],
      connections: {
        "Start": {
          "main": [[{ "node": "Process", "type": "main", "index": 0 }]]
        }
      }
    };

    await fs.writeFile(
      'workflows/sample.json',
      JSON.stringify(sampleWorkflow, null, 2)
    );

    cliLogger.info('\nTest framework initialized!');
    cliLogger.info('Run "n8n-test run" to execute the sample test');
  });

// Coverage command
program
  .command('coverage')
  .description('Generate coverage report from existing data')
  .option('-f, --coverage-file <file>', 'Coverage data file', './coverage/coverage.json')
  .option('-o, --output <dir>', 'Output directory for reports', './coverage')
  .action(async (options) => {
    try {
      const coverageData = JSON.parse(
        await fs.readFile(options.coverageFile, 'utf8')
      );

      const runner = new TestRunner();
      const { LcovReporter } = await import('./coverage-tools/LcovReporter');
      const reporter = new LcovReporter();

      await fs.mkdir(options.output, { recursive: true });
      
      // Generate LCOV report
      await reporter.generateReport(
        coverageData,
        path.join(options.output, 'lcov.info')
      );

      // Generate HTML report
      await reporter.generateHtmlReport(
        coverageData,
        path.join(options.output, 'html')
      );

      // Generate summary
      const summary = reporter.generateSummary(coverageData);
      await fs.writeFile(
        path.join(options.output, 'summary.txt'),
        summary
      );

      cliLogger.info(`Coverage reports generated in ${options.output}/`);
      cliLogger.info(summary);
    } catch (error) {
      cliLogger.error('Error generating coverage report:', error);
      process.exit(1);
    }
  });

// Analyze workflow command
program
  .command('analyze <workflow>')
  .description('Analyze a workflow to understand its structure')
  .option('-o, --output <file>', 'Save analysis to file')
  .action(async (workflow, options) => {
    try {
      const analyzer = new WorkflowAnalyzer();
      const analysis = await analyzer.analyzeWorkflow(workflow);
      
      cliLogger.info(chalk.bold('\n📊 Workflow Analysis\n'));
      cliLogger.info(chalk.cyan('Workflow:'), analysis.workflowName);
      
      cliLogger.info(chalk.yellow('\n🔌 Inputs:'));
      for (const input of analysis.inputs) {
        cliLogger.info(`  - ${input.nodeName} (${input.source})`);
      }
      
      cliLogger.info(chalk.yellow('\n🌐 External Services:'));
      for (const service of analysis.externalServices) {
        cliLogger.info(`  - ${service.nodeName} (${service.category})`);
      }
      
      cliLogger.info(chalk.yellow('\n📤 Outputs:'));
      for (const output of analysis.outputs) {
        cliLogger.info(`  - ${output.nodeName}`);
      }
      
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(analysis, null, 2));
        cliLogger.info(chalk.green(`\n✅ Analysis saved to ${options.output}`));
      }
    } catch (error) {
      cliLogger.error(chalk.red('Error analyzing workflow:'), error);
      process.exit(1);
    }
  });

// Generate test command
program
  .command('generate <workflow>')
  .description('Generate test file from workflow')
  .option('-f, --format <format>', 'Output format (json|yaml)', 'yaml')
  .option('-o, --output <file>', 'Output file name')
  .option('--examples', 'Look for .examples.json file')
  .option('--mocks', 'Look for .mocks.json file')
  .action(async (workflow, options) => {
    try {
      const generator = new TestGenerator();
      const testSuite = await generator.generateFromWorkflow(workflow);
      
      // Determine output file name
      const baseName = path.basename(workflow, '.json');
      const outputFile = options.output || `${baseName}.test.${options.format}`;
      
      // Convert to desired format
      let content: string;
      if (options.format === 'yaml') {
        // Create simplified format for YAML
        const simplified = {
          test: testSuite.name,
          workflow: workflow,
          cases: testSuite.tests.map(test => ({
            name: test.name,
            input: test.inputs,
            expect: test.expectedOutputs[0]?.json || {},
            mocks: test.mocks?.reduce((acc, mock) => {
              acc[mock.nodeName] = mock.response;
              return acc;
            }, {} as any)
          }))
        };
        content = yaml.dump(simplified, { indent: 2 });
      } else {
        content = JSON.stringify(testSuite, null, 2);
      }
      
      await fs.writeFile(outputFile, content);
      cliLogger.info(chalk.green(`✅ Test file generated: ${outputFile}`));
      
      // Show preview
      cliLogger.info(chalk.yellow('\n📝 Test Preview:\n'));
      cliLogger.info(content.substring(0, 500) + '...');
      
    } catch (error) {
      cliLogger.error(chalk.red('Error generating test:'), error);
      process.exit(1);
    }
  });

// Generate mocks command
program
  .command('generate-mocks <workflow>')
  .description('Generate default mocks for a workflow')
  .option('-o, --output <file>', 'Output file name')
  .action(async (workflow, options) => {
    try {
      const analyzer = new WorkflowAnalyzer();
      const analysis = await analyzer.analyzeWorkflow(workflow);
      const mockGen = new MockGenerator();
      
      const mocks: any = {};
      
      for (const service of analysis.externalServices) {
        mocks[service.nodeName] = {
          success: mockGen.generateMock(service.nodeType, service.nodeName, 'success'),
          error: mockGen.generateMock(service.nodeType, service.nodeName, 'error')
        };
      }
      
      const outputFile = options.output || workflow.replace('.json', '.mocks.json');
      await fs.writeFile(outputFile, JSON.stringify(mocks, null, 2));
      
      cliLogger.info(chalk.green(`✅ Mocks generated: ${outputFile}`));
      cliLogger.info(chalk.yellow('\n🎭 Generated Mocks:\n'));
      cliLogger.info(JSON.stringify(mocks, null, 2));
      
    } catch (error) {
      cliLogger.error(chalk.red('Error generating mocks:'), error);
      process.exit(1);
    }
  });

program.parse();