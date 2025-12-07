import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { spawn } from 'child_process';

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

    // Ensure bin directory exists
    if (!fs.existsSync(this.binPath)) {
      fs.mkdirSync(this.binPath, { recursive: true });
    }

    // Initialize tools
    this.tools.set('protoc', { name: 'protoc', status: ToolStatus.Unknown });
    this.tools.set('buf', { name: 'buf', status: ToolStatus.Unknown });

    // Initial check
    this.checkTools();
  }

  public async checkTools(): Promise<void> {
    this.outputChannel.appendLine('Checking protobuf toolchain...');

    await this.checkTool('protoc', '--version');
    await this.checkTool('buf', '--version');

    this.updateStatusBar();
  }

  /**
   * Find the tool binary by checking configured path, managed path, and common installation paths.
   * This handles GUI apps not inheriting shell PATH on all platforms.
   */
  private findToolPath(name: string): string {
    const config = vscode.workspace.getConfiguration(`protobuf.${name}`);
    const configuredPath = config.get<string>('path');
    const ext = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = name + ext;

    this.outputChannel.appendLine(`Looking for ${name}...`);
    this.outputChannel.appendLine(`  Managed bin path: ${this.binPath}`);

    // 1. Check if user has configured a specific path (not the default)
    if (configuredPath && configuredPath !== name) {
      if (fs.existsSync(configuredPath)) {
        this.outputChannel.appendLine(`  ✓ Using configured path: ${configuredPath}`);
        return configuredPath;
      }
      this.outputChannel.appendLine(`  ✗ Configured path not found: ${configuredPath}`);
    }

    // 2. Check managed version (installed by extension)
    const managedPath = this.getManagedToolPath(name);
    this.outputChannel.appendLine(`  Checking managed path: ${managedPath}`);
    if (fs.existsSync(managedPath)) {
      this.outputChannel.appendLine(`  ✓ Found managed ${name}: ${managedPath}`);
      return managedPath;
    }
    this.outputChannel.appendLine(`  ✗ Managed path does not exist`);

    // 3. Check common installation paths (handles GUI apps not inheriting shell PATH)
    const commonPaths = getCommonPaths();
    for (const dir of commonPaths) {
      const fullPath = path.join(dir, binaryName);
      if (fs.existsSync(fullPath)) {
        this.outputChannel.appendLine(`  ✓ Found in common path: ${fullPath}`);
        return fullPath;
      }
    }

    // 4. Try the command directly (relies on shell PATH)
    this.outputChannel.appendLine(`  Falling back to PATH lookup: ${binaryName}`);
    return binaryName;
  }

  private async checkTool(name: string, versionFlag: string): Promise<void> {
    const toolCmd = this.findToolPath(name);

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

  private getManagedToolPath(name: string): string {
      const ext = os.platform() === 'win32' ? '.exe' : '';
      return path.join(this.binPath, name + ext);
  }

  private async getToolVersion(cmd: string, flag: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Don't use shell: true to properly handle paths with spaces
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

      proc.on('error', (err) => reject(err));
    });
  }

  private updateStatusBar(): void {
    const missing = Array.from(this.tools.values()).filter(t => t.status === ToolStatus.NotInstalled);

    if (missing.length > 0) {
      this.statusBarItem.text = `$(warning) Protobuf: Missing Tools`;
      this.statusBarItem.tooltip = `Missing: ${missing.map(t => t.name).join(', ')}. Click to manage.`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.text = `$(check) Protobuf`;
      this.statusBarItem.tooltip = `Protobuf toolchain is healthy\nProtoc: ${this.tools.get('protoc')?.version}\nBuf: ${this.tools.get('buf')?.version}`;
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.show();
  }

  public async manageToolchain(): Promise<void> {
    const items: vscode.QuickPickItem[] = [];

    for (const [name, info] of this.tools.entries()) {
      const statusIcon = info.status === ToolStatus.Installed ? '$(check)' : '$(x)';
      items.push({
        label: `${statusIcon} ${name}`,
        description: info.status === ToolStatus.Installed ? info.version : 'Not installed',
        detail: info.path || 'Click to install/update'
      });
    }

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a tool to manage'
    });

    if (selection) {
      const toolName = selection.label.split(' ')[1]; // extract name
      await this.promptInstall(toolName);
    }
  }

  /**
   * Configure settings to use the managed (extension-installed) toolchain.
   * This updates protobuf.buf.path, protobuf.protoc.path, and protobuf.externalLinter.bufPath
   * to point to the extension's managed binaries.
   */
  public async useManagedToolchain(): Promise<void> {
    const managedBufPath = this.getManagedToolPath('buf');
    const managedProtocPath = this.getManagedToolPath('protoc');

    // Check if managed tools exist
    const bufExists = fs.existsSync(managedBufPath);
    const protocExists = fs.existsSync(managedProtocPath);

    if (!bufExists && !protocExists) {
      const install = await vscode.window.showWarningMessage(
        'No managed tools found. Would you like to install them first?',
        'Install buf', 'Install protoc', 'Install both', 'Cancel'
      );

      if (install === 'Install buf') {
        await this.installTool('buf');
      } else if (install === 'Install protoc') {
        await this.installTool('protoc');
      } else if (install === 'Install both') {
        await this.installTool('buf');
        await this.installTool('protoc');
      } else {
        return;
      }
    }

    // Ask user for scope
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: 'Where should the managed toolchain settings be applied?' }
    );

    if (!scope) {
      return;
    }

    const configTarget = scope.target;
    const updatedSettings: string[] = [];

    try {
      // Update buf.path
      if (fs.existsSync(managedBufPath)) {
        await vscode.workspace.getConfiguration('protobuf.buf').update('path', managedBufPath, configTarget);
        await vscode.workspace.getConfiguration('protobuf.externalLinter').update('bufPath', managedBufPath, configTarget);
        updatedSettings.push('buf');
        this.outputChannel.appendLine(`Set protobuf.buf.path to ${managedBufPath}`);
        this.outputChannel.appendLine(`Set protobuf.externalLinter.bufPath to ${managedBufPath}`);
      }

      // Update protoc.path
      if (fs.existsSync(managedProtocPath)) {
        await vscode.workspace.getConfiguration('protobuf.protoc').update('path', managedProtocPath, configTarget);
        updatedSettings.push('protoc');
        this.outputChannel.appendLine(`Set protobuf.protoc.path to ${managedProtocPath}`);
      }

      if (updatedSettings.length > 0) {
        vscode.window.showInformationMessage(
          `Configured to use managed toolchain: ${updatedSettings.join(', ')} (${scope.label})`
        );
      } else {
        vscode.window.showWarningMessage('No managed tools were found to configure.');
      }
    } catch (e) {
      const msg = `Failed to update settings: ${e instanceof Error ? e.message : String(e)}`;
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
    }
  }

  /**
   * Configure settings to use the system-installed (PATH) toolchain.
   * This resets protobuf.buf.path, protobuf.protoc.path, and protobuf.externalLinter.bufPath
   * to their default values (just the command names), relying on the system PATH.
   */
  public async useSystemToolchain(): Promise<void> {
    // Ask user for scope
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Apply to current workspace only', target: vscode.ConfigurationTarget.Workspace },
        { label: 'Global', description: 'Apply to all workspaces', target: vscode.ConfigurationTarget.Global }
      ],
      { placeHolder: 'Where should the system toolchain settings be applied?' }
    );

    if (!scope) {
      return;
    }

    const configTarget = scope.target;

    try {
      // Reset to default values (command names only, uses PATH)
      await vscode.workspace.getConfiguration('protobuf.buf').update('path', 'buf', configTarget);
      await vscode.workspace.getConfiguration('protobuf.protoc').update('path', 'protoc', configTarget);
      await vscode.workspace.getConfiguration('protobuf.externalLinter').update('bufPath', 'buf', configTarget);

      this.outputChannel.appendLine('Set protobuf.buf.path to buf (system PATH)');
      this.outputChannel.appendLine('Set protobuf.protoc.path to protoc (system PATH)');
      this.outputChannel.appendLine('Set protobuf.externalLinter.bufPath to buf (system PATH)');

      vscode.window.showInformationMessage(
        `Configured to use system toolchain from PATH (${scope.label})`
      );

      // Re-check tools to update status bar
      await this.checkTools();
    } catch (e) {
      const msg = `Failed to update settings: ${e instanceof Error ? e.message : String(e)}`;
      this.outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg);
    }
  }

  private async promptInstall(toolName: string): Promise<void> {
      const action = await vscode.window.showInformationMessage(
          `Do you want to install/update ${toolName}?`,
          'Yes', 'No'
      );

      if (action === 'Yes') {
          await this.installTool(toolName);
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

      this.outputChannel.appendLine(`Downloading protoc from: ${url}`);
      progress.report({ message: 'Downloading...', increment: 0 });
      await this.downloadFile(url, zipPath);

      this.outputChannel.appendLine(`Extracting to: ${this.globalStoragePath}`);
      progress.report({ message: 'Extracting...', increment: 50 });
      await this.extractZip(zipPath, this.globalStoragePath);

      // Cleanup zip file
      fs.unlinkSync(zipPath);

      // On macOS/Linux, ensure executable permission
      const ext = platform === 'win32' ? '.exe' : '';
      const binaryPath = path.join(this.binPath, 'protoc' + ext);
      this.outputChannel.appendLine(`Expected binary path: ${binaryPath}`);

      if (fs.existsSync(binaryPath)) {
          if (platform !== 'win32') {
              fs.chmodSync(binaryPath, 0o755);
          }
          this.outputChannel.appendLine(`✓ protoc installed successfully at: ${binaryPath}`);
      } else {
          // List what was extracted to help debug
          this.outputChannel.appendLine(`✗ Binary not found at expected path. Checking extracted contents...`);
          if (fs.existsSync(this.binPath)) {
              const files = fs.readdirSync(this.binPath);
              this.outputChannel.appendLine(`  Contents of bin/: ${files.join(', ')}`);
          } else {
              this.outputChannel.appendLine(`  bin/ directory does not exist`);
              const contents = fs.readdirSync(this.globalStoragePath);
              this.outputChannel.appendLine(`  Contents of storage: ${contents.join(', ')}`);
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

      this.outputChannel.appendLine(`Downloading buf from: ${url}`);
      this.outputChannel.appendLine(`Destination: ${destPath}`);
      progress.report({ message: 'Downloading...', increment: 0 });
      await this.downloadFile(url, destPath);

      if (platform !== 'win32') {
          fs.chmodSync(destPath, 0o755);
      }

      if (fs.existsSync(destPath)) {
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
}
