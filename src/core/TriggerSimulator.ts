import { EventEmitter } from 'events';
import axios from 'axios';
import * as cron from 'node-cron';
import { WebSocket } from 'ws';

export interface TriggerEvent {
  nodeType: string;
  nodeName: string;
  data: any;
  timestamp: Date;
}

export interface WebhookTriggerOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface ScheduleTriggerOptions {
  cronExpression: string;
  timezone?: string;
}

export interface WebSocketTriggerOptions {
  url: string;
  messages: Array<{
    delay?: number;
    data: any;
  }>;
}

export interface EmailTriggerOptions {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    content: string;
  }>;
}

export class TriggerSimulator extends EventEmitter {
  private webhookHandlers: Map<string, (...args: any[]) => any> = new Map();
  private scheduleHandlers: Map<string, cron.ScheduledTask> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();
  
  constructor(private mockServerUrl: string = 'http://localhost:3456') {
    super();
  }
  
  /**
   * Simulate a webhook trigger
   */
  async triggerWebhook(options: WebhookTriggerOptions): Promise<any> {
    const { url, method, headers = {}, body, query } = options;
    
    try {
      // Build full URL with query parameters
      const fullUrl = new URL(url);
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          fullUrl.searchParams.append(key, value);
        });
      }
      
      // Make HTTP request to trigger webhook
      const response = await axios({
        method: method.toUpperCase(),
        url: fullUrl.toString(),
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        data: body,
        validateStatus: () => true // Don't throw on any status
      });
      
      this.emit('webhook:triggered', {
        url: fullUrl.toString(),
        method,
        status: response.status,
        data: response.data
      });
      
      return {
        status: response.status,
        headers: response.headers,
        data: response.data
      };
    } catch (error: any) {
      this.emit('webhook:error', { url, error: error.message });
      throw error;
    }
  }
  
  /**
   * Simulate a schedule/cron trigger
   */
  async triggerSchedule(
    nodeName: string, 
    options: ScheduleTriggerOptions,
    callback: () => Promise<void>
  ): Promise<void> {
    const { cronExpression, timezone } = options;
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    
    // Create scheduled task
    const task = cron.schedule(cronExpression, async () => {
      this.emit('schedule:triggered', {
        nodeName,
        cronExpression,
        timestamp: new Date()
      });
      
      try {
        await callback();
      } catch (error: any) {
        this.emit('schedule:error', {
          nodeName,
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone
    });
    
    // Store task for cleanup
    this.scheduleHandlers.set(nodeName, task);
    
    // Start the task
    task.start();
    
    this.emit('schedule:started', {
      nodeName,
      cronExpression,
      nextRun: new Date() // Schedule next run for next cron occurrence
    });
  }
  
  /**
   * Simulate an immediate schedule trigger (for testing)
   */
  async triggerScheduleNow(nodeName: string): Promise<void> {
    const task = this.scheduleHandlers.get(nodeName);
    if (!task) {
      throw new Error(`No schedule handler found for node: ${nodeName}`);
    }
    
    // Manually trigger the scheduled function
    const taskFunction = (task as any)._callbacks[0];
    if (taskFunction) {
      await taskFunction();
    }
  }
  
  /**
   * Simulate a WebSocket trigger
   */
  async triggerWebSocket(options: WebSocketTriggerOptions): Promise<void> {
    const { url, messages } = options;
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      ws.on('open', async () => {
        this.emit('websocket:connected', { url });
        
        // Send messages with delays
        for (const message of messages) {
          if (message.delay) {
            await new Promise(r => setTimeout(r, message.delay));
          }
          
          ws.send(JSON.stringify(message.data));
          this.emit('websocket:sent', {
            url,
            data: message.data
          });
        }
        
        // Close connection after sending all messages
        setTimeout(() => {
          ws.close();
          resolve();
        }, 1000);
      });
      
      ws.on('message', (data) => {
        this.emit('websocket:received', {
          url,
          data: data.toString()
        });
      });
      
      ws.on('error', (error) => {
        this.emit('websocket:error', { url, error: error.message });
        reject(error);
      });
      
      ws.on('close', () => {
        this.emit('websocket:closed', { url });
      });
      
      // Store connection for cleanup
      this.wsConnections.set(url, ws);
    });
  }
  
  /**
   * Simulate an email trigger (IMAP)
   */
  async triggerEmail(options: EmailTriggerOptions): Promise<void> {
    // For email triggers, we'll send a mock email to the mock server
    // which will then trigger the workflow
    
    const emailData = {
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: options.body,
      attachments: options.attachments || [],
      date: new Date().toISOString(),
      messageId: `<${Date.now()}@test.example.com>`,
      headers: {
        'X-Test-Email': 'true'
      }
    };
    
    try {
      const response = await axios.post(
        `${this.mockServerUrl}/_trigger/email`,
        emailData
      );
      
      this.emit('email:triggered', {
        messageId: emailData.messageId,
        subject: options.subject
      });
      
      return response.data;
    } catch (error: any) {
      this.emit('email:error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Simulate a file system trigger (file watcher)
   */
  async triggerFileSystem(
    nodeName: string,
    event: 'create' | 'update' | 'delete',
    filePath: string,
    content?: string
  ): Promise<void> {
    const fsEvent = {
      type: event,
      path: filePath,
      filename: filePath.split('/').pop(),
      timestamp: new Date().toISOString(),
      content: content || null
    };
    
    try {
      const response = await axios.post(
        `${this.mockServerUrl}/_trigger/filesystem`,
        {
          nodeName,
          event: fsEvent
        }
      );
      
      this.emit('filesystem:triggered', {
        nodeName,
        event: fsEvent
      });
      
      return response.data;
    } catch (error: any) {
      this.emit('filesystem:error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Register a webhook handler for testing
   */
  registerWebhookHandler(
    path: string,
    handler: (req: any) => any
  ): void {
    this.webhookHandlers.set(path, handler);
    
    // Register with mock server
    axios.post(`${this.mockServerUrl}/_register/webhook`, {
      path,
      // Handler will be called by mock server
    }).catch(error => {
      this.emit('webhook:register:error', { path, error: error.message });
    });
  }
  
  /**
   * Wait for a trigger event
   */
  async waitForTrigger(
    eventType: string,
    timeout: number = 5000
  ): Promise<TriggerEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for trigger: ${eventType}`));
      }, timeout);
      
      const handler = (event: TriggerEvent) => {
        if (event.nodeType === eventType) {
          clearTimeout(timer);
          this.removeListener('trigger', handler);
          resolve(event);
        }
      };
      
      this.on('trigger', handler);
    });
  }
  
  /**
   * Clean up all triggers
   */
  async cleanup(): Promise<void> {
    // Stop all scheduled tasks
    for (const [name, task] of this.scheduleHandlers) {
      task.stop();
      this.emit('schedule:stopped', { nodeName: name });
    }
    this.scheduleHandlers.clear();
    
    // Close all WebSocket connections
    for (const [, ws] of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.wsConnections.clear();
    
    // Clear webhook handlers
    this.webhookHandlers.clear();
    
    // Notify mock server to clear triggers
    try {
      await axios.post(`${this.mockServerUrl}/_trigger/clear`);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}