/* eslint-disable no-console */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamp: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.timestamp = options.timestamp ?? false;
  }

  private formatMessage(level: string, message: string): string {
    const parts = [];
    
    if (this.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    parts.push(`[${level}]`);
    
    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }
    
    parts.push(message);
    
    return parts.join(' ');
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamp: this.timestamp
    });
  }
}

// Default logger instance
export const logger = new Logger({
  level: process.env.LOG_LEVEL ? 
    LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO :
    LogLevel.INFO,
  timestamp: process.env.LOG_TIMESTAMP === 'true'
});