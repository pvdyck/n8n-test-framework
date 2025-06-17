import { ValidationResult } from '../types';

export class OutputValidator {
  async validate(actual: any, expected: any): Promise<ValidationResult> {
    try {
      const differences = this.findDifferences(actual, expected, '');
      
      if (differences.length === 0) {
        return {
          passed: true,
          expected,
          actual
        };
      }

      return {
        passed: false,
        expected,
        actual,
        message: `Found ${differences.length} difference(s)`,
        differences
      };
    } catch (error: any) {
      return {
        passed: false,
        expected,
        actual,
        message: `Validation error: ${error.message}`
      };
    }
  }

  private findDifferences(actual: any, expected: any, path: string): any[] {
    const differences: any[] = [];

    // Handle wildcards in expected values
    if (expected === '*' || expected === '**') {
      return differences; // Any value is acceptable
    }

    // Check if types match
    if (typeof actual !== typeof expected) {
      differences.push({
        path,
        expected: typeof expected,
        actual: typeof actual,
        type: 'type-mismatch'
      });
      return differences;
    }

    // Handle null/undefined
    if (actual === null || actual === undefined) {
      if (actual !== expected) {
        differences.push({
          path,
          expected,
          actual,
          type: 'value-mismatch'
        });
      }
      return differences;
    }

    // Handle arrays
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) {
        differences.push({
          path,
          expected: 'array',
          actual: typeof actual,
          type: 'type-mismatch'
        });
        return differences;
      }

      // Check array length if expected is not using wildcards
      if (!this.hasWildcard(expected) && actual.length !== expected.length) {
        differences.push({
          path,
          expected: `array[${expected.length}]`,
          actual: `array[${actual.length}]`,
          type: 'length-mismatch'
        });
      }

      // Check each array element
      const maxLength = Math.min(actual.length, expected.length);
      for (let i = 0; i < maxLength; i++) {
        const itemDiffs = this.findDifferences(
          actual[i],
          expected[i],
          `${path}[${i}]`
        );
        differences.push(...itemDiffs);
      }

      return differences;
    }

    // Handle objects
    if (typeof expected === 'object') {
      // Check for expected properties
      for (const key in expected) {
        if (Object.prototype.hasOwnProperty.call(expected, key)) {
          const actualValue = actual[key];
          const expectedValue = expected[key];

          if (!(key in actual) && expectedValue !== undefined) {
            differences.push({
              path: `${path}.${key}`,
              expected: expectedValue,
              actual: undefined,
              type: 'missing-property'
            });
          } else {
            const propDiffs = this.findDifferences(
              actualValue,
              expectedValue,
              `${path}.${key}`
            );
            differences.push(...propDiffs);
          }
        }
      }

      // Check for unexpected properties (optional)
      if (expected.__strict === true) {
        for (const key in actual) {
          if (Object.prototype.hasOwnProperty.call(actual, key) && !(key in expected)) {
            differences.push({
              path: `${path}.${key}`,
              expected: undefined,
              actual: actual[key],
              type: 'unexpected-property'
            });
          }
        }
      }

      return differences;
    }

    // Handle primitive values
    if (actual !== expected) {
      // Check for wildcard patterns
      if (typeof expected === 'string' && expected.includes('*')) {
        // Convert wildcard to regex: * -> .*
        const pattern = expected
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
          .replace(/\*/g, '.*'); // Replace * with .*
        const regex = new RegExp(`^${pattern}$`);
        if (!regex.test(String(actual))) {
          differences.push({
            path,
            expected,
            actual,
            type: 'value-mismatch'
          });
        }
      }
      // Check for regex patterns
      else if (typeof expected === 'string' && expected.startsWith('/') && expected.endsWith('/')) {
        const regex = new RegExp(expected.slice(1, -1));
        if (!regex.test(String(actual))) {
          differences.push({
            path,
            expected: `matches ${expected}`,
            actual,
            type: 'pattern-mismatch'
          });
        }
      } else {
        differences.push({
          path,
          expected,
          actual,
          type: 'value-mismatch'
        });
      }
    }

    return differences;
  }

  private hasWildcard(arr: any[]): boolean {
    return arr.some(item => item === '*' || item === '**');
  }
}