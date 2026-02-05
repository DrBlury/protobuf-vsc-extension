/**
 * Helper functions for creating VS Code text edits and workspace edits
 * Reduces code duplication and provides consistent patterns
 */

import * as vscode from 'vscode';
import type { TextEdit } from 'vscode-languageserver/node';

/**
 * Converts a LSP TextEdit to a VS Code Range
 */
export function textEditToVSCodeRange(textEdit: TextEdit): vscode.Range {
  return new vscode.Range(
    new vscode.Position(textEdit.range.start.line, textEdit.range.start.character),
    new vscode.Position(textEdit.range.end.line, textEdit.range.end.character)
  );
}

/**
 * Creates a WorkspaceEdit from an array of LSP TextEdits
 * @param uri - The document URI to apply edits to
 * @param textEdits - Array of LSP TextEdit objects
 * @returns A VS Code WorkspaceEdit ready to apply
 */
export function createWorkspaceEditFromTextEdits(uri: vscode.Uri, textEdits: TextEdit[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const textEdit of textEdits) {
    edit.replace(uri, textEditToVSCodeRange(textEdit), textEdit.newText);
  }
  return edit;
}

/**
 * Applies a WorkspaceEdit and shows a success message
 * @param edit - The WorkspaceEdit to apply
 * @param successMessage - Optional success message to show
 */
export async function applyWorkspaceEditWithMessage(
  edit: vscode.WorkspaceEdit,
  successMessage?: string
): Promise<void> {
  const applied = await vscode.workspace.applyEdit(edit);
  if (applied && successMessage) {
    vscode.window.showInformationMessage(successMessage);
  }
}
