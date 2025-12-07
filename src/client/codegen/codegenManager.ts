import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

export class CodegenManager {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  public async generateCode(uri?: vscode.Uri): Promise<void> {
    const config = vscode.workspace.getConfiguration('protobuf');
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
      placeHolder: 'Select a codegen profile to run'
    });

    if (!selected) {
      return;
    }

    const argsTemplate = profiles[selected];
    if (!argsTemplate || !Array.isArray(argsTemplate)) {
        vscode.window.showErrorMessage(`Profile "${selected}" is invalid. It must be an array of string arguments.`);
        return;
    }

    // Determine context (file or workspace)
    const activeEditor = vscode.window.activeTextEditor;
    const targetUri = uri || activeEditor?.document.uri;

    // Resolve protoc path
    const protocPath = config.get<string>('protoc.path') || 'protoc';

    // Substitute variables
    const args = argsTemplate.map(arg => this.substituteVariables(arg, targetUri));

    // Run protoc
    await this.runProtoc(protocPath, args);
  }

  private substituteVariables(str: string, fileUri?: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    let result = str.replace(/\${workspaceFolder}/g, workspaceFolder);

    if (fileUri) {
        result = result.replace(/\${file}/g, fileUri.fsPath);
        result = result.replace(/\${fileDirname}/g, path.dirname(fileUri.fsPath));
        result = result.replace(/\${fileBasename}/g, path.basename(fileUri.fsPath));
        result = result.replace(/\${fileBasenameNoExtension}/g, path.basename(fileUri.fsPath, path.extname(fileUri.fsPath)));
    }
    return result;
  }

  private async runProtoc(command: string, args: string[]): Promise<void> {
    this.outputChannel.show(true);
    this.outputChannel.appendLine(`Running: ${command} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const proc = cp.spawn(command, args, {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        shell: true
      });

      proc.stdout.on('data', (data) => {
        this.outputChannel.append(data.toString());
      });

      proc.stderr.on('data', (data) => {
        this.outputChannel.append(data.toString());
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.outputChannel.appendLine('Codegen completed successfully.');
          vscode.window.showInformationMessage('Codegen completed successfully.');
        } else {
          this.outputChannel.appendLine(`Codegen failed with exit code ${code}.`);
          vscode.window.showErrorMessage(`Codegen failed with exit code ${code}. Check output for details.`);
        }
        resolve();
      });

      proc.on('error', (err) => {
        this.outputChannel.appendLine(`Failed to start process: ${err}`);
        vscode.window.showErrorMessage(`Failed to start protoc: ${err.message}`);
        resolve();
      });
    });
  }
}
