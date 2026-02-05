import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { fileExists } from '../utils/fsUtils';

export class PlaygroundManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'protobufPlayground';
  private outputChannel: vscode.OutputChannel;
  private grpcurlPath: string | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;

    const configListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('protobuf.grpcurl.path') || event.affectsConfiguration('protobuf.grpcurl')) {
        this.grpcurlPath = undefined;
        this.outputChannel.appendLine('grpcurl path changed; re-detecting on next use');
      }
    });
    context.subscriptions.push(configListener);
  }

  /**
   * Get the grpcurl binary path from configuration or auto-detect.
   */
  private async getGrpcurlPath(): Promise<string> {
    // Return cached path if available
    if (this.grpcurlPath) {
      return this.grpcurlPath;
    }

    const config = vscode.workspace.getConfiguration('protobuf.grpcurl');
    const configuredPath = config.get<string>('path');
    const ext = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = 'grpcurl' + ext;

    // 1. Check configured path
    if (configuredPath && configuredPath !== 'grpcurl') {
      if (await fileExists(configuredPath)) {
        this.grpcurlPath = configuredPath;
        this.outputChannel.appendLine(`Using configured grpcurl: ${configuredPath}`);
        return configuredPath;
      }
      this.outputChannel.appendLine(`Configured grpcurl path not found: ${configuredPath}`);
    }

    // 2. Check managed path (installed by extension)
    const managedPath = path.join(this.context.globalStorageUri.fsPath, 'bin', binaryName);
    if (await fileExists(managedPath)) {
      this.grpcurlPath = managedPath;
      this.outputChannel.appendLine(`Using managed grpcurl: ${managedPath}`);
      return managedPath;
    }

    // 3. Check common paths
    const commonPaths = this.getCommonPaths();
    for (const dir of commonPaths) {
      const fullPath = path.join(dir, binaryName);
      if (await fileExists(fullPath)) {
        this.grpcurlPath = fullPath;
        this.outputChannel.appendLine(`Found grpcurl in common path: ${fullPath}`);
        return fullPath;
      }
    }

    // 4. Fall back to PATH lookup
    this.outputChannel.appendLine(`Using grpcurl from PATH`);
    return binaryName;
  }

  private getCommonPaths(): string[] {
    const platform = os.platform();
    if (platform === 'win32') {
      const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
      return [
        path.join(localAppData, 'grpcurl'),
        path.join(os.homedir(), 'scoop', 'shims'),
        path.join(os.homedir(), 'go', 'bin'),
      ];
    } else if (platform === 'darwin') {
      return [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), 'go', 'bin'),
      ];
    } else {
      return [
        '/usr/local/bin',
        '/usr/bin',
        '/snap/bin',
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), 'go', 'bin'),
      ];
    }
  }

  public openPlayground() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(this.viewType, 'Protobuf Playground', vscode.ViewColumn.Two, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'out'))],
    });

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'runRequest':
          await this.runRequest(message.data);
          break;
        case 'listServices':
          await this.listServices(message.file);
          break;
        case 'listServicesViaReflection':
          await this.listServicesViaReflection(message.address);
          break;
        case 'runRequestViaReflection':
          await this.runRequestViaReflection(message.data);
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

  /**
   * Check if a proto file uses editions syntax (not supported by grpcurl)
   */
  private async usesEditions(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      // Check for edition declaration (e.g., edition = "2023";)
      return /^\s*edition\s*=\s*["'][^"']+["']\s*;/m.test(content);
    } catch {
      return false;
    }
  }

  private async listServices(filePath: string) {
    // Use grpcurl to list services if possible, or parse locally
    // For now, let's assume we can use grpcurl on the proto file
    // NOTE: This requires the proto file to be valid and imports resolvable by grpcurl
    // Often better to use the language server's knowledge, but that requires more plumbing.
    // Let's try running grpcurl describe with import paths.

    // Check if file uses editions syntax (not supported by grpcurl)
    if (await this.usesEditions(filePath)) {
      const errorMsg =
        'This proto file uses Protobuf Editions syntax (edition = "..."), which is not yet supported by grpcurl. ' +
        'Consider using server reflection instead, or convert to proto3 syntax for playground testing.';
      this.outputChannel.appendLine(`Editions not supported: ${filePath}`);

      const action = await vscode.window.showWarningMessage(
        'grpcurl does not support Protobuf Editions yet. Use server reflection or convert to proto3.',
        'Use Server Reflection',
        'Learn More'
      );

      if (action === 'Use Server Reflection') {
        // Update the webview to indicate server reflection mode
        this.panel?.webview.postMessage({
          command: 'editionsWarning',
          message: 'Enter server address and use reflection to discover services',
          useReflection: true,
        });
      } else if (action === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/fullstorydev/grpcurl/issues'));
      }

      this.panel?.webview.postMessage({ command: 'error', message: errorMsg });
      return;
    }

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
      const grpcurlCmd = await this.getGrpcurlPath();
      const output = await this.runGrpcurl(grpcurlCmd, args, cwd);
      const services = output.split('\n').filter(s => s.trim().length > 0);
      this.panel?.webview.postMessage({ command: 'servicesLoaded', services });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.outputChannel.appendLine(`Failed to list services: ${errorMsg}`);

      // Check if this is an editions-related error from grpcurl
      if (errorMsg.includes('editions are not yet supported') || errorMsg.includes('edition')) {
        const editionsErrorMsg =
          'grpcurl does not support Protobuf Editions syntax. ' +
          'Use server reflection by connecting to a running gRPC server, or convert to proto3 syntax.';
        this.panel?.webview.postMessage({ command: 'error', message: editionsErrorMsg });

        vscode.window
          .showWarningMessage(
            'grpcurl does not support Protobuf Editions. Use server reflection instead.',
            'Use Server Reflection'
          )
          .then(action => {
            if (action === 'Use Server Reflection') {
              this.panel?.webview.postMessage({
                command: 'editionsWarning',
                message: 'Enter server address and use reflection to discover services',
                useReflection: true,
              });
            }
          });
        return;
      }

      // Check if grpcurl is not installed and provide helpful message
      if (errorMsg.includes('command not found') || errorMsg.includes('ENOENT')) {
        const action = await vscode.window.showErrorMessage(
          'grpcurl is not installed or not found. Would you like to install it?',
          'Install grpcurl',
          'Configure Path',
          'Cancel'
        );
        if (action === 'Install grpcurl') {
          vscode.commands.executeCommand('protobuf.toolchain.manage');
        } else if (action === 'Configure Path') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.grpcurl.path');
        }
      }

      // Send error to webview
      this.panel?.webview.postMessage({ command: 'error', message: `Failed to list services: ${errorMsg}` });
    }
  }

  private async runRequest(data: {
    service: string;
    method: string;
    address: string;
    jsonBody: string;
    filePath: string;
  }) {
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
      const grpcurlCmd = await this.getGrpcurlPath();
      this.outputChannel.appendLine(`Running: ${grpcurlCmd} ${args.join(' ')}`);
      const output = await this.runGrpcurl(grpcurlCmd, args, cwd);
      this.panel?.webview.postMessage({ command: 'response', output });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      // Check if grpcurl is not installed and provide helpful message
      if (errorMsg.includes('command not found') || errorMsg.includes('ENOENT')) {
        vscode.window
          .showErrorMessage(
            'grpcurl is not installed. Use "Protobuf: Manage Toolchain" to install it.',
            'Install grpcurl'
          )
          .then(action => {
            if (action === 'Install grpcurl') {
              vscode.commands.executeCommand('protobuf.toolchain.manage');
            }
          });
      }
      this.panel?.webview.postMessage({ command: 'responseError', error: errorMsg });
    }
  }

  /**
   * List services using server reflection (no proto file needed)
   */
  private async listServicesViaReflection(address: string) {
    const args = ['-plaintext', address, 'list'];

    try {
      const grpcurlCmd = await this.getGrpcurlPath();
      this.outputChannel.appendLine(`Listing services via reflection: ${grpcurlCmd} ${args.join(' ')}`);
      const output = await this.runGrpcurl(grpcurlCmd, args, process.cwd());
      const services = output.split('\n').filter(s => s.trim().length > 0 && !s.startsWith('grpc.'));
      this.panel?.webview.postMessage({ command: 'servicesLoaded', services });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.outputChannel.appendLine(`Failed to list services via reflection: ${errorMsg}`);

      if (errorMsg.includes('reflection') || errorMsg.includes('Unimplemented')) {
        this.panel?.webview.postMessage({
          command: 'error',
          message:
            'Server reflection is not enabled on the target server. Enable reflection in your gRPC server configuration.',
        });
      } else if (errorMsg.includes('connection refused') || errorMsg.includes('dial tcp')) {
        this.panel?.webview.postMessage({
          command: 'error',
          message: `Cannot connect to ${address}. Make sure the gRPC server is running.`,
        });
      } else {
        this.panel?.webview.postMessage({ command: 'error', message: `Failed to list services: ${errorMsg}` });
      }
    }
  }

  /**
   * Run a gRPC request using server reflection (no proto file needed)
   */
  private async runRequestViaReflection(data: { service: string; method: string; address: string; jsonBody: string }) {
    const args = ['-plaintext', '-d', data.jsonBody, data.address, `${data.service}/${data.method}`];

    try {
      const grpcurlCmd = await this.getGrpcurlPath();
      this.outputChannel.appendLine(`Running via reflection: ${grpcurlCmd} ${args.join(' ')}`);
      const output = await this.runGrpcurl(grpcurlCmd, args, process.cwd());
      this.panel?.webview.postMessage({ command: 'response', output });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.panel?.webview.postMessage({ command: 'responseError', error: errorMsg });
    }
  }

  private runGrpcurl(grpcurlCmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Don't use shell: true as it breaks paths with spaces
      const proc = spawn(grpcurlCmd, args, { cwd });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => (stdout += d.toString()));
      proc.stderr.on('data', d => (stderr += d.toString()));

      proc.on('close', code => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Exited with code ${code}`));
        }
      });

      proc.on('error', err => {
        // Provide more helpful error messages
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(`grpcurl command not found. Install grpcurl or configure the path in settings.`));
        } else {
          reject(err);
        }
      });
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
            .warning { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); padding: 10px; margin-bottom: 10px; border-radius: 4px; display: none; }
            .warning.show { display: block; }
            .mode-toggle { display: flex; gap: 10px; margin-bottom: 15px; align-items: center; }
            .mode-toggle input[type="checkbox"] { width: auto; margin: 0; }
            .mode-toggle label { margin: 0; cursor: pointer; }
            .hidden { display: none; }
        </style>
    </head>
    <body>
        <h2>Protobuf Request Playground</h2>

        <div id="editionsWarning" class="warning">
            ⚠️ Proto Editions syntax is not supported by grpcurl. Using server reflection mode instead.
            <br><small>Make sure your gRPC server has reflection enabled.</small>
        </div>

        <div class="mode-toggle">
            <input type="checkbox" id="reflectionMode">
            <label for="reflectionMode">Use Server Reflection (required for Editions syntax)</label>
            <button id="refreshServicesBtn" style="margin-left: auto;">Refresh Services</button>
        </div>

        <div class="row">
            <div class="col" id="filePathRow">
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
            const filePathRow = document.getElementById('filePathRow');
            const addressInput = document.getElementById('address');
            const jsonBodyInput = document.getElementById('jsonBody');
            const sendBtn = document.getElementById('sendBtn');
            const responseOutput = document.getElementById('responseOutput');
            const reflectionMode = document.getElementById('reflectionMode');
            const editionsWarning = document.getElementById('editionsWarning');
            const refreshServicesBtn = document.getElementById('refreshServicesBtn');

            let useReflection = false;

            function setReflectionMode(enabled) {
                useReflection = enabled;
                reflectionMode.checked = enabled;
                if (enabled) {
                    filePathRow.classList.add('hidden');
                } else {
                    filePathRow.classList.remove('hidden');
                }
            }

            function refreshServices() {
                serviceSelect.innerHTML = '<option>Loading...</option>';
                if (useReflection) {
                    vscode.postMessage({ command: 'listServicesViaReflection', address: addressInput.value });
                } else if (filePathInput.value) {
                    vscode.postMessage({ command: 'listServices', file: filePathInput.value });
                }
            }

            reflectionMode.addEventListener('change', (e) => {
                setReflectionMode(e.target.checked);
                if (e.target.checked) {
                    editionsWarning.classList.remove('show');
                }
                refreshServices();
            });

            refreshServicesBtn.addEventListener('click', refreshServices);

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setFile':
                        filePathInput.value = message.file;
                        break;
                    case 'servicesLoaded':
                        serviceSelect.innerHTML = '';
                        if (message.services.length === 0) {
                            const opt = document.createElement('option');
                            opt.disabled = true;
                            opt.innerText = 'No services found';
                            serviceSelect.appendChild(opt);
                        } else {
                            message.services.forEach(s => {
                                const opt = document.createElement('option');
                                opt.value = s;
                                opt.innerText = s;
                                serviceSelect.appendChild(opt);
                            });
                        }
                        break;
                    case 'response':
                        responseOutput.innerText = message.output;
                        break;
                    case 'responseError':
                        responseOutput.innerText = 'Error: ' + message.error;
                        break;
                    case 'error':
                        serviceSelect.innerHTML = '<option disabled>Error loading services</option>';
                        responseOutput.innerText = 'Error: ' + message.message;
                        break;
                    case 'editionsWarning':
                        editionsWarning.classList.add('show');
                        if (message.useReflection) {
                            setReflectionMode(true);
                        }
                        break;
                }
            });

            sendBtn.addEventListener('click', () => {
                responseOutput.innerText = 'Sending...';
                if (useReflection) {
                    vscode.postMessage({
                        command: 'runRequestViaReflection',
                        data: {
                            address: addressInput.value,
                            service: serviceSelect.value,
                            method: methodInput.value,
                            jsonBody: jsonBodyInput.value
                        }
                    });
                } else {
                    vscode.postMessage({
                        command: 'runRequest',
                        data: {
                            filePath: filePathInput.value,
                            address: addressInput.value,
                            service: serviceSelect.value,
                            method: methodInput.value,
                            jsonBody: jsonBodyInput.value
                        }
                    });
                }
            });
        </script>
    </body>
    </html>`;
  }
}
