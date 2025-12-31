import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';

export class SchemaDiffManager {
  constructor(_outputChannel: vscode.OutputChannel) {
    // outputChannel reserved for future use
  }

  public async diffSchema(uri?: vscode.Uri): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    const targetUri = uri || activeEditor?.document.uri;

    if (!targetUri || !targetUri.fsPath.endsWith('.proto')) {
      vscode.window.showErrorMessage('Please open a .proto file to diff.');
      return;
    }

    const gitRef = await vscode.window.showInputBox({
      prompt: 'Enter Git reference to compare against (e.g., HEAD~1, main, origin/main)',
      placeHolder: 'HEAD~1',
      value: 'HEAD~1'
    });

    if (!gitRef) {
      return;
    }

    try {
        const fileContent = await this.getFileContentAtRef(targetUri.fsPath, gitRef);
        if (!fileContent) {
            vscode.window.showErrorMessage(`Could not find file at ${gitRef}`);
            return;
        }

        // Create a temp file for the old content
        const tmpDir = os.tmpdir();
        const tmpPath = path.join(tmpDir, `${path.basename(targetUri.fsPath)}.${gitRef.replace(/\//g, '_')}.proto`);
        fs.writeFileSync(tmpPath, fileContent);

        // Open VS Code diff view
        const tmpUri = vscode.Uri.file(tmpPath);
        const title = `${path.basename(targetUri.fsPath)} (${gitRef}) ↔ Current`;

        await vscode.commands.executeCommand('vscode.diff', tmpUri, targetUri, title);

    } catch (e) {
        vscode.window.showErrorMessage(`Failed to diff schema: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async getFileContentAtRef(filePath: string, ref: string): Promise<string> {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
      const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);
      const relPath = workspaceFolder ? path.relative(cwd, filePath) : path.basename(filePath);
      const gitPath = relPath.replace(/\\/g, '/');

      return new Promise((resolve, reject) => {
          const proc = spawn('git', ['show', `${ref}:${gitPath}`], { cwd });
          let stdout = '';
          let stderr = '';

          proc.stdout.on('data', d => stdout += d.toString());
          proc.stderr.on('data', d => stderr += d.toString());

          proc.on('close', code => {
              if (code === 0) {
                  resolve(stdout);
              } else {
                  reject(new Error(`Git exited with code ${code}: ${stderr}`));
              }
          });
      });
  }
}
