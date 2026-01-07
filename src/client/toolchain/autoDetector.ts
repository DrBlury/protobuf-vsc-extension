/**
 * Auto-detection for protobuf tools and configuration suggestions
 * Detects buf, protolint, protoc, clang-format and suggests settings
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { fileExists } from '../utils/fsUtils';
// Note: We still need Node.js fs for low-level shebang reading (only reads first 256 bytes)
// which VS Code's abstract filesystem doesn't support efficiently
import * as fs from 'fs';

export interface DetectedTool {
  name: string;
  path: string;
  version: string;
}

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
    // Only check files that exist and are accessible
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

    // Check for shebang (#!)
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
export function needsShellExecution(commandPath: string): boolean {
  // Quick check by extension first (avoids file I/O)
  if (isScriptByExtension(commandPath)) {
    return true;
  }

  // For extensionless files or unknown extensions, check for shebang
  const ext = path.extname(commandPath).toLowerCase();
  if (ext === '' || !SCRIPT_EXTENSIONS.has(ext)) {
    // Only check shebang for absolute paths or paths with separators
    // (not bare command names that rely on PATH lookup)
    if (path.isAbsolute(commandPath) || commandPath.includes(path.sep) || commandPath.includes('/')) {
      return hasShebang(commandPath);
    }
  }

  return false;
}

export interface DetectionResult {
  buf?: DetectedTool;
  protolint?: DetectedTool;
  apiLinter?: DetectedTool;
  protoc?: DetectedTool;
  clangFormat?: DetectedTool;
  bufYamlFound: boolean;
  bufWorkYamlFound: boolean;
  protolintConfigFound: boolean;
  apiLinterConfigFound: boolean;
  clangFormatConfigFound: boolean;
}

// Common installation paths to check when PATH isn't available (GUI apps)
function getCommonPaths(): string[] {
  const platform = os.platform();
  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    const userProfile = os.homedir();
    return [
      path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'),
      path.join(programFiles, 'protobuf', 'bin'),
      path.join(programFilesX86, 'protobuf', 'bin'),
      path.join(userProfile, 'scoop', 'shims'),
      path.join(userProfile, 'go', 'bin'),
      path.join(localAppData, 'buf', 'bin'),
      'C:\\tools\\protoc\\bin',
    ];
  } else if (platform === 'darwin') {
    return [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'go', 'bin'),
    ];
  } else {
    return [
      '/usr/local/bin',
      '/usr/bin',
      '/snap/bin',
      '/home/linuxbrew/.linuxbrew/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'go', 'bin'),
      path.join(os.homedir(), 'bin'),
    ];
  }
}

/**
 * Auto-detection manager for protobuf tools
 */
export class AutoDetector {
  private outputChannel: vscode.OutputChannel;
  private globalStoragePath: string;
  private hasPromptedThisSession = false;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.globalStoragePath = context.globalStorageUri.fsPath;
  }

  /**
   * Run full auto-detection and prompt user for configuration
   */
  public async detectAndPrompt(): Promise<void> {
    // Only prompt once per session to avoid being annoying
    if (this.hasPromptedThisSession) {
      return;
    }

    const result = await this.detectTools();
    await this.promptForSettings(result);
    this.hasPromptedThisSession = true;
  }

  /**
   * Detect all available tools
   */
  public async detectTools(): Promise<DetectionResult> {
    this.outputChannel.appendLine('Auto-detecting protobuf tools...');

    const [buf, protolint, apiLinter, protoc, clangFormat] = await Promise.all([
      this.detectTool('buf', '--version'),
      this.detectTool('protolint', '--version'),
      this.detectTool('api-linter', '--version'),
      this.detectTool('protoc', '--version'),
      this.detectTool('clang-format', '--version'),
    ]);

    // Check for config files in workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let bufYamlFound = false;
    let bufWorkYamlFound = false;
    let protolintConfigFound = false;
    let apiLinterConfigFound = false;
    let clangFormatConfigFound = false;

    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const rootPath = folder.uri.fsPath;

        if (!bufYamlFound && (
          await fileExists(path.join(rootPath, 'buf.yaml')) ||
          await fileExists(path.join(rootPath, 'buf.yml'))
        )) {
          bufYamlFound = true;
        }

        if (!bufWorkYamlFound && (
          await fileExists(path.join(rootPath, 'buf.work.yaml')) ||
          await fileExists(path.join(rootPath, 'buf.work.yml'))
        )) {
          bufWorkYamlFound = true;
        }

        if (!protolintConfigFound && (
          await fileExists(path.join(rootPath, '.protolint.yaml')) ||
          await fileExists(path.join(rootPath, '.protolint.yml'))
        )) {
          protolintConfigFound = true;
        }

        if (!apiLinterConfigFound && (
          await fileExists(path.join(rootPath, 'api-linter.yaml')) ||
          await fileExists(path.join(rootPath, 'api-linter.yml')) ||
          await fileExists(path.join(rootPath, '.api-linter.yaml')) ||
          await fileExists(path.join(rootPath, '.api-linter.yml'))
        )) {
          apiLinterConfigFound = true;
        }

        if (!clangFormatConfigFound && (
          await fileExists(path.join(rootPath, '.clang-format')) ||
          await fileExists(path.join(rootPath, '_clang-format'))
        )) {
          clangFormatConfigFound = true;
        }
      }
    }

    const result: DetectionResult = {
      buf,
      protolint,
      apiLinter,
      protoc,
      clangFormat,
      bufYamlFound,
      bufWorkYamlFound,
      protolintConfigFound,
      apiLinterConfigFound,
      clangFormatConfigFound,
    };

    this.outputChannel.appendLine(`Detection results:`);
    this.outputChannel.appendLine(`  buf: ${buf ? `${buf.version} at ${buf.path}` : 'not found'}`);
    this.outputChannel.appendLine(`  protolint: ${protolint ? `${protolint.version} at ${protolint.path}` : 'not found'}`);
    this.outputChannel.appendLine(`  api-linter: ${apiLinter ? `${apiLinter.version} at ${apiLinter.path}` : 'not found'}`);
    this.outputChannel.appendLine(`  protoc: ${protoc ? `${protoc.version} at ${protoc.path}` : 'not found'}`);
    this.outputChannel.appendLine(`  clang-format: ${clangFormat ? `${clangFormat.version} at ${clangFormat.path}` : 'not found'}`);
    this.outputChannel.appendLine(`  buf.yaml: ${bufYamlFound}`);
    this.outputChannel.appendLine(`  buf.work.yaml: ${bufWorkYamlFound}`);
    this.outputChannel.appendLine(`  .protolint.yaml: ${protolintConfigFound}`);
    this.outputChannel.appendLine(`  api-linter.yaml: ${apiLinterConfigFound}`);
    this.outputChannel.appendLine(`  .clang-format: ${clangFormatConfigFound}`);

    return result;
  }

  /**
   * Detect a single tool
   */
  private async detectTool(name: string, versionFlag: string): Promise<DetectedTool | undefined> {
    const ext = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = name + ext;

    // 1. Check managed version (installed by extension)
    const managedPath = path.join(this.globalStoragePath, 'bin', binaryName);
    if (await fileExists(managedPath)) {
      const version = await this.getVersion(managedPath, versionFlag);
      if (version) {
        return { name, path: managedPath, version };
      }
    }

    // 2. Check common installation paths
    for (const dir of getCommonPaths()) {
      const fullPath = path.join(dir, binaryName);
      if (await fileExists(fullPath)) {
        const version = await this.getVersion(fullPath, versionFlag);
        if (version) {
          return { name, path: fullPath, version };
        }
      }
    }

    // 3. Try the command directly (relies on shell PATH)
    const version = await this.getVersion(name, versionFlag);
    if (version) {
      return { name, path: name, version };
    }

    return undefined;
  }

  /**
   * Get version string from a tool.
   * Auto-detects script files (by extension or shebang) and uses shell execution for them.
   */
  private async getVersion(cmd: string, flag: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      // Check if this command is a script that needs shell execution
      const useShell = needsShellExecution(cmd);

      const proc = spawn(cmd, [flag], { timeout: 5000, shell: useShell });
      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => output += data.toString());
      proc.stderr?.on('data', (data) => errorOutput += data.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          resolve((output || errorOutput).trim().split('\n')[0]);
        } else {
          resolve(undefined);
        }
      });

      proc.on('error', () => {
        // If we didn't use shell and cmd is a simple command name (no path separators),
        // fallback to shell to pick up PATH from shell configuration
        // GUI apps on macOS/Linux don't inherit shell PATH
        // Don't use shell fallback for full paths as they may contain spaces
        const isSimpleCommand = !cmd.includes(path.sep) && !cmd.includes('/');
        if (!useShell && isSimpleCommand) {
          const procWithShell = spawn(cmd, [flag], { timeout: 5000, shell: true });
          let shellOutput = '';
          let shellErrorOutput = '';

          procWithShell.stdout?.on('data', (data) => shellOutput += data.toString());
          procWithShell.stderr?.on('data', (data) => shellErrorOutput += data.toString());

          procWithShell.on('close', (code) => {
            if (code === 0) {
              resolve((shellOutput || shellErrorOutput).trim().split('\n')[0]);
            } else {
              resolve(undefined);
            }
          });

          procWithShell.on('error', () => resolve(undefined));
        } else {
          resolve(undefined);
        }
      });
    });
  }

  /**
   * Prompt user to configure detected tools
   */
  private async promptForSettings(result: DetectionResult): Promise<void> {
    const config = vscode.workspace.getConfiguration('protobuf');
    const suggestions: string[] = [];

    // Check if external linter is not configured but buf, protolint, or api-linter is available
    const currentLinter = config.get<string>('externalLinter.linter', 'none');
    const linterEnabled = config.get<boolean>('externalLinter.enabled', false);

    if (!linterEnabled || currentLinter === 'none') {
      // Prefer buf if buf.yaml exists, otherwise suggest what's available
      if (result.buf && result.bufYamlFound) {
        suggestions.push('buf-linter');
      } else if (result.protolint && result.protolintConfigFound) {
        suggestions.push('protolint-linter');
      } else if (result.apiLinter && result.apiLinterConfigFound) {
        suggestions.push('api-linter');
      } else if (result.buf) {
        suggestions.push('buf-linter');
      } else if (result.protolint) {
        suggestions.push('protolint-linter');
      } else if (result.apiLinter) {
        suggestions.push('api-linter');
      }
    }

    // Check if clang-format is available but not configured
    // Only suggest if a .clang-format config file is found in the workspace
    const clangFormatEnabled = config.get<boolean>('clangFormat.enabled', false);
    if (result.clangFormat && !clangFormatEnabled && result.clangFormatConfigFound) {
      suggestions.push('clang-format');
    }

    // Check if buf path needs to be set (tool exists but path is default)
    if (result.buf) {
      const currentBufPath = config.get<string>('buf.path', 'buf');
      if (currentBufPath === 'buf' && result.buf.path !== 'buf') {
        suggestions.push('buf-path');
      }
    }

    // Check if protoc path needs to be set
    if (result.protoc) {
      const currentProtocPath = config.get<string>('protoc.path', 'protoc');
      if (currentProtocPath === 'protoc' && result.protoc.path !== 'protoc') {
        suggestions.push('protoc-path');
      }
    }

    if (suggestions.length === 0) {
      return;
    }

    // Create user-friendly message
    const toolsDetected: string[] = [];
    if (result.buf) {toolsDetected.push(`buf (${result.buf.version})`);}
    if (result.protolint) {toolsDetected.push(`protolint (${result.protolint.version})`);}
    if (result.apiLinter) {toolsDetected.push(`api-linter (${result.apiLinter.version})`);}
    if (result.clangFormat) {toolsDetected.push(`clang-format`);}

    const message = `Protobuf tools detected: ${toolsDetected.join(', ')}. Configure settings?`;

    const actions: string[] = ['Configure Now', 'Later', "Don't Ask Again"];
    const selection = await vscode.window.showInformationMessage(message, ...actions);

    if (selection === 'Configure Now') {
      await this.showConfigurationQuickPick(result, suggestions);
    } else if (selection === "Don't Ask Again") {
      // Store preference to not ask again
      await config.update('autoDetection.prompted', true, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Show quick pick for configuration options
   */
  private async showConfigurationQuickPick(result: DetectionResult, suggestions: string[]): Promise<void> {
    const items: vscode.QuickPickItem[] = [];

    if (suggestions.includes('buf-linter') && result.buf) {
      items.push({
        label: '$(check) Enable Buf Linting',
        description: `Use buf lint for proto validation`,
        detail: `Detected: ${result.buf.version} at ${result.buf.path}`,
        picked: true,
      });
    }

    if (suggestions.includes('protolint-linter') && result.protolint) {
      items.push({
        label: '$(check) Enable Protolint',
        description: `Use protolint for proto validation`,
        detail: `Detected: ${result.protolint.version} at ${result.protolint.path}`,
        picked: !suggestions.includes('buf-linter'), // Don't pick if buf is available
      });
    }

    if (suggestions.includes('api-linter') && result.apiLinter) {
      items.push({
        label: '$(check) Enable Google API Linter',
        description: `Use api-linter for Google API style validation`,
        detail: `Detected: ${result.apiLinter.version} at ${result.apiLinter.path}`,
        picked: !suggestions.includes('buf-linter') && !suggestions.includes('protolint-linter'),
      });
    }

    if (suggestions.includes('clang-format') && result.clangFormat) {
      items.push({
        label: '$(symbol-color) Enable clang-format',
        description: `Use clang-format for proto formatting`,
        detail: `Detected: ${result.clangFormat.version} at ${result.clangFormat.path}`,
      });
    }

    if (suggestions.includes('buf-path') && result.buf) {
      items.push({
        label: '$(gear) Set buf path',
        description: `Configure explicit path to buf`,
        detail: `Path: ${result.buf.path}`,
      });
    }

    if (suggestions.includes('protoc-path') && result.protoc) {
      items.push({
        label: '$(gear) Set protoc path',
        description: `Configure explicit path to protoc`,
        detail: `Path: ${result.protoc.path}`,
      });
    }

    if (items.length === 0) {
      return;
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select configurations to apply',
      canPickMany: true,
    });

    if (!selected || selected.length === 0) {
      return;
    }

    // Ask for scope
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: 'Where should these settings be applied?' }
    );

    if (!scope) {
      return;
    }

    // Apply selected configurations
    const config = vscode.workspace.getConfiguration('protobuf');
    const applied: string[] = [];

    for (const item of selected) {
      if (item.label.includes('Buf Linting') && result.buf) {
        await config.update('externalLinter.enabled', true, scope.target);
        await config.update('externalLinter.linter', 'buf', scope.target);
        await config.update('externalLinter.bufPath', result.buf.path, scope.target);
        applied.push('Buf linting');
      }

      if (item.label.includes('Protolint') && result.protolint) {
        await config.update('externalLinter.enabled', true, scope.target);
        await config.update('externalLinter.linter', 'protolint', scope.target);
        await config.update('externalLinter.protolintPath', result.protolint.path, scope.target);
        applied.push('Protolint');
      }

      if (item.label.includes('Google API Linter') && result.apiLinter) {
        await config.update('externalLinter.enabled', true, scope.target);
        await config.update('externalLinter.linter', 'api-linter', scope.target);
        await config.update('externalLinter.apiLinterPath', result.apiLinter.path, scope.target);
        applied.push('Google API Linter');
      }

      if (item.label.includes('clang-format') && result.clangFormat) {
        await config.update('clangFormat.enabled', true, scope.target);
        await config.update('clangFormat.path', result.clangFormat.path, scope.target);
        applied.push('clang-format');
      }

      if (item.label.includes('Set buf path') && result.buf) {
        await config.update('buf.path', result.buf.path, scope.target);
        applied.push('buf path');
      }

      if (item.label.includes('Set protoc path') && result.protoc) {
        await config.update('protoc.path', result.protoc.path, scope.target);
        applied.push('protoc path');
      }
    }

    if (applied.length > 0) {
      vscode.window.showInformationMessage(`Configured: ${applied.join(', ')}`);
    }
  }
}
