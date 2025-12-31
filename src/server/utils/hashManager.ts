/**
 * Hash Management System for Binary Integrity Verification
 * Provides automated hash fetching, caching, and validation for external binaries
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';

/**
 * Binary hash information
 */
export interface BinaryHash {
  version: string;
  assetName: string;
  sha256: string;
  url: string;
  lastUpdated: Date;
  source: 'official' | 'calculated' | 'cached';
}

/**
 * Hash cache configuration
 */
export interface HashCacheConfig {
  cacheDir: string;
  maxAge: number; // Maximum age in milliseconds
  fetchTimeout: number;
}

/**
 * Hash manager for automated binary integrity verification
 */
export class HashManager {
  private cache: Map<string, BinaryHash> = new Map();
  private config: HashCacheConfig;
  private cacheFilePath: string;

  constructor(config: Partial<HashCacheConfig> = {}) {
    this.config = {
      cacheDir: path.join(process.cwd(), '.hash-cache'),
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      fetchTimeout: 30000, // 30 seconds
      ...config
    };
    
    this.cacheFilePath = path.join(this.config.cacheDir, 'hash-cache.json');
    this.loadCache();
  }

  /**
   * Get hash for a specific binary asset
   */
  async getHash(
    tool: 'protoc' | 'buf',
    version: string,
    assetName: string
  ): Promise<BinaryHash | null> {
    const cacheKey = `${tool}-${version}-${assetName}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Try to fetch from official sources
    try {
      const officialHash = await this.fetchOfficialHash(tool, version, assetName);
      if (officialHash) {
        this.cache.set(cacheKey, officialHash);
        this.saveCache();
        return officialHash;
      }
    } catch (error) {
      console.warn(`Failed to fetch official hash for ${cacheKey}:`, error);
    }

    // Fallback: calculate hash by downloading the binary
    try {
      const calculatedHash = await this.calculateHashFromDownload(tool, version, assetName);
      if (calculatedHash) {
        this.cache.set(cacheKey, calculatedHash);
        this.saveCache();
        return calculatedHash;
      }
    } catch (error) {
      console.error(`Failed to calculate hash for ${cacheKey}:`, error);
    }

    return cached && !this.isCacheExpired(cached) ? cached : null;
  }

  /**
   * Fetch hash from official GitHub releases
   */
  private async fetchOfficialHash(
    tool: 'protoc' | 'buf',
    version: string,
    assetName: string
  ): Promise<BinaryHash | null> {
    const baseUrl = tool === 'protoc' 
      ? 'https://github.com/protocolbuffers/protobuf/releases'
      : 'https://github.com/bufbuild/buf/releases';

    // GitHub provides SHA256SUMS files for releases
    const sha256Url = `${baseUrl}/download/v${version}/sha256sums.txt`;
    
    try {
      const sha256Content = await this.fetchTextContent(sha256Url);
      const lines = sha256Content.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
        if (match && match[1] && match[2] && match[2].includes(assetName)) {
          return {
            version,
            assetName,
            sha256: match[1],
            url: `${baseUrl}/download/v${version}/${assetName}`,
            lastUpdated: new Date(),
            source: 'official'
          };
        }
      }
    } catch {
      // SHA256SUMS might not be available, try alternative methods
    }

    // Alternative: try to fetch .sha256 files for individual assets
    try {
      const shaFileUrl = `${baseUrl}/download/v${version}/${assetName}.sha256`;
      const shaContent = await this.fetchTextContent(shaFileUrl);
      const shaMatch = shaContent.match(/^([a-f0-9]{64})/);
      
      if (shaMatch && shaMatch[1]) {
        return {
          version,
          assetName,
          sha256: shaMatch[1],
          url: `${baseUrl}/download/v${version}/${assetName}`,
          lastUpdated: new Date(),
          source: 'official'
        };
      }
    } catch {
      // Individual SHA files not available
    }

    return null;
  }

  /**
   * Calculate hash by downloading the binary
   */
  private async calculateHashFromDownload(
    tool: 'protoc' | 'buf',
    version: string,
    assetName: string
  ): Promise<BinaryHash | null> {
    const baseUrl = tool === 'protoc'
      ? 'https://github.com/protocolbuffers/protobuf/releases'
      : 'https://github.com/bufbuild/buf/releases';

    const downloadUrl = `${baseUrl}/download/v${version}/${assetName}`;
    
    try {
      const hash = await this.downloadAndCalculateHash(downloadUrl);
      
      return {
        version,
        assetName,
        sha256: hash,
        url: downloadUrl,
        lastUpdated: new Date(),
        source: 'calculated'
      };
    } catch {
      return null;
    }
  }

  /**
   * Download file and calculate SHA256 hash
   */
  private async downloadAndCalculateHash(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.get(url, { 
        headers: { 'User-Agent': 'VSCode-Protobuf-Extension-HashManager' },
        timeout: this.config.fetchTimeout
      }, (response) => {
        if (response.statusCode !== 200 && response.statusCode !== 302) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        if (response.statusCode === 302 && response.headers.location) {
          this.downloadAndCalculateHash(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }

        response.on('data', (chunk) => {
          hash.update(chunk);
        });

        response.on('end', () => {
          resolve(hash.digest('hex'));
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Fetch text content from URL
   */
  private async fetchTextContent(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.get(url, {
        headers: { 'User-Agent': 'VSCode-Protobuf-Extension-HashManager' },
        timeout: this.config.fetchTimeout
      }, (response) => {
        if (response.statusCode !== 200 && response.statusCode !== 302) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        if (response.statusCode === 302 && response.headers.location) {
          this.fetchTextContent(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(entry: BinaryHash): boolean {
    const age = Date.now() - entry.lastUpdated.getTime();
    return age < this.config.maxAge;
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheExpired(entry: BinaryHash): boolean {
    const age = Date.now() - entry.lastUpdated.getTime();
    return age > this.config.maxAge * 7; // Allow 7x max age before complete expiration
  }

  /**
   * Load cache from disk
   */
  private loadCache(): void {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return;
      }

      const cacheData = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8')) as Record<string, BinaryHash>;
      Object.entries(cacheData).forEach(([key, entry]) => {
        entry.lastUpdated = new Date(entry.lastUpdated);
        this.cache.set(key, entry);
      });
    } catch {
      console.warn('Failed to load hash cache');
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      if (!fs.existsSync(this.config.cacheDir)) {
        fs.mkdirSync(this.config.cacheDir, { recursive: true });
      }

      const cacheData: Record<string, BinaryHash> = {};
      this.cache.forEach((value, key) => {
        cacheData[key] = value;
      });

      fs.writeFileSync(this.cacheFilePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('Failed to save hash cache:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.lastUpdated.getTime();
      if (age > this.config.maxAge * 7) {
        this.cache.delete(key);
      }
    }
    this.saveCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    officialHashes: number;
    calculatedHashes: number;
    expiredEntries: number;
  } {
    const stats = {
      totalEntries: this.cache.size,
      officialHashes: 0,
      calculatedHashes: 0,
      expiredEntries: 0
    };

    const now = Date.now();
    this.cache.forEach(entry => {
      if (entry.source === 'official') { stats.officialHashes++; }
      if (entry.source === 'calculated') { stats.calculatedHashes++; }
      if (now - entry.lastUpdated.getTime() > this.config.maxAge) {
        stats.expiredEntries++;
      }
    });

    return stats;
  }

  /**
   * Manually update hashes for a specific tool version
   */
  async updateToolHashes(tool: 'protoc' | 'buf', version: string): Promise<void> {
    const assetNames = this.getExpectedAssetNames(tool, version);
    
    for (const assetName of assetNames) {
      try {
        const hash = await this.getHash(tool, version, assetName);
        if (hash) {
          console.log(`Updated hash for ${tool} v${version} ${assetName}: ${hash.sha256}`);
        }
      } catch (error) {
        console.error(`Failed to update hash for ${assetName}:`, error);
      }
    }
  }

  /**
   * Get expected asset names for a tool version
   */
  private getExpectedAssetNames(tool: 'protoc' | 'buf', version: string): string[] {
    if (tool === 'protoc') {
      return [
        `protoc-${version}-win64.zip`,
        `protoc-${version}-osx-x86_64.zip`,
        `protoc-${version}-osx-aarch_64.zip`,
        `protoc-${version}-linux-x86_64.zip`,
        `protoc-${version}-linux-aarch_64.zip`
      ];
    } else {
      return [
        'buf-Windows-x86_64.exe',
        'buf-Darwin-x86_64',
        'buf-Darwin-arm64',
        'buf-Linux-x86_64',
        'buf-Linux-aarch64'
      ];
    }
  }
}

/**
 * Global hash manager instance
 */
export const hashManager = new HashManager();