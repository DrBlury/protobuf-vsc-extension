/**
 * Tests for server capabilities configuration
 */

import { getServerCapabilities } from '../capabilities';
import { TextDocumentSyncKind } from 'vscode-languageserver/node';

describe('Server Capabilities', () => {
  describe('getServerCapabilities', () => {
    it('should return InitializeResult with capabilities', () => {
      const result = getServerCapabilities();
      expect(result).toBeDefined();
      expect(result.capabilities).toBeDefined();
    });

    describe('text document sync', () => {
      it('should have incremental text document sync', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Incremental);
      });
    });

    describe('completion provider', () => {
      it('should have completion provider', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.completionProvider).toBeDefined();
      });

      it('should have trigger characters', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.completionProvider?.triggerCharacters).toEqual(['.', '"', '<', ' ']);
      });

      it('should not resolve completions', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.completionProvider?.resolveProvider).toBe(false);
      });
    });

    describe('hover provider', () => {
      it('should have hover provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.hoverProvider).toBe(true);
      });
    });

    describe('definition provider', () => {
      it('should have definition provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.definitionProvider).toBe(true);
      });
    });

    describe('references provider', () => {
      it('should have references provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.referencesProvider).toBe(true);
      });
    });

    describe('symbol providers', () => {
      it('should have document symbol provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.documentSymbolProvider).toBe(true);
      });

      it('should have workspace symbol provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.workspaceSymbolProvider).toBe(true);
      });
    });

    describe('formatting providers', () => {
      it('should have document formatting provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.documentFormattingProvider).toBe(true);
      });

      it('should have range formatting provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.documentRangeFormattingProvider).toBe(true);
      });
    });

    describe('folding range provider', () => {
      it('should have folding range provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.foldingRangeProvider).toBe(true);
      });
    });

    describe('rename provider', () => {
      it('should have rename provider with prepare support', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.renameProvider).toEqual({
          prepareProvider: true
        });
      });
    });

    describe('inlay hint provider', () => {
      it('should have inlay hint provider enabled', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.inlayHintProvider).toBe(true);
      });
    });

    describe('code action provider', () => {
      it('should have code action provider', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.codeActionProvider).toBeDefined();
      });

      it('should support all expected code action kinds', () => {
        const result = getServerCapabilities();
        const codeActionProvider = result.capabilities.codeActionProvider as { codeActionKinds: string[] };
        expect(codeActionProvider.codeActionKinds).toContain('quickfix');
        expect(codeActionProvider.codeActionKinds).toContain('refactor');
        expect(codeActionProvider.codeActionKinds).toContain('refactor.extract');
        expect(codeActionProvider.codeActionKinds).toContain('refactor.rewrite');
        expect(codeActionProvider.codeActionKinds).toContain('source');
        expect(codeActionProvider.codeActionKinds).toContain('source.fixAll');
        expect(codeActionProvider.codeActionKinds).toContain('source.organizeImports');
      });
    });

    describe('code lens provider', () => {
      it('should have code lens provider', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.codeLensProvider).toBeDefined();
      });

      it('should not resolve code lens', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.codeLensProvider?.resolveProvider).toBe(false);
      });
    });

    describe('document link provider', () => {
      it('should have document link provider', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.documentLinkProvider).toBeDefined();
      });

      it('should not resolve document links', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.documentLinkProvider?.resolveProvider).toBe(false);
      });
    });

    describe('semantic tokens provider', () => {
      it('should have semantic tokens provider', () => {
        const result = getServerCapabilities();
        expect(result.capabilities.semanticTokensProvider).toBeDefined();
      });

      it('should support full semantic tokens', () => {
        const result = getServerCapabilities();
        const semanticTokensProvider = result.capabilities.semanticTokensProvider as { full: boolean };
        expect(semanticTokensProvider.full).toBe(true);
      });

      it('should not support range semantic tokens', () => {
        const result = getServerCapabilities();
        const semanticTokensProvider = result.capabilities.semanticTokensProvider as { range: boolean };
        expect(semanticTokensProvider.range).toBe(false);
      });

      it('should have semantic tokens legend', () => {
        const result = getServerCapabilities();
        const semanticTokensProvider = result.capabilities.semanticTokensProvider as { legend: object };
        expect(semanticTokensProvider.legend).toBeDefined();
      });
    });
  });
});
