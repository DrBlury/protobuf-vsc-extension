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

  outputChannel.appendLine('Protobuf Language Support is now active');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
