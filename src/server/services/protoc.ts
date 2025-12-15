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
 * Default timeout for protoc execution in milliseconds.
 * Protoc should complete quickly; long runs usually indicate problems.
 */
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Maximum buffer size for stdout/stderr in bytes.
 * Prevents memory issues with very large outputs.
 */
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024; // 10 MB

/**
 * Check if we're running on Windows
 */
const IS_WINDOWS = process.platform === 'win32';

/**
 * Known script file extensions that require shell execution
 */
const SCRIPT_EXTENSIONS = new Set(['.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1', '.py']);

/**
 * Check if a command path looks like a script file based on extension.
 * Scripts need shell: true to execute properly.
 */
function isScriptByExtension(commandPath: string): boolean {
  const ext = path.extname(commandPath).toLowerCase();
  return SCRIPT_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a script by reading its shebang line.
 * Returns true if the file starts with #! (indicating a script interpreter).
 * This handles extensionless scripts like nanopb's protoc wrapper.
 */
function hasShebang(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(256);
    const bytesRead = fs.readSync(fd, buffer, 0, 256, 0);
    fs.closeSync(fd);

    if (bytesRead < 2) {
      return false;
    }

    const header = buffer.toString('utf-8', 0, bytesRead);
    return header.startsWith('#!');
  } catch {
    return false;
  }
}

/**
 * Determine if a command should be run with shell: true.
 * This handles script files (by extension or shebang) that need shell execution.
 */
function needsShellExecution(commandPath: string): boolean {
  // Quick check by extension first (avoids file I/O)
  if (isScriptByExtension(commandPath)) {
    return true;
  }

  // For extensionless files or unknown extensions, check for shebang
  const ext = path.extname(commandPath).toLowerCase();
  if (ext === '' || !SCRIPT_EXTENSIONS.has(ext)) {
    // Only check shebang for absolute paths or paths with separators
    if (path.isAbsolute(commandPath) || commandPath.includes(path.sep) || commandPath.includes('/')) {
      return hasShebang(commandPath);
    }
  }

  return false;
}

export interface ProtocSettings {
  path: string;
  compileOnSave: boolean;
  compileAllPath: string;
  useAbsolutePath: boolean;
  options: string[];
  /** Glob patterns or folder names to exclude from compile all (e.g., 'test', 'nanopb', 'third_party') */
  excludePatterns: string[];
  /** Timeout for protoc execution in milliseconds. Default: 60000 (60 seconds) */
  timeout?: number;
}

export interface CompilationResult {
  success: boolean;
  stdout: string;
  stderr: string;
  errors: ProtocError[];
  /** True if the process was terminated due to timeout */
  timedOut?: boolean;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Number of files compiled (only for compileAll) */
  fileCount?: number;
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
  private versionCache: { version: string | null; timestamp: number; path: string } | null = null;
  private static readonly VERSION_CACHE_TTL = 300000; // 5 minutes
  private activeProcesses: Set<ReturnType<typeof spawn>> = new Set();

  updateSettings(settings: Partial<ProtocSettings>): void {
    const pathChanged = settings.path && settings.path !== this.settings.path;
    this.settings = { ...this.settings, ...settings };
    // Clear version cache if path changed
    if (pathChanged) {
      this.versionCache = null;
    }
  }

  /**
   * Cancel all running protoc processes.
   * Useful when the user cancels an operation or the extension is deactivating.
   */
  cancelAll(): void {
    for (const proc of this.activeProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
    this.activeProcesses.clear();
  }

  /**
   * Clear the version cache, forcing a fresh check on next getVersion() call.
   */
  clearVersionCache(): void {
    this.versionCache = null;
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * Check if protoc is available.
   * Auto-detects script-based protoc (by extension or shebang) and uses shell execution for them.
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if this protoc is a script that needs shell execution
      const useShell = needsShellExecution(this.settings.path);

      const proc = spawn(this.settings.path, ['--version'], { shell: useShell });

      proc.on('close', (code: number | null) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        // If we didn't use shell, fallback to shell (needed for some PATH configurations)
        if (!useShell) {
          const procWithShell = spawn(this.settings.path, ['--version'], { shell: true });
          procWithShell.on('close', (code: number | null) => resolve(code === 0));
          procWithShell.on('error', () => resolve(false));
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Get protoc version with caching.
   * Results are cached for 5 minutes to avoid repeated subprocess calls.
   * @param forceRefresh - If true, bypasses the cache and fetches fresh version
   */
  async getVersion(forceRefresh = false): Promise<string | null> {
    // Check cache first (unless force refresh)
    if (!forceRefresh && this.versionCache) {
      const cacheAge = Date.now() - this.versionCache.timestamp;
      if (cacheAge < ProtocCompiler.VERSION_CACHE_TTL && this.versionCache.path === this.settings.path) {
        return this.versionCache.version;
      }
    }

    const version = await this.fetchVersion();

    // Update cache
    this.versionCache = {
      version,
      timestamp: Date.now(),
      path: this.settings.path
    };

    return version;
  }

  /**
   * Fetch protoc version from the executable (no caching).
   * Auto-detects script-based protoc and uses shell execution for them.
   */
  private async fetchVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      // Check if this protoc is a script that needs shell execution
      const useShell = needsShellExecution(this.settings.path);

      const proc = spawn(this.settings.path, ['--version'], { shell: useShell });

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
        // If we didn't use shell, fallback with shell
        if (!useShell) {
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
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Compile a single proto file.
   * @param filePath - Absolute or relative path to the .proto file
   * @throws Error if filePath is empty or not a .proto file
   */
  async compileFile(filePath: string): Promise<CompilationResult> {
    // Input validation
    if (!filePath || filePath.trim() === '') {
      return {
        success: false,
        stdout: '',
        stderr: 'File path is required',
        errors: [{
          file: '',
          line: 0,
          column: 0,
          message: 'File path is required',
          severity: 'error'
        }]
      };
    }

    if (!filePath.endsWith('.proto')) {
      return {
        success: false,
        stdout: '',
        stderr: `File must have .proto extension: ${filePath}`,
        errors: [{
          file: filePath,
          line: 0,
          column: 0,
          message: 'File must have .proto extension',
          severity: 'error'
        }]
      };
    }

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
        errors: [],
        fileCount: 0
      };
    }

    // Build args with proper proto_path handling for multiple files
    const args = this.buildArgsForMultipleFiles(protoFiles, searchPath);

    // Check if command line would be too long
    const commandLength = this.estimateCommandLength(args);

    let result: CompilationResult;
    if (commandLength > MAX_COMMAND_LINE_LENGTH) {
      // Use a response file to avoid command line length limits
      result = await this.runProtocWithResponseFile(args, searchPath);
    } else {
      result = await this.runProtoc(args, searchPath);
    }

    // Add file count to the result
    result.fileCount = protoFiles.length;
    return result;
  }

  /**
   * Build arguments for compiling multiple files.
   * Ensures proper --proto_path coverage for all files.
   */
  private buildArgsForMultipleFiles(files: string[], basePath: string): string[] {
    const args: string[] = [];
    const normalizedBasePath = this.normalizePath(basePath);

    // Parse user-configured proto paths from options first
    const { protoPaths: userProtoPaths, otherOptions } = this.parseProtoPaths(this.settings.options);

    // Add user-configured proto paths first (for import resolution)
    for (const protoPath of userProtoPaths) {
      args.push(`--proto_path=${protoPath}`);
    }

    // Add the base path as a proto_path if not already covered by user paths
    let basePathCovered = false;
    for (const userPath of userProtoPaths) {
      if (normalizedBasePath === userPath || this.isPathUnder(normalizedBasePath, userPath)) {
        basePathCovered = true;
        break;
      }
    }
    if (!basePathCovered && normalizedBasePath) {
      args.push(`--proto_path=${normalizedBasePath}`);
    }

    // Collect unique directories from files outside base path
    const uniqueDirs = new Set<string>();
    for (const file of files) {
      const resolvedFile = this.normalizePath(path.resolve(file));
      const fileDir = path.dirname(resolvedFile);

      // Check if covered by user paths or base path
      let covered = basePathCovered ? false : this.isPathUnder(resolvedFile, normalizedBasePath);
      if (!covered) {
        for (const userPath of userProtoPaths) {
          if (this.isPathUnder(resolvedFile, userPath)) {
            covered = true;
            break;
          }
        }
      }
      if (!covered && !basePathCovered) {
        covered = this.isPathUnder(resolvedFile, normalizedBasePath);
      }

      if (!covered) {
        const normalizedDir = this.normalizePath(fileDir);
        if (normalizedDir) {
          uniqueDirs.add(normalizedDir);
        }
      }
    }

    // Add additional proto_paths for directories outside coverage
    for (const dir of uniqueDirs) {
      args.push(`--proto_path=${dir}`);
    }

    // Add other configured options (output dirs, plugins, etc.)
    for (const option of otherOptions) {
      args.push(option);
    }

    // Collect all proto paths for relative path calculation
    const allProtoPaths = [...userProtoPaths];
    if (!basePathCovered && normalizedBasePath) {
      allProtoPaths.push(normalizedBasePath);
    }
    allProtoPaths.push(...uniqueDirs);

    // Add the files - use paths relative to covering proto_path
    for (const file of files) {
      const resolvedFile = this.normalizePath(path.resolve(file));

      // Find which proto_path covers this file
      let relativePath: string | null = null;
      for (const protoPath of allProtoPaths) {
        if (this.isPathUnder(resolvedFile, protoPath)) {
          relativePath = path.relative(protoPath, resolvedFile);
          break;
        }
      }

      if (relativePath !== null) {
        // Use forward slashes for protoc compatibility
        args.push(relativePath.split(path.sep).join('/'));
      } else if (this.settings.useAbsolutePath) {
        args.push(resolvedFile);
      } else {
        args.push(file);
      }
    }

    return args;
  }

  /**
   * Parse proto paths from options array.
   * Returns separated proto paths and other options.
   */
  private parseProtoPaths(options: string[]): { protoPaths: Set<string>; otherOptions: string[] } {
    const protoPaths = new Set<string>();
    const otherOptions: string[] = [];

    for (const option of options) {
      if (!option || option.trim() === '') {
        continue;
      }
      const expanded = this.expandVariables(option);
      if (expanded.startsWith('--proto_path=')) {
        const protoPath = this.normalizePath(expanded.substring('--proto_path='.length));
        if (protoPath) {
          protoPaths.add(protoPath);
        }
      } else if (expanded.startsWith('-I=')) {
        const protoPath = this.normalizePath(expanded.substring('-I='.length));
        if (protoPath) {
          protoPaths.add(protoPath);
        }
      } else if (expanded.startsWith('-I') && expanded.length > 2) {
        const protoPath = this.normalizePath(expanded.substring(2));
        if (protoPath) {
          protoPaths.add(protoPath);
        }
      } else {
        otherOptions.push(expanded);
      }
    }

    return { protoPaths, otherOptions };
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
    const resolvedFile = this.normalizePath(path.resolve(filePath));
    const fileDir = path.dirname(resolvedFile);

    const args: string[] = [];

    // Parse user proto paths
    const { protoPaths: userProtoPaths, otherOptions: _ } = this.parseProtoPaths(this.settings.options);

    // Add user-configured proto paths first
    for (const protoPath of userProtoPaths) {
      args.push(`--proto_path=${protoPath}`);
    }

    // Check if file is covered by user proto paths
    let covered = false;
    let coveringPath = '';
    for (const protoPath of userProtoPaths) {
      if (this.isPathUnder(resolvedFile, protoPath)) {
        covered = true;
        coveringPath = protoPath;
        break;
      }
    }

    // Add file's directory as proto_path if not covered
    if (!covered) {
      const normalizedDir = this.normalizePath(fileDir);
      if (normalizedDir) {
        args.push(`--proto_path=${normalizedDir}`);
        coveringPath = normalizedDir;
      }
    }

    // Add the file with relative path from covering proto_path
    if (coveringPath) {
      const relativePath = path.relative(coveringPath, resolvedFile);
      args.push(relativePath.split(path.sep).join('/'));
    } else {
      args.push(filePath);
    }

    // Add a dummy output to trigger validation (cross-platform)
    if (IS_WINDOWS) {
      args.push('--descriptor_set_out=NUL');
    } else {
      args.push('--descriptor_set_out=/dev/null');
    }

    return this.runProtoc(args, fileDir);
  }

  private buildArgs(...files: string[]): string[] {
    const args: string[] = [];

    // Parse proto_paths from user-configured options
    const { protoPaths: userProtoPaths, otherOptions } = this.parseProtoPaths(this.settings.options);

    // Add user-configured proto paths first (for import resolution)
    for (const protoPath of userProtoPaths) {
      args.push(`--proto_path=${protoPath}`);
    }

    // Check if files are covered by user proto paths
    // A proto_path covers a file if the file is under that path
    const fileProtoPaths = new Set<string>();
    for (const file of files) {
      const resolvedFile = this.normalizePath(path.resolve(file));
      const fileDir = path.dirname(resolvedFile);

      // Check if any user proto path covers this file
      let coveredByUserPath = false;
      for (const protoPath of userProtoPaths) {
        if (this.isPathUnder(resolvedFile, protoPath)) {
          coveredByUserPath = true;
          break;
        }
      }

      // If not covered by user paths, add the file's directory as a proto_path
      if (!coveredByUserPath) {
        const normalizedDir = this.normalizePath(fileDir);
        if (normalizedDir) {
          fileProtoPaths.add(normalizedDir);
        }
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
    const allProtoPaths = [...userProtoPaths, ...fileProtoPaths];

    // Add the files - use path relative to covering proto_path
    for (const file of files) {
      const resolvedFile = this.normalizePath(path.resolve(file));

      // Find which proto_path covers this file and compute relative path
      let relativePath: string | null = null;
      for (const protoPath of allProtoPaths) {
        if (this.isPathUnder(resolvedFile, protoPath)) {
          relativePath = path.relative(protoPath, resolvedFile);
          break;
        }
      }

      if (relativePath !== null) {
        // Use forward slashes for protoc compatibility
        args.push(relativePath.split(path.sep).join('/'));
      } else if (this.settings.useAbsolutePath) {
        args.push(resolvedFile);
      } else {
        args.push(file);
      }
    }

    return args;
  }

  /**
   * Check if a file path is under a directory path.
   * Returns true if filePath is inside dirPath.
   */
  private isPathUnder(filePath: string, dirPath: string): boolean {
    const normalizedFile = this.normalizePath(filePath);
    const normalizedDir = this.normalizePath(dirPath);

    if (!normalizedFile || !normalizedDir) {
      return false;
    }

    // File must start with dir path followed by a separator
    // Or be exactly equal (for the case where file is in the proto_path root)
    const relative = path.relative(normalizedDir, normalizedFile);

    // If relative path starts with '..', the file is not under the directory
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
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
      normalized = normalized[0]!.toUpperCase() + normalized.slice(1);
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
    const startTime = Date.now();
    const timeout = this.settings.timeout ?? DEFAULT_TIMEOUT_MS;

    // Check if this protoc is a script that needs shell execution
    const useShell = needsShellExecution(this.settings.path);

    // If we need shell for scripts, use response file approach to avoid command line limits
    if (useShell) {
      return this.runProtocWithResponseFile(args, cwd);
    }

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
      this.activeProcesses.add(proc);

      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timedOut = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill('SIGTERM');
          // Give it a moment, then force kill if needed
          setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {
              // Process may have already exited
            }
          }, 1000);
        } catch {
          // Process may have already exited
        }
      }, timeout);

      proc.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BUFFER) {
          stdout += data.toString();
          if (stdout.length >= MAX_OUTPUT_BUFFER) {
            stdoutTruncated = true;
            stdout = stdout.slice(0, MAX_OUTPUT_BUFFER);
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BUFFER) {
          stderr += data.toString();
          if (stderr.length >= MAX_OUTPUT_BUFFER) {
            stderrTruncated = true;
            stderr = stderr.slice(0, MAX_OUTPUT_BUFFER);
          }
        }
      });

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.activeProcesses.delete(proc);
      };

      proc.on('close', (code: number | null) => {
        cleanup();
        const executionTime = Date.now() - startTime;

        if (timedOut) {
          resolve({
            success: false,
            stdout,
            stderr: stderr + `\nProcess timed out after ${timeout}ms`,
            errors: [{
              file: '',
              line: 0,
              column: 0,
              message: `Protoc timed out after ${timeout}ms. Consider increasing timeout or checking for issues.`,
              severity: 'error'
            }],
            timedOut: true,
            executionTime
          });
          return;
        }

        const errors = this.parseErrors(stderr);

        // Add truncation warnings if needed
        if (stdoutTruncated || stderrTruncated) {
          errors.push({
            file: '',
            line: 0,
            column: 0,
            message: `Output was truncated (exceeded ${MAX_OUTPUT_BUFFER / 1024 / 1024}MB limit)`,
            severity: 'warning'
          });
        }

        resolve({
          success: code === 0,
          stdout,
          stderr,
          errors,
          executionTime
        });
      });

      proc.on('error', (err: Error) => {
        cleanup();

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
          }],
          executionTime: Date.now() - startTime
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
   * - Path segments: 'nanopb/tests' (matches paths starting with or containing this segment)
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

      // Check if pattern is a multi-segment path (e.g., 'nanopb/tests')
      // This should match if the relativePath starts with or contains this path prefix
      if (pattern.includes('/') && !pattern.includes('*')) {
        // Normalize pattern separators
        const normalizedPattern = pattern.split(/[/\\]/).join('/');
        // Check if path starts with or contains the pattern as a path prefix
        if (relativePath.startsWith(normalizedPattern + '/') ||
            relativePath === normalizedPattern ||
            relativePath.includes('/' + normalizedPattern + '/') ||
            relativePath.includes('/' + normalizedPattern)) {
          return true;
        }
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
