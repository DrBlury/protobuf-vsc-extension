/**
 * Logger abstraction for Protocol Buffers Language Server
 * Provides consistent logging interface across the codebase
 */

import { Connection } from 'vscode-languageserver/node';

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

/**
 * Logger class for consistent logging
 */
export class Logger {
  private connection: Connection | null = null;
  private level: LogLevel = LogLevel.INFO;
  private verboseLogging: boolean = false;

  /**
   * Initialize the logger with a connection
   * @param connection - The language server connection
   * @param level - The log level to use
   * @param verboseLogging - Enable super verbose logging for debugging
   */
  initialize(connection: Connection, level: LogLevel = LogLevel.INFO, verboseLogging: boolean = false): void {
    this.connection = connection;
    this.level = level;
    this.verboseLogging = verboseLogging;
  }

  /**
   * Set the log level
   * @param level - The new log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable or disable verbose logging
   * @param enabled - Whether to enable verbose logging
   */
  setVerboseLogging(enabled: boolean): void {
    this.verboseLogging = enabled;
    if (enabled) {
      this.info('Verbose logging enabled - all operations will be logged');
    }
  }

  /**
   * Check if verbose logging is enabled
   * @returns True if verbose logging is enabled
   */
  isVerboseLoggingEnabled(): boolean {
    return this.verboseLogging;
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.ERROR) {
      const formatted = this.format(message, args);
      if (this.connection) {
        this.connection.console.error(formatted);
      } else {
        console.error(formatted);
      }
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.WARN) {
      const formatted = this.format(message, args);
      if (this.connection) {
        this.connection.console.warn(formatted);
      } else {
        console.warn(formatted);
      }
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      const formatted = this.format(message, args);
      if (this.connection) {
        this.connection.console.info(formatted);
      } else {
        console.info(formatted);
      }
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.format(message, args);
      if (this.connection) {
        this.connection.console.log(formatted);
      } else {
        console.debug(formatted);
      }
    }
  }

  /**
   * Log a verbose message
   * Verbose messages are only shown when verbose logging is enabled
   */
  verbose(message: string, ...args: unknown[]): void {
    if (this.verboseLogging || this.level >= LogLevel.VERBOSE) {
      const formatted = this.format(message, args);
      if (this.connection) {
        this.connection.console.log(`[VERBOSE] ${formatted}`);
      } else {
        console.log(`[VERBOSE] ${formatted}`);
      }
    }
  }

  /**
   * Log a verbose message with automatic context
   * This is a convenience method for verbose logging that includes common context
   */
  verboseWithContext(message: string, context: {
    uri?: string;
    position?: { line: number; character: number };
    operation?: string;
    duration?: number;
    [key: string]: unknown;
  }): void {
    if (!this.verboseLogging && this.level < LogLevel.VERBOSE) {
      return;
    }

    const parts: string[] = [`[VERBOSE] ${message}`];

    if (context.uri) {
      parts.push(`URI: ${context.uri}`);
    }

    if (context.position) {
      parts.push(`Position: ${context.position.line}:${context.position.character}`);
    }

    if (context.operation) {
      parts.push(`Operation: ${context.operation}`);
    }

    if (context.duration !== undefined) {
      parts.push(`Duration: ${context.duration}ms`);
    }

    // Include any other context properties
    for (const [key, value] of Object.entries(context)) {
      if (!['uri', 'position', 'operation', 'duration'].includes(key)) {
        try {
          parts.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
        } catch {
          parts.push(`${key}: [unserializable]`);
        }
      }
    }

    const formatted = parts.join(' | ');
    if (this.connection) {
      this.connection.console.log(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log a debug message with context (alias for debug with context object)
   */
  debugWithContext(message: string, context: {
    uri?: string;
    position?: { line: number; character: number };
    operation?: string;
    error?: Error | unknown;
  }): void {
    const parts: string[] = [message];

    if (context.uri) {
      parts.push(`URI: ${context.uri}`);
    }

    if (context.position) {
      parts.push(`Position: ${context.position.line}:${context.position.character}`);
    }

    if (context.operation) {
      parts.push(`Operation: ${context.operation}`);
    }

    if (context.error) {
      const errorMessage = context.error instanceof Error
        ? context.error.message
        : String(context.error);
      parts.push(`Error: ${errorMessage}`);
    }

    this.debug(parts.join(' | '));
  }

  /**
   * Format a message with arguments
   */
  private format(message: string, args: unknown[]): string {
    if (args.length === 0) {
      return message;
    }
    try {
      return `${message} ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')}`;
    } catch {
      return `${message} [Error formatting arguments]`;
    }
  }

  /**
   * Log an error with context
   */
  errorWithContext(
    message: string,
    context: {
      uri?: string;
      position?: { line: number; character: number };
      operation?: string;
      error?: Error | unknown;
    }
  ): void {
    const parts: string[] = [message];

    if (context.uri) {
      parts.push(`URI: ${context.uri}`);
    }

    if (context.position) {
      parts.push(`Position: ${context.position.line}:${context.position.character}`);
    }

    if (context.operation) {
      parts.push(`Operation: ${context.operation}`);
    }

    if (context.error) {
      const errorMessage = context.error instanceof Error
        ? context.error.message
        : String(context.error);
      const errorStack = context.error instanceof Error ? context.error.stack : undefined;
      parts.push(`Error: ${errorMessage}`);
      if (errorStack) {
        parts.push(`Stack: ${errorStack}`);
      }
    }

    this.error(parts.join(' | '));
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
