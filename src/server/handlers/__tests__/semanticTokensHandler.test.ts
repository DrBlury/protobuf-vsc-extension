/**
 * Tests for semantic tokens handler
 */

import { handleSemanticTokensFull } from '../semanticTokensHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokensProvider } from '../../providers';
import { SemanticTokensParams } from 'vscode-languageserver/node';

describe('SemanticTokensHandler', () => {
  let semanticTokensProvider: jest.Mocked<SemanticTokensProvider>;
  let getDocumentMock: jest.Mock;

  beforeEach(() => {
    semanticTokensProvider = {
      getSemanticTokens: jest.fn(),
    } as any;
    getDocumentMock = jest.fn();
  });

  it('should return empty tokens in textmate mode', () => {
    const params: SemanticTokensParams = {
      textDocument: { uri: 'file:///test.proto' },
    };

    const result = handleSemanticTokensFull(params, semanticTokensProvider, getDocumentMock as any, 'textmate');
    expect(result).toEqual({ data: [] });
    expect(semanticTokensProvider.getSemanticTokens).not.toHaveBeenCalled();
  });

  it('should return empty tokens when document not found', () => {
    const params: SemanticTokensParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
    };

    getDocumentMock.mockReturnValue(undefined);

    const result = handleSemanticTokensFull(params, semanticTokensProvider, getDocumentMock as any, 'hybrid');
    expect(result).toEqual({ data: [] });
    expect(semanticTokensProvider.getSemanticTokens).not.toHaveBeenCalled();
  });

  it('should return semantic tokens from provider', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    getDocumentMock.mockReturnValue(doc);

    const params: SemanticTokensParams = {
      textDocument: { uri },
    };

    const tokens = { data: [0, 0, 7, 1, 0, 0, 0, 14, 1, 0] };
    semanticTokensProvider.getSemanticTokens.mockReturnValue(tokens);

    const result = handleSemanticTokensFull(params, semanticTokensProvider, getDocumentMock as any, 'hybrid');

    expect(semanticTokensProvider.getSemanticTokens).toHaveBeenCalledWith(uri, content, 'hybrid');
    expect(result).toEqual(tokens);
  });

  it('should use hybrid mode by default', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    getDocumentMock.mockReturnValue(doc);

    const params: SemanticTokensParams = {
      textDocument: { uri },
    };

    const tokens = { data: [0, 0, 7, 1, 0] };
    semanticTokensProvider.getSemanticTokens.mockReturnValue(tokens);

    handleSemanticTokensFull(params, semanticTokensProvider, getDocumentMock as any);

    expect(semanticTokensProvider.getSemanticTokens).toHaveBeenCalledWith(uri, content, 'hybrid');
  });

  it('should return empty tokens in semantic mode', () => {
    const params: SemanticTokensParams = {
      textDocument: { uri: 'file:///test.proto' },
    };

    const result = handleSemanticTokensFull(params, semanticTokensProvider, getDocumentMock as any, 'semantic');
    expect(result).toEqual({ data: [] });
  });
});
