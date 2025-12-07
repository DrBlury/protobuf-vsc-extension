/**
 * Reference-related command handlers
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { VALIDATION_MESSAGES } from '../../server/utils/constants';

interface ReferenceLocation {
  uri?: string;
  position?: { line: number; character: number };
}

/**
 * Registers all reference-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerReferenceCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  return [registerFindReferencesCommand(context, client)];
}

/**
 * Registers the find references command
 * Finds all references to the symbol at the cursor position or provided location
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerFindReferencesCommand(
  _context: vscode.ExtensionContext,
  _client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'protobuf.findReferences',
    async (location?: ReferenceLocation) => {
      // Use location info from the CodeLens when provided; otherwise fall back to the active editor.
      const targetUri = location?.uri
        ? vscode.Uri.parse(location.uri)
        : vscode.window.activeTextEditor?.document.uri;

      if (!targetUri) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_REFERENCES);
        return;
      }

      const document = await vscode.workspace.openTextDocument(targetUri);
      const editor = await vscode.window.showTextDocument(document);

      const fallbackPosition = editor.selection.active;
      const position = location?.position
        ? new vscode.Position(location.position.line, location.position.character)
        : fallbackPosition;

      editor.selection = new vscode.Selection(position, position);

      await vscode.commands.executeCommand('editor.action.goToReferences', targetUri, position);
    }
  );
}
