/**
 * clang-format Integration for Protocol Buffers
 * Uses clang-format for code formatting when available
 */

import { spawn, SpawnOptions } from 'child_process';
import { TextEdit, Range } from 'vscode-languageserver/node';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Split text into lines, handling both CRLF (\r\n) and LF (\n) line endings.
 */
function splitLines(text: string): string[] {
  return text.split('\n').map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

export interface ClangFormatSettings {
  enabled: boolean;
  path: string;
  style: string;
  fallbackStyle: string;
  configPath?: string;
}

const DEFAULT_SETTINGS: ClangFormatSettings = {
  enabled: false,
  path: 'clang-format',
  style: 'file',
  fallbackStyle: 'Google',
  configPath: ''
};

export class ClangFormatProvider {
  private settings: ClangFormatSettings = DEFAULT_SETTINGS;

  updateSettings(settings: Partial<ClangFormatSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Check if clang-format is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.settings.enabled) {
      return false;
    }

    return new Promise((resolve) => {
      logger.verbose(`Checking clang-format availability via "${this.settings.path}" --version`);
      const proc = spawn(this.settings.path, ['--version']);

      proc.on('close', (code: number | null) => resolve(code === 0));
      proc.on('error', (err) => {
        logger.warn(`clang-format availability check failed for path "${this.settings.path}": ${err instanceof Error ? err.message : String(err)}`);
        resolve(false);
      });
    });
  }

  /**
   * Get clang-format version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      logger.verbose(`Requesting clang-format version via "${this.settings.path}" --version`);
      const proc = spawn(this.settings.path, ['--version']);

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse version from output like "clang-format version 14.0.0"
          const match = output.match(/version\s+([\d.]+)/);
          resolve(match ? match[1]! : output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', (err) => {
        logger.warn(`Unable to read clang-format version from "${this.settings.path}": ${err instanceof Error ? err.message : String(err)}`);
        resolve(null);
      });
    });
  }

  /**
   * Format a document using clang-format
   */
  async formatDocument(text: string, filePath?: string): Promise<TextEdit[]> {
    if (!this.settings.enabled) {
      return [];
    }

    const formatted = await this.runClangFormat(text, filePath);

    if (formatted === null || formatted === text) {
      return [];
    }

    const lines = splitLines(text);
    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1]!.length }
      },
      newText: formatted
    }];
  }

  /**
   * Format a range using clang-format
   * Returns null if disabled or failed, empty array if no changes needed, or edits if changes needed
   */
  async formatRange(text: string, range: Range, filePath?: string): Promise<TextEdit[] | null> {
    if (!this.settings.enabled) {
      return null;
    }

    // Detect if the text uses CRLF line endings
    const usesCRLF = text.includes('\r\n');
    const newlineLength = usesCRLF ? 2 : 1;

    const lines = splitLines(text);

    // Calculate byte offsets for the range
    // clang-format expects byte offsets in the original text, so we need to account for CRLF
    let offset = 0;
    for (let i = 0; i < range.start.line; i++) {
      offset += lines[i]!.length + newlineLength;
    }
    offset += range.start.character;

    let length = 0;
    for (let i = range.start.line; i <= range.end.line; i++) {
      if (i === range.start.line && i === range.end.line) {
        length = range.end.character - range.start.character;
      } else if (i === range.start.line) {
        length += lines[i]!.length - range.start.character + newlineLength;
      } else if (i === range.end.line) {
        length += range.end.character;
      } else {
        length += lines[i]!.length + newlineLength;
      }
    }

    const formatted = await this.runClangFormat(text, filePath, offset, length);

    if (formatted === null) {
      return null; // clang-format failed
    }

    if (formatted === text) {
      return []; // No changes needed - this is success, not failure
    }

    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1]!.length }
      },
      newText: formatted
    }];
  }

  private async runClangFormat(
    text: string,
    filePath?: string,
    offset?: number,
    length?: number
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const args: string[] = [];

      // Add style option
      if (this.settings.style) {
        if (this.settings.style === 'file') {
          // If a custom config path is provided, use file:<path> syntax
          if (this.settings.configPath) {
            args.push(`--style=file:${this.settings.configPath}`);
          } else {
            args.push(`--style=file`);
          }
          args.push(`--fallback-style=${this.settings.fallbackStyle}`);
        } else {
          args.push(`--style=${this.settings.style}`);
        }
      }

      // Add assume filename for language detection
      if (filePath) {
        args.push(`--assume-filename=${filePath}`);
      } else {
        args.push('--assume-filename=file.proto');
      }

      // Add range options if specified
      if (offset !== undefined && length !== undefined) {
        args.push(`--offset=${offset}`);
        args.push(`--length=${length}`);
      }

      // Set working directory to the file's directory so clang-format can find .clang-format config
      // clang-format searches for config files starting from the working directory when reading from stdin
      let cwd: string | undefined;
      if (filePath) {
        // Handle both file:// URIs and regular paths
        let actualPath = filePath;
        if (filePath.startsWith('file://')) {
          actualPath = filePath.replace('file://', '');
          // Handle Windows paths like file:///C:/...
          if (actualPath.match(/^\/[A-Za-z]:\//)) {
            actualPath = actualPath.substring(1);
          }
        }
        cwd = path.dirname(actualPath);
      }

      const spawnOptions: SpawnOptions = {};
      if (cwd) {
        spawnOptions.cwd = cwd;
      }

      logger.verboseWithContext('Invoking clang-format', {
        operation: 'clang-format',
        path: this.settings.path,
        args,
        cwd: spawnOptions.cwd || process.cwd(),
        filePath,
        offset,
        length,
        inputLength: text.length
      });

      const start = Date.now();
      const proc = spawn(this.settings.path, args, spawnOptions);

      let stdout = '';
      let stderrOutput = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          logger.verboseWithContext('clang-format completed successfully', {
            operation: 'clang-format',
            filePath,
            duration: Date.now() - start,
            outputLength: stdout.length
          });
          resolve(stdout);
        } else {
          logger.verboseWithContext('clang-format failed', {
            operation: 'clang-format',
            filePath,
            duration: Date.now() - start,
            exitCode: code ?? -1,
            stderr: stderrOutput.slice(0, 2000),
            args
          });
          logger.warn(`clang-format exited with code ${code} when formatting via "${this.settings.path}". Args: ${args.join(' ')}`);
          resolve(null);
        }
      });

      proc.on('error', (err: Error) => {
        logger.verboseWithContext('clang-format process error', {
          operation: 'clang-format',
          filePath,
          duration: Date.now() - start,
          error: err.message,
          args
        });
        logger.warn(`Failed to run clang-format at "${this.settings.path}": ${err.message}`);
        resolve(null);
      });

      // Write input to stdin
      proc.stdin?.write(text);
      proc.stdin?.end();
    });
  }

  /**
   * Get style presets
   */
  getStylePresets(): string[] {
    return [
      'LLVM',
      'Google',
      'Chromium',
      'Mozilla',
      'WebKit',
      'Microsoft',
      'GNU',
      'file'
    ];
  }

  /**
   * Get sample .clang-format config for protobuf
   */
  getSampleConfig(): string {
    return `# .clang-format for Protocol Buffers
---
Language: Proto
BasedOnStyle: Google
IndentWidth: 2
ColumnLimit: 100
AlignConsecutiveDeclarations: true
AlignConsecutiveAssignments: true
SortIncludes: false
`;
  }
}

export const clangFormat = new ClangFormatProvider();
