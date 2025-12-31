/**
 * Dependency Confusion Attack Prevention System
 * Validates package dependencies to prevent supply chain attacks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
  packageName: string;
  expectedRegistry: string;
  actualRegistry: string;
  isConfused: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  recommendation: string;
}

/**
 * Package registry information
 */
export interface PackageRegistry {
  name: string;
  url: string;
  trusted: boolean;
  allowedScopes?: string[];
}

/**
 * Dependency confusion validator
 */
export class DependencyConfusionValidator {
  private static readonly TRUSTED_REGISTRIES: PackageRegistry[] = [
    {
      name: 'npm',
      url: 'https://registry.npmjs.org',
      trusted: true
    },
    {
      name: 'github',
      url: 'https://npm.pkg.github.com',
      trusted: true
    }
  ];

  private static readonly HIGH_RISK_SCOPES = [
    '@types/',
    '@babel/',
    '@webpack/',
    '@rollup/',
    '@eslint/',
    '@typescript-eslint/'
  ];

  static getTrustedRegistries(): PackageRegistry[] {
    return this.TRUSTED_REGISTRIES;
  }

  static async validateDependencies(packageJsonPath: string): Promise<DependencyValidationResult[]> {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const results: DependencyValidationResult[] = [];
      
      // Check direct dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          const result = await this.validateSingleDependency(name, String(version), 'production');
          results.push(result);
        }
      }
      
      // Check dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          const result = await this.validateSingleDependency(name, String(version), 'development');
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to validate dependencies: ${error}`);
    }
  }

  private static async validateSingleDependency(
    packageName: string,
    _version: string,
    dependencyType: 'production' | 'development'
  ): Promise<DependencyValidationResult> {
    const expectedRegistry = this.detectExpectedRegistry(packageName);
    const actualRegistry = await this.resolveActualRegistry(packageName);
    
    const isConfused = this.isDependencyConfused(expectedRegistry, actualRegistry, packageName);
    const risk = this.assessRiskLevel(packageName, isConfused, dependencyType);
    const details = this.generateValidationDetails(packageName, expectedRegistry, actualRegistry, isConfused);
    const recommendation = this.generateRecommendation(isConfused, risk, packageName);

    return {
      packageName,
      expectedRegistry,
      actualRegistry,
      isConfused,
      risk,
      details,
      recommendation
    };
  }

  private static detectExpectedRegistry(packageName: string): string {
    if (packageName.startsWith('@')) {
      const scope = packageName.split('/')[0];
      
      if (scope && this.HIGH_RISK_SCOPES.some(riskyScope => scope.startsWith(riskyScope))) {
        return 'npm';
      }
      
      if (scope && (scope.includes('github') || scope.includes('gitlab'))) {
        return 'github';
      }
    }
    
    return 'npm';
  }

  private static async resolveActualRegistry(packageName: string): Promise<string> {
    try {
      // Try to resolve package from npm registry
      const npmResponse = await this.fetchFromRegistry('https://registry.npmjs.org', packageName);
      if (npmResponse.found) {
        return 'npm';
      }
      
      // Try GitHub packages registry
      const githubResponse = await this.fetchFromRegistry('https://npm.pkg.github.com', packageName);
      if (githubResponse.found) {
        return 'github';
      }
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private static async fetchFromRegistry(registryUrl: string, packageName: string): Promise<{ found: boolean; registry: string }> {
    return new Promise((resolve) => {
      const url = `${registryUrl}/${packageName.replace('@', '%40').replace('/', '%2F')}`;
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.get(url, { timeout: 5000 }, (response) => {
        resolve({
          found: response.statusCode === 200,
          registry: registryUrl
        });
      });

      request.on('error', () => {
        resolve({
          found: false,
          registry: registryUrl
        });
      });

      request.on('timeout', () => {
        resolve({
          found: false,
          registry: registryUrl
        });
      });
    });
  }

  private static isDependencyConfused(
    expectedRegistry: string,
    actualRegistry: string,
    packageName: string
  ): boolean {
    // Check for registry mismatch
    if (expectedRegistry !== actualRegistry && actualRegistry !== 'unknown') {
      return true;
    }
    
    // Check for high-risk scope confusion
    if (this.HIGH_RISK_SCOPES.some(scope => packageName.startsWith(scope))) {
      return true;
    }
    
    return false;
  }

  private static assessRiskLevel(
    packageName: string,
    isConfused: boolean,
    dependencyType: 'production' | 'development'
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (!isConfused) {
      return 'low';
    }
    
    // Higher risk for production dependencies
    if (dependencyType === 'production') {
      if (this.HIGH_RISK_SCOPES.some(scope => packageName.startsWith(scope))) {
        return 'critical';
      }
      return 'high';
    }
    
    // Medium risk for dev dependencies
    return 'medium';
  }

  private static generateValidationDetails(
    packageName: string,
    expectedRegistry: string,
    actualRegistry: string,
    isConfused: boolean
  ): string {
    if (!isConfused) {
      return `Package ${packageName} resolves from expected registry: ${expectedRegistry}`;
    }
    
    if (this.HIGH_RISK_SCOPES.some(scope => packageName.startsWith(scope))) {
      return `High-risk scope detected: ${packageName}. This could be a typosquatting attack.`;
    }
    
    return `Registry mismatch for ${packageName}. Expected: ${expectedRegistry}, Actual: ${actualRegistry}`;
  }

  private static generateRecommendation(
    isConfused: boolean,
    risk: 'low' | 'medium' | 'high' | 'critical',
    packageName: string
  ): string {
    if (!isConfused) {
      return 'No action required.';
    }
    
    switch (risk) {
      case 'critical':
        return `CRITICAL: Remove ${packageName} immediately and verify the exact package name. Consider using exact package specification in package.json.`;
      case 'high':
        return `HIGH: Audit ${packageName} thoroughly and consider replacing with an explicitly specified package.`;
      case 'medium':
        return `MEDIUM: Verify ${packageName} authenticity and consider pinning to exact version and registry.`;
      default:
        return `Monitor ${packageName} for unusual behavior.`;
    }
  }

  static generateLockFileValidation(packageJsonPath: string): string {
    const packageDir = path.dirname(packageJsonPath);
    const lockFilePaths = [
      path.join(packageDir, 'package-lock.json'),
      path.join(packageDir, 'yarn.lock'),
      path.join(packageDir, 'pnpm-lock.yaml')
    ];
    
    let recommendations: string[] = [];
    
    const hasLockFile = lockFilePaths.some(lockPath => fs.existsSync(lockPath));
    if (!hasLockFile) {
      recommendations.push('Generate a lock file (package-lock.json, yarn.lock, or pnpm-lock.yaml) to prevent dependency confusion attacks');
    }
    
    if (hasLockFile) {
      recommendations.push('Commit lock files to version control to ensure dependency consistency');
      recommendations.push('Use npm ci or yarn ci in production to install from lock files');
      recommendations.push('Regularly audit lock files with npm audit or yarn audit');
    }
    
    return recommendations.join('\n');
  }

  static async validatePackageIntegrity(packageJsonPath: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const issues: string[] = [];
      
      // Check for missing required fields
      if (!packageJson.name) {issues.push('Missing package name');}
      if (!packageJson.version) {issues.push('Missing package version');}
      
      // Check for suspicious entries
      if (packageJson.scripts) {
        Object.entries(packageJson.scripts).forEach(([scriptName, scriptContent]) => {
          if (typeof scriptContent === 'string') {
            // Check for suspicious postinstall scripts
            if (scriptName.includes('postinstall') || scriptName.includes('preinstall')) {
              if (scriptContent.includes('curl') || scriptContent.includes('wget') || scriptContent.includes('eval')) {
                issues.push(`Suspicious ${scriptName} script detected: contains potentially dangerous commands`);
              }
            }
            
            // Check for obfuscated code
            if (scriptContent.length > 1000 && !/[a-zA-Z]/.test(scriptContent)) {
              issues.push(`Suspicious ${scriptName} script: appears to contain obfuscated code`);
            }
          }
        });
      }
      
      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Failed to validate package integrity: ${error}`]
      };
    }
  }

  static generateSecurityReport(validationResults: DependencyValidationResult[]): {
    summary: {
      totalDependencies: number;
      confusedDependencies: number;
      criticalRisks: number;
      highRisks: number;
      mediumRisks: number;
      lowRisks: number;
    };
    recommendations: string[];
    details: DependencyValidationResult[];
  } {
    const summary = {
      totalDependencies: validationResults.length,
      confusedDependencies: validationResults.filter(r => r.isConfused).length,
      criticalRisks: validationResults.filter(r => r.risk === 'critical').length,
      highRisks: validationResults.filter(r => r.risk === 'high').length,
      mediumRisks: validationResults.filter(r => r.risk === 'medium').length,
      lowRisks: validationResults.filter(r => r.risk === 'low').length
    };
    
    const recommendations: string[] = [];
    
    if (summary.criticalRisks > 0) {
      recommendations.push('IMMEDIATE ACTION REQUIRED: Remove critical-risk dependencies');
    }
    
    if (summary.highRisks > 0) {
      recommendations.push('HIGH PRIORITY: Audit and replace high-risk dependencies');
    }
    
    const confusedCount = summary.confusedDependencies;
    if (confusedCount > 0) {
      recommendations.push(`Found ${confusedCount} potentially confused dependencies`);
      recommendations.push('Use exact package specifications: package@registry.org/package@version');
      recommendations.push('Implement lock files for dependency pinning');
    }
    
    return {
      summary,
      recommendations,
      details: validationResults
    };
  }
}