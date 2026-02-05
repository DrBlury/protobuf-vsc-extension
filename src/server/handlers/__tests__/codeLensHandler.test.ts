/**
 * Tests for code lens handler
 */

import { handleCodeLens } from '../codeLensHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { CodeLensProvider } from '../../providers';
import { CodeLensParams } from 'vscode-languageserver/node';
import { IProtoParser } from '../../core/parserFactory';
import { ProtoFile } from '../../core/ast';

describe('CodeLensHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let codeLensProvider: jest.Mocked<CodeLensProvider>;
  let parser: jest.Mocked<IProtoParser>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    codeLensProvider = {
      getCodeLenses: jest.fn(),
    } as any;
    parser = {
      parse: jest.fn(),
    } as any;
  });

  it('should return empty array when document not found', () => {
    const params: CodeLensParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
    };

    documents.get.mockReturnValue(undefined);

    const result = handleCodeLens(params, documents, codeLensProvider, parser);
    expect(result).toEqual([]);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('should return empty array when parser throws', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: CodeLensParams = {
      textDocument: { uri },
    };

    parser.parse.mockImplementation(() => {
      throw new Error('Parse error');
    });

    const result = handleCodeLens(params, documents, codeLensProvider, parser);
    expect(result).toEqual([]);
  });

  it('should return code lenses from provider', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: CodeLensParams = {
      textDocument: { uri },
    };

    const parsedFile = {
      messages: [],
      enums: [],
      extends: [],
      imports: [],
      syntax: 'proto3',
      type: 'file',
      options: undefined,
      services: [],
      range: undefined,
    } as unknown as ProtoFile;
    parser.parse.mockReturnValue(parsedFile);

    const codeLenses = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 13 } } }];
    codeLensProvider.getCodeLenses.mockReturnValue(codeLenses as any);

    const result = handleCodeLens(params, documents, codeLensProvider, parser);

    expect(parser.parse).toHaveBeenCalledWith(content, uri);
    expect(codeLensProvider.getCodeLenses).toHaveBeenCalledWith(uri, parsedFile);
    expect(result).toEqual(codeLenses);
  });

  it('should return empty array when provider returns no code lenses', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: CodeLensParams = {
      textDocument: { uri },
    };

    const parsedFile = {
      messages: [],
      enums: [],
      extends: [],
      imports: [],
      syntax: 'proto3',
      type: 'file',
      options: undefined,
      services: [],
      range: undefined,
    } as unknown as ProtoFile;
    parser.parse.mockReturnValue(parsedFile);
    codeLensProvider.getCodeLenses.mockReturnValue([]);

    const result = handleCodeLens(params, documents, codeLensProvider, parser);

    expect(result).toEqual([]);
  });
});
