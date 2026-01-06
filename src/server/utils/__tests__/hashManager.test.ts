/**
 * Tests for hash manager - binary integrity verification
 */

import { HashManager, BinaryHash, hashManager } from '../hashManager';
import * as fs from 'fs';

// Mock modules
jest.mock('fs');
jest.mock('https');
jest.mock('http');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('HashManager', () => {
  let manager: HashManager;
  const testCacheDir = '/tmp/test-hash-cache';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
    mockFs.writeFileSync.mockImplementation(() => undefined);

    manager = new HashManager({
      cacheDir: testCacheDir,
      maxAge: 1000,
      fetchTimeout: 5000
    });
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      mockFs.existsSync.mockReturnValue(false);
      const defaultManager = new HashManager();
      expect(defaultManager).toBeDefined();
    });

    it('should create manager with custom config', () => {
      const customManager = new HashManager({
        cacheDir: '/custom/cache',
        maxAge: 5000,
        fetchTimeout: 10000
      });
      expect(customManager).toBeDefined();
    });

    it('should load existing cache from disk', () => {
      const cachedData = {
        'protoc-3.21.0-protoc.zip': {
          version: '3.21.0',
          assetName: 'protoc.zip',
          sha256: 'abc123',
          url: 'https://example.com/protoc.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const managerWithCache = new HashManager({ cacheDir: testCacheDir });
      expect(managerWithCache).toBeDefined();
    });

    it('should handle corrupted cache file gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json{{{');

      // Should not throw
      const managerWithBadCache = new HashManager({ cacheDir: testCacheDir });
      expect(managerWithBadCache).toBeDefined();
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats for empty cache', () => {
      const stats = manager.getCacheStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.officialHashes).toBe(0);
      expect(stats.calculatedHashes).toBe(0);
      expect(stats.expiredEntries).toBe(0);
    });

    it('should correctly count official and calculated hashes', () => {
      const cachedData = {
        'protoc-3.21.0-asset1.zip': {
          version: '3.21.0',
          assetName: 'asset1.zip',
          sha256: 'hash1',
          url: 'https://example.com/asset1.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official'
        },
        'protoc-3.21.0-asset2.zip': {
          version: '3.21.0',
          assetName: 'asset2.zip',
          sha256: 'hash2',
          url: 'https://example.com/asset2.zip',
          lastUpdated: new Date().toISOString(),
          source: 'calculated'
        },
        'buf-1.0.0-asset3.zip': {
          version: '1.0.0',
          assetName: 'asset3.zip',
          sha256: 'hash3',
          url: 'https://example.com/asset3.zip',
          lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days old
          source: 'official'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const managerWithData = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      const stats = managerWithData.getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.officialHashes).toBe(2);
      expect(stats.calculatedHashes).toBe(1);
      expect(stats.expiredEntries).toBe(1);
    });
  });

  describe('clearExpiredCache', () => {
    it('should clear expired entries', () => {
      // Set up a cached entry that is expired
      const cachedData = {
        'protoc-3.21.0-protoc.zip': {
          version: '3.21.0',
          assetName: 'protoc.zip',
          sha256: 'abc123',
          url: 'https://example.com/protoc.zip',
          lastUpdated: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          source: 'official'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const managerWithExpired = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 1000 // 1 second
      });

      managerWithExpired.clearExpiredCache();

      // Verify writeFileSync was called to save the cleared cache
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should create cache directory if not exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      // Trigger saveCache by clearing expired cache
      manager.clearExpiredCache();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testCacheDir, { recursive: true });
    });

    it('should handle write errors gracefully', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      manager.clearExpiredCache();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('isCacheValid (private method via integration)', () => {
    it('should treat recent entries as valid', () => {
      const recentEntry: BinaryHash = {
        version: '3.21.0',
        assetName: 'protoc.zip',
        sha256: 'abc123',
        url: 'https://example.com',
        lastUpdated: new Date(),
        source: 'official'
      };

      const cachedData = {
        'protoc-3.21.0-protoc.zip': recentEntry
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const managerWithRecent = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 10000000 // Very long time
      });

      const stats = managerWithRecent.getCacheStats();
      expect(stats.expiredEntries).toBe(0);
    });
  });

  describe('hashManager singleton', () => {
    it('should export a default hash manager instance', () => {
      expect(hashManager).toBeDefined();
      expect(hashManager).toBeInstanceOf(HashManager);
    });
  });

  describe('getHash with valid cache', () => {
    it('should return cached hash if valid', async () => {
      const cachedData = {
        'protoc-3.21.0-protoc.zip': {
          version: '3.21.0',
          assetName: 'protoc.zip',
          sha256: 'abc123def456',
          url: 'https://github.com/protocolbuffers/protobuf/releases/download/v3.21.0/protoc.zip',
          lastUpdated: new Date().toISOString(),
          source: 'official'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

      const managerWithCache = new HashManager({
        cacheDir: testCacheDir,
        maxAge: 10000000
      });

      const result = await managerWithCache.getHash('protoc', '3.21.0', 'protoc.zip');
      expect(result).toBeDefined();
      expect(result?.sha256).toBe('abc123def456');
    });
  });

  describe('updateToolHashes', () => {
    it('should attempt to update hashes for protoc', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.updateToolHashes('protoc', '3.21.0');

      // Just ensure it doesn't throw
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should attempt to update hashes for buf', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.updateToolHashes('buf', '1.0.0');

      // Just ensure it doesn't throw
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
