/* eslint-disable no-console */
import chalk from 'chalk';
import { TestResults, TestResult } from '../types';

export class ConsoleReporter {
  async generateReport(results: TestResults): Promise<void> {
    console.log('\n' + chalk.bold.blue('🧪 N8N Workflow Test Results'));
    console.log(chalk.gray('═'.repeat(50)) + '\n');

    // Summary
    const total = results.tests.length;
    const passedColor = results.passed > 0 ? chalk.green : chalk.gray;
    const failedColor = results.failed > 0 ? chalk.red : chalk.gray;
    const errorColor = results.errors > 0 ? chalk.yellow : chalk.gray;
    const skippedColor = results.skipped > 0 ? chalk.gray : chalk.gray;

    console.log(chalk.bold('Summary:'));
    console.log(`  ${passedColor(`✓ Passed:  ${results.passed}`)}`);
    console.log(`  ${failedColor(`✗ Failed:  ${results.failed}`)}`);
    console.log(`  ${errorColor(`⚠ Errors:  ${results.errors}`)}`);
    console.log(`  ${skippedColor(`- Skipped: ${results.skipped}`)}`);
    console.log(`  ${chalk.gray(`Total:     ${total}`)}`);
    console.log(`  ${chalk.gray(`Duration:  ${this.formatDuration(results.duration)}`)}\n`);

    // Detailed results
    if (results.failed > 0 || results.errors > 0) {
      console.log(chalk.bold('Failed Tests:'));
      console.log(chalk.gray('─'.repeat(50)) + '\n');

      for (const test of results.tests) {
        if (test.status === 'failed' || test.status === 'error') {
          this.printTestResult(test);
        }
      }
    }

    // All test results (verbose)
    if (process.env.VERBOSE === 'true') {
      console.log(chalk.bold('\nAll Tests:'));
      console.log(chalk.gray('─'.repeat(50)) + '\n');

      for (const test of results.tests) {
        this.printTestResult(test, true);
      }
    }

    // Footer
    console.log('\n' + chalk.gray('═'.repeat(50)));
    
    if (results.failed === 0 && results.errors === 0) {
      console.log(chalk.green.bold('✨ All tests passed!'));
    } else {
      console.log(chalk.red.bold(`💥 ${results.failed + results.errors} test(s) failed`));
    }
  }

  private printTestResult(test: TestResult, compact: boolean = false): void {
    const statusIcon = {
      passed: chalk.green('✓'),
      failed: chalk.red('✗'),
      error: chalk.yellow('⚠'),
      skipped: chalk.gray('-')
    }[test.status];


    console.log(`${statusIcon} ${chalk.bold(test.name)} ${chalk.gray(`(${this.formatDuration(test.duration)})`)}`);

    if (test.retries && test.retries > 0) {
      console.log(`  ${chalk.yellow(`⟲ Retried ${test.retries} time(s)`)}`);
    }

    if (!compact || test.status !== 'passed') {
      if (test.status === 'failed' && test.validation) {
        console.log(`  ${chalk.red('Validation failed:')}`);
        
        if (test.validation.differences) {
          for (const diff of test.validation.differences) {
            console.log(`    ${chalk.gray('Path:')} ${diff.path || 'root'}`);
            console.log(`    ${chalk.red('Expected:')} ${JSON.stringify(diff.expected)}`);
            console.log(`    ${chalk.green('Actual:')}   ${JSON.stringify(diff.actual)}`);
            console.log(`    ${chalk.gray('Type:')}     ${diff.type}\n`);
          }
        } else if (test.validation.message) {
          console.log(`    ${test.validation.message}`);
        }
      }

      if (test.error) {
        console.log(`  ${chalk.red('Error:')} ${test.error}`);
      }

      if (process.env.DEBUG === 'true' && test.output) {
        console.log(`  ${chalk.gray('Output:')}`);
        console.log(`    ${JSON.stringify(test.output, null, 2).split('\n').join('\n    ')}`);
      }
    }

    console.log();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }
}