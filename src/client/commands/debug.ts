/**
 * Debug command handler
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { VALIDATION_MESSAGES } from '../../server/utils/constants';

/**
 * Registers the debug definition command
 * Debug utility to test definition provider functionality
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
export function registerDebugCommand(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.debugDefinition', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
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
          `Found ${definitions.length} definition(s): ${definitions
            .map(d => `${d.uri.fsPath}:${d.range.start.line}`)
            .join(', ')}`
        );
      } else {
        vscode.window.showWarningMessage('No definitions found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error: ${errorMessage}`);
    }
  });
}
