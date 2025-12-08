/**
 * Protobuf Language Support Extension
 * Main entry point
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  Trace,
  RevealOutputChannelOn
} from 'vscode-languageclient/node';
import { DEBUG_PORT, OUTPUT_CHANNEL_NAME, SERVER_IDS } from './server/utils/constants';
import { registerAllCommands } from './client/commands';
import { ToolchainManager } from './client/toolchain/toolchainManager';
import { CodegenManager } from './client/codegen/codegenManager';
import { SchemaDiffManager } from './client/diff/schemaDiff';
import { PlaygroundManager } from './client/playground/playgroundManager';
import { OptionInspectorProvider } from './client/inspector/optionInspector';
import { RegistryManager } from './client/registry/registryManager';

let client: LanguageClient;
let outputChannel: vscode.OutputChannel;
let toolchainManager: ToolchainManager;
let codegenManager: CodegenManager;
let schemaDiffManager: SchemaDiffManager;
let playgroundManager: PlaygroundManager;
let registryManager: RegistryManager;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine('Activating Protobuf extension...');

  // Initialize toolchain manager
  toolchainManager = new ToolchainManager(context, outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.toolchain.manage', () => {
    toolchainManager.manageToolchain();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.toolchain.useManaged', () => {
    toolchainManager.useManagedToolchain();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.toolchain.useSystem', () => {
    toolchainManager.useSystemToolchain();
  }));

  // Initialize codegen manager
  codegenManager = new CodegenManager(outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.generateCode', (uri?: vscode.Uri) => {
    codegenManager.generateCode(uri);
  }));

  // Initialize schema diff manager
  schemaDiffManager = new SchemaDiffManager(outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.diffSchema', (uri?: vscode.Uri) => {
    schemaDiffManager.diffSchema(uri);
  }));

  // Initialize playground manager
  playgroundManager = new PlaygroundManager(context, outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.openPlayground', () => {
    playgroundManager.openPlayground();
  }));

  // Initialize registry manager
  registryManager = new RegistryManager(outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.addBufDependency', () => {
    registryManager.addDependency();
  }));

  // Register buf export command for resolving BSR dependencies
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.exportBufDependencies', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a .proto file first.');
      return;
    }

    // Find the workspace folder containing the current file
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceFolder = workspaceFolders?.find((folder: vscode.WorkspaceFolder) =>
      editor.document.uri.fsPath.startsWith(folder.uri.fsPath)
    );

    if (!workspaceFolder) {
      vscode.window.showWarningMessage('Could not determine workspace folder.');
      return;
    }

    // Try to find buf.yaml in the file's directory hierarchy
    const fs = await import('fs');
    const pathModule = await import('path');
    let currentDir = pathModule.dirname(editor.document.uri.fsPath);
    let bufYamlDir: string | null = null;

    while (currentDir !== pathModule.dirname(currentDir)) {
      if (fs.existsSync(pathModule.join(currentDir, 'buf.yaml'))) {
        bufYamlDir = currentDir;
        break;
      }
      currentDir = pathModule.dirname(currentDir);
    }

    if (!bufYamlDir) {
      vscode.window.showWarningMessage('No buf.yaml found in the file hierarchy. Create a buf.yaml first.');
      return;
    }

    // Parse buf.yaml to get dependencies
    const bufYamlPath = pathModule.join(bufYamlDir, 'buf.yaml');
    const bufYamlContent = fs.readFileSync(bufYamlPath, 'utf-8');

    // Simple YAML parsing for deps array
    const depsMatch = bufYamlContent.match(/^deps:\s*\n((?:\s+-\s+.+\n?)+)/m);
    const deps: string[] = [];
    if (depsMatch) {
      const depsLines = depsMatch[1].split('\n');
      for (const line of depsLines) {
        const depMatch = line.match(/^\s+-\s+(.+)/);
        if (depMatch) {
          deps.push(depMatch[1].trim());
        }
      }
    }

    if (deps.length === 0) {
      vscode.window.showWarningMessage('No dependencies found in buf.yaml. Add dependencies using the "deps:" section.');
      return;
    }

    const outputDir = '.buf-deps';
    const terminal = vscode.window.createTerminal('Buf Export');
    terminal.show();

    // First, remove the existing .buf-deps directory, then export each dependency
    // This ensures we only get dependencies, not source files
    const exportCommands = deps.map(dep => `buf export ${dep} --output=${outputDir}`).join(' && ');
    terminal.sendText(`cd "${bufYamlDir}" && rm -rf ${outputDir} && ${exportCommands}`);

    // Check if the path is already in protobuf.includes
    const absoluteOutputPath = pathModule.join(bufYamlDir, outputDir);
    const workspaceFolderPath = workspaceFolder.uri.fsPath;
    const currentIncludes: string[] = vscode.workspace.getConfiguration('protobuf').get('includes') || [];

    // Check if path is already configured (with or without ${workspaceFolder} variable)
    const isAlreadyConfigured = currentIncludes.some(includePath => {
      // Expand ${workspaceFolder} variable if present
      const expandedPath = includePath.replace(/\$\{workspaceFolder\}/g, workspaceFolderPath);
      return expandedPath === absoluteOutputPath;
    });

    if (isAlreadyConfigured) {
      vscode.window.showInformationMessage(
        `Exporting ${deps.length} buf dependencies to ${outputDir}/. Path is already configured in "protobuf.includes".`
      );
    } else {
      // Use ${workspaceFolder} variable in suggested path if possible for better portability
      const suggestedPath = absoluteOutputPath.startsWith(workspaceFolderPath)
        ? '${workspaceFolder}' + absoluteOutputPath.slice(workspaceFolderPath.length)
        : absoluteOutputPath;

      vscode.window.showInformationMessage(
        `Exporting ${deps.length} buf dependencies to ${outputDir}/. After export completes, add "${suggestedPath}" to "protobuf.includes" in settings.`,
        'Add to Settings',
        'Open Settings'
      ).then(async selection => {
        if (selection === 'Add to Settings') {
          // Add the path to protobuf.includes configuration
          const config = vscode.workspace.getConfiguration('protobuf', workspaceFolder.uri);
          const updatedIncludes = [...currentIncludes, suggestedPath];
          await config.update('includes', updatedIncludes, vscode.ConfigurationTarget.WorkspaceFolder);
          vscode.window.showInformationMessage(`Added "${suggestedPath}" to "protobuf.includes" in workspace settings.`);
        } else if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.includes');
        }
      });
    }
  }));

  // Server module path
  const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
  outputChannel.appendLine(`Server module: ${serverModule}`);

  // Server options
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', `--inspect=${DEBUG_PORT}`]
      }
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'proto' },
      { scheme: 'file', language: 'textproto' }
    ],
    initializationOptions: {
      wellKnownCachePath: context.globalStorageUri.fsPath
    },
    synchronize: {
      configurationSection: 'protobuf',
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{proto,textproto,pbtxt,prototxt}')
    },
    outputChannel,
    outputChannelName: OUTPUT_CHANNEL_NAME,
    revealOutputChannelOn: RevealOutputChannelOn.Error
  };

  // Create the language client
  client = new LanguageClient(
    SERVER_IDS.LANGUAGE_SERVER,
    SERVER_IDS.LANGUAGE_SERVER_NAME,
    serverOptions,
    clientOptions
  );

  // Enable verbose tracing to capture definition crashes
  client.setTrace(Trace.Verbose);

  client.onDidChangeState(e => {
    outputChannel.appendLine(`Client state changed: ${e.oldState} -> ${e.newState}`);
  });

  client.onNotification('window/logMessage', (msg: { type: number; message: string }) => {
    outputChannel.appendLine(`server log [${msg.type}]: ${msg.message}`);
  });

  client.onNotification('window/showMessage', (msg: { type: number; message: string }) => {
    outputChannel.appendLine(`server message [${msg.type}]: ${msg.message}`);
  });

  client.onTelemetry((e: unknown) => {
    outputChannel.appendLine(`telemetry: ${JSON.stringify(e)}`);
  });

  client.onNotification('$/logTrace', (params: { message?: string; verbose?: string }) => {
    const msg = params.verbose || params.message || '(trace message without content)';
    outputChannel.appendLine(`server trace: ${msg}`);
  });

  // Start the client (also starts the server) and wait for it to be ready
  try {
    await client.start();
    outputChannel.appendLine('Language server started successfully');
  } catch (err) {
    const msg = `Failed to start language server: ${err instanceof Error ? err.message : String(err)}`;
    outputChannel.appendLine(msg);
    vscode.window.showErrorMessage(msg);
    return;
  }

  // Register Option Inspector Provider
  const optionInspectorProvider = new OptionInspectorProvider(client);
  vscode.window.registerTreeDataProvider('protobufOptionInspector', optionInspectorProvider);

  // Register all commands
  const commandDisposables = registerAllCommands(context, client);
  context.subscriptions.push(...commandDisposables);

  // Register code generation on save handler
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (document.languageId !== 'proto') {
        return;
      }

      const config = vscode.workspace.getConfiguration('protobuf');
      const generateOnSave = config.get<boolean>('codegen.generateOnSave', false);
      const legacyCompileOnSave = config.get<boolean>('protoc.compileOnSave', false);

      if (!generateOnSave && !legacyCompileOnSave) {
        return;
      }

      const tool = config.get<string>('codegen.tool', 'buf');

      if (tool === 'buf' && generateOnSave) {
        await runBufGenerate(document.uri, outputChannel);
      } else if (tool === 'protoc' || legacyCompileOnSave) {
        // Use existing protoc compilation via language server
        try {
          await client.sendRequest('protobuf/compileFile', { uri: document.uri.toString() });
        } catch (err) {
          outputChannel.appendLine(`Protoc compilation failed: ${err}`);
        }
      }
    })
  );

  outputChannel.appendLine('Protobuf Language Support is now active');
}

/**
 * Run buf generate for a proto file
 */
async function runBufGenerate(uri: vscode.Uri, outputChannel: vscode.OutputChannel): Promise<void> {
  const fs = await import('fs');
  const pathModule = await import('path');

  // Find buf.yaml in the file's directory hierarchy
  let currentDir = pathModule.dirname(uri.fsPath);
  let bufYamlDir: string | null = null;

  while (currentDir !== pathModule.dirname(currentDir)) {
    if (fs.existsSync(pathModule.join(currentDir, 'buf.yaml'))) {
      bufYamlDir = currentDir;
      break;
    }
    currentDir = pathModule.dirname(currentDir);
  }

  if (!bufYamlDir) {
    outputChannel.appendLine('No buf.yaml found, skipping buf generate');
    return;
  }

  // Check if buf.gen.yaml exists
  const bufGenPath = pathModule.join(bufYamlDir, 'buf.gen.yaml');
  if (!fs.existsSync(bufGenPath)) {
    outputChannel.appendLine('No buf.gen.yaml found, skipping buf generate');
    return;
  }

  const config = vscode.workspace.getConfiguration('protobuf');
  const bufPath = config.get<string>('buf.path', 'buf');

  outputChannel.appendLine(`Running buf generate in ${bufYamlDir}...`);

  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const proc = spawn(bufPath, ['generate'], {
      cwd: bufYamlDir,
      shell: true
    });

    let _stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      _stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        outputChannel.appendLine('buf generate completed successfully');
      } else {
        outputChannel.appendLine(`buf generate failed with code ${code}`);
        if (stderr) {
          outputChannel.appendLine(stderr);
        }
      }
      resolve();
    });

    proc.on('error', (err: Error) => {
      outputChannel.appendLine(`buf generate error: ${err.message}`);
      resolve();
    });
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
