import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

export class CodegenManager {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  public async generateCode(uri?: vscode.Uri): Promise<void> {
    const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
    const workspaceFolder =
      (targetUri && vscode.workspace.getWorkspaceFolder(targetUri)) || vscode.workspace.workspaceFolders?.[0];
    const config = vscode.workspace.getConfiguration('protobuf', targetUri);
    const profiles = config.get<Record<string, string[]>>('codegen.profiles', {});

    const profileNames = Object.keys(profiles);
    if (profileNames.length === 0) {
      const openSettings = 'Open Settings';
      const result = await vscode.window.showWarningMessage(
        'No codegen profiles defined. Please configure "protobuf.codegen.profiles" in settings.',
        openSettings
      );
      if (result === openSettings) {
        vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.codegen.profiles');
      }
      return;
    }

    const selected = await vscode.window.showQuickPick(profileNames, {
      placeHolder: 'Select a codegen profile to run',
    });

    if (!selected) {
      return;
    }

    const argsTemplate = profiles[selected];
    if (!Array.isArray(argsTemplate) || !argsTemplate.every(arg => typeof arg === 'string')) {
      vscode.window.showErrorMessage(`Profile "${selected}" is invalid. It must be an array of string arguments.`);
      return;
    }

    // Resolve protoc path
    const protocPath = config.get<string>('protoc.path') || 'protoc';

    // Substitute variables
    const args = argsTemplate.map(arg => this.substituteVariables(arg, targetUri, workspaceFolder?.uri.fsPath));

    // Run protoc
    await this.runProtoc(protocPath, args, workspaceFolder?.uri.fsPath);
  }

  private substituteVariables(str: string, fileUri?: vscode.Uri, workspaceFolder = ''): string {
    let result = str.replace(/\${workspaceFolder}/g, workspaceFolder);

    if (fileUri) {
      result = result.replace(/\${file}/g, fileUri.fsPath);
      result = result.replace(/\${fileDirname}/g, path.dirname(fileUri.fsPath));
      result = result.replace(/\${fileBasename}/g, path.basename(fileUri.fsPath));
      result = result.replace(
        /\${fileBasenameNoExtension}/g,
        path.basename(fileUri.fsPath, path.extname(fileUri.fsPath))
      );
    }
    return result;
  }

  private async runProtoc(command: string, args: string[], cwd?: string): Promise<void> {
    this.outputChannel.show(true);
    this.outputChannel.appendLine(`Running: ${command} ${args.join(' ')}`);

    return new Promise(resolve => {
      const proc = cp.spawn(command, args, {
        cwd,
        shell: false,
      });

      proc.stdout.on('data', (data: Buffer) => {
        this.outputChannel.append(data.toString('utf8'));
      });

      proc.stderr.on('data', (data: Buffer) => {
        this.outputChannel.append(data.toString('utf8'));
      });

      let failedToStart = false;
      proc.on('close', code => {
        if (failedToStart) {
          return;
        }
        if (code === 0) {
          this.outputChannel.appendLine('Codegen completed successfully.');
          vscode.window.showInformationMessage('Codegen completed successfully.');
        } else {
          this.outputChannel.appendLine(`Codegen failed with exit code ${code}.`);
          vscode.window.showErrorMessage(`Codegen failed with exit code ${code}. Check output for details.`);
        }
        resolve();
      });

      proc.on('error', err => {
        failedToStart = true;
        this.outputChannel.appendLine(`Failed to start process: ${err}`);
        vscode.window.showErrorMessage(`Failed to start protoc: ${err.message}`);
        resolve();
      });
    });
  }
}
