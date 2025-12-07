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

  private async checkTool(name: string, versionFlag: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('protobuf');
    let toolCmd = config.get<string>(`${name}.path`) || name;

    // If set to default name, check if we have a managed version
    if (toolCmd === name) {
        const managedPath = this.getManagedToolPath(name);
        if (fs.existsSync(managedPath)) {
            toolCmd = managedPath;
        }
    }

    try {
      const version = await this.getToolVersion(toolCmd, versionFlag);
      const toolInfo = this.tools.get(name)!;
      toolInfo.status = ToolStatus.Installed;
      toolInfo.version = version;
      toolInfo.path = toolCmd;
      this.outputChannel.appendLine(`Found ${name} at ${toolCmd} (version: ${version})`);
    } catch (e) {
      const toolInfo = this.tools.get(name)!;
      toolInfo.status = ToolStatus.NotInstalled;
      toolInfo.path = undefined;
      toolInfo.version = undefined;
      this.outputChannel.appendLine(`Could not find ${name}: ${e}`);
    }
  }

  private getManagedToolPath(name: string): string {
      const ext = os.platform() === 'win32' ? '.exe' : '';
      return path.join(this.binPath, name + ext);
  }

  private async getToolVersion(cmd: string, flag: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [flag], { shell: true });
      let output = '';

      proc.stdout.on('data', (data) => output += data.toString());
      proc.stderr.on('data', (data) => output += data.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Process exited with code ${code}`));
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
              const config = vscode.workspace.getConfiguration('protobuf');
              const currentPath = config.get<string>(`${toolName}.path`);
              const managedPath = this.getManagedToolPath(toolName);

              if (!currentPath || currentPath === toolName) {
                   await config.update(`${toolName}.path`, managedPath, vscode.ConfigurationTarget.Global);
                   this.outputChannel.appendLine(`Updated ${toolName}.path to ${managedPath}`);
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
          assetName = `protoc-${version}-win64.zip`;
      } else if (platform === 'darwin') {
          assetName = arch === 'arm64' ? `protoc-${version}-osx-aarch_64.zip` : `protoc-${version}-osx-x86_64.zip`;
      } else {
          assetName = `protoc-${version}-linux-x86_64.zip`; // Assuming x64 for linux for now
      }

      const url = `https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${assetName}`;
      const zipPath = path.join(this.globalStoragePath, assetName);

      progress.report({ message: 'Downloading...', increment: 0 });
      await this.downloadFile(url, zipPath);

      progress.report({ message: 'Extracting...', increment: 50 });
      await this.extractZip(zipPath, this.globalStoragePath);

      // Cleanup
      fs.unlinkSync(zipPath);

      // On macOS/Linux, ensure executable permission
      const binaryPath = path.join(this.binPath, 'protoc');
      if (platform !== 'win32' && fs.existsSync(binaryPath)) {
          fs.chmodSync(binaryPath, 0o755);
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
          assetName = `buf-Linux-x86_64`; // Assuming x64
      }

      const url = `https://github.com/bufbuild/buf/releases/download/v${version}/${assetName}`;
      const destPath = this.getManagedToolPath('buf');

      progress.report({ message: 'Downloading...', increment: 0 });
      await this.downloadFile(url, destPath);

      if (platform !== 'win32') {
          fs.chmodSync(destPath, 0o755);
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
