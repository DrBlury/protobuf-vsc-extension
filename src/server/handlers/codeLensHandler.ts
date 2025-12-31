/**
 * Code Lens Handler
 * Handles code lens requests
 */

import type {
  CodeLensParams,
  CodeLens
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { CodeLensProvider } from '../providers/codeLens';
import type { IProtoParser } from '../core/parserFactory';

/**
 * Handle code lens request
 */
export function handleCodeLens(
  params: CodeLensParams,
  documents: TextDocuments<TextDocument>,
  codeLensProvider: CodeLensProvider,
  parser: IProtoParser
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
