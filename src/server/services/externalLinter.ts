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

/**
 * Basic validation for linter command arguments.
 * Shell-specific safety is handled only when we actually fall back to shell execution.
 */
function validateLinterArgs(args: string[], useShell = false): void {
  const basePatterns = [/\0/, /\r?\n/];
  const shellPatterns = [/[;&|`]/, /^\s*[|&]/, /[|&]\s*$/, /\$\(/];
  const patterns = useShell ? basePatterns.concat(shellPatterns) : basePatterns;

  for (const arg of args) {
    if (patterns.some(pattern => pattern.test(arg))) {
      const context = useShell ? 'shell ' : '';
      throw new Error(`Dangerous characters detected in ${context}linter argument: ${arg}`);
    }
  }
}

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
  /** Proto include paths, passed to linters that resolve imports themselves */
  includePaths: string[];
  runOnSave: boolean;
}

/** Collected output of a finished linter process */
interface LinterProcessResult {
  stdout: string;
  stderr: string;
  /** Exit code, or null when the process was terminated by a signal */
  code: number | null;
}

/** Longest stretch of linter output quoted in an error message */
const MAX_FAILURE_OUTPUT_LENGTH = 2000;

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
  includePaths: [],
  runOnSave: true,
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

    // Only fall back to the shell for simple command names that need PATH
    // resolution. Full paths may contain spaces and gain nothing from a shell.
    const isSimpleCommand = !linterPath.includes(path.sep) && !linterPath.includes('/');

    try {
      const { code } = await this.runProcess(linterPath, ['--version'], undefined, isSimpleCommand);
      if (code === 0) {
        logger.debug(`${this.settings.linter} is available`);
        return true;
      }
      logger.info(
        `${this.settings.linter} not found or not working. Check that it is installed and the path is correct.`
      );
      return false;
    } catch {
      logger.info(
        isSimpleCommand
          ? `${this.settings.linter} not found. Install it or configure the correct path.`
          : `${this.settings.linter} not found at ${linterPath}. Check that the path is correct.`
      );
      return false;
    }
  }

  /**
   * Spawn a linter and collect its output. Falls back to shell execution for
   * PATH resolution when the binary cannot be spawned directly, and rejects
   * when it cannot be started at all.
   */
  private runProcess(
    command: string,
    args: string[],
    cwd?: string,
    allowShellFallback = true
  ): Promise<LinterProcessResult> {
    const run = (useShell: boolean): Promise<LinterProcessResult> =>
      new Promise((resolve, reject) => {
        const proc = spawn(command, args, useShell ? { cwd, shell: true } : { cwd });

        let stdout = '';
        let stderr = '';
        let failedToStart = false;

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString('utf8');
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString('utf8');
        });

        proc.on('close', (code: number | null) => {
          // Node also emits 'close' after a failed spawn. That is not a linter
          // result, and resolving here would discard the shell fallback.
          if (!failedToStart) {
            resolve({ stdout, stderr, code });
          }
        });

        proc.on('error', (err: Error) => {
          failedToStart = true;
          reject(err);
        });
      });

    // Try without shell first to avoid command line length limits
    return run(false).catch((err: Error) => {
      if (!allowShellFallback) {
        throw err;
      }
      logger.debug(`${command} spawn failed, trying with shell: ${err.message}`);
      try {
        validateLinterArgs(args, true);
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : String(validationError);
        throw new Error(`shell fallback blocked: ${message}. Configure an explicit path to avoid shell fallback`);
      }
      return run(true);
    });
  }

  /**
   * Run the configured linter and parse its output. Rejects when the linter
   * could not run, or failed without reporting any findings, so that a broken
   * invocation is never mistaken for a clean result.
   */
  private async runAndParse(
    command: string,
    args: string[],
    cwd: string,
    parse: (output: string) => LintResult[]
  ): Promise<LintResult[]> {
    const linter = this.settings.linter;

    let result: LinterProcessResult;
    try {
      result = await this.runProcess(command, args, cwd);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`${linter} could not be started: ${reason}. Ensure ${linter} is installed and accessible.`);
    }

    const results = parse(result.stdout || result.stderr);
    if (results.length === 0 && result.code !== 0) {
      const output = (result.stderr || result.stdout).trim().slice(0, MAX_FAILURE_OUTPUT_LENGTH);
      const status = result.code === null ? 'was terminated' : `exited with code ${result.code}`;
      throw new Error(`${linter} ${status}${output ? `: ${output}` : ' without reporting any findings'}`);
    }

    return results;
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
    const args = ['lint', '--error-format=json'];

    // Validate arguments before execution
    validateLinterArgs(args);

    // Determine working directory for buf lint
    // buf needs to run from the directory containing buf.yaml to properly detect the module
    let cwd = this.workspaceRoot;

    // If user explicitly configured a config path, use it and its directory
    // This respects the user's preference over auto-detection
    if (this.settings.bufConfigPath) {
      const configArg = '--config';
      const configPath = this.settings.bufConfigPath;
      args.push(configArg, configPath);

      // Validate the config path as well
      validateLinterArgs([configArg, configPath]);

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

    return this.runAndParse(this.settings.bufPath, args, cwd, output => this.parseBufOutput(output));
  }

  private async runProtolint(filePath?: string): Promise<LintResult[]> {
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

    return this.runAndParse(this.settings.protolintPath, args, this.workspaceRoot, output =>
      this.parseProtolintOutput(output)
    );
  }

  private async runApiLinter(filePath?: string): Promise<LintResult[]> {
    const args = ['--output-format=json'];

    if (this.settings.apiLinterConfigPath) {
      args.push('--config', this.settings.apiLinterConfigPath);
      logger.debug(`Using user-configured api-linter config: ${this.settings.apiLinterConfigPath}`);
    }

    // Add proto paths for imports
    const protoPaths = [...new Set([...this.settings.includePaths, this.workspaceRoot].filter(Boolean))];
    let cwd = this.workspaceRoot;
    // For workspace-wide linting, we need to specify proto files
    // api-linter requires explicit file paths
    let target = '.';

    if (filePath) {
      // api-linter resolves files against its proto paths and cannot open an
      // absolute path, so name the file relative to the root that contains it.
      const relative = this.relativeToProtoPath(filePath, protoPaths);
      if (relative) {
        target = relative;
      } else {
        cwd = path.dirname(filePath);
        protoPaths.push(cwd);
        target = path.basename(filePath);
      }
    }

    for (const protoPath of protoPaths) {
      args.push('-I', protoPath);
    }
    args.push(target);

    logger.debug(`Running api-linter with args: ${args.join(' ')}`);

    return this.runAndParse(this.settings.apiLinterPath, args, cwd, output => this.parseApiLinterOutput(output));
  }

  /**
   * Express a file relative to the most specific proto path containing it,
   * using the forward slashes protobuf expects in file names.
   */
  private relativeToProtoPath(filePath: string, protoPaths: string[]): string | undefined {
    let best: string | undefined;

    for (const protoPath of protoPaths) {
      const relative = path.relative(protoPath, filePath);
      const isInside = relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`);
      if (isInside && !path.isAbsolute(relative) && (best === undefined || relative.length < best.length)) {
        best = relative;
      }
    }

    return best?.split(path.sep).join('/');
  }

  private parseBufOutput(output: string): LintResult[] {
    const results: LintResult[] = [];

    try {
      // Buf outputs one JSON object per line
      const lines = output
        .trim()
        .split('\n')
        .filter(l => l.trim());

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
            severity: 'warning',
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
          severity: 'warning',
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
            severity: lint.severity === 'error' ? 'error' : 'warning',
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
          severity: 'warning',
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
              severity: 'warning',
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
          severity: 'warning',
        });
      }
    }

    return results;
  }

  private convertToDiagnostics(results: LintResult[], currentFile: string): Diagnostic[] {
    return results.filter(r => this.matchesFile(r.file, currentFile)).map(r => this.convertResult(r));
  }

  private convertResult(result: LintResult): Diagnostic {
    const range: Range = {
      start: { line: Math.max(0, result.line - 1), character: Math.max(0, result.column - 1) },
      end: {
        line: Math.max(0, (result.endLine || result.line) - 1),
        character: Math.max(0, (result.endColumn || result.column + 10) - 1),
      },
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
      code: result.rule,
    };
  }

  private matchesFile(resultFile: string, targetFile: string): boolean {
    const normalizedResult = path.normalize(resultFile).toLowerCase();
    const normalizedTarget = path.normalize(targetFile).toLowerCase();

    return (
      normalizedTarget.endsWith(normalizedResult) ||
      normalizedResult.endsWith(normalizedTarget) ||
      path.basename(normalizedResult) === path.basename(normalizedTarget)
    );
  }

  private resolveFileUri(filePath: string): string {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
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
    try {
      const { stdout } = await this.runProcess(this.settings.bufPath, ['config', 'ls-lint-rules'], this.workspaceRoot);
      return stdout.split('\n').filter(r => r.trim());
    } catch {
      return [];
    }
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
      'INDENT',
    ];
  }

  private async getApiLinterRules(): Promise<string[]> {
    let stdout: string;
    try {
      // api-linter supports --list-rules to list all available rules
      ({ stdout } = await this.runProcess(
        this.settings.apiLinterPath,
        ['--list-rules', '--output-format=json'],
        this.workspaceRoot
      ));
    } catch {
      return [];
    }

    try {
      const data = JSON.parse(stdout);
      // api-linter --list-rules returns an array of rule objects
      if (Array.isArray(data)) {
        return data.map((rule: { name?: string }) => rule.name || '').filter((r: string) => r);
      }
      return [];
    } catch {
      // Fallback to parsing text output
      return stdout.split('\n').filter(r => r.trim());
    }
  }
}

export const externalLinter = new ExternalLinterProvider();
