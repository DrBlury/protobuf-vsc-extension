/**
 * Code Actions Handler
 * Handles code action requests
 */

import type {
  CodeActionParams,
  CodeAction
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { CodeActionsProvider } from '../providers/codeActions';

/**
 * Handle code action request
 */
export function handleCodeActions(
  params: CodeActionParams,
  documents: TextDocuments<TextDocument>,
  codeActionsProvider: CodeActionsProvider
): CodeAction[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return codeActionsProvider.getCodeActions(
    params.textDocument.uri,
    params.range,
    params.context,
    document.getText()
  );
}
