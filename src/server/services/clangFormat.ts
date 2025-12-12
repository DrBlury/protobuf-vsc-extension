/**
 * clang-format Integration for Protocol Buffers
 * Uses clang-format for code formatting when available
 */

import { spawn } from 'child_process';
import { TextEdit, Range } from 'vscode-languageserver/node';
import * as path from 'path';

export interface ClangFormatSettings {
  enabled: boolean;
  path: string;
  style: string;
  fallbackStyle: string;
}

const DEFAULT_SETTINGS: ClangFormatSettings = {
  enabled: false,
  path: 'clang-format',
  style: 'file',
  fallbackStyle: 'Google'
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
      const proc = spawn(this.settings.path, ['--version'], { shell: true });

      proc.on('close', (code: number | null) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Get clang-format version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.settings.path, ['--version'], { shell: true });

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse version from output like "clang-format version 14.0.0"
          const match = output.match(/version\s+([\d.]+)/);
          resolve(match ? match[1] : output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
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

    const lines = text.split('\n');
    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1].length }
      },
      newText: formatted
    }];
  }

  /**
   * Format a range using clang-format
   */
  async formatRange(text: string, range: Range, filePath?: string): Promise<TextEdit[]> {
    if (!this.settings.enabled) {
      return [];
    }

    const lines = text.split('\n');

    // Calculate byte offsets for the range
    let offset = 0;
    for (let i = 0; i < range.start.line; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += range.start.character;

    let length = 0;
    for (let i = range.start.line; i <= range.end.line; i++) {
      if (i === range.start.line && i === range.end.line) {
        length = range.end.character - range.start.character;
      } else if (i === range.start.line) {
        length += lines[i].length - range.start.character + 1;
      } else if (i === range.end.line) {
        length += range.end.character;
      } else {
        length += lines[i].length + 1;
      }
    }

    const formatted = await this.runClangFormat(text, filePath, offset, length);

    if (formatted === null || formatted === text) {
      return [];
    }

    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1].length }
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
          args.push(`--style=file`);
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

      const proc = spawn(this.settings.path, args, { shell: true, cwd });

      let stdout = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (_data: Buffer) => {
        // stderr captured but not used - errors handled via close event
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          // Error logged via connection.console in parent try-catch
          resolve(null);
        }
      });

      proc.on('error', (_err: Error) => {
        // Error logged via connection.console in parent try-catch
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
