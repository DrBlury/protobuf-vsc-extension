/**
 * Tests for logger utilities
 */

import { Logger, LogLevel } from '../logger';
import { Connection } from 'vscode-languageserver/node';

describe('Logger', () => {
  let logger: Logger;
  let mockConnection: Partial<Connection>;

  beforeEach(() => {
    logger = new Logger();
    mockConnection = {
      console: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        log: jest.fn()
      } as any
    };
  });

  describe('initialization', () => {
    it('should initialize with connection', () => {
      logger.initialize(mockConnection as Connection);
      expect(logger.isVerboseLoggingEnabled()).toBe(false);
    });

    it('should initialize with log level', () => {
      logger.initialize(mockConnection as Connection, LogLevel.DEBUG);
      logger.debug('test');
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should initialize with verbose logging', () => {
      logger.initialize(mockConnection as Connection, LogLevel.INFO, true);
      expect(logger.isVerboseLoggingEnabled()).toBe(true);
    });
  });

  describe('setLevel', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should set log level', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('test');
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should filter messages below level', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.info('test');
      expect(mockConnection.console?.info).not.toHaveBeenCalled();
    });
  });

  describe('setVerboseLogging', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should enable verbose logging', () => {
      logger.setVerboseLogging(true);
      expect(logger.isVerboseLoggingEnabled()).toBe(true);
    });

    it('should disable verbose logging', () => {
      logger.setVerboseLogging(true);
      logger.setVerboseLogging(false);
      expect(logger.isVerboseLoggingEnabled()).toBe(false);
    });
  });

  describe('error', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log error messages', () => {
      logger.error('Error message');
      expect(mockConnection.console?.error).toHaveBeenCalledWith('Error message');
    });

    it('should log error with arguments', () => {
      logger.error('Error', 'arg1', 'arg2');
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });

    it('should log even at ERROR level', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.error('Error');
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });

    it('should use console.error when no connection', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.ERROR);
      logger2.error('Error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('warn', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(mockConnection.console?.warn).toHaveBeenCalled();
    });

    it('should not log when level is ERROR only', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.warn('Warning');
      expect(mockConnection.console?.warn).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log info messages', () => {
      logger.info('Info message');
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should not log when level is WARN or higher', () => {
      logger.setLevel(LogLevel.WARN);
      logger.info('Info');
      expect(mockConnection.console?.info).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log debug messages at DEBUG level', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug message');
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should not log when level is INFO or higher', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('Debug');
      expect(mockConnection.console?.log).not.toHaveBeenCalled();
    });
  });

  describe('verbose', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log verbose messages when verbose logging enabled', () => {
      logger.setVerboseLogging(true);
      logger.verbose('Verbose message');
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('[VERBOSE]'));
    });

    it('should log verbose messages at VERBOSE level', () => {
      logger.setLevel(LogLevel.VERBOSE);
      logger.verbose('Verbose message');
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should not log when verbose disabled and level below VERBOSE', () => {
      logger.setVerboseLogging(false);
      logger.setLevel(LogLevel.DEBUG);
      logger.verbose('Verbose');
      expect(mockConnection.console?.log).not.toHaveBeenCalled();
    });
  });

  describe('verboseWithContext', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log with URI context', () => {
      logger.setVerboseLogging(true);
      logger.verboseWithContext('Message', { uri: 'file:///test.proto' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('URI:'));
    });

    it('should log with position context', () => {
      logger.setVerboseLogging(true);
      logger.verboseWithContext('Message', { position: { line: 5, character: 10 } });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Position:'));
    });

    it('should log with operation context', () => {
      logger.setVerboseLogging(true);
      logger.verboseWithContext('Message', { operation: 'parse' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Operation:'));
    });

    it('should log with duration context', () => {
      logger.setVerboseLogging(true);
      logger.verboseWithContext('Message', { duration: 100 });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Duration:'));
    });

    it('should log with custom context', () => {
      logger.setVerboseLogging(true);
      logger.verboseWithContext('Message', { customKey: 'customValue' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('customKey:'));
    });

    it('should handle unserializable context', () => {
      logger.setVerboseLogging(true);
      const circular: any = { a: 1 };
      circular.self = circular;
      logger.verboseWithContext('Message', { circular });
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should not log when verbose disabled', () => {
      logger.setVerboseLogging(false);
      logger.setLevel(LogLevel.DEBUG);
      logger.verboseWithContext('Message', {});
      expect(mockConnection.console?.log).not.toHaveBeenCalled();
    });
  });

  describe('debugWithContext', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection, LogLevel.DEBUG);
    });

    it('should log with context', () => {
      logger.debugWithContext('Message', { uri: 'file:///test.proto' });
      expect(mockConnection.console?.log).toHaveBeenCalled();
    });

    it('should log with error context', () => {
      const error = new Error('Test error');
      logger.debugWithContext('Message', { error });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });
  });

  describe('errorWithContext', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should log error with context', () => {
      logger.errorWithContext('Error', { uri: 'file:///test.proto' });
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });

    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Stack:'));
    });

    it('should handle non-Error objects', () => {
      logger.errorWithContext('Error', { error: 'String error' });
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });
  });

  describe('format', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should format message with object arguments', () => {
      logger.info('Message', { key: 'value' });
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('Message'));
    });

    it('should handle formatting errors gracefully', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      logger.info('Message', circular);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });
  });
});
