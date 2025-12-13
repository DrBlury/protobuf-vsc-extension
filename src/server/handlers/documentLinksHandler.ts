/**
 * Document Links Handler
 * Handles document links requests
 */

import {
  DocumentLinkParams,
  DocumentLink
} from 'vscode-languageserver/node';

import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { DocumentLinksProvider } from '../providers/documentLinks';
import { ProtoParser } from '../core/parser';

/**
 * Handle document links request
 */
export function handleDocumentLinks(
  params: DocumentLinkParams,
  documents: TextDocuments<TextDocument>,
  documentLinksProvider: DocumentLinksProvider,
  parser: ProtoParser
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
