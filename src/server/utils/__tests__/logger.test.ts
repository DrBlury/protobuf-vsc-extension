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

    it('should log error with sanitized message (no stack trace for security)', () => {
      const error = new Error('Test error');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Error:'));
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

  describe('formatArg (via format)', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should format null values', () => {
      logger.info('Message', null);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('null'));
    });

    it('should format undefined values', () => {
      logger.info('Message', undefined);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('undefined'));
    });

    it('should format Error objects with name and message', () => {
      const error = new Error('Test error');
      error.name = 'CustomError';
      logger.info('Message', error);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('CustomError'));
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });

    it('should format Error objects with stack trace', () => {
      const error = new Error('Test error');
      logger.info('Message', error);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('Stack:'));
    });

    it('should format Error objects with cause (ES2022+)', () => {
      const cause = new Error('Root cause');
      const error = new Error('Wrapper error', { cause });
      logger.info('Message', error);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('Cause:'));
    });

    it('should format empty objects', () => {
      logger.info('Message', {});
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('[empty object]'));
    });

    it('should format empty objects with custom constructor name', () => {
      class CustomClass {}
      const instance = new CustomClass();
      logger.info('Message', instance);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('CustomClass'));
    });

    it('should format objects as JSON', () => {
      logger.info('Message', { key: 'value', nested: { a: 1 } });
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('"key":"value"'));
    });

    it('should handle circular references in objects', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      logger.info('Message', circular);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('non-serializable'));
    });

    it('should format primitive values as strings', () => {
      logger.info('Message', 42, true, 'string');
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('42'));
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('true'));
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('string'));
    });

    it('should format arrays as JSON', () => {
      logger.info('Message', [1, 2, 3]);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('[1,2,3]'));
    });
  });

  describe('sanitizeErrorMessage (via errorWithContext)', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should redact Unix paths', () => {
      const error = new Error('Error at /home/user/project/file.ts');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
      expect(mockConnection.console?.error).not.toHaveBeenCalledWith(expect.stringContaining('/home/user'));
    });

    it('should redact Windows-style paths with drive letters', () => {
      const error = new Error('Error at C:/Users/user/project/');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
    });

    it('should redact environment variable exposures', () => {
      const error = new Error('API_KEY=secret123');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_ENV]'));
    });

    it('should redact /home directory paths', () => {
      const error = new Error('Error in /home/john/Documents');
      logger.errorWithContext('Error occurred', { error });
      // The general path regex runs first, so this becomes [REDACTED_PATH]
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
    });

    it('should redact localhost ports', () => {
      const error = new Error('Connection to localhost:8080 failed');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('localhost:[PORT]'));
    });

    it('should redact 127.0.0.1 ports', () => {
      const error = new Error('Connection to 127.0.0.1:3000 refused');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('127.0.0.1:[PORT]'));
    });

    it('should redact sensitive file extensions', () => {
      const error = new Error('Could not load certificate.pem');
      logger.errorWithContext('Error occurred', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_EXT]'));
    });

    it('should sanitize URI in context', () => {
      logger.errorWithContext('Error', { uri: 'file:///home/user/secret/file.proto' });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
    });

    it('should handle non-Error objects', () => {
      logger.errorWithContext('Error', { error: 'String error with /path/to/file' });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
    });
  });

  describe('console fallbacks', () => {
    let consoleSpy: { [key: string]: jest.SpyInstance };

    beforeEach(() => {
      consoleSpy = {
        error: jest.spyOn(console, 'error').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        info: jest.spyOn(console, 'info').mockImplementation(),
        debug: jest.spyOn(console, 'debug').mockImplementation(),
        log: jest.spyOn(console, 'log').mockImplementation()
      };
    });

    afterEach(() => {
      Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    it('should use console.error when no connection for error()', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.ERROR);
      logger2.error('Error message');
      expect(consoleSpy.error).toHaveBeenCalledWith('Error message');
    });

    it('should use console.warn when no connection for warn()', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.WARN);
      logger2.warn('Warning message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should use console.info when no connection for info()', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.INFO);
      logger2.info('Info message');
      expect(consoleSpy.info).toHaveBeenCalledWith('Info message');
    });

    it('should use console.debug when no connection for debug()', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.DEBUG);
      logger2.debug('Debug message');
      expect(consoleSpy.debug).toHaveBeenCalledWith('Debug message');
    });

    it('should use console.log when no connection for verbose()', () => {
      const logger2 = new Logger();
      logger2.setVerboseLogging(true);
      logger2.verbose('Verbose message');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[VERBOSE]'));
    });

    it('should use console.log when no connection for verboseWithContext()', () => {
      const logger2 = new Logger();
      logger2.setVerboseLogging(true);
      logger2.verboseWithContext('Message', { uri: 'test.proto' });
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should use console for debugWithContext when no connection', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.DEBUG);
      logger2.debugWithContext('Debug message', { uri: 'test.proto' });
      // debugWithContext calls debug which uses console.debug
      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('should use console for errorWithContext when no connection', () => {
      const logger2 = new Logger();
      logger2.setLevel(LogLevel.ERROR);
      logger2.errorWithContext('Error message', { uri: 'test.proto' });
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('errorWithContext edge cases', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should include position in error context', () => {
      logger.errorWithContext('Error', { position: { line: 10, character: 5 } });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Position: 10:5'));
    });

    it('should include operation in error context', () => {
      logger.errorWithContext('Error', { operation: 'parsing' });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Operation: parsing'));
    });

    it('should include all context fields together', () => {
      logger.errorWithContext('Full context error', {
        uri: 'file:///test.proto',
        position: { line: 5, character: 10 },
        operation: 'validation',
        error: new Error('Test error')
      });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('URI:'));
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Position: 5:10'));
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Operation: validation'));
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });

    it('should handle empty context', () => {
      logger.errorWithContext('Error with empty context', {});
      expect(mockConnection.console?.error).toHaveBeenCalledWith('Error with empty context');
    });

    it('should redact .key file extension', () => {
      const error = new Error('Cannot read private.key');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_EXT]'));
    });

    it('should redact .p12 file extension', () => {
      const error = new Error('Cannot load certificate.p12');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_EXT]'));
    });

    it('should redact .pfx file extension', () => {
      const error = new Error('Certificate file.pfx not found');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_EXT]'));
    });
  });

  describe('debugWithContext', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection, LogLevel.DEBUG);
    });

    it('should include uri in debug context', () => {
      logger.debugWithContext('Debug', { uri: 'file:///test.proto' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('URI: file:///test.proto'));
    });

    it('should include position in debug context', () => {
      logger.debugWithContext('Debug', { position: { line: 5, character: 10 } });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Position: 5:10'));
    });

    it('should include operation in debug context', () => {
      logger.debugWithContext('Debug', { operation: 'analyze' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Operation: analyze'));
    });

    it('should include error message in debug context', () => {
      const error = new Error('Debug error');
      logger.debugWithContext('Debug', { error });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Error: Debug error'));
    });

    it('should handle non-Error object in debug context', () => {
      logger.debugWithContext('Debug', { error: 'String error' });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Error: String error'));
    });

    it('should handle all context fields together', () => {
      logger.debugWithContext('Full debug', {
        uri: 'file:///debug.proto',
        position: { line: 1, character: 0 },
        operation: 'test',
        error: new Error('test error')
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('URI:'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Position:'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Operation:'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });

    it('should not log when level is above DEBUG', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.debugWithContext('Should not appear', { uri: 'test.proto' });
      expect(mockConnection.console?.log).not.toHaveBeenCalled();
    });
  });

  describe('verboseWithContext edge cases', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
      logger.setVerboseLogging(true);
    });

    it('should include all context types', () => {
      logger.verboseWithContext('Verbose message', {
        uri: 'file:///test.proto',
        position: { line: 10, character: 5 },
        operation: 'completion',
        duration: 150,
        extra: 'value'
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('[VERBOSE]'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('URI:'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Position: 10:5'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Operation: completion'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Duration: 150ms'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('extra: value'));
    });

    it('should handle zero duration', () => {
      logger.verboseWithContext('Fast operation', { duration: 0 });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('Duration: 0ms'));
    });

    it('should serialize object context values', () => {
      logger.verboseWithContext('Object context', {
        data: { nested: { value: 123 } }
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('{"nested":{"value":123}}'));
    });

    it('should handle array context values', () => {
      logger.verboseWithContext('Array context', {
        items: [1, 2, 3]
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('[1,2,3]'));
    });

    it('should handle boolean context values', () => {
      logger.verboseWithContext('Boolean context', {
        enabled: true,
        disabled: false
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('enabled: true'));
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('disabled: false'));
    });

    it('should handle null context values', () => {
      logger.verboseWithContext('Null context', {
        value: null
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('value: null'));
    });

    it('should handle undefined context values', () => {
      logger.verboseWithContext('Undefined context', {
        value: undefined
      });
      expect(mockConnection.console?.log).toHaveBeenCalledWith(expect.stringContaining('value: undefined'));
    });
  });

  describe('LogLevel enum values', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
      expect(LogLevel.VERBOSE).toBe(4);
    });

    it('should filter correctly at each level', () => {
      logger.initialize(mockConnection as Connection, LogLevel.ERROR);

      logger.error('error');
      logger.warn('warn');
      logger.info('info');
      logger.debug('debug');
      logger.verbose('verbose');

      expect(mockConnection.console?.error).toHaveBeenCalledTimes(1);
      expect(mockConnection.console?.warn).not.toHaveBeenCalled();
      expect(mockConnection.console?.info).not.toHaveBeenCalled();
      expect(mockConnection.console?.log).not.toHaveBeenCalled();
    });

    it('should allow all at VERBOSE level', () => {
      logger.initialize(mockConnection as Connection, LogLevel.VERBOSE);

      logger.error('error');
      logger.warn('warn');
      logger.info('info');
      logger.debug('debug');
      logger.verbose('verbose');

      expect(mockConnection.console?.error).toHaveBeenCalledTimes(1);
      expect(mockConnection.console?.warn).toHaveBeenCalledTimes(1);
      expect(mockConnection.console?.info).toHaveBeenCalledTimes(1);
      // debug and verbose both use console.log
      expect(mockConnection.console?.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatArg additional cases', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should format Date objects', () => {
      const date = new Date('2026-01-07T12:00:00Z');
      logger.info('Date:', date);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format RegExp objects', () => {
      const regex = /test-pattern/gi;
      logger.info('Regex:', regex);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format Map objects', () => {
      const map = new Map([['key', 'value']]);
      logger.info('Map:', map);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format Set objects', () => {
      const set = new Set([1, 2, 3]);
      logger.info('Set:', set);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format Symbol values', () => {
      const sym = Symbol('test');
      logger.info('Symbol:', sym);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format BigInt values', () => {
      const big = BigInt(9007199254740991);
      logger.info('BigInt:', big);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format function objects', () => {
      const fn = () => 'test';
      logger.info('Function:', fn);
      expect(mockConnection.console?.info).toHaveBeenCalled();
    });

    it('should format NaN', () => {
      logger.info('NaN:', NaN);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('NaN'));
    });

    it('should format Infinity', () => {
      logger.info('Infinity:', Infinity);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('Infinity'));
    });

    it('should format negative Infinity', () => {
      logger.info('Negative Infinity:', -Infinity);
      expect(mockConnection.console?.info).toHaveBeenCalledWith(expect.stringContaining('-Infinity'));
    });
  });

  describe('sanitizeErrorMessage additional cases', () => {
    beforeEach(() => {
      logger.initialize(mockConnection as Connection);
    });

    it('should redact multiple paths in same message', () => {
      const error = new Error('Copy /src/file to /dest/file failed');
      logger.errorWithContext('Error', { error });
      // Should have multiple [REDACTED_PATH] occurrences
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });

    it('should redact paths with special characters', () => {
      const error = new Error('Error at /path/with-dashes/and_underscores/file.txt');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_PATH]'));
    });

    it('should preserve non-path text', () => {
      const error = new Error('Connection failed');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
    });

    it('should handle empty error message', () => {
      const error = new Error('');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });

    it('should handle error with only whitespace', () => {
      const error = new Error('   ');
      logger.errorWithContext('Error', { error });
      expect(mockConnection.console?.error).toHaveBeenCalled();
    });
  });
});
