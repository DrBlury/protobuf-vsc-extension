/**
 * Code Lens Handler
 * Handles code lens requests
 */

import {
  CodeLensParams,
  CodeLens
} from 'vscode-languageserver/node';

import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CodeLensProvider } from '../providers/codeLens';
import { ProtoParser } from '../core/parser';

/**
 * Handle code lens request
 */
export function handleCodeLens(
  params: CodeLensParams,
  documents: TextDocuments<TextDocument>,
  codeLensProvider: CodeLensProvider,
  parser: ProtoParser
): CodeLens[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    const file = parser.parse(document.getText(), params.textDocument.uri);
    return codeLensProvider.getCodeLenses(params.textDocument.uri, file);
  } catch {
    return [];
  }
}
