/**
 * Server capabilities configuration
 */

import {
  InitializeResult,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';

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
      }
    }
  };
}
