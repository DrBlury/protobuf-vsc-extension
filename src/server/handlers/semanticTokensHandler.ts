/**
 * Semantic Tokens Handler
 * Handles semantic tokens requests
 */

import {
  SemanticTokensParams,
  SemanticTokens
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokensProvider } from '../providers/semanticTokens';

/**
 * Handle semantic tokens full request
 */
export function handleSemanticTokensFull(
  params: SemanticTokensParams,
  semanticTokensProvider: SemanticTokensProvider,
  getDocument: (uri: string) => TextDocument | undefined
): SemanticTokens {
  const document = getDocument(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }

  return semanticTokensProvider.getSemanticTokens(
    params.textDocument.uri,
    document.getText()
  );
}
