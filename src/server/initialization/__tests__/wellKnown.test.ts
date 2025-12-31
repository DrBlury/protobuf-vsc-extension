/**
 * Tests for initialization/wellKnown.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    errorWithContext: jest.fn()
  }
}));

describe('wellKnown', () => {
  const mockedFs = jest.mocked(fs);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up env variables
    delete process.env.PROTOC_INCLUDE;
  });

  describe('discoverWellKnownIncludePath', () => {
    it('should return undefined when no paths exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBeUndefined();
    });

    it('should return path when file exists in first candidate', () => {
      mockedFs.existsSync.mockImplementation((p: any) => {
        return String(p) === '/usr/local/include/google/protobuf/timestamp.proto';
      });

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBe('/usr/local/include');
    });

    it('should check PROTOC_INCLUDE env variable first', () => {
      process.env.PROTOC_INCLUDE = '/custom/path';

      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        // Only return true for the custom path from env variable
        return pathStr === '/custom/path/google/protobuf/timestamp.proto';
      });

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBe('/custom/path');
    });

    it('should check multiple PROTOC_INCLUDE paths separated by path delimiter', () => {
      process.env.PROTOC_INCLUDE = `/first/path${path.delimiter}/second/path`;

      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        // Only the second path exists
        return pathStr === '/second/path/google/protobuf/timestamp.proto';
      });

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBe('/second/path');
    });

    it('should skip empty path entries', () => {
      process.env.PROTOC_INCLUDE = '';

      mockedFs.existsSync.mockReturnValue(false);

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBeUndefined();
    });

    it('should fall back to PROTOC_INCLUDE_PATHS when env var path does not exist', () => {
      process.env.PROTOC_INCLUDE = '/nonexistent/path';

      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        // Only usr/local/include exists
        return pathStr === '/usr/local/include/google/protobuf/timestamp.proto';
      });

      let result: string | undefined;
      jest.isolateModules(() => {
        const { discoverWellKnownIncludePath } = require('../wellKnown');
        result = discoverWellKnownIncludePath();
      });

      expect(result).toBe('/usr/local/include');
    });
  });

  describe('preloadGoogleWellKnownProtos', () => {
    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.readFileSync.mockReturnValue('syntax = "proto3";');
      mockedFs.mkdirSync.mockReturnValue(undefined);
      mockedFs.writeFileSync.mockReturnValue(undefined);
    });

    it('should handle case when all sources are unavailable', () => {
      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos(undefined, parser, analyzer);
      });

      expect(analyzer.updateFile).toHaveBeenCalled();
      expect(parser.parse).toHaveBeenCalled();
    });

    it('should use discovered include path when available', () => {
      // Mock existsSync to return true for discovered paths
      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        return pathStr.startsWith('/discovered/');
      });

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos('/discovered', parser, analyzer);
      });

      // Verify readFileSync was called with discovered path
      expect(mockedFs.readFileSync).toHaveBeenCalled();
      const readCalls = mockedFs.readFileSync.mock.calls;
      const hasDiscoveredPath = readCalls.some(call => String(call[0]).startsWith('/discovered/'));
      expect(hasDiscoveredPath).toBe(true);
    });

    it('should use bundled resource path when discovered path not available', () => {
      // Mock existsSync to return true only for resource paths
      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        return pathStr.includes('resources') && pathStr.includes('google-protos');
      });

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos(undefined, parser, analyzer);
      });

      // Verify readFileSync was called
      expect(mockedFs.readFileSync).toHaveBeenCalled();
    });

    it('should write to cache when cache dir is provided and no files exist', () => {
      // Ensure no existing files are found
      mockedFs.existsSync.mockReturnValue(false);

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos(undefined, parser, analyzer, '/cache/dir');
      });

      expect(mockedFs.mkdirSync).toHaveBeenCalled();
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle fs write errors gracefully', () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => {
        throw new Error('Failed to create directory');
      });

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        // Should not throw
        preloadGoogleWellKnownProtos(undefined, parser, analyzer, '/cache/dir');
      });

      expect(analyzer.updateFile).toHaveBeenCalled();
    });

    it('should handle parser errors gracefully', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const parser = {
        parse: jest.fn().mockImplementation(() => {
          throw new Error('Parse error');
        })
      };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        // Should not throw
        preloadGoogleWellKnownProtos(undefined, parser, analyzer);
      });

      // Parse should be called but should not throw
      expect(parser.parse).toHaveBeenCalled();
    });

    it('should use file URI for existing files', () => {
      // Return true for discovered paths
      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        return pathStr.startsWith('/discovered/');
      });

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos('/discovered', parser, analyzer);
      });

      // Verify parser was called with file:// URI
      const parseCalls = parser.parse.mock.calls;
      const hasFileUri = parseCalls.some(call => String(call[1]).startsWith('file://'));
      expect(hasFileUri).toBe(true);
    });

    it('should use builtin:// URI for fallback content', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos(undefined, parser, analyzer);
      });

      // Verify parser was called with builtin:// URI
      const parseCalls = parser.parse.mock.calls;
      const hasBuiltinUri = parseCalls.some(call => String(call[1]).startsWith('builtin://'));
      expect(hasBuiltinUri).toBe(true);
    });

    it('should not write to cache when file already exists', () => {
      // File exists in discovered path
      mockedFs.existsSync.mockImplementation((p: any) => {
        const pathStr = String(p);
        return pathStr.startsWith('/discovered/');
      });

      const parser = { parse: jest.fn().mockReturnValue({}) };
      const analyzer = { updateFile: jest.fn() };

      jest.isolateModules(() => {
        const { preloadGoogleWellKnownProtos } = require('../wellKnown');
        preloadGoogleWellKnownProtos('/discovered', parser, analyzer, '/cache/dir');
      });

      // mkdirSync and writeFileSync should NOT be called because files exist
      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
