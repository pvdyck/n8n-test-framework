export interface TestCase {
  name: string;
  workflow: string;
  inputs?: Record<string, any>;
  expectedOutputs?: any;
  mocks?: MockConfig[];
  timeout?: number;
  retries?: number;
  skip?: boolean;
  trigger?: any; // Trigger configuration for trigger-based tests
}

export interface TestSuite {
  name: string;
  workflow?: string;
  tests: TestCase[];
  config?: TestConfig;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface TestConfig {
  concurrency?: number;
  timeout?: number;
  retries?: number;
  bail?: boolean;
  mockServerPort?: number;
  environment?: Record<string, string>;
}

export interface MockConfig {
  nodeType: string;
  nodeName?: string;
  method?: string;
  url?: string;
  response?: any;
  delay?: number;
  scenarios?: MockScenario[];
}

export interface MockScenario {
  condition: (req: any) => boolean;
  response: any;
}

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  duration: number;
  output?: any;
  validation?: ValidationResult;
  error?: string;
  retries?: number;
}

export interface ValidationResult {
  passed: boolean;
  expected?: any;
  actual?: any;
  message?: string;
  differences?: any[];
}

export interface TestResults {
  suite: string;
  tests: TestResult[];
  duration: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  timestamp: Date;
}

export interface MockEndpoint {
  method: string;
  path: string;
  response: any | ((req: any) => any);
  delay?: number;
  scenarios?: MockScenario[];
}

export * from './trigger';