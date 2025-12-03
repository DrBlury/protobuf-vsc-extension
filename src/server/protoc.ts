/**
 * Protoc Integration for Protocol Buffers
 * Provides compilation and code generation capabilities
 */

import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ProtocSettings {
  path: string;
  compileOnSave: boolean;
  compileAllPath: string;
  useAbsolutePath: boolean;
  options: string[];
}

export interface CompilationResult {
  success: boolean;
  stdout: string;
  stderr: string;
  errors: ProtocError[];
}

export interface ProtocError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

const DEFAULT_SETTINGS: ProtocSettings = {
  path: 'protoc',
  compileOnSave: false,
  compileAllPath: '',
  useAbsolutePath: false,
  options: []
};

export class ProtocCompiler {
  private settings: ProtocSettings = DEFAULT_SETTINGS;
  private workspaceRoot: string = '';

  updateSettings(settings: Partial<ProtocSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * Check if protoc is available
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.settings.path, ['--version'], {
        shell: true
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get protoc version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.settings.path, ['--version'], {
        shell: true
      });

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const match = output.match(/libprotoc\s+([\d.]+)/);
          resolve(match ? match[1] : output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Compile a single proto file
   */
  async compileFile(filePath: string): Promise<CompilationResult> {
    const args = this.buildArgs(filePath);
    return this.runProtoc(args, path.dirname(filePath));
  }

  /**
   * Compile all proto files in the workspace
   */
  async compileAll(): Promise<CompilationResult> {
    const searchPath = this.settings.compileAllPath || this.workspaceRoot;
    const protoFiles = this.findProtoFiles(searchPath);

    if (protoFiles.length === 0) {
      return {
        success: true,
        stdout: 'No .proto files found',
        stderr: '',
        errors: []
      };
    }

    const args = this.buildArgs(...protoFiles);
    return this.runProtoc(args, searchPath);
  }

  /**
   * Validate a proto file without generating output
   */
  async validate(filePath: string): Promise<CompilationResult> {
    // Use --encode or a null output to just validate syntax
    const args: string[] = [];

    // Add proto paths
    args.push(`--proto_path=${path.dirname(filePath)}`);

    // Add configured proto paths
    for (const opt of this.settings.options) {
      if (opt.startsWith('--proto_path=') || opt.startsWith('-I')) {
        args.push(this.expandVariables(opt));
      }
    }

    // Add the file to compile
    args.push(filePath);

    // Add a dummy output to trigger validation
    args.push('--descriptor_set_out=/dev/null');

    return this.runProtoc(args, path.dirname(filePath));
  }

  private buildArgs(...files: string[]): string[] {
    const args: string[] = [];

    // Add all configured options (expand variables)
    for (const option of this.settings.options) {
      args.push(this.expandVariables(option));
    }

    // Add the files
    for (const file of files) {
      if (this.settings.useAbsolutePath) {
        args.push(path.resolve(file));
      } else {
        args.push(file);
      }
    }

    return args;
  }

  private expandVariables(value: string): string {
    return value
      .replace(/\$\{workspaceRoot\}/g, this.workspaceRoot)
      .replace(/\$\{workspaceFolder\}/g, this.workspaceRoot)
      .replace(/\$\{env\.(\w+)\}/g, (_, name) => process.env[name] || '')
      .replace(/\$\{config\.(\w+)\}/g, () => ''); // Config variables would need VS Code context
  }

  private async runProtoc(args: string[], cwd: string): Promise<CompilationResult> {
    return new Promise((resolve) => {
      const options: SpawnOptions = {
        cwd,
        shell: true
      };

      const proc = spawn(this.settings.path, args, options);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const errors = this.parseErrors(stderr);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          errors
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout: '',
          stderr: err.message,
          errors: [{
            file: '',
            line: 0,
            column: 0,
            message: `Failed to run protoc: ${err.message}`,
            severity: 'error'
          }]
        });
      });
    });
  }

  private parseErrors(stderr: string): ProtocError[] {
    const errors: ProtocError[] = [];
    const lines = stderr.split('\n');

    // Protoc error format: file:line:column: message
    // Or sometimes: file:line: message
    const errorRegex = /^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/;

    for (const line of lines) {
      const match = line.match(errorRegex);
      if (match) {
        const [, file, lineStr, colStr, message] = match;
        errors.push({
          file: file.trim(),
          line: parseInt(lineStr, 10),
          column: colStr ? parseInt(colStr, 10) : 1,
          message: message.trim(),
          severity: message.toLowerCase().includes('warning') ? 'warning' : 'error'
        });
      }
    }

    return errors;
  }

  private findProtoFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            files.push(...this.findProtoFiles(fullPath));
          }
        } else if (entry.isFile() && entry.name.endsWith('.proto')) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Ignore permission errors
    }

    return files;
  }
}

export const protocCompiler = new ProtocCompiler();
