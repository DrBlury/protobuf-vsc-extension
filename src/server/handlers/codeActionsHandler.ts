/**
 * Code Actions Handler
 * Handles code action requests
 */

import {
  CodeActionParams,
  CodeAction
} from 'vscode-languageserver/node';

import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CodeActionsProvider } from '../providers/codeActions';

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
