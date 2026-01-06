/**
 * Protobuf Language Support Extension
 * Main entry point
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type {
  LanguageClientOptions,
  ServerOptions} from 'vscode-languageclient/node';
import {
  LanguageClient,
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
import { SaveStateTracker } from './client/formatting/saveState';
import { fileExists, readFile, writeFile } from './client/utils/fsUtils';
import { BinaryDecoderProvider } from './client/binary-decoder/binaryDecoder';

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
const saveStateTracker = new SaveStateTracker();
let modificationsModeWarningShown = false;

function isProtoDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'proto' || document.languageId === 'textproto';
}

function markSaveInProgress(uri: vscode.Uri): void {
  saveStateTracker.mark(uri.toString());
}

function clearSaveInProgress(uri: vscode.Uri): void {
  saveStateTracker.clear(uri.toString());
}

function shouldSkipFormatRequest(document: vscode.TextDocument): boolean {
  if (!isProtoDocument(document)) {
    return false;
  }

  const protoConfig = vscode.workspace.getConfiguration('protobuf', document.uri);
  const formatOnSaveEnabled = protoConfig.get<boolean>('formatOnSave', false);
  if (formatOnSaveEnabled) {
    return false;
  }

  return saveStateTracker.isSaving(document.uri.toString());
}

function getFormattingOptionsForDocument(document: vscode.TextDocument): vscode.FormattingOptions {
  const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
  const tabSize = editorConfig.get<number>('tabSize', 4);
  const insertSpaces = editorConfig.get<boolean>('insertSpaces', true);
  return {
    tabSize: Number.isInteger(tabSize) ? tabSize : 4,
    insertSpaces
  };
}

async function formatDocumentIfNeeded(document: vscode.TextDocument): Promise<void> {
  if (!isProtoDocument(document)) {
    return;
  }

  const protoConfig = vscode.workspace.getConfiguration('protobuf', document.uri);
  const formatOnSave = protoConfig.get<boolean>('formatOnSave', false);
  if (!formatOnSave) {
    return;
  }

  const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
  const editorFormatOnSave = editorConfig.get<boolean>('formatOnSave', false);
  if (editorFormatOnSave) {
    // VS Code will handle formatting automatically.
    return;
  }

  const formatMode = editorConfig.get<'file' | 'modifications' | 'modificationsIfAvailable'>('formatOnSaveMode', 'file');
  if (formatMode === 'modifications') {
    if (!modificationsModeWarningShown) {
      outputChannel.appendLine('Skipping manual proto formatting because editor.formatOnSaveMode is set to "modifications". Enable VS Code formatOnSave or switch formatOnSaveMode to "file" or "modificationsIfAvailable" to allow protobuf.formatOnSave.');
      modificationsModeWarningShown = true;
    }
    return;
  }

  const formattingOptions = getFormattingOptionsForDocument(document);

  let edits: vscode.TextEdit[] | undefined;
  try {
    edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      document.uri,
      formattingOptions
    );
  } catch (err) {
    outputChannel.appendLine(`Failed to request proto formatting edits: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!edits || edits.length === 0) {
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(document.uri, edits);
  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (!applied) {
    throw new Error('Failed to apply formatting edits returned by proto formatter');
  }
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine('Activating Protobuf extension...');

  // Initialize toolchain manager
  toolchainManager = new ToolchainManager(context, outputChannel);
  context.subscriptions.push(vscode.commands.registerCommand('protobuf.toolchain.manage', () => {
    toolchainManager.manageToolchain();
  }));

  // Respect protobuf.formatOnSave and provide manual formatting when editor.formatOnSave is disabled
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(event => {
      if (!isProtoDocument(event.document)) {
        return;
      }

      markSaveInProgress(event.document.uri);

      event.waitUntil(
        formatDocumentIfNeeded(event.document).catch(err => {
          outputChannel.appendLine(
            `Failed to run protobuf.formatOnSave for ${event.document.uri.fsPath}: ${err instanceof Error ? err.message : String(err)}`
          );
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      if (isProtoDocument(document)) {
        clearSaveInProgress(document.uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      if (isProtoDocument(document)) {
        clearSaveInProgress(document.uri);
      }
    })
  );
  context.subscriptions.push({ dispose: () => saveStateTracker.dispose() });

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

  // Register Binary Decoder Provider
  context.subscriptions.push(BinaryDecoderProvider.register(context, outputChannel));

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

    // Find buf.yaml (or buf.yml) starting from document directory
    const documentDir = editor ? path.dirname(editor.document.uri.fsPath) : workspaceFolders[0]!.uri.fsPath;
    let searchDir = documentDir;
    let bufYamlPath: string | null = null;

    // Search up the directory tree for buf.yaml or buf.yml
    while (searchDir !== path.dirname(searchDir)) {
      const yamlCandidate = path.join(searchDir, 'buf.yaml');
      const ymlCandidate = path.join(searchDir, 'buf.yml');

      if (await fileExists(yamlCandidate)) {
        bufYamlPath = yamlCandidate;
        break;
      }
      if (await fileExists(ymlCandidate)) {
        bufYamlPath = ymlCandidate;
        break;
      }
      searchDir = path.dirname(searchDir);
    }

    if (!bufYamlPath) {
      // Determine best location for new buf.yaml - prefer directory closest to document
      // that contains proto files or is a reasonable project root
      let createDir = documentDir;

      // If there's a buf.work.yaml nearby, find the appropriate module directory
      let workSearchDir = documentDir;
      while (workSearchDir !== path.dirname(workSearchDir)) {
        if (await fileExists(path.join(workSearchDir, 'buf.work.yaml'))) {
          // Found a buf workspace - suggest creating buf.yaml in the document's module directory
          // which is typically one level below the workspace
          createDir = documentDir;
          break;
        }
        workSearchDir = path.dirname(workSearchDir);
      }

      const create = await vscode.window.showInformationMessage(
        `buf.yaml not found. Create one at '${createDir}' with dependency '${moduleName}'?`,
        'Create', 'Choose Location', 'Cancel'
      );

      if (create === 'Create') {
        bufYamlPath = path.join(createDir, 'buf.yaml');
      } else if (create === 'Choose Location') {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri: vscode.Uri.file(createDir),
          title: 'Select folder for buf.yaml'
        });
        if (selected && selected[0]) {
          bufYamlPath = path.join(selected[0].fsPath, 'buf.yaml');
        } else {
          return;
        }
      } else {
        return;
      }

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
      await writeFile(bufYamlPath, content);
      outputChannel.appendLine(`Created ${bufYamlPath} with dependency ${moduleName}`);
    } else {
      // Add dependency to existing buf.yaml
      let content = await readFile(bufYamlPath);

      if (content.includes(moduleName)) {
        vscode.window.showInformationMessage(`Dependency '${moduleName}' already exists in buf.yaml`);
        return;
      }

      if (content.includes('deps:')) {
        content = content.replace(/deps:\s*\n/, `deps:\n  - ${moduleName}\n`);
      } else {
        content += `\ndeps:\n  - ${moduleName}\n`;
      }

      await writeFile(bufYamlPath, content);
      outputChannel.appendLine(`Added ${moduleName} to ${bufYamlPath}`);
    }

    // Run buf dep update with auto-fix for editions issues
    const config = vscode.workspace.getConfiguration('protobuf');
    const bufPath = config.get<string>('buf.path') || config.get<string>('externalLinter.bufPath') || 'buf';
    const bufYamlDir = path.dirname(bufYamlPath);

    const { spawn } = await import('child_process');

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Adding dependency ${moduleName}...`,
      cancellable: false
    }, async () => {
      const runBufDepUpdateWithAutoFix = async (retryCount: number = 0): Promise<void> => {
        const maxRetries = 3;

        return new Promise<void>((resolve, reject) => {
          outputChannel.appendLine(`Running: ${bufPath} dep update`);
          const proc = spawn(bufPath, ['dep', 'update'], { cwd: bufYamlDir, shell: true });

          let stderrOutput = '';

          proc.stdout?.on('data', d => outputChannel.append(d.toString()));
          proc.stderr?.on('data', d => {
            const str = d.toString();
            stderrOutput += str;
            outputChannel.append(str);
          });

          proc.on('close', async code => {
            if (code === 0) {
              outputChannel.appendLine('buf dep update completed');
              resolve();
            } else {
              // Check if the error is about 'optional' or 'required' labels in editions
              const editionsErrors = parseEditionsErrors(stderrOutput, bufYamlDir);

              if (editionsErrors.length > 0 && retryCount < maxRetries) {
                outputChannel.appendLine(`\nDetected ${editionsErrors.length} editions compatibility issue(s). Auto-fixing...`);

                try {
                  await fixEditionsErrors(editionsErrors, outputChannel);
                  outputChannel.appendLine('Auto-fix applied. Retrying buf dep update...\n');

                  // Retry after fixing
                  await runBufDepUpdateWithAutoFix(retryCount + 1);
                  resolve();
                } catch (fixErr) {
                  const msg = fixErr instanceof Error ? fixErr.message : String(fixErr);
                  outputChannel.appendLine(`Auto-fix failed: ${msg}`);
                  reject(new Error(`buf dep update failed with code ${code}`));
                }
              } else {
                reject(new Error(`buf dep update failed with code ${code}`));
              }
            }
          });

          proc.on('error', err => {
            outputChannel.appendLine(`buf dep update error: ${err.message}`);
            reject(err);
          });
        });
      };

      try {
        await runBufDepUpdateWithAutoFix();
        vscode.window.showInformationMessage(`Added dependency '${moduleName}' and updated buf.lock`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`Error: ${msg}`);
        vscode.window.showErrorMessage(`Failed to run 'buf dep update'. Check output for details.`);
      }
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
    let currentDir = path.dirname(editor.document.uri.fsPath);
    let bufYamlDir: string | null = null;

    while (currentDir !== path.dirname(currentDir)) {
      if (await fileExists(path.join(currentDir, 'buf.yaml'))) {
        bufYamlDir = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    if (!bufYamlDir) {
      vscode.window.showWarningMessage('No buf.yaml found in the file hierarchy. Create a buf.yaml first.');
      return;
    }

    // Parse buf.yaml to get dependencies
    const bufYamlPath = path.join(bufYamlDir, 'buf.yaml');
    const bufYamlContent = await readFile(bufYamlPath);

    // Simple YAML parsing for deps array
    const depsMatch = bufYamlContent.match(/^deps:\s*\n((?:\s+-\s+.+\n?)+)/m);
    const deps: string[] = [];
    if (depsMatch) {
      const depsLines = depsMatch[1]!.split('\n');
      for (const line of depsLines) {
        const depMatch = line.match(/^\s+-\s+(.+)/);
        if (depMatch) {
          deps.push(depMatch[1]!.trim());
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
    const absoluteOutputPath = path.join(bufYamlDir, outputDir);
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
    middleware: {
      provideDocumentFormattingEdits: (document, options, token, next) => {
        if (shouldSkipFormatRequest(document)) {
          return [];
        }
        return next ? next(document, options, token) : [];
      },
      provideDocumentRangeFormattingEdits: (document, range, options, token, next) => {
        if (shouldSkipFormatRequest(document)) {
          return [];
        }
        return next ? next(document, range, options, token) : [];
      }
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

    // Initialize Tree-sitter parser (if enabled)
    try {
      const wasmPath = path.join(context.extensionPath, 'out', 'tree-sitter', 'tree-sitter-proto.wasm');
      // Send initialization request to server
      await client.sendRequest('protobuf/initTreeSitter', { wasmPath });
      outputChannel.appendLine('Tree-sitter parser initialized');
    } catch (err) {
      outputChannel.appendLine(`Tree-sitter initialization failed (will use fallback parser): ${err instanceof Error ? err.message : String(err)}`);
    }
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
              unresolvedImports.push(match[1]!);
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
          const result = await client.sendRequest('protobuf/compileFile', { uri: document.uri.toString() }) as {
            success: boolean;
            stderr?: string;
            errors?: Array<{ file: string; line: number; column: number; message: string }>;
          };

          if (!result.success) {
            // Build detailed error message
            let errorDetail = '';
            if (result.errors && result.errors.length > 0) {
              errorDetail = result.errors.map(e =>
                e.file ? `${e.file}:${e.line}:${e.column}: ${e.message}` : e.message
              ).join('\n');
            } else if (result.stderr) {
              errorDetail = result.stderr.trim();
            }

            outputChannel.appendLine(`Protoc compilation failed: ${errorDetail || 'Unknown error'}`);
            outputChannel.show(true);
          }
        } catch (err) {
          outputChannel.appendLine(`Protoc compilation failed: ${err}`);
          outputChannel.show(true);
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
  // Find buf.yaml in the file's directory hierarchy
  let currentDir = path.dirname(uri.fsPath);
  let bufYamlDir: string | null = null;

  while (currentDir !== path.dirname(currentDir)) {
    if (await fileExists(path.join(currentDir, 'buf.yaml'))) {
      bufYamlDir = currentDir;
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  if (!bufYamlDir) {
    outputChannel.appendLine('No buf.yaml found, skipping buf generate');
    return;
  }

  // Check if buf.gen.yaml exists
  const bufGenPath = path.join(bufYamlDir, 'buf.gen.yaml');
  if (!(await fileExists(bufGenPath))) {
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

/**
 * Parse buf output for editions-related errors (optional/required labels)
 */
function parseEditionsErrors(stderr: string, cwd: string): Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}> {
  const errors: Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}> = [];

  // Pattern: file.proto:43:9:field package.Message.field_name: label 'optional' is not allowed in editions
  const regex = /^([^:]+):(\d+):\d+:field\s+[\w.]+\.(\w+):\s+label\s+'(optional|required)'\s+is\s+not\s+allowed\s+in\s+editions/gm;

  let match;
  while ((match = regex.exec(stderr)) !== null) {
    const [, filePath, lineStr, fieldName, label] = match;
    const fullPath = path.isAbsolute(filePath!) ? filePath! : path.join(cwd, filePath!);
    errors.push({
      filePath: fullPath,
      line: parseInt(lineStr!, 10),
      fieldName: fieldName!,
      label: label as 'optional' | 'required',
    });
  }

  return errors;
}

/**
 * Fix editions errors by converting optional/required to features.field_presence
 */
async function fixEditionsErrors(
  errors: Array<{filePath: string; line: number; fieldName: string; label: 'optional' | 'required'}>,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  // Group errors by file
  const errorsByFile = new Map<string, Array<{line: number; fieldName: string; label: 'optional' | 'required'}>>();

  for (const error of errors) {
    const existing = errorsByFile.get(error.filePath) || [];
    existing.push({ line: error.line, fieldName: error.fieldName, label: error.label });
    errorsByFile.set(error.filePath, existing);
  }

  for (const [filePath, fileErrors] of errorsByFile) {
    try {
      // Check if file exists
      if (!(await fileExists(filePath))) {
        outputChannel.appendLine(`  ERROR: File not found: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      }

      let content = await readFile(filePath);
      const originalContent = content;
      const lines = content.split('\n');
      outputChannel.appendLine(`  Reading ${filePath} (${lines.length} lines)`);

      // Sort errors by line number in descending order to avoid index shifts
      fileErrors.sort((a, b) => b.line - a.line);

      let fixCount = 0;
      for (const error of fileErrors) {
        const lineIndex = error.line - 1;
        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex]!;
          outputChannel.appendLine(`  Line ${error.line}: "${line.substring(0, 60)}..."`);

          // Match: optional/required Type name = N; or optional/required Type name = N [options];
          const fieldMatch = line.match(/^(\s*)(optional|required)\s+(\S+)\s+(\w+)\s*=\s*(\d+)\s*(\[[^\]]*\])?\s*;/);
          if (fieldMatch) {
            const [, indent, , type, name, number, existingOptions] = fieldMatch;
            const presenceValue = error.label === 'optional' ? 'EXPLICIT' : 'LEGACY_REQUIRED';

            let newLine: string;
            if (existingOptions) {
              // Append to existing options
              const optionsContent = existingOptions.slice(1, -1).trim();
              newLine = `${indent!}${type!} ${name!} = ${number!} [${optionsContent}, features.field_presence = ${presenceValue}];`;
            } else {
              newLine = `${indent!}${type!} ${name!} = ${number!} [features.field_presence = ${presenceValue}];`;
            }

            lines[lineIndex] = newLine;
            fixCount++;
            outputChannel.appendLine(`  Fixed: ${filePath}:${error.line} - converted '${error.label}' to features.field_presence = ${presenceValue}`);
          } else {
            outputChannel.appendLine(`  WARNING: Line ${error.line} did not match expected pattern: "${line.substring(0, 80)}"`);
          }
        }
      }

      if (fixCount > 0) {
        content = lines.join('\n');
        if (content !== originalContent) {
          await writeFile(filePath, content);
          outputChannel.appendLine(`  Saved: ${filePath} (${fixCount} fixes applied)`);
        } else {
          outputChannel.appendLine(`  WARNING: No changes detected in ${filePath}`);
        }
      } else {
        outputChannel.appendLine(`  WARNING: No fixes applied to ${filePath}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fix ${filePath}: ${msg}`);
    }
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
