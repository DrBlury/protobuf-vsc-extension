import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

export class PlaygroundManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'protobufPlayground';
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  public openPlayground() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      this.viewType,
      'Protobuf Playground',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'out'))]
      }
    );

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'runRequest':
          await this.runRequest(message.data);
          break;
        case 'listServices':
            await this.listServices(message.file);
            break;
      }
    });

    // Initial data load if a file is active
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'proto') {
        this.panel.webview.postMessage({ command: 'setFile', file: activeEditor.document.uri.fsPath });
        this.listServices(activeEditor.document.uri.fsPath);
    }
  }

  private async listServices(filePath: string) {
      // Use grpcurl to list services if possible, or parse locally
      // For now, let's assume we can use grpcurl on the proto file
      // NOTE: This requires the proto file to be valid and imports resolvable by grpcurl
      // Often better to use the language server's knowledge, but that requires more plumbing.
      // Let's try running grpcurl describe with import paths.

      const config = vscode.workspace.getConfiguration('protobuf');
      const includes = config.get<string[]>('includes') || [];
      const cwd = path.dirname(filePath);

      const args = ['-import-path', cwd];
      includes.forEach(inc => {
          args.push('-import-path', inc);
      });
      args.push('-proto', filePath);
      args.push('list'); // List services

      try {
        const output = await this.runGrpcurl(args, cwd);
        const services = output.split('\n').filter(s => s.trim().length > 0);
        this.panel?.webview.postMessage({ command: 'servicesLoaded', services });
      } catch (e) {
          this.outputChannel.appendLine(`Failed to list services: ${e}`);
          // Fallback: Send empty list or error
           this.panel?.webview.postMessage({ command: 'error', message: `Failed to list services: ${e instanceof Error ? e.message : String(e)}` });
      }
  }

  private async runRequest(data: { service: string, method: string, address: string, jsonBody: string, filePath: string }) {
     const config = vscode.workspace.getConfiguration('protobuf');
     const includes = config.get<string[]>('includes') || [];
     const cwd = path.dirname(data.filePath);

     const args = ['-import-path', cwd];
     includes.forEach(inc => {
         args.push('-import-path', inc);
     });
     args.push('-proto', data.filePath);
     args.push('-d', data.jsonBody);
     args.push('-plaintext'); // Assume plaintext for local dev, make configurable later
     args.push(data.address);
     args.push(`${data.service}/${data.method}`);

     try {
         this.outputChannel.appendLine(`Running: grpcurl ${args.join(' ')}`);
         const output = await this.runGrpcurl(args, cwd);
         this.panel?.webview.postMessage({ command: 'response', output });
     } catch (e) {
         this.panel?.webview.postMessage({ command: 'responseError', error: e instanceof Error ? e.message : String(e) });
     }
  }

  private runGrpcurl(args: string[], cwd: string): Promise<string> {
      return new Promise((resolve, reject) => {
          const proc = spawn('grpcurl', args, { cwd, shell: true });
          let stdout = '';
          let stderr = '';

          proc.stdout.on('data', d => stdout += d.toString());
          proc.stderr.on('data', d => stderr += d.toString());

          proc.on('close', code => {
              if (code === 0) {
                  resolve(stdout);
              } else {
                  reject(new Error(stderr || `Exited with code ${code}`));
              }
          });

          proc.on('error', err => reject(err));
      });
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Protobuf Playground</title>
        <style>
            body { font-family: sans-serif; padding: 20px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
            input, select, textarea, button { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
            button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; width: auto; }
            button:hover { background: var(--vscode-button-hoverBackground); }
            pre { background: var(--vscode-editor-inactiveSelectionBackground); padding: 10px; overflow: auto; }
            .row { display: flex; gap: 10px; }
            .col { flex: 1; }
        </style>
    </head>
    <body>
        <h2>Protobuf Request Playground</h2>

        <div class="row">
            <div class="col">
                <label>Target File</label>
                <input type="text" id="filePath" readonly placeholder="Open a .proto file">
            </div>
            <div class="col">
                 <label>Server Address</label>
                 <input type="text" id="address" value="localhost:50051" placeholder="localhost:50051">
            </div>
        </div>

        <div class="row">
            <div class="col">
                <label>Service</label>
                <select id="serviceSelect"><option>Loading...</option></select>
            </div>
             <div class="col">
                <label>Method</label>
                <input type="text" id="methodInput" placeholder="MethodName">
            </div>
        </div>

        <label>Request Body (JSON)</label>
        <textarea id="jsonBody" rows="10">{}</textarea>

        <button id="sendBtn">Send Request</button>

        <h3>Response</h3>
        <pre id="responseOutput">Waiting...</pre>

        <script>
            const vscode = acquireVsCodeApi();
            const serviceSelect = document.getElementById('serviceSelect');
            const methodInput = document.getElementById('methodInput');
            const filePathInput = document.getElementById('filePath');
            const addressInput = document.getElementById('address');
            const jsonBodyInput = document.getElementById('jsonBody');
            const sendBtn = document.getElementById('sendBtn');
            const responseOutput = document.getElementById('responseOutput');

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setFile':
                        filePathInput.value = message.file;
                        break;
                    case 'servicesLoaded':
                        serviceSelect.innerHTML = '';
                        message.services.forEach(s => {
                            const opt = document.createElement('option');
                            opt.value = s;
                            opt.innerText = s;
                            serviceSelect.appendChild(opt);
                        });
                        break;
                    case 'response':
                        responseOutput.innerText = message.output;
                        break;
                    case 'responseError':
                        responseOutput.innerText = 'Error: ' + message.error;
                        break;
                    case 'error':
                        responseOutput.innerText = 'System Error: ' + message.message;
                        break;
                }
            });

            sendBtn.addEventListener('click', () => {
                responseOutput.innerText = 'Sending...';
                vscode.postMessage({
                    command: 'runRequest',
                    data: {
                        filePath: filePathInput.value,
                        address: addressInput.value,
                        service: serviceSelect.value, // This is usually full service name
                        method: methodInput.value, // Just the method name? or part of service?
                        jsonBody: jsonBodyInput.value
                    }
                });
            });
        </script>
    </body>
    </html>`;
  }
}
