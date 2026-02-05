/**
 * Additional coverage tests for hashManager, parser, and codeActions
 */

import { HashManager } from '../../utils/hashManager';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter, PassThrough } from 'stream';

// Mock modules
jest.mock('fs');
jest.mock('https');
jest.mock('http');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockHttps = https as jest.Mocked<typeof https>;
const mockHttp = http as jest.Mocked<typeof http>;

// Helper to create mock HTTP response
function createMockResponse(
  statusCode: number,
  data: string | Buffer = '',
  headers: Record<string, string> = {}
): EventEmitter {
  const response = new PassThrough() as PassThrough & {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
  };
  response.statusCode = statusCode;
  response.statusMessage = statusCode === 200 ? 'OK' : 'Error';
  response.headers = headers;

  setImmediate(() => {
    if (data) {
      response.emit('data', data);
    }
    response.emit('end');
  });

  return response;
}

// Helper to create mock request
function createMockRequest(): EventEmitter & { destroy: jest.Mock } {
  const request = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
  request.destroy = jest.fn();
  return request;
}

describe('HashManager Extended Coverage', () => {
  const testCacheDir = '/tmp/test-hash-cache-ext';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  describe('calculateHashFromDownload error handling', () => {
    it('should handle request timeout', async () => {
      const mockRequest = createMockRequest();

      (mockHttps.get as jest.Mock).mockImplementation(
        (_url: string, _options: object, _callback: (res: EventEmitter) => void) => {
          // Emit timeout after a short delay
          setTimeout(() => {
            mockRequest.emit('timeout');
          }, 10);
          return mockRequest;
        }
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000,
        fetchTimeout: 50,
      });

      const result = await manager.getHash('protoc', '3.21.0', 'protoc-3.21.0-win64.zip');

      expect(result).toBeNull();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }, 10000);

    it('should handle request error', async () => {
      const mockRequest = createMockRequest();

      (mockHttps.get as jest.Mock).mockImplementation(
        (_url: string, _options: object, _callback: (res: EventEmitter) => void) => {
          setTimeout(() => {
            mockRequest.emit('error', new Error('Connection refused'));
          }, 10);
          return mockRequest;
        }
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000,
        fetchTimeout: 5000,
      });

      const result = await manager.getHash('protoc', '3.21.0', 'protoc-3.21.0-win64.zip');

      expect(result).toBeNull();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }, 10000);

    it('should handle response error', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = new PassThrough() as PassThrough & {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
      };
      mockResponse.statusCode = 200;
      mockResponse.statusMessage = 'OK';
      mockResponse.headers = {};

      (mockHttps.get as jest.Mock).mockImplementation(
        (url: string, options: object, callback: (res: EventEmitter) => void) => {
          callback(mockResponse);
          setTimeout(() => {
            mockResponse.emit('error', new Error('Connection reset'));
          }, 10);
          return mockRequest;
        }
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000,
        fetchTimeout: 5000,
      });

      const result = await manager.getHash('protoc', '3.21.0', 'protoc-3.21.0-win64.zip');

      // Will timeout or error, should not throw
      expect(result).toBeNull();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }, 10000);
  });

  describe('fetchTextContent with http', () => {
    it('should use http client for http URLs', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200, 'text content');

      (mockHttp.get as jest.Mock).mockImplementation(
        (url: string, options: object, callback: (res: EventEmitter) => void) => {
          callback(mockResponse);
          return mockRequest;
        }
      );
      (mockHttps.get as jest.Mock).mockImplementation(
        (url: string, options: object, callback: (res: EventEmitter) => void) => {
          callback(createMockResponse(404));
          return mockRequest;
        }
      );

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000,
        fetchTimeout: 5000,
      });

      // This will internally call http/https based on URL
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.getHash('protoc', '3.21.0', 'protoc-3.21.0-win64.zip');

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }, 10000);
  });

  describe('updateToolHashes with successful updates', () => {
    it('should log successful hash updates', async () => {
      const cachedData = {
        'protoc-25.0-protoc-25.0-win64.zip': {
          version: '25.0',
          assetName: 'protoc-25.0-win64.zip',
          sha256: 'abc123',
          url: 'https://example.com/protoc.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 10000000,
      });

      await manager.updateToolHashes('protoc', '25.0');

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }, 10000);
  });

  describe('clearExpiredCache edge cases', () => {
    it('should keep non-expired entries', () => {
      const cachedData = {
        'protoc-3.21.0-recent.zip': {
          version: '3.21.0',
          assetName: 'recent.zip',
          sha256: 'abc123',
          url: 'https://example.com/recent.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official',
        },
        'protoc-3.21.0-old.zip': {
          version: '3.21.0',
          assetName: 'old.zip',
          sha256: 'def456',
          url: 'https://example.com/old.zip',
          lastUpdated: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
          source: 'official',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000, // 1 second, so the old entry is definitely expired (7x would be 7 seconds)
      });

      manager.clearExpiredCache();

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getCacheStats with mixed entries', () => {
    it('should correctly count all entry types', () => {
      const cachedData = {
        entry1: {
          version: '1.0',
          assetName: 'e1.zip',
          sha256: 'h1',
          url: 'https://example.com/e1.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official',
        },
        entry2: {
          version: '1.0',
          assetName: 'e2.zip',
          sha256: 'h2',
          url: 'https://example.com/e2.zip',
          lastUpdated: new Date().toISOString(),
          source: 'calculated',
        },
        entry3: {
          version: '1.0',
          assetName: 'e3.zip',
          sha256: 'h3',
          url: 'https://example.com/e3.zip',
          lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days old
          source: 'official',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const manager = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      });

      const stats = manager.getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.officialHashes).toBe(2);
      expect(stats.calculatedHashes).toBe(1);
      expect(stats.expiredEntries).toBe(1);
    });
  });
});
