/**
 * Tests for completion handler
 */

import { handleCompletion } from '../completionHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { CompletionProvider } from '../../providers/completion';
import { TextDocumentPositionParams } from 'vscode-languageserver/node';

describe('CompletionHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let completionProvider: jest.Mocked<CompletionProvider>;

  beforeEach(() => {
    documents = {
      get: jest.fn()
    } as any;
    completionProvider = {
      getCompletions: jest.fn()
    } as any;
  });

  it('should return empty array when document not found', () => {
    const params: TextDocumentPositionParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
      position: { line: 0, character: 0 }
    };

    documents.get.mockReturnValue(undefined);

    const result = handleCompletion(params, documents, completionProvider);
    expect(result).toEqual([]);
    expect(completionProvider.getCompletions).not.toHaveBeenCalled();
  });

  it('should call completion provider with correct parameters', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line: 1, character: 10 }
    };

    completionProvider.getCompletions.mockReturnValue([]);

    handleCompletion(params, documents, completionProvider);

    expect(completionProvider.getCompletions).toHaveBeenCalledWith(
      uri,
      params.position,
      'message Test {}',
      undefined,
      content
    );
  });

  it('should handle empty line', () => {
    const content = 'syntax = "proto3";\n\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line: 1, character: 0 }
    };

    completionProvider.getCompletions.mockReturnValue([]);

    handleCompletion(params, documents, completionProvider);

    expect(completionProvider.getCompletions).toHaveBeenCalledWith(
      uri,
      params.position,
      '',
      undefined,
      content
    );
  });

  it('should handle position beyond document lines', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line: 10, character: 0 }
    };

    completionProvider.getCompletions.mockReturnValue([]);

    handleCompletion(params, documents, completionProvider);

    expect(completionProvider.getCompletions).toHaveBeenCalledWith(
      uri,
      params.position,
      '',
      undefined,
      content
    );
  });

  it('should return completion items from provider', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line: 0, character: 0 }
    };

    const completions = [
      { label: 'message', kind: 1 },
      { label: 'enum', kind: 1 }
    ];

    completionProvider.getCompletions.mockReturnValue(completions as any);

    const result = handleCompletion(params, documents, completionProvider);

    expect(result).toEqual(completions);
  });
});
