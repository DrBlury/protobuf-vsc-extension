/**
 * Go to Definition command handler
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * Registers the go to definition command
 * Navigates to the definition of the symbol at the cursor position
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
export function registerGoToDefinitionCommand(
  _context: vscode.ExtensionContext,
  _client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.goToDefinition', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'proto') {
      vscode.commands.executeCommand('editor.action.revealDefinition');
    }
  });
}
