import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class RegistryManager {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  public async addDependency(): Promise<void> {
    const moduleName = await vscode.window.showInputBox({
      prompt: 'Enter Buf module name (e.g., buf.build/acme/weather)',
      placeHolder: 'buf.build/owner/repository'
    });

    if (!moduleName) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const bufYamlPath = path.join(rootPath, 'buf.yaml');

    if (!fs.existsSync(bufYamlPath)) {
      const create = await vscode.window.showInformationMessage(
        'buf.yaml not found. Create one?',
        'Yes', 'No'
      );
      if (create === 'Yes') {
        await this.runBufCommand(['mod', 'init'], rootPath);
      } else {
        return;
      }
    }

    // Add dependency
    // We can try `buf mod update` but that updates deps, doesn't add them.
    // We need to edit buf.yaml.
    try {
        const content = fs.readFileSync(bufYamlPath, 'utf-8');
        // Simple regex-based insertion if we don't want to depend on a yaml parser library
        // Look for 'deps:'
        let newContent = content;
        if (content.includes('deps:')) {
            if (!content.includes(moduleName)) {
                newContent = content.replace(/deps:\s*\n/, `deps:\n  - ${moduleName}\n`);
                // If regex didn't match (e.g. deps: []), handle that?
                if (newContent === content) {
                     // Try simpler append or just use string search
                     const lines = content.split('\n');
                     const depsIndex = lines.findIndex(l => l.trim().startsWith('deps:'));
                     if (depsIndex !== -1) {
                         lines.splice(depsIndex + 1, 0, `  - ${moduleName}`);
                         newContent = lines.join('\n');
                     }
                }
            }
        } else {
            newContent = content + `\ndeps:\n  - ${moduleName}\n`;
        }

        fs.writeFileSync(bufYamlPath, newContent);
        this.outputChannel.appendLine(`Added ${moduleName} to buf.yaml`);

        // Run update
        await this.runBufCommand(['mod', 'update'], rootPath);
        vscode.window.showInformationMessage(`Added dependency ${moduleName}`);

    } catch (e) {
        vscode.window.showErrorMessage(`Failed to add dependency: ${e}`);
    }
  }

  private async runBufCommand(args: string[], cwd: string): Promise<void> {
      const config = vscode.workspace.getConfiguration('protobuf');
      // Use buf.path as primary, fall back to externalLinter.bufPath for backwards compatibility
      const bufPath = config.get<string>('buf.path') || config.get<string>('externalLinter.bufPath') || 'buf';

      return new Promise((resolve, reject) => {
          this.outputChannel.appendLine(`Running: ${bufPath} ${args.join(' ')}`);
          const proc = spawn(bufPath, args, { cwd, shell: true });

          proc.stdout.on('data', d => this.outputChannel.append(d.toString()));
          proc.stderr.on('data', d => this.outputChannel.append(d.toString()));

          proc.on('close', code => {
              if (code === 0) {
                  resolve();
              } else {
                  reject(new Error(`Buf exited with code ${code}`));
              }
          });

          proc.on('error', reject);
      });
  }
}
