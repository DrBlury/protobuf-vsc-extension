/**
 * Command registration module
 * Centralizes all command handler registrations
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { registerFormatCommand } from './format';
import { registerGoToDefinitionCommand } from './definition';
import { registerRenumberCommands } from './renumber';
import { registerCompileCommands } from './compile';
import { registerDebugCommand } from './debug';
import { registerSchemaGraphCommand } from './schemaGraph';
import { registerImportCommands } from './imports';
import { registerReferenceCommands } from './references';
import { registerBreakingCommands } from './breaking';
import { registerLinterCommands } from './linter';
import { registerGrpcCommands } from './grpc';

/**
 * Registers all commands for the Protobuf extension
 * This function centralizes command registration and should be called during extension activation
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for all registered commands, which should be added to context.subscriptions
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Core commands
  disposables.push(registerFormatCommand(context, client));
  disposables.push(registerGoToDefinitionCommand(context, client));
  disposables.push(registerDebugCommand(context, client));
  disposables.push(registerSchemaGraphCommand(context, client));

  // Feature command groups
  disposables.push(...registerRenumberCommands(context, client));
  disposables.push(...registerCompileCommands(context, client));
  disposables.push(...registerImportCommands(context, client));
  disposables.push(...registerReferenceCommands(context, client));
  disposables.push(...registerBreakingCommands(context, client));
  disposables.push(...registerLinterCommands(context, client));
  disposables.push(...registerGrpcCommands(context, client));

  // Migrate to proto3 command
  disposables.push(vscode.commands.registerCommand('protobuf.migrateToProto3', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
          return;
      }

      interface TextEdit {
          range: { start: { line: number; character: number }; end: { line: number; character: number } };
          newText: string;
      }
      const edits = await client.sendRequest<TextEdit[]>('protobuf/migrateToProto3', { uri: editor.document.uri.toString() });
      if (edits && edits.length > 0) {
          const workspaceEdit = new vscode.WorkspaceEdit();
          workspaceEdit.set(editor.document.uri, edits.map(e => new vscode.TextEdit(
              new vscode.Range(e.range.start.line, e.range.start.character, e.range.end.line, e.range.end.character),
              e.newText
          )));
          await vscode.workspace.applyEdit(workspaceEdit);
      } else {
          vscode.window.showInformationMessage('No migration changes needed.');
      }
  }));

  // Copy to clipboard helper
  disposables.push(vscode.commands.registerCommand('protobuf.copyToClipboard', async (text: string) => {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Copied to clipboard');
  }));

  return disposables;
}
