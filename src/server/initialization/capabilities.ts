/**
 * Server capabilities configuration
 */

import type {
  InitializeResult,
  SemanticTokensOptions
} from 'vscode-languageserver/node';
import {
  TextDocumentSyncKind
} from 'vscode-languageserver/node';

import { semanticTokensLegend } from '../providers/semanticTokens';

/**
 * Server capabilities returned during initialization
 */
export function getServerCapabilities(): InitializeResult {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '"', '<', ' ']
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      foldingRangeProvider: true,
      renameProvider: {
        prepareProvider: true
      },
      inlayHintProvider: true,
      codeActionProvider: {
        codeActionKinds: [
          'quickfix',
          'refactor',
          'refactor.extract',
          'refactor.rewrite',
          'source',
          'source.fixAll',
          'source.organizeImports'
        ]
      },
      codeLensProvider: {
        resolveProvider: false
      },
      documentLinkProvider: {
        resolveProvider: false
      },
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        full: true,
        range: false
      } as SemanticTokensOptions
    }
  };
}
