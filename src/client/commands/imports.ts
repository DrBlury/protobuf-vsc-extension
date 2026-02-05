/**
 * Import-related command handlers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { CodeActionKind } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

interface ImportInfo {
  importPath: string;
  resolvedUri?: string;
  isResolved: boolean;
}

/**
 * Registers all import-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerImportCommands(context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable[] {
  return [registerOpenImportedFileCommand(context, client), registerOrganizeImportsCommand(context, client)];
}

/**
 * Registers the organize imports command
 * Sorts, deduplicates, and groups imports in the current proto file
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerOrganizeImportsCommand(_context: vscode.ExtensionContext, _client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.organizeImports', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      // Use VS Code's built-in mechanism to trigger source.organizeImports code action
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        editor.document.uri,
        new vscode.Range(0, 0, editor.document.lineCount, 0),
        CodeActionKind.SourceOrganizeImports
      );

      if (!codeActions || codeActions.length === 0) {
        vscode.window.showInformationMessage('Imports are already organized.');
        return;
      }

      // Find the organize imports action
      const organizeAction = codeActions.find(
        action => action.kind?.value === 'source.organizeImports' || action.title?.toLowerCase().includes('organize')
      );

      if (organizeAction?.edit) {
        await vscode.workspace.applyEdit(organizeAction.edit);
        vscode.window.showInformationMessage('Imports organized successfully.');
      } else {
        vscode.window.showInformationMessage('Imports are already organized.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to organize imports: ${errorMessage}`);
    }
  });
}

/**
 * Registers the open imported file command
 * Opens a quick pick to select and open an imported proto file
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerOpenImportedFileCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.openImportedFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      const imports = (await client.sendRequest<ImportInfo[]>(REQUEST_METHODS.LIST_IMPORTS, {
        uri: editor.document.uri.toString(),
      })) as ImportInfo[];

      if (!imports || imports.length === 0) {
        vscode.window.showInformationMessage(VALIDATION_MESSAGES.NO_IMPORTS_FOUND);
        return;
      }

      const pick = await vscode.window.showQuickPick(
        imports.map(imp => ({
          label: imp.importPath,
          description: imp.isResolved ? 'resolved' : 'unresolved',
          detail: imp.resolvedUri ? vscode.Uri.parse(imp.resolvedUri).fsPath : undefined,
          resolvedUri: imp.resolvedUri,
        })),
        { placeHolder: 'Select an import to open' }
      );

      if (!pick) {
        return;
      }

      if (!pick.resolvedUri) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.IMPORT_NOT_RESOLVED(pick.label));
        return;
      }

      const docUri = vscode.Uri.parse(pick.resolvedUri);
      await vscode.window.showTextDocument(docUri);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.FAILED_TO_LIST_IMPORTS}: ${errorMessage}`);
    }
  });
}
