import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
// Note: We still need Node.js fs for streaming downloads and chmod operations
// which VS Code's abstract filesystem doesn't support
import * as fs from 'fs';
import { fileExists, createDirectory, readDirectory } from '../utils/fsUtils';

export enum ToolStatus {
  NotInstalled,
  Installed,
  Outdated,
  Unknown
}

export interface ToolInfo {
  name: string;
  version?: string;
  path?: string;
  status: ToolStatus;
}



// Common installation paths to check when PATH isn't available (GUI apps)
function getCommonPaths(): string[] {
  const platform = os.platform();
  if (platform === 'win32') {
    // Windows common paths
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    const userProfile = os.homedir();
    return [
      path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'), // WinGet
      path.join(programFiles, 'protobuf', 'bin'),
      path.join(programFilesX86, 'protobuf', 'bin'),
      path.join(userProfile, 'scoop', 'shims'), // Scoop
      path.join(userProfile, 'go', 'bin'), // Go binaries (for buf)
      path.join(localAppData, 'buf', 'bin'), // buf installer
      'C:\\tools\\protoc\\bin', // Chocolatey style
    ];
  } else if (platform === 'darwin') {
    // macOS common paths
    return [
      '/opt/homebrew/bin',      // Homebrew on Apple Silicon
      '/usr/local/bin',         // Homebrew on Intel Mac
      '/usr/bin',               // System binaries
      path.join(os.homedir(), '.local', 'bin'), // User local
      path.join(os.homedir(), 'go', 'bin'), // Go binaries
    ];
  } else {
    // Linux common paths
    return [
      '/usr/local/bin',
      '/usr/bin',
      '/snap/bin',              // Snap packages
      '/home/linuxbrew/.linuxbrew/bin', // Linuxbrew
      path.join(os.homedir(), '.local', 'bin'), // User local
      path.join(os.homedir(), 'go', 'bin'), // Go binaries
      path.join(os.homedir(), 'bin'), // User bin
    ];
  }
}

export class ToolchainManager {
  private statusBarItem: vscode.StatusBarItem;
  private tools: Map<string, ToolInfo> = new Map();
  private outputChannel: vscode.OutputChannel;
  private globalStoragePath: string;
  private binPath: string;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.globalStoragePath = context.globalStorageUri.fsPath;
    this.binPath = path.join(this.globalStoragePath, 'bin');

    this.outputChannel.appendLine(`ToolchainManager initialized`);
    this.outputChannel.appendLine(`  Platform: ${os.platform()}, Arch: ${os.arch()}`);
    this.outputChannel.appendLine(`  Global storage: ${this.globalStoragePath}`);
    this.outputChannel.appendLine(`  Bin path: ${this.binPath}`);

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'protobuf.toolchain.manage';
    context.subscriptions.push(this.statusBarItem);

    // Initialize tools
    this.tools.set('protoc', { name: 'protoc', status: ToolStatus.Unknown });
    this.tools.set('buf', { name: 'buf', status: ToolStatus.Unknown });
    this.tools.set('protolint', { name: 'protolint', status: ToolStatus.Unknown });
    this.tools.set('api-linter', { name: 'api-linter', status: ToolStatus.Unknown });

    // Initialize asynchronously (ensure bin directory exists and check tools)
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Ensure bin directory exists
    if (!(await fileExists(this.binPath))) {
      await createDirectory(this.binPath);
    }

    // Initial check
    await this.checkTools();
  }

  public async checkTools(): Promise<void> {
    this.outputChannel.appendLine('Checking protobuf toolchain...');

    // Always check all tools for detection
    for (const name of this.tools.keys()) {
      await this.checkTool(name, '--version');
    }

    this.updateStatusBar();
  }

  /**
   * Find the tool binary by checking configured path, common paths, then managed path.
   * Priority: explicit config > system PATH > managed (fallback)
   * This handles GUI apps not inheriting shell PATH on all platforms.
   */
  private async findToolPath(name: string): Promise<string> {
    // Map tool names to their configuration paths
    const configPath = this.getToolConfigPath(name);
    const config = vscode.workspace.getConfiguration(configPath.section);
    const configuredPathValue = config.get<string>(configPath.key);
    const configuredPath = this.resolveConfiguredPath(configuredPathValue);
    const ext = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = name + ext;

    this.outputChannel.appendLine(`Looking for ${name}...`);
    this.outputChannel.appendLine(`  Managed bin path: ${this.binPath}`);
    this.outputChannel.appendLine(`  Configured path: ${configuredPath || '(not set)'}`);

    // Check if user explicitly configured a managed path
    const managedPath = this.getManagedToolPath(name);
    const wantsManagedTool = configuredPath === managedPath;

    // 1. Check if user has configured a specific full path
    if (configuredPath && configuredPath !== name) {
      if (await fileExists(configuredPath)) {
        this.outputChannel.appendLine(`  ✓ Using configured path: ${configuredPath}`);
        return configuredPath;
      }
      this.outputChannel.appendLine(`  ✗ Configured path not found: ${configuredPath}`);
      // Show user-visible warning for configured but missing tool path
      const settingsKey = `${configPath.section}.${configPath.key}`;
      vscode.window.showWarningMessage(
        `Protobuf: Configured ${name} path not found: ${configuredPath}. Falling back to auto-detection.`,
        'Open Settings'
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', settingsKey);
        }
      });
    }

    // 2. Check common installation paths first (system tools have priority)
    //    Skip this if user explicitly wants managed tools
    if (!wantsManagedTool) {
      const commonPaths = getCommonPaths();
      for (const dir of commonPaths) {
        const fullPath = path.join(dir, binaryName);
        if (await fileExists(fullPath)) {
          this.outputChannel.appendLine(`  ✓ Found in common path: ${fullPath}`);
          return fullPath;
        }
      }
    }

    // 3. Check managed version (installed by extension) as fallback
    this.outputChannel.appendLine(`  Checking managed path: ${managedPath}`);
    if (await fileExists(managedPath)) {
      this.outputChannel.appendLine(`  ✓ Found managed ${name}: ${managedPath}`);
      return managedPath;
    }
    this.outputChannel.appendLine(`  ✗ Managed path does not exist`);

    // 4. Try the command directly (relies on shell PATH)
    this.outputChannel.appendLine(`  Falling back to PATH lookup: ${binaryName}`);
    return binaryName;
  }

  private async checkTool(name: string, versionFlag: string): Promise<void> {
    const toolCmd = await this.findToolPath(name);

    try {
      const version = await this.getToolVersion(toolCmd, versionFlag);
      const toolInfo = this.tools.get(name)!;
      toolInfo.status = ToolStatus.Installed;
      toolInfo.version = version;
      toolInfo.path = toolCmd;
      this.outputChannel.appendLine(`✓ ${name} detected: ${version} (${toolCmd})`);
    } catch (e) {
      const toolInfo = this.tools.get(name)!;
      toolInfo.status = ToolStatus.NotInstalled;
      toolInfo.path = undefined;
      toolInfo.version = undefined;
      this.outputChannel.appendLine(`✗ Could not find ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Get the configuration section and key for a tool's path setting.
   * Maps tool names to their correct VS Code settings locations.
   */
  private getToolConfigPath(name: string): { section: string; key: string } {
    switch (name) {
      case 'protolint':
        return { section: 'protobuf.externalLinter', key: 'protolintPath' };
      case 'api-linter':
        return { section: 'protobuf.externalLinter', key: 'apiLinterPath' };
      default:
        return { section: `protobuf.${name}`, key: 'path' };
    }
  }

  private getManagedToolPath(name: string): string {
      const ext = os.platform() === 'win32' ? '.exe' : '';
      return path.join(this.binPath, name + ext);
  }

  private async getToolVersion(cmd: string, flag: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Don't use shell: true initially to properly handle paths with spaces
      const proc = spawn(cmd, [flag]);
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => output += data.toString());
      proc.stderr.on('data', (data) => errorOutput += data.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          resolve((output || errorOutput).trim());
        } else {
          reject(new Error(`Process exited with code ${code}: ${errorOutput || output}`));
        }
      });

      proc.on('error', () => {
        // Fallback: try with shell to pick up PATH from shell configuration
        // GUI apps on macOS/Linux don't inherit shell PATH
        const procWithShell = spawn(cmd, [flag], { shell: true });
        let shellOutput = '';
        let shellErrorOutput = '';

        procWithShell.stdout.on('data', (data) => shellOutput += data.toString());
        procWithShell.stderr.on('data', (data) => shellErrorOutput += data.toString());

        procWithShell.on('close', (code) => {
          if (code === 0) {
            resolve((shellOutput || shellErrorOutput).trim());
          } else {
            reject(new Error(`Process exited with code ${code}: ${shellErrorOutput || shellOutput}`));
          }
        });

        procWithShell.on('error', (err) => reject(err));
      });
    });
  }

  private updateStatusBar(): void {
    const allTools = Array.from(this.tools.entries());
    const installed = allTools.filter(([_, info]) => info.status === ToolStatus.Installed);

    // Build detailed tooltip with all tools
    const detailLines: string[] = [];
    for (const [name, info] of this.tools.entries()) {
      const status = info.status === ToolStatus.Installed ? '✓' : '✗';
      if (info.status === ToolStatus.Installed) {
        detailLines.push(`${status} ${name}: ${info.version}`);
        detailLines.push(`    Path: ${info.path}`);
      } else {
        detailLines.push(`${status} ${name}: not detected`);
      }
    }

    if (installed.length > 0) {
      // Tools detected - show versions
      const toolVersions = installed
        .map(([name, info]) => {
          const ver = info.version?.split('\n')[0] || 'unknown';
          // Extract short version (e.g., "libprotoc 33.0" -> "33.0")
          const shortVer = ver.match(/[\d.]+/)?.[0] || ver;
          return `${name}:${shortVer}`;
        })
        .join(' ');

      this.statusBarItem.text = `$(check) Protobuf: ${toolVersions}`;
      this.statusBarItem.tooltip = `Protobuf Toolchain\n\n${detailLines.join('\n')}\n\nClick to manage.`;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      // No tools detected at all
      this.statusBarItem.text = `$(info) Protobuf`;
      this.statusBarItem.tooltip = `Protobuf Toolchain\n\n${detailLines.join('\n')}\n\nClick to install tools.`;
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.show();
  }

  public async manageToolchain(): Promise<void> {
    const items: vscode.QuickPickItem[] = [];

    // Show each tool with its current status and available actions
    for (const [name, info] of this.tools.entries()) {
      const isInstalled = info.status === ToolStatus.Installed;
      const isManaged = info.path?.startsWith(this.binPath);
      const hasManagedVersion = await fileExists(this.getManagedToolPath(name));

      items.push({
        label: name,
        kind: vscode.QuickPickItemKind.Separator
      } as vscode.QuickPickItem);

      if (isInstalled) {
        const sourceLabel = isManaged ? 'managed' : 'system';
        items.push({
          label: `$(check) ${name}`,
          description: `${info.version} (${sourceLabel})`,
          detail: info.path
        });

        // Show switch option based on current state
        if (isManaged) {
          items.push({
            label: `$(terminal) Use system ${name}`,
            description: 'Switch to system PATH version',
            detail: `Configure ${name} to use the version from your shell PATH`
          });
        } else if (hasManagedVersion) {
          items.push({
            label: `$(package) Use managed ${name}`,
            description: 'Switch to extension-managed version',
            detail: `Configure ${name} to use the version installed by this extension`
          });
        }
      } else {
        items.push({
          label: `$(x) ${name}`,
          description: 'Not detected',
          detail: 'Not found on system or in managed tools'
        });

        items.push({
          label: `$(cloud-download) Install ${name}`,
          description: 'Download and install',
          detail: `Install ${name} managed by this extension`
        });
      }
    }

    // Global actions section
    items.push({
      label: 'Actions',
      kind: vscode.QuickPickItemKind.Separator
    } as vscode.QuickPickItem);

    // Always show re-detect option
    items.push({
      label: '$(refresh) Re-detect Tools',
      description: 'Scan for installed tools',
      detail: 'Check common paths and shell PATH for protobuf tools'
    });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'Manage Protobuf Toolchain'
    });

    if (!selection) {
      return;
    }

    // Handle selection
    if (selection.label.includes('Re-detect')) {
      await this.redetectAndUpdateSettings();
    } else if (selection.label.includes('Install protoc')) {
      await this.installTool('protoc');
    } else if (selection.label.includes('Install buf')) {
      await this.installTool('buf');
    } else if (selection.label.includes('Use system protoc')) {
      await this.useSystemTool('protoc');
    } else if (selection.label.includes('Use system buf')) {
      await this.useSystemTool('buf');
    } else if (selection.label.includes('Use managed protoc')) {
      await this.useManagedTool('protoc');
    } else if (selection.label.includes('Use managed buf')) {
      await this.useManagedTool('buf');
    }
  }

  /**
   * Re-detect tools and update settings to match what was found.
   * Prefers system tools over managed tools.
   */
  private async redetectAndUpdateSettings(): Promise<void> {
    this.outputChannel.appendLine('Re-detecting tools and updating settings...');

    const ext = os.platform() === 'win32' ? '.exe' : '';
    const commonPaths = getCommonPaths();
    const updates: { tool: string; path: string; source: string }[] = [];

    for (const toolName of ['protoc', 'buf']) {
      const binaryName = toolName + ext;
      let foundPath: string | undefined;
      let source = '';

      // Check common paths first (system tools)
      for (const dir of commonPaths) {
        const fullPath = path.join(dir, binaryName);
        if (await fileExists(fullPath)) {
          foundPath = fullPath;
          source = 'system';
          break;
        }
      }

      // Fallback to managed
      if (!foundPath) {
        const managedPath = this.getManagedToolPath(toolName);
        if (await fileExists(managedPath)) {
          foundPath = managedPath;
          source = 'managed';
        }
      }

      if (foundPath) {
        updates.push({ tool: toolName, path: foundPath, source });
      }
    }

    if (updates.length === 0) {
      await this.checkTools();
      vscode.window.showInformationMessage('No tools found. You can install them via the toolchain menu.');
      return;
    }

    // Ask user for scope
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: 'Where should the detected tool settings be applied?' }
    );

    if (!scope) {
      return;
    }

    // Update settings
    for (const { tool, path: toolPath, source } of updates) {
      try {
        await vscode.workspace.getConfiguration(`protobuf.${tool}`).update('path', toolPath, scope.target);
        if (tool === 'buf') {
          await vscode.workspace.getConfiguration('protobuf.externalLinter').update('bufPath', toolPath, scope.target);
        }
        this.outputChannel.appendLine(`Set protobuf.${tool}.path to ${toolPath} (${source})`);
      } catch (e) {
        this.outputChannel.appendLine(`Failed to update ${tool} setting: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Re-check tools to update status bar
    await this.checkTools();

    const summary = updates.map(u => `${u.tool} (${u.source})`).join(', ');
    vscode.window.showInformationMessage(`Configured: ${summary} (${scope.label})`);
  }

  /**
   * Switch a single tool to use the system PATH version
   */
  private async useSystemTool(toolName: string): Promise<void> {
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: `Where should the ${toolName} setting be applied?` }
    );

    if (!scope) {
      return;
    }

    try {
      await vscode.workspace.getConfiguration(`protobuf.${toolName}`).update('path', toolName, scope.target);
      if (toolName === 'buf') {
        await vscode.workspace.getConfiguration('protobuf.externalLinter').update('bufPath', 'buf', scope.target);
      }
      this.outputChannel.appendLine(`Set protobuf.${toolName}.path to ${toolName} (system PATH)`);
      vscode.window.showInformationMessage(`${toolName} configured to use system PATH (${scope.label})`);
      await this.checkTools();
    } catch (e) {
      const msg = `Failed to update settings: ${e instanceof Error ? e.message : String(e)}`;
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
    }
  }

  /**
   * Switch a single tool to use the managed (extension-installed) version
   */
  private async useManagedTool(toolName: string): Promise<void> {
    const managedPath = this.getManagedToolPath(toolName);

    if (!(await fileExists(managedPath))) {
      const install = await vscode.window.showWarningMessage(
        `Managed ${toolName} not found. Would you like to install it?`,
        'Install', 'Cancel'
      );
      if (install === 'Install') {
        await this.installTool(toolName);
      }
      return;
    }

    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: `Where should the ${toolName} setting be applied?` }
    );

    if (!scope) {
      return;
    }

    try {
      await vscode.workspace.getConfiguration(`protobuf.${toolName}`).update('path', managedPath, scope.target);
      if (toolName === 'buf') {
        await vscode.workspace.getConfiguration('protobuf.externalLinter').update('bufPath', managedPath, scope.target);
      }
      this.outputChannel.appendLine(`Set protobuf.${toolName}.path to ${managedPath}`);
      vscode.window.showInformationMessage(`${toolName} configured to use managed version (${scope.label})`);
      await this.checkTools();
    } catch (e) {
      const msg = `Failed to update settings: ${e instanceof Error ? e.message : String(e)}`;
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
    }
  }

  private async installTool(toolName: string): Promise<void> {
      return vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${toolName}...`,
          cancellable: false
      }, async (progress, _token) => {
          try {
              if (toolName === 'protoc') {
                  await this.installProtoc(progress);
              } else if (toolName === 'buf') {
                  await this.installBuf(progress);
              }

              // Refresh status
              await this.checkTools();

              // Update settings to point to managed tool if not already set
              const config = vscode.workspace.getConfiguration(`protobuf.${toolName}`);
              const currentPath = config.get<string>('path');
              const managedPath = this.getManagedToolPath(toolName);

              if (!currentPath || currentPath === toolName) {
                   await config.update('path', managedPath, vscode.ConfigurationTarget.Global);
                   this.outputChannel.appendLine(`Updated protobuf.${toolName}.path to ${managedPath}`);
              }

              vscode.window.showInformationMessage(`Successfully installed ${toolName}`);
          } catch (e) {
              const msg = `Failed to install ${toolName}: ${e instanceof Error ? e.message : String(e)}`;
              this.outputChannel.appendLine(msg);
              vscode.window.showErrorMessage(msg);
          }
      });
  }

  private async installProtoc(progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
      const version = '25.1';
      const platform = os.platform();
      const arch = os.arch();

      let assetName = '';
      if (platform === 'win32') {
          assetName = arch === 'arm64' ? `protoc-${version}-win64.zip` : `protoc-${version}-win64.zip`;
      } else if (platform === 'darwin') {
          assetName = arch === 'arm64' ? `protoc-${version}-osx-aarch_64.zip` : `protoc-${version}-osx-x86_64.zip`;
      } else {
          // Linux
          assetName = arch === 'arm64' ? `protoc-${version}-linux-aarch_64.zip` : `protoc-${version}-linux-x86_64.zip`;
      }

      const url = `https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${assetName}`;
      const zipPath = path.join(this.globalStoragePath, assetName);

      // SHA256 values computed from the official release artifacts (update when version changes).
      const protocHashes: Record<string, string> = {
        'protoc-25.1-win64.zip': 'b55901fc748d1679f3a803bdc2a920e1897eb02433c501b5a589ea08c4623844',
        'protoc-25.1-osx-aarch_64.zip': '320308ce18c359564948754f51748de41cf02a4e7edf0cf47a805b9d38610f16',
        'protoc-25.1-osx-x86_64.zip': '72c6d6b2bc855ff8688c3b7fb31288ccafd0ab55256ff8382d5711ecfcc11f4f',
        'protoc-25.1-linux-aarch_64.zip': '99975a8c11b83cd65c3e1151ae1714bf959abc0521acb659bf720524276ab0c8',
        'protoc-25.1-linux-x86_64.zip': 'ed8fca87a11c888fed329d6a59c34c7d436165f662a2c875246ddb1ac2b6dd50'
      };

      this.outputChannel.appendLine(`Downloading protoc from: ${url}`);
      progress.report({ message: 'Downloading...', increment: 0 });
      
      const expectedHash = protocHashes[assetName];
      if (expectedHash) {
        await this.downloadFileWithIntegrity(url, zipPath, expectedHash);
      } else {
        this.outputChannel.appendLine(`⚠️  No integrity hash available for ${assetName}, downloading without verification`);
        await this.downloadFile(url, zipPath);
      }

      this.outputChannel.appendLine(`Extracting to: ${this.globalStoragePath}`);
      progress.report({ message: 'Extracting...', increment: 50 });
      await this.extractZip(zipPath, this.globalStoragePath);

      // Cleanup zip file
      fs.unlinkSync(zipPath);

      // On macOS/Linux, ensure executable permission
      const ext = platform === 'win32' ? '.exe' : '';
      const binaryPath = path.join(this.binPath, 'protoc' + ext);
      this.outputChannel.appendLine(`Expected binary path: ${binaryPath}`);

      if (await fileExists(binaryPath)) {
          if (platform !== 'win32') {
              fs.chmodSync(binaryPath, 0o755);
          }
          this.outputChannel.appendLine(`✓ protoc installed successfully at: ${binaryPath}`);
      } else {
          // List what was extracted to help debug
          this.outputChannel.appendLine(`✗ Binary not found at expected path. Checking extracted contents...`);
          if (await fileExists(this.binPath)) {
              const files = await readDirectory(this.binPath);
              this.outputChannel.appendLine(`  Contents of bin/: ${files.map(([name]) => name).join(', ')}`);
          } else {
              this.outputChannel.appendLine(`  bin/ directory does not exist`);
              const contents = await readDirectory(this.globalStoragePath);
              this.outputChannel.appendLine(`  Contents of storage: ${contents.map(([name]) => name).join(', ')}`);
          }
          throw new Error(`protoc binary not found after extraction`);
      }
  }

  private async installBuf(progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
      const version = '1.28.1';
      const platform = os.platform();
      const arch = os.arch();

      let assetName = '';
      if (platform === 'win32') {
          assetName = `buf-Windows-x86_64.exe`;
      } else if (platform === 'darwin') {
          assetName = arch === 'arm64' ? `buf-Darwin-arm64` : `buf-Darwin-x86_64`;
      } else {
          // Linux
          assetName = arch === 'arm64' ? `buf-Linux-aarch64` : `buf-Linux-x86_64`;
      }

      const url = `https://github.com/bufbuild/buf/releases/download/v${version}/${assetName}`;
      const destPath = this.getManagedToolPath('buf');

      // SHA256 values from the release sha256.txt (update when version changes).
      const bufHashes: Record<string, string> = {
        'buf-Windows-x86_64.exe': 'ed53ec73f52d98e78dcc99b068a139b51f6842a5be4b73b029aa0c5e5270056f',
        'buf-Darwin-x86_64': '9f464e4178db03d07fb455997d9fdb579c2c67a353ff4e133e0b248aebf1446e',
        'buf-Darwin-arm64': '72bcb6c7ffd46ff3d47ca78e77b55223d71e35675d7fe5b4ab5c6b41c9814165',
        'buf-Linux-x86_64': '855a055c8615a03ee93219f287bd7f652586c6b6b8d2b01079782cba54ee6033',
        'buf-Linux-aarch64': '1c3bc4a1aad5be3a30d20d999cb123eca8ab4861ce0db9aa3ee2c9a4dfe2d78c'
      };

      this.outputChannel.appendLine(`Downloading buf from: ${url}`);
      this.outputChannel.appendLine(`Destination: ${destPath}`);
      progress.report({ message: 'Downloading...', increment: 0 });
      
      const expectedHash = bufHashes[assetName];
      if (expectedHash) {
        await this.downloadFileWithIntegrity(url, destPath, expectedHash);
      } else {
        this.outputChannel.appendLine(`⚠️  No integrity hash available for ${assetName}, downloading without verification`);
        await this.downloadFile(url, destPath);
      }

      if (platform !== 'win32') {
          fs.chmodSync(destPath, 0o755);
      }

      if (await fileExists(destPath)) {
          this.outputChannel.appendLine(`✓ buf installed successfully at: ${destPath}`);
      } else {
          throw new Error(`buf binary not found after download`);
      }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
      return new Promise((resolve, reject) => {
          const file = fs.createWriteStream(dest);
          https.get(url, { headers: { 'User-Agent': 'VSCode-Protobuf-Extension' } }, (response) => {
              if (response.statusCode !== 200 && response.statusCode !== 302) {
                  reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
                  return;
              }

              if (response.statusCode === 302 && response.headers.location) {
                   this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                   return;
              }

              response.pipe(file);
              file.on('finish', () => {
                  file.close();
                  resolve();
              });
          }).on('error', (err) => {
              fs.unlink(dest, () => {});
              reject(err);
          });
      });
  }

  /**
   * Download a binary file with integrity verification
   */
  private async downloadFileWithIntegrity(
    url: string, 
    dest: string, 
    expectedSha256: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const hash = crypto.createHash('sha256');
      
      https.get(url, { headers: { 'User-Agent': 'VSCode-Protobuf-Extension' } }, (response) => {
        if (response.statusCode !== 200 && response.statusCode !== 302) {
          reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
          return;
        }

        if (response.statusCode === 302 && response.headers.location) {
          this.downloadFileWithIntegrity(response.headers.location, dest, expectedSha256)
            .then(resolve).catch(reject);
          return;
        }

        response.on('data', (chunk) => {
          hash.update(chunk);
        });

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          
          // Verify integrity
          const calculatedHash = hash.digest('hex');
          if (calculatedHash !== expectedSha256.toLowerCase()) {
            fs.unlink(dest, () => {});
            reject(new Error(
              `Integrity verification failed for ${dest}\n` +
              `Expected: ${expectedSha256}\n` +
              `Calculated: ${calculatedHash}\n` +
              `This could indicate a supply chain attack or corrupted download.`
            ));
            return;
          }
          
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }



  private async extractZip(zipPath: string, destDir: string): Promise<void> {
      // Use system unzip/tar/powershell to avoid dependencies
      return new Promise((resolve, reject) => {
          let command = '';
          let args: string[] = [];

          if (os.platform() === 'win32') {
              command = 'powershell';
              args = ['-command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`];
          } else {
              command = 'unzip';
              args = ['-o', zipPath, '-d', destDir];
          }

          const proc = spawn(command, args);
          proc.on('close', (code) => {
              if (code === 0) {
                  resolve();
              } else {
                  reject(new Error(`Extraction failed with code ${code}`));
              }
          });
          proc.on('error', reject);
      });
  }

  private resolveConfiguredPath(value?: string): string | undefined {
    if (!value) {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const workspaceFolderBasename = workspaceFolder ? path.basename(workspaceFolder) : '';
    let resolved = trimmed
      .replace(/\$\{workspaceRoot\}/g, workspaceFolder)
      .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
      .replace(/\$\{workspaceFolderBasename\}/g, workspaceFolderBasename)
      .replace(/\$\{env(?::|\.)([^}]+)\}/g, (_match, name: string) => process.env[name] || '');

    return resolved;
  }
}
