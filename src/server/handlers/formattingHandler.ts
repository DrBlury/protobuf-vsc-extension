/**
 * Formatting Handler
 * Handles document formatting requests
 */

import type {
  DocumentFormattingParams,
  DocumentRangeFormattingParams,
  TextEdit
} from 'vscode-languageserver/node';

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { ProtoFormatter } from '../providers/formatter';
import type { Settings } from '../utils/types';

/**
 * Handle document formatting request
 */
export async function handleDocumentFormatting(
  params: DocumentFormattingParams,
  documents: TextDocuments<TextDocument>,
  formatterProvider: ProtoFormatter,
  settings: Settings
): Promise<TextEdit[]> {
  if (!settings.protobuf.formatter.enabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return formatterProvider.formatDocument(document.getText(), params.textDocument.uri);
}

/**
 * Handle document range formatting request
 */
export async function handleRangeFormatting(
  params: DocumentRangeFormattingParams,
  documents: TextDocuments<TextDocument>,
  formatterProvider: ProtoFormatter,
  settings: Settings
): Promise<TextEdit[]> {
  if (!settings.protobuf.formatter.enabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return formatterProvider.formatRange(
    document.getText(),
    params.range,
    params.textDocument.uri
  );
}
