/**
 * References Handler
 * Handles find-references requests
 */

import type {
  ReferenceParams,
  Location
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { ReferencesProvider } from '../providers/references';

/**
 * Handle references request
 */
export function handleReferences(
  params: ReferenceParams,
  documents: TextDocuments<TextDocument>,
  referencesProvider: ReferencesProvider
): Location[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return referencesProvider.findReferences(
    params.textDocument.uri,
    params.position,
    lineText,
    params.context.includeDeclaration
  );
}
