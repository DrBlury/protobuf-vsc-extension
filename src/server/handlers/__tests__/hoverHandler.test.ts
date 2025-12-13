/**
 * Tests for hover handler
 */

import { handleHover } from '../hoverHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { HoverProvider } from '../../providers/hover';
import { HoverParams } from 'vscode-languageserver/node';

describe('HoverHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let hoverProvider: jest.Mocked<HoverProvider>;

  beforeEach(() => {
    documents = {
      get: jest.fn()
    } as any;
    hoverProvider = {
      getHover: jest.fn()
    } as any;
  });

  it('should return null when document not found', () => {
    const params: HoverParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
      position: { line: 0, character: 0 }
    };

    documents.get.mockReturnValue(undefined);

    const result = handleHover(params, documents, hoverProvider);
    expect(result).toBeNull();
    expect(hoverProvider.getHover).not.toHaveBeenCalled();
  });

  it('should call hover provider with correct parameters', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: HoverParams = {
      textDocument: { uri },
      position: { line: 1, character: 10 }
    };

    hoverProvider.getHover.mockReturnValue(null);

    handleHover(params, documents, hoverProvider);

    expect(hoverProvider.getHover).toHaveBeenCalledWith(
      uri,
      params.position,
      'message Test {}'
    );
  });

  it('should handle empty line', () => {
    const content = 'syntax = "proto3";\n\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: HoverParams = {
      textDocument: { uri },
      position: { line: 1, character: 0 }
    };

    hoverProvider.getHover.mockReturnValue(null);

    handleHover(params, documents, hoverProvider);

    expect(hoverProvider.getHover).toHaveBeenCalledWith(
      uri,
      params.position,
      ''
    );
  });

  it('should handle position beyond document lines', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: HoverParams = {
      textDocument: { uri },
      position: { line: 10, character: 0 }
    };

    hoverProvider.getHover.mockReturnValue(null);

    handleHover(params, documents, hoverProvider);

    expect(hoverProvider.getHover).toHaveBeenCalledWith(
      uri,
      params.position,
      ''
    );
  });

  it('should return hover information from provider', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: HoverParams = {
      textDocument: { uri },
      position: { line: 0, character: 0 }
    };

    const hover = {
      contents: { value: 'Hover information' }
    };

    hoverProvider.getHover.mockReturnValue(hover as any);

    const result = handleHover(params, documents, hoverProvider);

    expect(result).toEqual(hover);
  });
});
