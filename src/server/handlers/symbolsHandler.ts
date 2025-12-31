/**
 * Symbols Handler
 * Handles document and workspace symbol requests
 */

import type {
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  DocumentSymbol,
  SymbolInformation
} from 'vscode-languageserver/node';

import type { SymbolProvider } from '../providers/symbols';

/**
 * Handle document symbol request
 */
export function handleDocumentSymbols(
  params: DocumentSymbolParams,
  symbolsProvider: SymbolProvider
): DocumentSymbol[] {
  return symbolsProvider.getDocumentSymbols(params.textDocument.uri);
}

/**
 * Handle workspace symbol request
 */
export function handleWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  symbolsProvider: SymbolProvider
): SymbolInformation[] {
  return symbolsProvider.getWorkspaceSymbols(params.query);
}
