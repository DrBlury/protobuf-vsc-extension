/**
 * External Linter Integration for Protocol Buffers
 * Supports buf lint and protolint
 */

import { spawn } from 'child_process';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import * as path from 'path';
import * as fs from 'fs';

export type ExternalLinter = 'buf' | 'protolint' | 'none';

export interface ExternalLinterSettings {
  enabled: boolean;
  linter: ExternalLinter;
  bufPath: string;
  protolintPath: string;
  bufConfigPath: string;
  protolintConfigPath: string;
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
  bufConfigPath: '',
  protolintConfigPath: '',
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

    const linterPath = this.settings.linter === 'buf'
      ? this.settings.bufPath
      : this.settings.protolintPath;

    return new Promise((resolve) => {
      const proc = spawn(linterPath, ['--version'], { shell: true });

      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
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
    }
    return [];
  }

  private async runLinterOnWorkspace(): Promise<LintResult[]> {
    if (this.settings.linter === 'buf') {
      return this.runBufLint();
    } else if (this.settings.linter === 'protolint') {
      return this.runProtolint();
    }
    return [];
  }

  private async runBufLint(filePath?: string): Promise<LintResult[]> {
    return new Promise((resolve) => {
      const args = ['lint', '--error-format=json'];

      if (this.settings.bufConfigPath) {
        args.push('--config', this.settings.bufConfigPath);
      }

      if (filePath) {
        args.push('--path', filePath);
      }

      const proc = spawn(this.settings.bufPath, args, {
        cwd: this.workspaceRoot,
        shell: true
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

      proc.on('error', () => {
        resolve([]);
      });
    });
  }

  private async runProtolint(filePath?: string): Promise<LintResult[]> {
    return new Promise((resolve) => {
      const args = ['lint', '-reporter=json'];

      if (this.settings.protolintConfigPath) {
        args.push('-config_path', this.settings.protolintConfigPath);
      }

      if (filePath) {
        args.push(filePath);
      } else {
        args.push(this.workspaceRoot);
      }

      const proc = spawn(this.settings.protolintPath, args, {
        cwd: this.workspaceRoot,
        shell: true
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

      proc.on('error', () => {
        resolve([]);
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
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          rule: 'BUF_LINT',
          message: match[4].trim(),
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
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[4].trim(),
          rule: match[5],
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
    if (path.isAbsolute(filePath)) {
      return 'file://' + filePath;
    }
    return 'file://' + path.join(this.workspaceRoot, filePath);
  }

  /**
   * Get available lint rules for the configured linter
   */
  async getAvailableRules(): Promise<string[]> {
    if (this.settings.linter === 'buf') {
      return this.getBufRules();
    } else if (this.settings.linter === 'protolint') {
      return this.getProtolintRules();
    }
    return [];
  }

  private async getBufRules(): Promise<string[]> {
    return new Promise((resolve) => {
      const proc = spawn(this.settings.bufPath, ['config', 'ls-lint-rules'], {
        cwd: this.workspaceRoot,
        shell: true
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
        resolve([]);
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
}

export const externalLinter = new ExternalLinterProvider();
