/**
 * Tests for document links handler
 */

import { handleDocumentLinks } from '../documentLinksHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { DocumentLinksProvider } from '../../providers';
import { DocumentLinkParams, DocumentLink } from 'vscode-languageserver/node';
import { IProtoParser } from '../../core/parserFactory';
import { ProtoFile } from '../../core/ast';

describe('DocumentLinksHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let documentLinksProvider: jest.Mocked<DocumentLinksProvider>;
  let parser: jest.Mocked<IProtoParser>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    documentLinksProvider = {
      getDocumentLinks: jest.fn(),
    } as any;
    parser = {
      parse: jest.fn(),
    } as any;
  });

  it('should return empty array when document not found', () => {
    const params: DocumentLinkParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
    };

    documents.get.mockReturnValue(undefined);

    const result = handleDocumentLinks(params, documents, documentLinksProvider, parser);
    expect(result).toEqual([]);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('should return empty array when parser throws', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: DocumentLinkParams = {
      textDocument: { uri },
    };

    parser.parse.mockImplementation(() => {
      throw new Error('Parse error');
    });

    const result = handleDocumentLinks(params, documents, documentLinksProvider, parser);
    expect(result).toEqual([]);
  });

  it('should return document links from provider', () => {
    const content = 'syntax = "proto3";\nimport "google/protobuf/timestamp.proto";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: DocumentLinkParams = {
      textDocument: { uri },
    };

    const parsedFile = {
      messages: [],
      enums: [],
      extends: [],
      imports: [{ path: 'google/protobuf/timestamp.proto' }],
      syntax: 'proto3',
      type: 'file',
      options: undefined,
      services: [],
      range: undefined,
    } as unknown as ProtoFile;
    parser.parse.mockReturnValue(parsedFile);

    const documentLinks: DocumentLink[] = [
      {
        range: { start: { line: 1, character: 7 }, end: { line: 1, character: 40 } },
        target: 'file:///path/to/timestamp.proto',
      },
    ];
    documentLinksProvider.getDocumentLinks.mockReturnValue(documentLinks);

    const result = handleDocumentLinks(params, documents, documentLinksProvider, parser);

    expect(parser.parse).toHaveBeenCalledWith(content, uri);
    expect(documentLinksProvider.getDocumentLinks).toHaveBeenCalledWith(uri, parsedFile);
    expect(result).toEqual(documentLinks);
  });

  it('should return empty array when provider returns no document links', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: DocumentLinkParams = {
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
    documentLinksProvider.getDocumentLinks.mockReturnValue([]);

    const result = handleDocumentLinks(params, documents, documentLinksProvider, parser);

    expect(result).toEqual([]);
  });
});
