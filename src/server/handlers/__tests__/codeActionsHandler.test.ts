/**
 * Tests for code actions handler
 */

import { handleCodeActions } from '../codeActionsHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { CodeActionsProvider } from '../../providers';
import { CodeActionParams } from 'vscode-languageserver/node';

describe('CodeActionsHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let codeActionsProvider: jest.Mocked<CodeActionsProvider>;

  beforeEach(() => {
    documents = {
      get: jest.fn()
    } as any;
    codeActionsProvider = {
      getCodeActions: jest.fn()
    } as any;
  });

  it('should return empty array when document not found', () => {
    const params: CodeActionParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      context: { diagnostics: [] }
    };

    documents.get.mockReturnValue(undefined);

    const result = handleCodeActions(params, documents, codeActionsProvider);
    expect(result).toEqual([]);
    expect(codeActionsProvider.getCodeActions).not.toHaveBeenCalled();
  });

  it('should call code actions provider with correct parameters', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: CodeActionParams = {
      textDocument: { uri },
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 13 } },
      context: { diagnostics: [] }
    };

    const codeActions = [{ title: 'Test Action', command: { command: 'test', title: 'Test Action' } }];
    codeActionsProvider.getCodeActions.mockReturnValue(codeActions as any);

    const result = handleCodeActions(params, documents, codeActionsProvider);

    expect(codeActionsProvider.getCodeActions).toHaveBeenCalledWith(
      uri,
      params.range,
      params.context,
      content
    );
    expect(result).toEqual(codeActions);
  });

  it('should return empty array when provider returns no code actions', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: CodeActionParams = {
      textDocument: { uri },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
      context: { diagnostics: [] }
    };

    codeActionsProvider.getCodeActions.mockReturnValue([]);

    const result = handleCodeActions(params, documents, codeActionsProvider);

    expect(result).toEqual([]);
  });
});
