/**
 * Security Test Coverage Reporter
 * Provides comprehensive security test coverage analysis and reporting
 */

import * as fs from 'fs';
import * as path from 'path';
import { SecurityTestResult, SecurityTester } from './securityUtils';

/**
 * Security coverage metrics
 */
export interface SecurityCoverageMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  criticalTests: number;
  highSeverityTests: number;
  coveragePercentage: number;
  securityScore: number;
  testCategories: {
    commandInjection: { total: number; passed: number; coverage: number };
    pathTraversal: { total: number; passed: number; coverage: number };
    fileIntegrity: { total: number; passed: number; coverage: number };
    temporaryFiles: { total: number; passed: number; coverage: number };
  };
  recommendations: string[];
}

/**
 * Security coverage reporter
 */
export class SecurityCoverageReporter {
  private testResults: SecurityTestResult[] = [];
  
  constructor(private outputPath?: string) {}

  async generateCoverageReport(): Promise<SecurityCoverageMetrics> {
    const securityTester = new SecurityTester();
    this.testResults = await securityTester.runAllTests();
    
    const metrics = this.calculateMetrics();
    
    if (this.outputPath) {
      await this.saveReport(metrics);
    }
    
    return metrics;
  }

  private calculateMetrics(): SecurityCoverageMetrics {
    const categories = this.categorizeTests();
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const criticalTests = this.testResults.filter(r => r.severity === 'critical').length;
    const highSeverityTests = this.testResults.filter(r => r.severity === 'high').length;
    
    const coveragePercentage = (passedTests / totalTests) * 100;
    
    // Calculate weighted security score
    const securityScore = this.calculateSecurityScore();
    
    const recommendations = this.generateRecommendations(categories);
    
    return {
      totalTests,
      passedTests,
      failedTests,
      criticalTests,
      highSeverityTests,
      coveragePercentage,
      securityScore,
      testCategories: categories,
      recommendations
    };
  }

  private categorizeTests(): SecurityCoverageMetrics['testCategories'] {
    const categories = {
      commandInjection: { total: 0, passed: 0, coverage: 0 },
      pathTraversal: { total: 0, passed: 0, coverage: 0 },
      fileIntegrity: { total: 0, passed: 0, coverage: 0 },
      temporaryFiles: { total: 0, passed: 0, coverage: 0 }
    };

    this.testResults.forEach(result => {
      if (result.testName.includes('Command Injection')) {
        categories.commandInjection.total++;
        if (result.passed) {categories.commandInjection.passed++;}
      } else if (result.testName.includes('Path Traversal')) {
        categories.pathTraversal.total++;
        if (result.passed) {categories.pathTraversal.passed++;}
      } else if (result.testName.includes('File Integrity')) {
        categories.fileIntegrity.total++;
        if (result.passed) {categories.fileIntegrity.passed++;}
      } else if (result.testName.includes('Temporary File')) {
        categories.temporaryFiles.total++;
        if (result.passed) {categories.temporaryFiles.passed++;}
      }
    });

    // Calculate coverage percentages
    Object.keys(categories).forEach(key => {
      const category = categories[key as keyof typeof categories];
      category.coverage = category.total > 0 ? (category.passed / category.total) * 100 : 0;
    });

    return categories;
  }

  private calculateSecurityScore(): number {
    let score = 100;
    
    this.testResults.forEach(result => {
      if (!result.passed) {
        switch (result.severity) {
          case 'critical':
            score -= 25;
            break;
          case 'high':
            score -= 15;
            break;
          case 'medium':
            score -= 10;
            break;
          case 'low':
            score -= 5;
            break;
        }
      }
    });
    
    return Math.max(0, score);
  }

  private generateRecommendations(categories: SecurityCoverageMetrics['testCategories']): string[] {
    const recommendations: string[] = [];
    
    if (categories.commandInjection.coverage < 100) {
      recommendations.push('Improve command injection detection and validation');
    }
    
    if (categories.pathTraversal.coverage < 100) {
      recommendations.push('Strengthen path traversal prevention mechanisms');
    }
    
    if (categories.fileIntegrity.coverage < 100) {
      recommendations.push('Enhance file integrity verification processes');
    }
    
    if (categories.temporaryFiles.coverage < 100) {
      recommendations.push('Implement secure temporary file handling');
    }
    
    const failedCriticalTests = this.testResults.filter(r => !r.passed && r.severity === 'critical');
    if (failedCriticalTests.length > 0) {
      recommendations.push('CRITICAL: Address all critical security test failures immediately');
    }
    
    const failedHighTests = this.testResults.filter(r => !r.passed && r.severity === 'high');
    if (failedHighTests.length > 0) {
      recommendations.push('HIGH: Prioritize fixing high-severity security issues');
    }
    
    return recommendations;
  }

  private async saveReport(metrics: SecurityCoverageMetrics): Promise<void> {
    if (!this.outputPath) {return;}
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        securityScore: metrics.securityScore,
        coveragePercentage: metrics.coveragePercentage,
        totalTests: metrics.totalTests,
        passedTests: metrics.passedTests,
        failedTests: metrics.failedTests,
        criticalFailures: metrics.criticalTests,
        highSeverityFailures: metrics.highSeverityTests
      },
      categories: metrics.testCategories,
      recommendations: metrics.recommendations,
      detailedResults: this.testResults
    };
    
    const reportPath = path.resolve(this.outputPath);
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  printSummary(metrics: SecurityCoverageMetrics): void {
    console.log('\n🔒 Security Test Coverage Report');
    console.log('=====================================');
    console.log(`📊 Security Score: ${metrics.securityScore}/100`);
    console.log(`📈 Coverage: ${metrics.coveragePercentage.toFixed(1)}%`);
    console.log(`🧪 Total Tests: ${metrics.totalTests}`);
    console.log(`✅ Passed: ${metrics.passedTests}`);
    console.log(`❌ Failed: ${metrics.failedTests}`);
    console.log(`🚨 Critical Failures: ${metrics.criticalTests}`);
    console.log(`⚠️  High Severity: ${metrics.highSeverityTests}`);
    
    console.log('\n📋 Category Breakdown:');
    Object.entries(metrics.testCategories).forEach(([category, stats]) => {
      const icon = this.getCategoryIcon(category);
      console.log(`${icon} ${category}: ${stats.coverage.toFixed(1)}% (${stats.passed}/${stats.total})`);
    });
    
    if (metrics.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      metrics.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (metrics.securityScore >= 90) {
      console.log('🎉 EXCELLENT: Security posture is very strong');
    } else if (metrics.securityScore >= 75) {
      console.log('👍 GOOD: Security posture is solid with room for improvement');
    } else if (metrics.securityScore >= 60) {
      console.log('⚠️  MODERATE: Security posture needs improvement');
    } else {
      console.log('🚨 POOR: Security posture requires immediate attention');
    }
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      commandInjection: '💉',
      pathTraversal: '🔍',
      fileIntegrity: '🔐',
      temporaryFiles: '📁'
    };
    return icons[category] || '📋';
  }
}

/**
 * Generate security coverage report and return metrics
 */
export async function generateSecurityCoverageReport(outputPath?: string): Promise<SecurityCoverageMetrics> {
  const reporter = new SecurityCoverageReporter(outputPath);
  const metrics = await reporter.generateCoverageReport();
  reporter.printSummary(metrics);
  return metrics;
}
