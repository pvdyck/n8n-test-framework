import { TestResults } from '../types';

export class JUnitReporter {
  async generateReport(results: TestResults): Promise<string> {
    const xml = [`<?xml version="1.0" encoding="UTF-8"?>`];
    xml.push(`<testsuites name="${results.suite}" tests="${results.tests.length}" failures="${results.failed}" errors="${results.errors}" time="${results.duration / 1000}">`);
    
    xml.push(`  <testsuite name="${results.suite}" tests="${results.tests.length}" failures="${results.failed}" errors="${results.errors}" time="${results.duration / 1000}">`);
    
    for (const test of results.tests) {
      xml.push(`    <testcase name="${test.name}" time="${test.duration / 1000}">`);
      
      if (test.status === 'failed') {
        xml.push(`      <failure message="${test.validation?.message || 'Test failed'}">`);
        xml.push(`        Expected: ${JSON.stringify(test.validation?.expected)}`);
        xml.push(`        Actual: ${JSON.stringify(test.validation?.actual)}`);
        xml.push(`      </failure>`);
      } else if (test.status === 'error') {
        xml.push(`      <error message="${test.error || 'Unknown error'}" />`);
      } else if (test.status === 'skipped') {
        xml.push(`      <skipped />`);
      }
      
      xml.push(`    </testcase>`);
    }
    
    xml.push(`  </testsuite>`);
    xml.push(`</testsuites>`);
    
    return xml.join('\n');
  }
}