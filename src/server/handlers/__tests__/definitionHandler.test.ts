/**
 * Tests for definition handler
 */

import { handleDefinition, extractIdentifierAtPosition } from '../definitionHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';
import { DefinitionProvider } from '../../providers';
import { Location } from 'vscode-languageserver/node';
import type { DefinitionParams } from 'vscode-languageserver/node';
import { IProtoParser } from '../../core/parserFactory';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoFile } from '../../core/ast';
import { ContentHashCache } from '../../utils/cache';

describe('DefinitionHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let definitionProvider: jest.Mocked<DefinitionProvider>;
  let parser: jest.Mocked<IProtoParser>;
  let analyzer: jest.Mocked<SemanticAnalyzer>;
  let parsedFileCache: jest.Mocked<ContentHashCache<ProtoFile>>;

  beforeEach(() => {
    documents = {
      get: jest.fn(),
    } as any;
    definitionProvider = {
      getDefinition: jest.fn(),
    } as any;
    parser = {
      parse: jest.fn(),
    } as any;
    analyzer = {
      getAllSymbols: jest.fn().mockReturnValue([]),
      updateFile: jest.fn(),
    } as any;
    parsedFileCache = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;
  });

  describe('extractIdentifierAtPosition', () => {
    it('should extract simple identifier', () => {
      const line = 'message TestMessage {';
      const result = extractIdentifierAtPosition(line, 8);
      expect(result).toBe('TestMessage');
    });

    it('should extract keyword at start of line', () => {
      const line = 'message TestMessage {';
      const result = extractIdentifierAtPosition(line, 0);
      expect(result).toBe('message');
    });

    it('should return null for position on bracket', () => {
      const line = 'message TestMessage {';
      const result = extractIdentifierAtPosition(line, 20);
      expect(result).toBeNull();
    });

    it('should extract identifier with underscores', () => {
      const line = 'string my_field_name = 1;';
      const result = extractIdentifierAtPosition(line, 7);
      expect(result).toBe('my_field_name');
    });

    it('should extract fully qualified identifier', () => {
      const line = 'package.Message.SubMessage';
      const result = extractIdentifierAtPosition(line, 0);
      expect(result).toBe('package.Message.SubMessage');
    });

    it('should handle identifier at end of line', () => {
      const line = 'optional int32 field_name';
      const result = extractIdentifierAtPosition(line, 19);
      expect(result).toBe('field_name');
    });

    it('should return null for position after identifier', () => {
      const line = 'message Test {}';
      const result = extractIdentifierAtPosition(line, 13);
      expect(result).toBeNull();
    });

    it('should handle dot-separated identifier and strip trailing dots', () => {
      const line = 'package.Type.';
      const result = extractIdentifierAtPosition(line, 0);
      expect(result).toBe('package.Type');
    });

    it('should handle position at dot after identifier', () => {
      const line = 'package.Type.';
      const result = extractIdentifierAtPosition(line, 12);
      expect(result).toBe('package.Type');
    });
  });

  describe('handleDefinition', () => {
    it('should return null when document not found', () => {
      const params: DefinitionParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        position: { line: 0, character: 0 },
      };

      documents.get.mockReturnValue(undefined);

      const result = handleDefinition(params, documents, definitionProvider, parser, analyzer, parsedFileCache);
      expect(result).toBeNull();
      expect(definitionProvider.getDefinition).not.toHaveBeenCalled();
    });

    it('should return definition from provider', () => {
      const content = 'syntax = "proto3";\nmessage Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: DefinitionParams = {
        textDocument: { uri },
        position: { line: 1, character: 10 },
      };

      const location = Location.create(uri, { start: { line: 1, character: 0 }, end: { line: 1, character: 13 } });
      definitionProvider.getDefinition.mockReturnValue(location);

      const result = handleDefinition(params, documents, definitionProvider, parser, analyzer, parsedFileCache);

      expect(definitionProvider.getDefinition).toHaveBeenCalledWith(uri, params.position, 'message Test {}');
      expect(result).toEqual(location);
    });

    it('should handle position beyond document lines', () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: DefinitionParams = {
        textDocument: { uri },
        position: { line: 10, character: 0 },
      };

      definitionProvider.getDefinition.mockReturnValue(null);

      const result = handleDefinition(params, documents, definitionProvider, parser, analyzer, parsedFileCache);

      expect(definitionProvider.getDefinition).toHaveBeenCalledWith(uri, params.position, '');
      expect(result).toBeNull();
    });

    it('should handle array of locations', () => {
      const content = 'syntax = "proto3";\nmessage Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: DefinitionParams = {
        textDocument: { uri },
        position: { line: 1, character: 10 },
      };

      const locations = [
        Location.create(uri, { start: { line: 1, character: 0 }, end: { line: 1, character: 13 } }),
        Location.create(uri, { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }),
      ];
      definitionProvider.getDefinition.mockReturnValue(locations);

      const result = handleDefinition(params, documents, definitionProvider, parser, analyzer, parsedFileCache);

      expect(result).toEqual(locations);
    });
  });
});
