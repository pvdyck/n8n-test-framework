import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { MockConfig, MockEndpoint } from '../types';
import { logger } from '../utils/Logger';

export class MockServer {
  private app: express.Application;
  private server: Server | null = null;
  private mockConfigs: Map<string, MockEndpoint> = new Map();
  private port: number;
  private mockCalls: Map<string, any[]> = new Map();
  private triggerHandlers: Map<string, (req: Request, res: Response) => void> = new Map();
  private webhookHandlers: Map<string, (req: Request, res: Response) => void> = new Map();
  private logger = logger.child('MockServer');

  constructor(port: number = 3456) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Log all requests for debugging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const key = `${req.method}:${req.path}`;
      if (!this.mockCalls.has(key)) {
        this.mockCalls.set(key, []);
      }
      this.mockCalls.get(key)!.push({
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params,
        timestamp: new Date()
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', port: this.port });
    });

    // Trigger endpoints for testing
    this.setupTriggerEndpoints();

    // Dynamic route handler for all methods and paths
    this.app.all('*', (req: Request, res: Response) => {
      const key = `${req.method}:${req.path}`;
      const mock = this.mockConfigs.get(key);
      
      if (mock) {
        const response = this.evaluateMockResponse(mock, req);
        
        // Simulate network delay if specified
        const delay = mock.delay || 0;
        setTimeout(() => {
          if (response.error) {
            res.status(response.status || 500).json({
              error: response.error,
              message: response.message || 'Mock error'
            });
          } else {
            res.status(response.status || 200).json(response.body || response);
          }
        }, delay);
      } else {
        // No mock found, return 404
        res.status(404).json({
          error: 'Mock not found',
          message: `No mock registered for ${req.method} ${req.path}`,
          availableMocks: Array.from(this.mockConfigs.keys())
        });
      }
    });
  }

  private evaluateMockResponse(mock: MockEndpoint, req: Request): any {
    // If response is a function, call it with the request
    if (typeof mock.response === 'function') {
      return mock.response(req);
    }
    
    // Support scenario-based responses
    if (mock.scenarios) {
      for (const scenario of mock.scenarios) {
        if (scenario.condition(req)) {
          return scenario.response;
        }
      }
    }
    
    // Return static response
    return mock.response;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          this.logger.info(`Mock server started on port ${this.port}`);
          resolve();
        });
        
        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error(`Port ${this.port} is already in use`);
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Mock server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async registerMocks(mocks: MockConfig[]): Promise<void> {
    for (const mock of mocks) {
      // Convert node-specific mocks to HTTP mocks
      if (mock.nodeType === 'n8n-nodes-base.httpRequest' && mock.url) {
        const url = new URL(mock.url);
        const endpoint: MockEndpoint = {
          method: mock.method || 'GET',
          path: url.pathname,
          response: mock.response,
          delay: mock.delay,
          scenarios: mock.scenarios
        };
        
        const key = `${endpoint.method}:${endpoint.path}`;
        this.mockConfigs.set(key, endpoint);
      }
      
      // Handle webhook mocks
      if (mock.nodeType === 'n8n-nodes-base.webhook') {
        const endpoint: MockEndpoint = {
          method: 'POST',
          path: `/webhook/${mock.nodeName || 'test'}`,
          response: mock.response,
          delay: mock.delay
        };
        
        const key = `${endpoint.method}:${endpoint.path}`;
        this.mockConfigs.set(key, endpoint);
      }
      
      // Handle other service mocks (e.g., database, email)
      if (mock.nodeType === 'n8n-nodes-base.emailSend') {
        // Mock SMTP endpoint
        const endpoint: MockEndpoint = {
          method: 'POST',
          path: '/smtp/send',
          response: {
            success: true,
            messageId: `mock-${Date.now()}`,
            ...mock.response
          }
        };
        
        const key = `${endpoint.method}:${endpoint.path}`;
        this.mockConfigs.set(key, endpoint);
      }
    }
  }

  async clearMocks(): Promise<void> {
    this.mockConfigs.clear();
    this.mockCalls.clear();
  }

  registerEndpoint(endpoint: MockEndpoint): void {
    const key = `${endpoint.method}:${endpoint.path}`;
    this.mockConfigs.set(key, endpoint);
  }

  getMockCalls(method: string, path: string): any[] {
    const key = `${method}:${path}`;
    return this.mockCalls.get(key) || [];
  }

  getAllMockCalls(): Map<string, any[]> {
    return new Map(this.mockCalls);
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  getPort(): number {
    return this.port;
  }

  private setupTriggerEndpoints(): void {
    // Email trigger endpoint
    this.app.post('/_trigger/email', (req: Request, res: Response) => {
      const handler = this.triggerHandlers.get('email');
      if (handler) {
        handler(req.body);
      }
      res.json({ success: true, messageId: req.body.messageId });
    });

    // File system trigger endpoint
    this.app.post('/_trigger/filesystem', (req: Request, res: Response) => {
      const handler = this.triggerHandlers.get('filesystem');
      if (handler) {
        handler(req.body);
      }
      res.json({ success: true });
    });

    // Webhook registration endpoint
    this.app.post('/_register/webhook', (req: Request, res: Response) => {
      const { path } = req.body;
      // In real implementation, this would register the webhook
      res.json({ success: true, path });
    });

    // Clear triggers endpoint
    this.app.post('/_trigger/clear', (req: Request, res: Response) => {
      this.triggerHandlers.clear();
      this.webhookHandlers.clear();
      res.json({ success: true });
    });

    // Webhook endpoints are registered dynamically
    this.app.use('/webhook/*', (req: Request, res: Response) => {
      const webhookPath = req.path;
      const handler = this.webhookHandlers.get(webhookPath);
      
      if (handler) {
        const result = handler(req);
        res.status(result.status || 200).json(result.body || { success: true });
      } else {
        // Check if there's a mock for this webhook
        const key = `${req.method}:${req.path}`;
        const mock = this.mockConfigs.get(key);
        
        if (mock) {
          const response = this.evaluateMockResponse(mock, req);
          res.status(response.status || 200).json(response.body || response);
        } else {
          res.status(404).json({ 
            error: 'Webhook not found',
            path: webhookPath 
          });
        }
      }
    });
  }

  registerTriggerHandler(type: string, handler: (req: Request, res: Response) => void): void {
    this.triggerHandlers.set(type, handler);
  }

  registerWebhookHandler(path: string, handler: (req: Request, res: Response) => void): void {
    this.webhookHandlers.set(path, handler);
  }
}