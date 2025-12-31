/**
 * External Linter Integration for Protocol Buffers
 * Supports buf lint, protolint, and api-linter
 */

import { spawn } from 'child_process';
import type { Diagnostic, Range } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import * as path from 'path';
import { bufConfigProvider } from './bufConfig';
import { logger } from '../utils/logger';
import { pathToUri } from '../utils/utils';

export type ExternalLinter = 'buf' | 'protolint' | 'api-linter' | 'none';

export interface ExternalLinterSettings {
  enabled: boolean;
  linter: ExternalLinter;
  bufPath: string;
  protolintPath: string;
  apiLinterPath: string;
  bufConfigPath: string;
  protolintConfigPath: string;
  apiLinterConfigPath: string;
  runOnSave: boolean;
}

export interface LintResult {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const DEFAULT_SETTINGS: ExternalLinterSettings = {
  enabled: false,
  linter: 'none',
  bufPath: 'buf',
  protolintPath: 'protolint',
  apiLinterPath: 'api-linter',
  bufConfigPath: '',
  protolintConfigPath: '',
  apiLinterConfigPath: '',
  runOnSave: true
};

export class ExternalLinterProvider {
  private settings: ExternalLinterSettings = DEFAULT_SETTINGS;
  private workspaceRoot: string = '';

  updateSettings(settings: Partial<ExternalLinterSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * Check if the configured linter is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.settings.linter === 'none' || !this.settings.enabled) {
      return false;
    }

    let linterPath: string;
    switch (this.settings.linter) {
      case 'buf':
        linterPath = this.settings.bufPath;
        break;
      case 'protolint':
        linterPath = this.settings.protolintPath;
        break;
      case 'api-linter':
        linterPath = this.settings.apiLinterPath;
        break;
      default:
        return false;
    }

    logger.debug(`Checking if ${this.settings.linter} is available at: ${linterPath}`);

    return new Promise((resolve) => {
      // Try without shell first
      const proc = spawn(linterPath, ['--version']);

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          logger.debug(`${this.settings.linter} is available`);
          resolve(true);
        } else {
          logger.debug(`${this.settings.linter} exited with code ${code}, trying with shell`);
          resolve(false);
        }
      });
      proc.on('error', () => {
        // Fallback with shell for PATH resolution
        const procWithShell = spawn(linterPath, ['--version'], { shell: true });
        procWithShell.on('close', (code: number | null) => {
          if (code === 0) {
            logger.debug(`${this.settings.linter} is available (via shell)`);
            resolve(true);
          } else {
            logger.info(`${this.settings.linter} not found or not working. Check that it is installed and the path is correct.`);
            resolve(false);
          }
        });
        procWithShell.on('error', () => {
          logger.info(`${this.settings.linter} not found. Install it or configure the correct path.`);
          resolve(false);
        });
      });
    });
  }

  /**
   * Run linter on a file and return diagnostics
   */
  async lint(filePath: string): Promise<Diagnostic[]> {
    if (!this.settings.enabled || this.settings.linter === 'none') {
      return [];
    }

    const results = await this.runLinter(filePath);
    return this.convertToDiagnostics(results, filePath);
  }

  /**
   * Run linter on all files in workspace
   */
  async lintWorkspace(): Promise<Map<string, Diagnostic[]>> {
    if (!this.settings.enabled || this.settings.linter === 'none') {
      return new Map();
    }

    const results = await this.runLinterOnWorkspace();
    const diagnosticsMap = new Map<string, Diagnostic[]>();

    for (const result of results) {
      const uri = this.resolveFileUri(result.file);
      if (!diagnosticsMap.has(uri)) {
        diagnosticsMap.set(uri, []);
      }
      diagnosticsMap.get(uri)!.push(this.convertResult(result));
    }

    return diagnosticsMap;
  }

  private async runLinter(filePath: string): Promise<LintResult[]> {
    if (this.settings.linter === 'buf') {
      return this.runBufLint(filePath);
    } else if (this.settings.linter === 'protolint') {
      return this.runProtolint(filePath);
    } else if (this.settings.linter === 'api-linter') {
      return this.runApiLinter(filePath);
    }
    return [];
  }

  private async runLinterOnWorkspace(): Promise<LintResult[]> {
    if (this.settings.linter === 'buf') {
      return this.runBufLint();
    } else if (this.settings.linter === 'protolint') {
      return this.runProtolint();
    } else if (this.settings.linter === 'api-linter') {
      return this.runApiLinter();
    }
    return [];
  }

  private async runBufLint(filePath?: string): Promise<LintResult[]> {
    return new Promise((resolve) => {
      const args = ['lint', '--error-format=json'];

      // Determine the working directory for buf lint
      // buf needs to run from the directory containing buf.yaml to properly detect the module
      let cwd = this.workspaceRoot;

      // If user explicitly configured a config path, use it and its directory
      // This respects the user's preference over auto-detection
      if (this.settings.bufConfigPath) {
        args.push('--config', this.settings.bufConfigPath);
        // Use the config file's directory as cwd for consistent behavior
        cwd = path.dirname(path.resolve(this.workspaceRoot, this.settings.bufConfigPath));
        logger.debug(`Using user-configured buf config: ${this.settings.bufConfigPath}`);
      } else if (filePath) {
        // Only auto-detect if user hasn't explicitly configured a path
        // Find the buf.yaml for this specific file and run from its directory
        // This ensures buf properly discovers and applies the module's lint configuration
        const bufConfigPath = bufConfigProvider.findBufConfigPath(filePath);
        if (bufConfigPath) {
          cwd = path.dirname(bufConfigPath);
          logger.debug(`Auto-detected buf config at: ${bufConfigPath}`);
        }
      }

      if (filePath) {
        args.push('--path', filePath);
      }

      logger.debug(`Running buf lint with args: ${args.join(' ')} in ${cwd}`);

      // Try without shell first to avoid command line length limits
      const proc = spawn(this.settings.bufPath, args, {
        cwd
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        resolve(this.parseBufOutput(stdout || stderr));
      });

      proc.on('error', (err) => {
        logger.debug(`buf spawn failed, trying with shell: ${err.message}`);
        // Fallback with shell for PATH resolution
        const procWithShell = spawn(this.settings.bufPath, args, {
          cwd,
          shell: true
        });
        let shellStdout = '';
        let shellStderr = '';
        procWithShell.stdout?.on('data', (data) => shellStdout += data.toString());
        procWithShell.stderr?.on('data', (data) => shellStderr += data.toString());
        procWithShell.on('close', () => resolve(this.parseBufOutput(shellStdout || shellStderr)));
        procWithShell.on('error', (shellErr) => {
          logger.warn(`buf lint failed: ${shellErr.message}. Ensure buf is installed and accessible.`);
          resolve([]);
        });
      });
    });
  }

  private async runProtolint(filePath?: string): Promise<LintResult[]> {
    return new Promise((resolve) => {
      const args = ['lint', '-reporter=json'];

      if (this.settings.protolintConfigPath) {
        args.push('-config_path', this.settings.protolintConfigPath);
        logger.debug(`Using user-configured protolint config: ${this.settings.protolintConfigPath}`);
      }

      if (filePath) {
        args.push(filePath);
      } else {
        args.push(this.workspaceRoot);
      }

      logger.debug(`Running protolint with args: ${args.join(' ')}`);

      // Try without shell first to avoid command line length limits
      const proc = spawn(this.settings.protolintPath, args, {
        cwd: this.workspaceRoot
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        resolve(this.parseProtolintOutput(stdout || stderr));
      });

      proc.on('error', (err) => {
        logger.debug(`protolint spawn failed, trying with shell: ${err.message}`);
        // Fallback with shell for PATH resolution
        const procWithShell = spawn(this.settings.protolintPath, args, {
          cwd: this.workspaceRoot,
          shell: true
        });
        let shellStdout = '';
        let shellStderr = '';
        procWithShell.stdout?.on('data', (data) => shellStdout += data.toString());
        procWithShell.stderr?.on('data', (data) => shellStderr += data.toString());
        procWithShell.on('close', () => resolve(this.parseProtolintOutput(shellStdout || shellStderr)));
        procWithShell.on('error', (shellErr) => {
          logger.warn(`protolint failed: ${shellErr.message}. Ensure protolint is installed and accessible.`);
          resolve([]);
        });
      });
    });
  }

  private async runApiLinter(filePath?: string): Promise<LintResult[]> {
    return new Promise((resolve) => {
      const args = ['--output-format=json'];

      if (this.settings.apiLinterConfigPath) {
        args.push('--config', this.settings.apiLinterConfigPath);
        logger.debug(`Using user-configured api-linter config: ${this.settings.apiLinterConfigPath}`);
      }

      // Add proto paths for imports
      if (this.workspaceRoot) {
        args.push('-I', this.workspaceRoot);
      }

      if (filePath) {
        args.push(filePath);
      } else {
        // For workspace-wide linting, we need to specify proto files
        // api-linter requires explicit file paths
        args.push('.');
      }

      logger.debug(`Running api-linter with args: ${args.join(' ')}`);

      // Try without shell first to avoid command line length limits
      const proc = spawn(this.settings.apiLinterPath, args, {
        cwd: this.workspaceRoot
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        resolve(this.parseApiLinterOutput(stdout || stderr));
      });

      proc.on('error', (err) => {
        // Fallback with shell for PATH resolution
        logger.debug(`api-linter spawn failed (${err.message}), retrying with shell`);
        const procWithShell = spawn(this.settings.apiLinterPath, args, {
          cwd: this.workspaceRoot,
          shell: true
        });
        let shellStdout = '';
        let shellStderr = '';
        procWithShell.stdout?.on('data', (data) => shellStdout += data.toString());
        procWithShell.stderr?.on('data', (data) => shellStderr += data.toString());
        procWithShell.on('close', () => resolve(this.parseApiLinterOutput(shellStdout || shellStderr)));
        procWithShell.on('error', (shellErr) => {
          logger.warn(`api-linter failed: ${shellErr.message}. Ensure api-linter is installed and accessible.`);
          resolve([]);
        });
      });
    });
  }

  private parseBufOutput(output: string): LintResult[] {
    const results: LintResult[] = [];

    try {
      // Buf outputs one JSON object per line
      const lines = output.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const item = JSON.parse(line);

          // Buf format: {"path":"file.proto","start_line":1,"start_column":1,"end_line":1,"end_column":10,"type":"FAILURE_TYPE","message":"..."}
          results.push({
            file: item.path || '',
            line: item.start_line || 1,
            column: item.start_column || 1,
            endLine: item.end_line,
            endColumn: item.end_column,
            rule: item.type || 'BUF_LINT',
            message: item.message || '',
            severity: 'warning'
          });
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // If JSON parsing fails, try regex parsing
      const errorRegex = /^(.+?):(\d+):(\d+):(.+)$/gm;
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        results.push({
          file: match[1]!,
          line: parseInt(match[2]!, 10),
          column: parseInt(match[3]!, 10),
          rule: 'BUF_LINT',
          message: match[4]!.trim(),
          severity: 'warning'
        });
      }
    }

    return results;
  }

  private parseProtolintOutput(output: string): LintResult[] {
    const results: LintResult[] = [];

    try {
      const data = JSON.parse(output);

      // Protolint format: {"lints":[{"filename":"...","line":1,"column":1,"message":"...","rule":"...","severity":"..."}]}
      if (data.lints && Array.isArray(data.lints)) {
        for (const lint of data.lints) {
          results.push({
            file: lint.filename || '',
            line: lint.line || 1,
            column: lint.column || 1,
            rule: lint.rule || 'PROTOLINT',
            message: lint.message || '',
            severity: lint.severity === 'error' ? 'error' : 'warning'
          });
        }
      }
    } catch {
      // If JSON parsing fails, try regex parsing
      // Protolint text format: [file:line:column] message (rule)
      const errorRegex = /\[(.+?):(\d+):(\d+)\]\s+(.+?)\s+\((\w+)\)/g;
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        results.push({
          file: match[1]!,
          line: parseInt(match[2]!, 10),
          column: parseInt(match[3]!, 10),
          message: match[4]!.trim(),
          rule: match[5]!,
          severity: 'warning'
        });
      }
    }

    return results;
  }

  private parseApiLinterOutput(output: string): LintResult[] {
    const results: LintResult[] = [];

    try {
      const data = JSON.parse(output);

      // api-linter JSON format is an array of file results:
      // [{"file_path":"file.proto","problems":[{"message":"...","suggestion":"...","location":{"start_position":{"line_number":1,"column_number":1},"end_position":{"line_number":1,"column_number":10}},"rule_id":"core::0140::lower-snake","rule_doc_uri":"https://linter.aip.dev/140/lower-snake"}]}]
      if (Array.isArray(data)) {
        for (const fileResult of data) {
          const filePath = fileResult.file_path || '';
          const problems = fileResult.problems || [];

          for (const problem of problems) {
            const location = problem.location || {};
            const startPos = location.start_position || {};
            const endPos = location.end_position || {};

            let message = problem.message || '';
            if (problem.suggestion) {
              message += ` Suggestion: ${problem.suggestion}`;
            }

            results.push({
              file: filePath,
              line: startPos.line_number || 1,
              column: startPos.column_number || 1,
              endLine: endPos.line_number,
              endColumn: endPos.column_number,
              rule: problem.rule_id || 'API_LINTER',
              message: message,
              severity: 'warning'
            });
          }
        }
      }
    } catch {
      // If JSON parsing fails, try YAML-like parsing (default output format)
      // api-linter YAML format:
      // - file_path: file.proto
      //   problems:
      //     - message: Field name should be lower_snake_case
      //       rule_id: core::0140::lower-snake
      //       location:
      //         start_position: {line_number: 10, column_number: 3}
      // For simplicity, we recommend users use --output-format=json
      // but we can still try basic text parsing
      const problemRegex = /^(.+?):(\d+):(\d+):\s*(.+)$/gm;
      let match;

      while ((match = problemRegex.exec(output)) !== null) {
        results.push({
          file: match[1]!,
          line: parseInt(match[2]!, 10),
          column: parseInt(match[3]!, 10),
          rule: 'API_LINTER',
          message: match[4]!.trim(),
          severity: 'warning'
        });
      }
    }

    return results;
  }

  private convertToDiagnostics(results: LintResult[], currentFile: string): Diagnostic[] {
    return results
      .filter(r => this.matchesFile(r.file, currentFile))
      .map(r => this.convertResult(r));
  }

  private convertResult(result: LintResult): Diagnostic {
    const range: Range = {
      start: { line: Math.max(0, result.line - 1), character: Math.max(0, result.column - 1) },
      end: {
        line: Math.max(0, (result.endLine || result.line) - 1),
        character: Math.max(0, (result.endColumn || result.column + 10) - 1)
      }
    };

    let severity: DiagnosticSeverity;
    switch (result.severity) {
      case 'error':
        severity = DiagnosticSeverity.Error;
        break;
      case 'info':
        severity = DiagnosticSeverity.Information;
        break;
      default:
        severity = DiagnosticSeverity.Warning;
    }

    return {
      severity,
      range,
      message: result.message,
      source: this.settings.linter,
      code: result.rule
    };
  }

  private matchesFile(resultFile: string, targetFile: string): boolean {
    const normalizedResult = path.normalize(resultFile).toLowerCase();
    const normalizedTarget = path.normalize(targetFile).toLowerCase();

    return normalizedTarget.endsWith(normalizedResult) ||
           normalizedResult.endsWith(normalizedTarget) ||
           path.basename(normalizedResult) === path.basename(normalizedTarget);
  }

  private resolveFileUri(filePath: string): string {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceRoot, filePath);
    return pathToUri(absolutePath);
  }

  /**
   * Get available lint rules for the configured linter
   */
  async getAvailableRules(): Promise<string[]> {
    if (this.settings.linter === 'buf') {
      return this.getBufRules();
    } else if (this.settings.linter === 'protolint') {
      return this.getProtolintRules();
    } else if (this.settings.linter === 'api-linter') {
      return this.getApiLinterRules();
    }
    return [];
  }

  private async getBufRules(): Promise<string[]> {
    return new Promise((resolve) => {
      // Try without shell first
      const proc = spawn(this.settings.bufPath, ['config', 'ls-lint-rules'], {
        cwd: this.workspaceRoot
      });

      let stdout = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        const rules = stdout.split('\n').filter(r => r.trim());
        resolve(rules);
      });

      proc.on('error', () => {
        // Fallback with shell
        const procWithShell = spawn(this.settings.bufPath, ['config', 'ls-lint-rules'], {
          cwd: this.workspaceRoot,
          shell: true
        });
        let shellStdout = '';
        procWithShell.stdout?.on('data', (data) => shellStdout += data.toString());
        procWithShell.on('close', () => resolve(shellStdout.split('\n').filter(r => r.trim())));
        procWithShell.on('error', () => resolve([]));
      });
    });
  }

  private async getProtolintRules(): Promise<string[]> {
    // Protolint doesn't have a built-in command to list rules
    // Return common rules
    return [
      'ENUM_FIELD_NAMES_PREFIX',
      'ENUM_FIELD_NAMES_UPPER_SNAKE_CASE',
      'ENUM_FIELD_NAMES_ZERO_VALUE_END_WITH',
      'ENUM_NAMES_UPPER_CAMEL_CASE',
      'FIELD_NAMES_LOWER_SNAKE_CASE',
      'FILE_NAMES_LOWER_SNAKE_CASE',
      'IMPORTS_SORTED',
      'MAX_LINE_LENGTH',
      'MESSAGE_NAMES_UPPER_CAMEL_CASE',
      'ORDER',
      'PACKAGE_NAME_LOWER_CASE',
      'REPEATED_FIELD_NAMES_PLURALIZED',
      'RPC_NAMES_UPPER_CAMEL_CASE',
      'SERVICE_NAMES_END_WITH',
      'SERVICE_NAMES_UPPER_CAMEL_CASE',
      'SYNTAX_CONSISTENT',
      'INDENT'
    ];
  }

  private async getApiLinterRules(): Promise<string[]> {
    return new Promise((resolve) => {
      // api-linter supports --list-rules to list all available rules
      const proc = spawn(this.settings.apiLinterPath, ['--list-rules', '--output-format=json'], {
        cwd: this.workspaceRoot
      });

      let stdout = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        try {
          const data = JSON.parse(stdout);
          // api-linter --list-rules returns an array of rule objects
          if (Array.isArray(data)) {
            const rules = data.map((rule: { name?: string }) => rule.name || '').filter((r: string) => r);
            resolve(rules);
          } else {
            resolve([]);
          }
        } catch {
          // Fallback to parsing text output
          const rules = stdout.split('\n').filter(r => r.trim());
          resolve(rules);
        }
      });

      proc.on('error', () => {
        // Fallback with shell
        const procWithShell = spawn(this.settings.apiLinterPath, ['--list-rules', '--output-format=json'], {
          cwd: this.workspaceRoot,
          shell: true
        });
        let shellStdout = '';
        procWithShell.stdout?.on('data', (data) => shellStdout += data.toString());
        procWithShell.on('close', () => {
          try {
            const data = JSON.parse(shellStdout);
            if (Array.isArray(data)) {
              const rules = data.map((rule: { name?: string }) => rule.name || '').filter((r: string) => r);
              resolve(rules);
            } else {
              resolve([]);
            }
          } catch {
            resolve(shellStdout.split('\n').filter(r => r.trim()));
          }
        });
        procWithShell.on('error', () => resolve([]));
      });
    });
  }
}

export const externalLinter = new ExternalLinterProvider();
