import { TestResults } from '../types';

export class JsonReporter {
  async generateReport(results: TestResults): Promise<string> {
    return JSON.stringify(results, null, 2);
  }
}