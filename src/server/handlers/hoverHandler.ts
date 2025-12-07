/**
 * Hover Handler
 * Handles LSP hover requests
 */

import { HoverParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { HoverProvider } from '../providers/hover';

/**
 * Handle hover request
 *
 * @param params - Hover request parameters
 * @param documents - Document manager
 * @param hoverProvider - Hover provider
 * @returns Hover information or null
 */
export function handleHover(
  params: HoverParams,
  documents: TextDocuments<TextDocument>,
  hoverProvider: HoverProvider
) {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return hoverProvider.getHover(
    params.textDocument.uri,
    params.position,
    lineText
  );
}
