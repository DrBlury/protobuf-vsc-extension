/**
 * Rename Handler
 * Handles prepare rename and rename requests
 */

import type { PrepareRenameParams, RenameParams, Range, WorkspaceEdit, TextEdit } from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { RenameProvider } from '../providers/rename';

interface PrepareRenameResult {
  range: Range;
  placeholder: string;
}

/**
 * Handle prepare rename request
 */
export function handlePrepareRename(
  params: PrepareRenameParams,
  documents: TextDocuments<TextDocument>,
  renameProvider: RenameProvider
): PrepareRenameResult | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = renameProvider.prepareRename(params.textDocument.uri, params.position, lineText);

  if (!result) {
    return null;
  }

  // Adjust range to correct line
  return {
    range: {
      start: { line: params.position.line, character: result.range.start.character },
      end: { line: params.position.line, character: result.range.end.character },
    },
    placeholder: result.placeholder,
  };
}

/**
 * Handle rename request
 */
export function handleRename(
  params: RenameParams,
  documents: TextDocuments<TextDocument>,
  renameProvider: RenameProvider
): WorkspaceEdit | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = renameProvider.rename(params.textDocument.uri, params.position, lineText, params.newName);

  if (result.changes.size === 0) {
    return null;
  }

  // Convert to WorkspaceEdit format
  const changes: { [uri: string]: TextEdit[] } = {};
  for (const [uri, edits] of result.changes) {
    changes[uri] = edits;
  }

  return { changes };
}
