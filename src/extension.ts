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
import { AutoDetector } from './client/toolchain/autoDetector';
import { DependencySuggestionProvider } from './client/toolchain/dependencySuggestion';
import { CodegenManager } from './client/codegen/codegenManager';
import { SchemaDiffManager } from './client/diff/schemaDiff';
import { PlaygroundManager } from './client/playground/playgroundManager';
import { OptionInspectorProvider } from './client/inspector/optionInspector';
import { RegistryManager } from './client/registry/registryManager';

let client: LanguageClient;
let outputChannel: vscode.OutputChannel;
let toolchainManager: ToolchainManager;
let autoDetector: AutoDetector;
let dependencySuggestionProvider: DependencySuggestionProvider;
let codegenManager: CodegenManager;
let schemaDiffManager: SchemaDiffManager;
let playgroundManager: PlaygroundManager;
let registryManager: RegistryManager;

// Debounce map for dependency suggestions to avoid multiple prompts
const dependencySuggestionDebounce = new Map<string, boolean>();

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

  // Initialize auto-detector for tools
  autoDetector = new AutoDetector(context, outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.detectTools', () => {
    autoDetector.detectAndPrompt();
  }));

  // Initialize dependency suggestion provider
  dependencySuggestionProvider = new DependencySuggestionProvider(outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.suggestDependencies', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'proto') {
      // This will be called with actual unresolved imports from diagnostics
      vscode.window.showInformationMessage('Dependency suggestions are shown automatically when unresolved imports are detected.');
    }
  }));

  // Run auto-detection on first proto file opened (delayed to avoid startup noise)
  const config = vscode.workspace.getConfiguration('protobuf');
  const autoDetectionPrompted = config.get<boolean>('autoDetection.prompted', false);
  if (!autoDetectionPrompted) {
    // Delay auto-detection to avoid impacting startup performance
    setTimeout(() => {
      autoDetector.detectAndPrompt();
    }, 3000);
  }

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

  // Register quick add dependency command (used by code actions)
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.addBufDependencyQuick', async (moduleName: string, _importPath: string) => {
    if (!moduleName) {
      vscode.window.showErrorMessage('No module name provided');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    // Find buf.yaml
    const fs = await import('fs');
    const pathModule = await import('path');

    let searchDir = editor ? pathModule.dirname(editor.document.uri.fsPath) : workspaceFolders[0].uri.fsPath;
    let bufYamlPath: string | null = null;

    while (searchDir !== pathModule.dirname(searchDir)) {
      const candidate = pathModule.join(searchDir, 'buf.yaml');
      if (fs.existsSync(candidate)) {
        bufYamlPath = candidate;
        break;
      }
      searchDir = pathModule.dirname(searchDir);
    }

    if (!bufYamlPath) {
      const create = await vscode.window.showInformationMessage(
        `buf.yaml not found. Create one with dependency '${moduleName}'?`,
        'Create', 'Cancel'
      );
      if (create === 'Create') {
        const rootPath = workspaceFolders[0].uri.fsPath;
        bufYamlPath = pathModule.join(rootPath, 'buf.yaml');
        const content = `version: v2
deps:
  - ${moduleName}
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
`;
        fs.writeFileSync(bufYamlPath, content);
        outputChannel.appendLine(`Created ${bufYamlPath} with dependency ${moduleName}`);
      } else {
        return;
      }
    } else {
      // Add dependency to existing buf.yaml
      let content = fs.readFileSync(bufYamlPath, 'utf-8');

      if (content.includes(moduleName)) {
        vscode.window.showInformationMessage(`Dependency '${moduleName}' already exists in buf.yaml`);
        return;
      }

      if (content.includes('deps:')) {
        content = content.replace(/deps:\s*\n/, `deps:\n  - ${moduleName}\n`);
      } else {
        content += `\ndeps:\n  - ${moduleName}\n`;
      }

      fs.writeFileSync(bufYamlPath, content);
      outputChannel.appendLine(`Added ${moduleName} to ${bufYamlPath}`);
    }

    // Run buf mod update
    const config = vscode.workspace.getConfiguration('protobuf');
    const bufPath = config.get<string>('buf.path') || config.get<string>('externalLinter.bufPath') || 'buf';
    const bufYamlDir = pathModule.dirname(bufYamlPath);

    const { spawn } = await import('child_process');

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Adding dependency ${moduleName}...`,
      cancellable: false
    }, async () => {
      return new Promise<void>((resolve) => {
        const proc = spawn(bufPath, ['mod', 'update'], { cwd: bufYamlDir, shell: true });

        proc.stdout?.on('data', d => outputChannel.append(d.toString()));
        proc.stderr?.on('data', d => outputChannel.append(d.toString()));

        proc.on('close', code => {
          if (code === 0) {
            vscode.window.showInformationMessage(`Added dependency '${moduleName}' and updated buf.lock`);
          } else {
            vscode.window.showErrorMessage(`Failed to run 'buf mod update'. Check output for details.`);
          }
          resolve();
        });

        proc.on('error', err => {
          outputChannel.appendLine(`Error: ${err.message}`);
          vscode.window.showErrorMessage(`Failed to run 'buf mod update': ${err.message}`);
          resolve();
        });
      });
    });
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
          const latestIncludes: string[] = config.get('includes') || [];

          // Check if path already exists (in case settings changed since initial check)
          const alreadyExists = latestIncludes.some(includePath => {
            const expandedPath = includePath.replace(/\$\{workspaceFolder\}/g, workspaceFolderPath);
            return expandedPath === absoluteOutputPath;
          });

          if (alreadyExists) {
            vscode.window.showInformationMessage(`Path "${suggestedPath}" is already in "protobuf.includes".`);
          } else {
            const updatedIncludes = [...latestIncludes, suggestedPath];
            await config.update('includes', updatedIncludes, vscode.ConfigurationTarget.WorkspaceFolder);
            vscode.window.showInformationMessage(`Added "${suggestedPath}" to "protobuf.includes" in workspace settings.`);
          }
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
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/*.{proto,textproto,pbtxt,prototxt}'),
        vscode.workspace.createFileSystemWatcher('**/buf.yaml'),
        vscode.workspace.createFileSystemWatcher('**/buf.yml'),
        vscode.workspace.createFileSystemWatcher('**/buf.work.yaml'),
        vscode.workspace.createFileSystemWatcher('**/buf.work.yml'),
        vscode.workspace.createFileSystemWatcher('**/buf.lock')
      ]
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

  // Listen for diagnostics to suggest dependencies for unresolved imports
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(async (e) => {
      for (const uri of e.uris) {
        if (!uri.fsPath.endsWith('.proto')) {
          continue;
        }

        const diagnostics = vscode.languages.getDiagnostics(uri);
        const unresolvedImports: string[] = [];

        for (const diagnostic of diagnostics) {
          // Look for unresolved import diagnostics
          if (diagnostic.source === 'protobuf' &&
              diagnostic.message.includes("Import '") &&
              diagnostic.message.includes("cannot be resolved")) {
            const match = diagnostic.message.match(/Import '([^']+)' cannot be resolved/);
            if (match) {
              unresolvedImports.push(match[1]);
            }
          }
        }

        // Suggest dependencies if we found unresolved imports that look like BSR modules
        if (unresolvedImports.length > 0) {
          // Debounce to avoid multiple prompts
          const key = uri.toString();
          if (!dependencySuggestionDebounce.has(key)) {
            dependencySuggestionDebounce.set(key, true);
            setTimeout(async () => {
              dependencySuggestionDebounce.delete(key);
              await dependencySuggestionProvider.suggestDependencies(unresolvedImports, uri);
            }, 1000);
          }
        }
      }
    })
  );

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
