/**
 * Document Links Handler
 * Handles document links requests
 */

import type {
  DocumentLinkParams,
  DocumentLink
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { DocumentLinksProvider } from '../providers/documentLinks';
import type { IProtoParser } from '../core/parserFactory';

/**
 * Handle document links request
 */
export function handleDocumentLinks(
  params: DocumentLinkParams,
  documents: TextDocuments<TextDocument>,
  documentLinksProvider: DocumentLinksProvider,
  parser: IProtoParser
): DocumentLink[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    const file = parser.parse(document.getText(), params.textDocument.uri);
    return documentLinksProvider.getDocumentLinks(params.textDocument.uri, file);
  } catch {
    return [];
  }
}
