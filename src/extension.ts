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
import { SchemaGraphPanel } from './client/schemaGraphPanel';

let client: LanguageClient;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Protobuf VSC');
  outputChannel.appendLine('Activating Protobuf extension...');

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
        execArgv: ['--nolazy', '--inspect=6009']
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
    outputChannelName: 'Protobuf VSC',
    revealOutputChannelOn: RevealOutputChannelOn.Error
  };

  // Create the language client
  client = new LanguageClient(
    'protobufLanguageServer',
    'Protobuf Language Server',
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

  // Register debug command to test definition
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.debugDefinition', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      const position = editor.selection.active;
      const line = editor.document.lineAt(position.line).text;

      vscode.window.showInformationMessage(
        `Debug: Line ${position.line}, Char ${position.character}, Text: "${line}"`
      );

      // Try to trigger go to definition
      try {
        const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          editor.document.uri,
          position
        );

        if (definitions && definitions.length > 0) {
          vscode.window.showInformationMessage(
            `Found ${definitions.length} definition(s): ${definitions.map(d => d.uri.fsPath + ':' + d.range.start.line).join(', ')}`
          );
        } else {
          vscode.window.showWarningMessage('No definitions found');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    })
  );

  // Register format command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.formatDocument', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'proto') {
        vscode.commands.executeCommand('editor.action.formatDocument');
      }
    })
  );

  // Register go to definition command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.goToDefinition', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'proto') {
        vscode.commands.executeCommand('editor.action.revealDefinition');
      }
    })
  );

  // Register schema graph command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.showSchemaGraph', () => {
      if (!client) {
        vscode.window.showErrorMessage('Language client is not ready yet.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const uri = editor?.document.languageId === 'proto'
        ? editor.document.uri.toString()
        : undefined;

      SchemaGraphPanel.createOrShow(context.extensionUri, client, {
        uri,
        scope: 'workspace'
      });
    })
  );

  // Register open imported file picker
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.openImportedFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      try {
        const imports = await client.sendRequest<
          { importPath: string; resolvedUri?: string; isResolved: boolean }[]
        >('protobuf/listImports', { uri: editor.document.uri.toString() });

        if (!imports || imports.length === 0) {
          vscode.window.showInformationMessage('No imports found in this file');
          return;
        }

        const pick = await vscode.window.showQuickPick(
          imports.map(i => ({
            label: i.importPath,
            description: i.isResolved ? 'resolved' : 'unresolved',
            detail: i.resolvedUri ? vscode.Uri.parse(i.resolvedUri).fsPath : undefined,
            resolvedUri: i.resolvedUri
          })),
          { placeHolder: 'Select an import to open' }
        );

        if (!pick) {
          return;
        }

        if (!pick.resolvedUri) {
          vscode.window.showWarningMessage(`Import "${pick.label}" is not resolved.`);
          return;
        }

        const docUri = vscode.Uri.parse(pick.resolvedUri);
        await vscode.window.showTextDocument(docUri);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to list imports: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Register find references command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.findReferences', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'proto') {
        vscode.commands.executeCommand('editor.action.goToReferences');
      }
    })
  );

  // Register renumber document command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.renumberDocument', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      const result = await client.sendRequest('protobuf/renumberDocument', {
        uri: editor.document.uri.toString()
      });

      if (result && Array.isArray(result) && result.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const textEdit of result) {
          edit.replace(
            editor.document.uri,
            new vscode.Range(
              new vscode.Position(textEdit.range.start.line, textEdit.range.start.character),
              new vscode.Position(textEdit.range.end.line, textEdit.range.end.character)
            ),
            textEdit.newText
          );
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Renumbered ${result.length} field(s)`);
      } else {
        vscode.window.showInformationMessage('No fields to renumber');
      }
    })
  );

  // Register renumber message command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.renumberMessage', async (uri?: string, messageName?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      const docUri = uri || editor.document.uri.toString();

      // If no message name provided, get it from current cursor position
      if (!messageName) {
        const result = await client.sendRequest('protobuf/getMessageAtPosition', {
          uri: docUri,
          position: {
            line: editor.selection.active.line,
            character: editor.selection.active.character
          }
        });
        messageName = result as string | undefined;
      }

      if (!messageName) {
        // Ask user to select a message
        const messages = await client.sendRequest('protobuf/getMessages', { uri: docUri }) as string[];
        if (!messages || messages.length === 0) {
          vscode.window.showWarningMessage('No messages found in this file');
          return;
        }
        messageName = await vscode.window.showQuickPick(messages, {
          placeHolder: 'Select a message to renumber'
        });
      }

      if (!messageName) {
        return;
      }

      const edits = await client.sendRequest('protobuf/renumberMessage', {
        uri: docUri,
        messageName
      });

      if (edits && Array.isArray(edits) && edits.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const textEdit of edits) {
          edit.replace(
            editor.document.uri,
            new vscode.Range(
              new vscode.Position(textEdit.range.start.line, textEdit.range.start.character),
              new vscode.Position(textEdit.range.end.line, textEdit.range.end.character)
            ),
            textEdit.newText
          );
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Renumbered ${edits.length} field(s) in '${messageName}'`);
      } else {
        vscode.window.showInformationMessage('No fields to renumber');
      }
    })
  );

  // Register renumber from cursor command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.renumberFromCursor', async (uri?: string, position?: { line: number; character: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      const docUri = uri || editor.document.uri.toString();
      const cursorPosition = position || {
        line: editor.selection.active.line,
        character: editor.selection.active.character
      };

      const edits = await client.sendRequest('protobuf/renumberFromPosition', {
        uri: docUri,
        position: cursorPosition
      });

      if (edits && Array.isArray(edits) && edits.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const textEdit of edits) {
          edit.replace(
            editor.document.uri,
            new vscode.Range(
              new vscode.Position(textEdit.range.start.line, textEdit.range.start.character),
              new vscode.Position(textEdit.range.end.line, textEdit.range.end.character)
            ),
            textEdit.newText
          );
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Renumbered ${edits.length} field(s)`);
      } else {
        vscode.window.showInformationMessage('No fields to renumber from this position');
      }
    })
  );

  // Register renumber enum command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.renumberEnum', async (uri?: string, enumName?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      const docUri = uri || editor.document.uri.toString();

      if (!enumName) {
        // Ask user to select an enum
        const enums = await client.sendRequest('protobuf/getEnums', { uri: docUri }) as string[];
        if (!enums || enums.length === 0) {
          vscode.window.showWarningMessage('No enums found in this file');
          return;
        }
        enumName = await vscode.window.showQuickPick(enums, {
          placeHolder: 'Select an enum to renumber'
        });
      }

      if (!enumName) {
        return;
      }

      const edits = await client.sendRequest('protobuf/renumberEnum', {
        uri: docUri,
        enumName
      });

      if (edits && Array.isArray(edits) && edits.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const textEdit of edits) {
          edit.replace(
            editor.document.uri,
            new vscode.Range(
              new vscode.Position(textEdit.range.start.line, textEdit.range.start.character),
              new vscode.Position(textEdit.range.end.line, textEdit.range.end.character)
            ),
            textEdit.newText
          );
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Renumbered ${edits.length} value(s) in '${enumName}'`);
      } else {
        vscode.window.showInformationMessage('No values to renumber');
      }
    })
  );

  // Register compile file command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.compileFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      try {
        const result = await client.sendRequest('protobuf/compileFile', {
          uri: editor.document.uri.toString()
        }) as { success: boolean; output?: string; error?: string };

        if (result.success) {
          vscode.window.showInformationMessage('Proto file compiled successfully');
        } else {
          vscode.window.showErrorMessage(`Compilation failed: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error}`);
      }
    })
  );

  // Register compile all command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.compileAll', async () => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage('No workspace folder open');
          return;
        }

        const result = await client.sendRequest('protobuf/compileAll', {
          workspaceRoot: workspaceFolders[0].uri.fsPath
        }) as { success: boolean; compiledFiles?: number; errors?: string[] };

        if (result.success) {
          vscode.window.showInformationMessage(`Compiled ${result.compiledFiles || 0} proto file(s) successfully`);
        } else {
          const errorMsg = result.errors?.join('\n') || 'Unknown error';
          vscode.window.showErrorMessage(`Compilation failed:\n${errorMsg}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error}`);
      }
    })
  );

  // Register check breaking changes command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.checkBreakingChanges', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      try {
        const result = await client.sendRequest('protobuf/checkBreakingChanges', {
          uri: editor.document.uri.toString()
        }) as { hasBreakingChanges: boolean; changes: Array<{ rule: string; message: string; location?: { line: number; character: number } }> };

        if (!result.hasBreakingChanges) {
          vscode.window.showInformationMessage('No breaking changes detected');
        } else {
          const panel = vscode.window.createOutputChannel('Protobuf Breaking Changes');
          panel.clear();
          panel.appendLine('Breaking Changes Detected:');
          panel.appendLine('');
          for (const change of result.changes) {
            panel.appendLine(`[${change.rule}] ${change.message}`);
            if (change.location) {
              panel.appendLine(`  Line ${change.location.line + 1}, Character ${change.location.character + 1}`);
            }
          }
          panel.show();
          vscode.window.showWarningMessage(`${result.changes.length} breaking change(s) detected. See output for details.`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error checking breaking changes: ${error}`);
      }
    })
  );

  // Register run external linter command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.runExternalLinter', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'proto') {
        vscode.window.showWarningMessage('Please open a .proto file first');
        return;
      }

      try {
        const result = await client.sendRequest('protobuf/runExternalLinter', {
          uri: editor.document.uri.toString()
        }) as { success: boolean; diagnostics?: unknown[]; error?: string };

        if (result.success) {
          const count = result.diagnostics?.length || 0;
          if (count === 0) {
            vscode.window.showInformationMessage('Linter passed with no issues');
          } else {
            vscode.window.showInformationMessage(`Linter found ${count} issue(s)`);
          }
        } else {
          vscode.window.showErrorMessage(`Linter error: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Linter error: ${error}`);
      }
    })
  );

  // Register show available lint rules command
  context.subscriptions.push(
    vscode.commands.registerCommand('protobuf.showAvailableLintRules', async () => {
      try {
        const result = await client.sendRequest('protobuf/getAvailableLintRules', {}) as { rules: string[] };

        if (result.rules && result.rules.length > 0) {
          const panel = vscode.window.createOutputChannel('Protobuf Lint Rules');
          panel.clear();
          panel.appendLine('Available Lint Rules:');
          panel.appendLine('');
          for (const rule of result.rules) {
            panel.appendLine(`  • ${rule}`);
          }
          panel.show();
        } else {
          vscode.window.showInformationMessage('No lint rules available. Make sure buf or protolint is configured.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error getting lint rules: ${error}`);
      }
    })
  );

  console.log('Protobuf Language Support is now active');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
