/**
 * Handler for textDocument/inlayHint requests
 */

import type { InlayHint, InlayHintParams, TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { InlayHintsSettings } from '../providers/inlayHints';
import { InlayHintsProvider } from '../providers/inlayHints';
import type { ParserFactory } from '../core/parserFactory';

let provider: InlayHintsProvider | null = null;

/**
 * Initialize the inlay hints provider with settings
 */
export function initializeInlayHintsProvider(settings?: Partial<InlayHintsSettings>): void {
  provider = new InlayHintsProvider(settings);
}

/**
 * Handle inlay hints request
 */
export function handleInlayHints(
  params: InlayHintParams,
  documents: TextDocuments<TextDocument>,
  parser: ParserFactory
): InlayHint[] | null {
  const uri = params.textDocument.uri;

  // Get document content
  const document = documents.get(uri);
  if (!document) {
    return null;
  }

  // Parse the document
  const content = document.getText();
  const parseResult = parser.parse(content, uri);
  if (!parseResult) {
    return null;
  }

  // Initialize provider if needed
  if (!provider) {
    provider = new InlayHintsProvider();
  }

  // Get lines for position calculations
  const lines = content.split('\n');

  // Get hints
  return provider.getInlayHints(parseResult, lines);
}
