/**
 * Completion Handler
 * Handles LSP completion requests
 */

import {
  CompletionItem,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { CompletionProvider } from '../providers/completion';

/**
 * Handle completion request
 *
 * @param params - Completion request parameters
 * @param documents - Document manager
 * @param completionProvider - Completion provider
 * @returns Array of completion items
 */
export function handleCompletion(
  params: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
  completionProvider: CompletionProvider
): CompletionItem[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const documentText = document.getText();
  const lines = documentText.split('\n');
  const lineText = lines[params.position.line] || '';

  return completionProvider.getCompletions(
    params.textDocument.uri,
    params.position,
    lineText,
    undefined,
    documentText
  );
}
