/**
 * Tests for references handler
 */

import { handleReferences } from '../referencesHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { ReferencesProvider } from '../../providers';
import { ReferenceParams, Location } from 'vscode-languageserver/node';

describe('ReferencesHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let referencesProvider: jest.Mocked<ReferencesProvider>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    referencesProvider = {
      findReferences: jest.fn(),
    } as any;
  });

  it('should return empty array when document not found', () => {
    const params: ReferenceParams = {
      textDocument: { uri: 'file:///nonexistent.proto' },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: true },
    };

    documents.get.mockReturnValue(undefined);

    const result = handleReferences(params, documents, referencesProvider);
    expect(result).toEqual([]);
    expect(referencesProvider.findReferences).not.toHaveBeenCalled();
  });

  it('should return references from provider', () => {
    const content = 'syntax = "proto3";\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: ReferenceParams = {
      textDocument: { uri },
      position: { line: 1, character: 10 },
      context: { includeDeclaration: true },
    };

    const locations: Location[] = [
      Location.create(uri, { start: { line: 1, character: 8 }, end: { line: 1, character: 12 } }),
    ];
    referencesProvider.findReferences.mockReturnValue(locations);

    const result = handleReferences(params, documents, referencesProvider);

    expect(referencesProvider.findReferences).toHaveBeenCalledWith(uri, params.position, 'message Test {}', true);
    expect(result).toEqual(locations);
  });

  it('should pass includeDeclaration=false to provider', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: ReferenceParams = {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: false },
    };

    referencesProvider.findReferences.mockReturnValue([]);

    handleReferences(params, documents, referencesProvider);

    expect(referencesProvider.findReferences).toHaveBeenCalledWith(uri, params.position, 'syntax = "proto3";', false);
  });

  it('should handle position beyond document lines', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: ReferenceParams = {
      textDocument: { uri },
      position: { line: 10, character: 0 },
      context: { includeDeclaration: true },
    };

    referencesProvider.findReferences.mockReturnValue([]);

    const result = handleReferences(params, documents, referencesProvider);

    expect(referencesProvider.findReferences).toHaveBeenCalledWith(uri, params.position, '', true);
    expect(result).toEqual([]);
  });

  it('should handle empty line', () => {
    const content = 'syntax = "proto3";\n\nmessage Test {}';
    const uri = 'file:///test.proto';
    const doc = TextDocument.create(uri, 'proto', 1, content);
    documents.get.mockReturnValue(doc);

    const params: ReferenceParams = {
      textDocument: { uri },
      position: { line: 1, character: 0 },
      context: { includeDeclaration: true },
    };

    referencesProvider.findReferences.mockReturnValue([]);

    const result = handleReferences(params, documents, referencesProvider);

    expect(referencesProvider.findReferences).toHaveBeenCalledWith(uri, params.position, '', true);
    expect(result).toEqual([]);
  });
});
