/**
 * Format Document command handler
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Registers the format document command
 * Formats the current proto file using the configured formatter
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
export function registerFormatCommand(_context: vscode.ExtensionContext, _client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.formatDocument', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'proto') {
      vscode.commands.executeCommand('editor.action.formatDocument');
    }
  });
}
