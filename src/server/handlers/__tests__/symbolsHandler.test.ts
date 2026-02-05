/**
 * Tests for symbols handler
 */

import { handleDocumentSymbols, handleWorkspaceSymbols } from '../symbolsHandler';
import { SymbolProvider } from '../../providers';
import {
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  DocumentSymbol,
  SymbolInformation,
} from 'vscode-languageserver/node';

describe('SymbolsHandler', () => {
  let symbolsProvider: jest.Mocked<SymbolProvider>;

  beforeEach(() => {
    symbolsProvider = {
      getDocumentSymbols: jest.fn(),
      getWorkspaceSymbols: jest.fn(),
    } as any;
  });

  describe('handleDocumentSymbols', () => {
    it('should return document symbols from provider', () => {
      const params: DocumentSymbolParams = {
        textDocument: { uri: 'file:///test.proto' },
      };

      const symbols: DocumentSymbol[] = [
        {
          name: 'Test',
          kind: 11,
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          selectionRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
        },
      ];
      symbolsProvider.getDocumentSymbols.mockReturnValue(symbols);

      const result = handleDocumentSymbols(params, symbolsProvider);

      expect(symbolsProvider.getDocumentSymbols).toHaveBeenCalledWith('file:///test.proto');
      expect(result).toEqual(symbols);
    });

    it('should return empty array when provider returns no symbols', () => {
      const params: DocumentSymbolParams = {
        textDocument: { uri: 'file:///test.proto' },
      };

      symbolsProvider.getDocumentSymbols.mockReturnValue([]);

      const result = handleDocumentSymbols(params, symbolsProvider);

      expect(result).toEqual([]);
    });
  });

  describe('handleWorkspaceSymbols', () => {
    it('should return workspace symbols from provider', () => {
      const params: WorkspaceSymbolParams = {
        query: 'Test',
      };

      const symbols: SymbolInformation[] = [
        {
          name: 'Test',
          kind: 11,
          location: {
            uri: 'file:///test.proto',
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          },
        },
      ];
      symbolsProvider.getWorkspaceSymbols.mockReturnValue(symbols);

      const result = handleWorkspaceSymbols(params, symbolsProvider);

      expect(symbolsProvider.getWorkspaceSymbols).toHaveBeenCalledWith('Test');
      expect(result).toEqual(symbols);
    });

    it('should return empty array when provider returns no symbols', () => {
      const params: WorkspaceSymbolParams = {
        query: 'Nonexistent',
      };

      symbolsProvider.getWorkspaceSymbols.mockReturnValue([]);

      const result = handleWorkspaceSymbols(params, symbolsProvider);

      expect(result).toEqual([]);
    });

    it('should handle empty query', () => {
      const params: WorkspaceSymbolParams = {
        query: '',
      };

      symbolsProvider.getWorkspaceSymbols.mockReturnValue([]);

      handleWorkspaceSymbols(params, symbolsProvider);

      expect(symbolsProvider.getWorkspaceSymbols).toHaveBeenCalledWith('');
    });
  });
});
