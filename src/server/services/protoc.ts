/**
 * Protoc Integration for Protocol Buffers
 * Provides compilation and code generation capabilities
 */

import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Maximum command line length to stay safely below OS limits.
 * Windows cmd.exe: 8191 chars limit
 * We use a conservative limit to be safe.
 * When shell: false is used, this limit doesn't apply, but we still
 * use response files for very large argument lists for reliability.
 */
const MAX_COMMAND_LINE_LENGTH = 7000;

/**
 * Check if we're running on Windows
 */
const IS_WINDOWS = process.platform === 'win32';

export interface ProtocSettings {
  path: string;
  compileOnSave: boolean;
  compileAllPath: string;
  useAbsolutePath: boolean;
  options: string[];
  /** Glob patterns or folder names to exclude from compile all (e.g., 'test', 'nanopb', 'third_party') */
  excludePatterns: string[];
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
  options: [],
  excludePatterns: []
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
      // Try without shell first (faster and avoids shell issues)
      const proc = spawn(this.settings.path, ['--version']);

      proc.on('close', (code: number | null) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        // Fallback: try with shell (needed for some PATH configurations)
        const procWithShell = spawn(this.settings.path, ['--version'], { shell: true });
        procWithShell.on('close', (code: number | null) => resolve(code === 0));
        procWithShell.on('error', () => resolve(false));
      });
    });
  }

  /**
   * Get protoc version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.settings.path, ['--version']);

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          const match = output.match(/libprotoc\s+([\d.]+)/);
          resolve(match ? match[1]! : output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        // Fallback with shell
        const procWithShell = spawn(this.settings.path, ['--version'], { shell: true });
        let shellOutput = '';
        procWithShell.stdout?.on('data', (data: Buffer) => {
          shellOutput += data.toString();
        });
        procWithShell.on('close', (code: number | null) => {
          if (code === 0) {
            const match = shellOutput.match(/libprotoc\s+([\d.]+)/);
            resolve(match ? match[1]! : shellOutput.trim());
          } else {
            resolve(null);
          }
        });
        procWithShell.on('error', () => resolve(null));
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
   * Compile all proto files in the workspace.
   * Handles large numbers of files by using a response file (@argfile)
   * when the command line would exceed OS limits.
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

    // Build args with proper proto_path handling for multiple files
    const args = this.buildArgsForMultipleFiles(protoFiles, searchPath);

    // Check if command line would be too long
    const commandLength = this.estimateCommandLength(args);

    if (commandLength > MAX_COMMAND_LINE_LENGTH) {
      // Use a response file to avoid command line length limits
      return this.runProtocWithResponseFile(args, searchPath);
    }

    return this.runProtoc(args, searchPath);
  }

  /**
   * Build arguments for compiling multiple files.
   * Ensures proper --proto_path coverage for all files.
   */
  private buildArgsForMultipleFiles(files: string[], basePath: string): string[] {
    const args: string[] = [];

    // Add the base path as a proto_path so imports work correctly
    args.push(`--proto_path=${basePath}`);

    // Collect unique directories from all files and add them as proto_paths
    // This ensures that imports between files in different directories work
    const uniqueDirs = new Set<string>();
    for (const file of files) {
      const dir = path.dirname(file);
      // Only add if it's not the base path and not already a subdirectory of base path
      const relativeDir = path.relative(basePath, dir);
      if (relativeDir && !relativeDir.startsWith('..')) {
        // It's a subdirectory of basePath, no need to add separately
        // as --proto_path=${basePath} will cover it
      } else if (relativeDir.startsWith('..')) {
        // Directory is outside basePath, need to add it
        uniqueDirs.add(dir);
      }
    }

    // Add additional proto_paths for directories outside the base path
    for (const dir of uniqueDirs) {
      args.push(`--proto_path=${dir}`);
    }

    // Add all configured options (expand variables)
    for (const option of this.settings.options) {
      args.push(this.expandVariables(option));
    }

    // Add the files - use paths relative to basePath when possible
    for (const file of files) {
      const relativePath = path.relative(basePath, file);
      // If the file is within basePath, use relative path; otherwise use absolute
      if (!relativePath.startsWith('..')) {
        args.push(relativePath);
      } else if (this.settings.useAbsolutePath) {
        args.push(path.resolve(file));
      } else {
        args.push(file);
      }
    }

    return args;
  }

  /**
   * Estimate the total command line length for the given arguments.
   * Accounts for the protoc path, spaces between arguments, and quotes around arguments with spaces.
   */
  private estimateCommandLength(args: string[]): number {
    let length = this.settings.path.length; // protoc path
    for (const arg of args) {
      length += 1; // space separator
      // Add 2 for quotes if arg contains spaces
      length += arg.includes(' ') ? arg.length + 2 : arg.length;
    }
    return length;
  }

  /**
   * Run protoc using a response file (@argfile) to avoid command line length limits.
   * The response file contains all arguments, one per line.
   */
  private async runProtocWithResponseFile(args: string[], cwd: string): Promise<CompilationResult> {
    // Create a temporary response file
    const tempDir = os.tmpdir();
    const responseFilePath = path.join(tempDir, `protoc-args-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

    try {
      // Write arguments to the response file, one per line
      // Arguments with spaces need to be quoted
      const responseContent = args.map(arg => {
        if (arg.includes(' ') || arg.includes('"')) {
          // Escape any existing quotes and wrap in quotes
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      }).join('\n');

      fs.writeFileSync(responseFilePath, responseContent, 'utf-8');

      // Run protoc with the response file
      const result = await this.runProtoc([`@${responseFilePath}`], cwd);

      return result;
    } finally {
      // Clean up the response file
      try {
        if (fs.existsSync(responseFilePath)) {
          fs.unlinkSync(responseFilePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
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

    // Collect proto_paths from user-configured options first
    // These are needed for imports to resolve correctly
    const userProtoPaths = new Set<string>();
    const otherOptions: string[] = [];

    for (const option of this.settings.options) {
      // Skip empty options
      if (!option || option.trim() === '') {
        continue;
      }
      const expanded = this.expandVariables(option);
      if (expanded.startsWith('--proto_path=')) {
        const protoPath = this.normalizePath(expanded.substring('--proto_path='.length));
        if (protoPath) {
          userProtoPaths.add(protoPath);
        }
      } else if (expanded.startsWith('-I=')) {
        const protoPath = this.normalizePath(expanded.substring('-I='.length));
        if (protoPath) {
          userProtoPaths.add(protoPath);
        }
      } else if (expanded.startsWith('-I') && expanded.length > 2) {
        const protoPath = this.normalizePath(expanded.substring(2));
        if (protoPath) {
          userProtoPaths.add(protoPath);
        }
      } else {
        otherOptions.push(expanded);
      }
    }

    // Add user-configured proto paths first (for import resolution)
    for (const protoPath of userProtoPaths) {
      args.push(`--proto_path=${protoPath}`);
    }

    // Add proto_path for the directory containing the file(s)
    // This is required by protoc - files must reside within a --proto_path
    const fileProtoPaths = new Set<string>();
    for (const file of files) {
      const fileDir = this.normalizePath(path.dirname(path.resolve(file)));
      // Only add if not already covered by user proto paths
      if (fileDir && !userProtoPaths.has(fileDir)) {
        fileProtoPaths.add(fileDir);
      }
    }
    for (const protoPath of fileProtoPaths) {
      args.push(`--proto_path=${protoPath}`);
    }

    // Add other configured options (output dirs, plugins, etc.)
    for (const option of otherOptions) {
      args.push(option);
    }

    // Combine all proto paths for file path resolution
    const allProtoPaths = new Set([...userProtoPaths, ...fileProtoPaths]);

    // Add the files - use basename if the file's directory is in proto paths
    for (const file of files) {
      const resolvedFile = path.resolve(file);
      const fileDir = this.normalizePath(path.dirname(resolvedFile));
      const fileName = path.basename(resolvedFile);

      // If file's directory is covered by a proto_path, use relative name
      if (fileDir && allProtoPaths.has(fileDir)) {
        args.push(fileName);
      } else if (this.settings.useAbsolutePath) {
        args.push(resolvedFile);
      } else {
        args.push(file);
      }
    }

    return args;
  }

  /**
   * Normalize a path for consistent comparison across platforms.
   * - Resolves to absolute path
   * - Removes trailing slashes
   * - On Windows, normalizes drive letter case
   */
  private normalizePath(inputPath: string): string {
    if (!inputPath || inputPath.trim() === '') {
      return '';
    }

    let normalized = path.resolve(inputPath);

    // Remove trailing slashes (but keep root slash on Unix or drive root on Windows)
    while (normalized.length > 1 && (normalized.endsWith('/') || normalized.endsWith('\\'))) {
      normalized = normalized.slice(0, -1);
    }

    // On Windows, normalize drive letter to uppercase for consistent comparison
    if (IS_WINDOWS && /^[a-z]:/.test(normalized)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1);
    }

    return normalized;
  }

  private expandVariables(value: string): string {
    return value
      .replace(/\$\{workspaceRoot\}/g, this.workspaceRoot)
      .replace(/\$\{workspaceFolder\}/g, this.workspaceRoot)
      .replace(/\$\{env\.(\w+)\}/g, (_: string, name: string) => process.env[name] || '')
      .replace(/\$\{config\.(\w+)\}/g, () => ''); // Config variables would need VS Code context
  }

  private async runProtoc(args: string[], cwd: string): Promise<CompilationResult> {
    return new Promise((resolve) => {
      // Resolve the command path - avoid shell: true to bypass command line length limits
      // shell: true on Windows uses cmd.exe which has an 8191 char limit
      const command = this.resolveCommand(this.settings.path);

      const options: SpawnOptions = {
        cwd,
        // Avoid shell: true to bypass Windows command line length limits
        // This requires the command to be a direct path to an executable
        shell: false,
        // On Windows, we need to handle .cmd/.bat files specially
        windowsVerbatimArguments: IS_WINDOWS
      };

      const proc = spawn(command, args, options);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        const errors = this.parseErrors(stderr);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          errors
        });
      });

      proc.on('error', (err: Error) => {
        // If spawn fails without shell, try with shell as fallback
        // This handles cases where the command is a shell alias or script
        if (!options.shell) {
          this.runProtocWithShell(args, cwd).then(resolve);
          return;
        }

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

  /**
   * Resolve the command to an executable path.
   * On Windows, this helps find .exe files when given just the command name.
   */
  private resolveCommand(command: string): string {
    // If it's already an absolute path or contains path separators, use as-is
    if (path.isAbsolute(command) || command.includes(path.sep) || command.includes('/')) {
      return command;
    }

    // For simple command names like 'protoc', return as-is
    // spawn will search PATH when shell: false
    return command;
  }

  /**
   * Fallback: run protoc with shell: true for cases where shell-less execution fails.
   * Uses response file to avoid command line length limits.
   */
  private async runProtocWithShell(args: string[], cwd: string): Promise<CompilationResult> {
    // Always use response file when falling back to shell to avoid length limits
    return this.runProtocWithResponseFile(args, cwd);
  }

  /**
   * Analyze stderr to provide helpful suggestions for common errors
   */
  private analyzeErrorsForSuggestions(stderr: string): string | undefined {
    // Check for missing import errors (Google well-known types)
    if (stderr.includes('google/protobuf/') && stderr.includes('not found')) {
      return 'Missing Google well-known types. Add --proto_path pointing to your protoc include directory (e.g., /usr/local/include or /opt/homebrew/include) in protobuf.protoc.options';
    }

    if (stderr.includes('google/type/') && stderr.includes('not found')) {
      return 'Missing Google common types (google/type/*). These require googleapis. Either use buf with BSR dependencies, or download googleapis and add --proto_path to its location';
    }

    if (stderr.includes('google/api/') && stderr.includes('not found')) {
      return 'Missing Google API types (google/api/*). These require googleapis. Either use buf with BSR dependencies (buf.build/googleapis/googleapis), or download from https://github.com/googleapis/googleapis';
    }

    // Check for generic import not found
    if (stderr.includes('not found') || stderr.includes('File not found')) {
      return 'Import file not found. Check that --proto_path in protobuf.protoc.options covers all your proto source directories';
    }

    // Check for type not defined errors
    if (stderr.includes('is not defined') || stderr.includes('not defined in')) {
      return 'Type not found. Ensure all required .proto files are imported and --proto_path settings are correct';
    }

    return undefined;
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
          file: file!.trim(),
          line: parseInt(lineStr!, 10),
          column: colStr ? parseInt(colStr, 10) : 1,
          message: message!.trim(),
          severity: message!.toLowerCase().includes('warning') ? 'warning' : 'error'
        });
      }
    }

    // If we found errors, check if we can add a helpful suggestion
    if (errors.length > 0) {
      const suggestion = this.analyzeErrorsForSuggestions(stderr);
      if (suggestion) {
        errors.push({
          file: '',
          line: 0,
          column: 0,
          message: `💡 Tip: ${suggestion}`,
          severity: 'warning'
        });
      }
    }

    return errors;
  }

  private findProtoFiles(dir: string, basePath?: string): string[] {
    const files: string[] = [];
    const rootPath = basePath || dir;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden dirs and node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          // Check if directory matches any exclude pattern
          if (this.isExcluded(fullPath, entry.name, rootPath)) {
            continue;
          }
          files.push(...this.findProtoFiles(fullPath, rootPath));
        } else if (entry.isFile() && entry.name.endsWith('.proto')) {
          // Check if file matches any exclude pattern
          if (!this.isExcluded(fullPath, entry.name, rootPath)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }

    return files;
  }

  /**
   * Check if a path should be excluded based on exclude patterns.
   * Supports:
   * - Simple folder names: 'nanopb', 'test'
   * - Glob-like patterns with wildcards
   * - Path segments: 'nanopb/tests'
   */
  private isExcluded(fullPath: string, name: string, rootPath: string): boolean {
    if (this.settings.excludePatterns.length === 0) {
      return false;
    }

    const relativePath = path.relative(rootPath, fullPath).split(path.sep).join('/');

    for (const pattern of this.settings.excludePatterns) {
      // Simple name match (e.g., 'nanopb' matches any folder named 'nanopb')
      if (pattern === name) {
        return true;
      }

      // Check if pattern appears as a path segment
      const segments = relativePath.split('/');
      if (segments.includes(pattern)) {
        return true;
      }

      // Glob-like pattern matching
      if (this.matchGlobPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob pattern matching.
   * Supports: * (any chars except /), ** (any chars including /), ? (single char)
   */
  private matchGlobPattern(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars (except * and ?)
      .replace(/\*\*/g, '{{GLOBSTAR}}')      // Temporarily replace **
      .replace(/\*/g, '[^/]*')                // * matches anything except /
      .replace(/\?/g, '.')                    // ? matches single char
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');   // ** matches anything including /

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(path);
    } catch {
      return false;
    }
  }
}

export const protocCompiler = new ProtocCompiler();
