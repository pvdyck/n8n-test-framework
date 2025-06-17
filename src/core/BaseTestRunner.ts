import { EventEmitter } from 'events';
import { MockServer } from './MockServer';
import { Logger } from '../utils/Logger';

export interface BaseTestConfig {
  mockServerPort?: number;
  verbose?: boolean;
}

export abstract class BaseTestRunner extends EventEmitter {
  protected mockServer: MockServer;
  protected logger: Logger;

  constructor(config: BaseTestConfig = {}) {
    super();
    this.mockServer = new MockServer(config.mockServerPort);
    this.logger = new Logger().child(this.constructor.name);
  }

  protected async startMockServer(): Promise<void> {
    if (!this.mockServer.isRunning()) {
      await this.mockServer.start();
      this.emit('mockServer:started', this.mockServer.getPort());
    }
  }

  protected async stopMockServer(): Promise<void> {
    if (this.mockServer.isRunning()) {
      await this.mockServer.stop();
      this.emit('mockServer:stopped');
    }
  }

  protected getMockServerUrl(): string {
    return `http://localhost:${this.mockServer.getPort()}`;
  }

  protected async withMockServer<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await this.startMockServer();
      return await fn();
    } finally {
      await this.stopMockServer();
    }
  }

  protected async withTestMocks<T>(mocks: any, fn: () => Promise<T>): Promise<T> {
    if (mocks) {
      await this.mockServer.registerMocks(mocks);
    }
    try {
      return await fn();
    } finally {
      if (mocks) {
        await this.mockServer.clearMocks();
      }
    }
  }
}