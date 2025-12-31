#!/usr/bin/env node

/**
 * Security Test Runner
 */

const fs = require('fs');
const ts = require('typescript');

if (!require.extensions['.ts']) {
  // Allow this runner to load TypeScript test modules without a separate transpiler.
  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename
    });

    module._compile(outputText, filename);
  };
}

const { generateSecurityCoverageReport } = require('./src/server/__tests__/securityCoverage');

async function runSecurityTests() {
  try {
    console.log('🔒 Running security tests with coverage analysis...');
    
    const metrics = await generateSecurityCoverageReport('./security-coverage-report.json');
    
    if (metrics.failedTests > 0 || metrics.securityScore < 80) {
      console.log('\n❌ Security issues detected!');
      process.exit(1);
    } else {
      console.log('\n✅ Security posture is acceptable!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n💥 Security test runner failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

runSecurityTests();
