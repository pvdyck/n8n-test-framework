import { TestCase } from './index';

export interface TriggerTest extends TestCase {
  trigger: TriggerConfig;
  /**
   * Time to wait for workflow to start after trigger (ms)
   */
  triggerTimeout?: number;
  /**
   * Whether to automatically clean up triggers after test
   */
  autoCleanup?: boolean;
}

export interface TriggerConfig {
  type: 'webhook' | 'schedule' | 'email' | 'websocket' | 'filesystem' | 'custom';
  nodeId?: string;
  nodeName?: string;
  config: WebhookTrigger | ScheduleTrigger | EmailTrigger | WebSocketTrigger | FileSystemTrigger | CustomTrigger;
}

export interface WebhookTrigger {
  type: 'webhook';
  /**
   * URL path for the webhook (relative to workflow URL)
   */
  path: string;
  /**
   * HTTP method
   */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /**
   * Request headers
   */
  headers?: Record<string, string>;
  /**
   * Request body
   */
  body?: any;
  /**
   * Query parameters
   */
  query?: Record<string, string>;
  /**
   * Expected response status
   */
  expectedStatus?: number;
  /**
   * Expected response body
   */
  expectedResponse?: any;
}

export interface ScheduleTrigger {
  type: 'schedule';
  /**
   * Cron expression
   */
  cron: string;
  /**
   * Timezone (optional)
   */
  timezone?: string;
  /**
   * Whether to trigger immediately for testing
   */
  triggerNow?: boolean;
  /**
   * Number of times to trigger (for testing)
   */
  triggerCount?: number;
}

export interface EmailTrigger {
  type: 'email';
  /**
   * Email details
   */
  from: string;
  to: string;
  subject: string;
  body: string;
  /**
   * Email attachments
   */
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
  /**
   * Additional headers
   */
  headers?: Record<string, string>;
}

export interface WebSocketTrigger {
  type: 'websocket';
  /**
   * WebSocket URL
   */
  url: string;
  /**
   * Messages to send
   */
  messages: Array<{
    /**
     * Delay before sending (ms)
     */
    delay?: number;
    /**
     * Message data
     */
    data: any;
    /**
     * Expected response (optional)
     */
    expectedResponse?: any;
  }>;
  /**
   * Connection options
   */
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
  };
}

export interface FileSystemTrigger {
  type: 'filesystem';
  /**
   * File system event
   */
  event: 'create' | 'update' | 'delete';
  /**
   * File path
   */
  path: string;
  /**
   * File content (for create/update)
   */
  content?: string;
  /**
   * File metadata
   */
  metadata?: {
    size?: number;
    mimeType?: string;
    encoding?: string;
  };
}

export interface CustomTrigger {
  type: 'custom';
  /**
   * Custom trigger implementation
   */
  handler: (context: TriggerContext) => Promise<any>;
  /**
   * Configuration for custom trigger
   */
  config?: any;
}

export interface TriggerContext {
  /**
   * Workflow ID
   */
  workflowId: string;
  /**
   * Node name
   */
  nodeName: string;
  /**
   * Mock server URL
   */
  mockServerUrl: string;
  /**
   * Emit custom events
   */
  emit: (event: string, data: any) => void;
  /**
   * Wait for workflow execution
   */
  waitForExecution: (timeout?: number) => Promise<any>;
}