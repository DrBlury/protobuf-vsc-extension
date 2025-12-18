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

export type SemanticHighlightingMode = 'hybrid' | 'semantic' | 'textmate';

/**
 * Handle semantic tokens full request
 */
export function handleSemanticTokensFull(
  params: SemanticTokensParams,
  semanticTokensProvider: SemanticTokensProvider,
  getDocument: (uri: string) => TextDocument | undefined,
  mode: SemanticHighlightingMode = 'hybrid'
): SemanticTokens {
  // If textmate-only mode, return empty tokens
  if (mode === 'textmate') {
    return { data: [] };
  }

  const document = getDocument(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }

  return semanticTokensProvider.getSemanticTokens(
    params.textDocument.uri,
    document.getText(),
    mode
  );
}
