/**
 * Tests for inlay hints handler
 */

import { handleInlayHints, initializeInlayHintsProvider } from '../inlayHintsHandler';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments, InlayHintParams } from 'vscode-languageserver/node';
import { ParserFactory } from '../../core/parserFactory';
import { ProtoFile, Range } from '../../core/ast';

// Helper to create a valid range
function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar }
  };
}

// Helper to create a minimal valid ProtoFile
function createProtoFile(overrides: Partial<ProtoFile> = {}): ProtoFile {
  return {
    type: 'file',
    range: createRange(0, 0, 10, 0),
    messages: [],
    enums: [],
    imports: [],
    services: [],
    extends: [],
    options: [],
    ...overrides
  };
}

describe('InlayHintsHandler', () => {
  let documents: jest.Mocked<TextDocuments<TextDocument>>;
  let parser: jest.Mocked<ParserFactory>;

  beforeEach(() => {
    documents = {
      get: jest.fn()
    } as any;
    parser = {
      parse: jest.fn()
    } as any;
  });

  describe('initializeInlayHintsProvider', () => {
    it('should initialize provider with default settings', () => {
      expect(() => initializeInlayHintsProvider()).not.toThrow();
    });

    it('should initialize provider with custom settings', () => {
      expect(() => initializeInlayHintsProvider({
        showFieldNumbers: false,
        showEnumValues: true,
        showDefaults: false
      })).not.toThrow();
    });

    it('should initialize provider with partial settings', () => {
      expect(() => initializeInlayHintsProvider({
        showFieldNumbers: false
      })).not.toThrow();
    });
  });

  describe('handleInlayHints', () => {
    it('should return null when document not found', () => {
      const params: InlayHintParams = {
        textDocument: { uri: 'file:///nonexistent.proto' },
        range: createRange(0, 0, 10, 0)
      };

      documents.get.mockReturnValue(undefined);

      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeNull();
      expect(parser.parse).not.toHaveBeenCalled();
    });

    it('should return null when parser returns null', () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      parser.parse.mockReturnValue(null as unknown as any);

      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeNull();
    });

    it('should return inlay hints from provider', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  string name = 1;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'name',
            fieldType: 'string',
            fieldTypeRange: createRange(2, 2, 2, 8),
            number: 1,
            nameRange: createRange(2, 9, 2, 13),
            range: createRange(2, 2, 2, 17)
          }],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      // Initialize provider first
      initializeInlayHintsProvider();

      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should initialize provider lazily if not initialized', () => {
      const content = 'syntax = "proto3";\nmessage Test {}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile();
      parser.parse.mockReturnValue(parsedFile);

      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle parsed file with enum definitions', () => {
      const content = 'syntax = "proto3";\nenum Status {\n  UNKNOWN = 0;\n  ACTIVE = 1001;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        enums: [{
          type: 'enum',
          name: 'Status',
          nameRange: createRange(1, 5, 1, 11),
          range: createRange(1, 0, 4, 1),
          values: [
            {
              type: 'enum_value',
              name: 'UNKNOWN',
              number: 0,
              nameRange: createRange(2, 2, 2, 9),
              range: createRange(2, 2, 2, 13)
            },
            {
              type: 'enum_value',
              name: 'ACTIVE',
              number: 1001,
              nameRange: createRange(3, 2, 3, 8),
              range: createRange(3, 2, 3, 15)
            }
          ],
          options: [],
          reserved: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showEnumValues: true });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should have hint for ACTIVE (> 1000)
      const activeHint = result?.find(h => 
        typeof h.label === 'string' && h.label.includes('0x3E9')
      );
      expect(activeHint).toBeDefined();
    });

    it('should handle parsed file with extends', () => {
      const content = 'syntax = "proto2";\nextend google.protobuf.MessageOptions {\n  optional string custom = 50001;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto2',
          range: createRange(0, 0, 0, 18)
        },
        extends: [{
          type: 'extend',
          extendType: 'google.protobuf.MessageOptions',
          extendTypeRange: createRange(1, 7, 1, 39),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'custom',
            fieldType: 'string',
            fieldTypeRange: createRange(2, 11, 2, 17),
            number: 50001,
            modifier: 'optional',
            nameRange: createRange(2, 18, 2, 24),
            range: createRange(2, 2, 2, 33)
          }],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle nested messages', () => {
      const content = 'syntax = "proto3";\nmessage Outer {\n  message Inner {\n    string name = 1;\n  }\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Outer',
          nameRange: createRange(1, 8, 1, 13),
          range: createRange(1, 0, 5, 1),
          fields: [],
          nestedEnums: [],
          nestedMessages: [{
            type: 'message',
            name: 'Inner',
            nameRange: createRange(2, 10, 2, 15),
            range: createRange(2, 2, 4, 3),
            fields: [{
              type: 'field',
              name: 'name',
              fieldType: 'string',
              fieldTypeRange: createRange(3, 4, 3, 10),
              number: 1,
              nameRange: createRange(3, 11, 3, 15),
              range: createRange(3, 4, 3, 19)
            }],
            nestedEnums: [],
            nestedMessages: [],
            oneofs: [],
            options: [],
            maps: [],
            reserved: [],
            extensions: [],
            groups: []
          }],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle fields with default values in proto2', () => {
      const content = 'syntax = "proto2";\nmessage Test {\n  optional string name = 1 [default = "test"];\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto2',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'name',
            fieldType: 'string',
            fieldTypeRange: createRange(2, 11, 2, 17),
            number: 1,
            modifier: 'optional',
            options: [{ 
              type: 'field_option',
              name: 'default', 
              value: 'test',
              range: createRange(2, 28, 2, 44)
            }],
            nameRange: createRange(2, 18, 2, 22),
            range: createRange(2, 2, 2, 46)
          }],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showDefaults: true });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle map fields', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  map<string, int32> values = 1;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [{
            type: 'map',
            name: 'values',
            keyType: 'string',
            valueType: 'int32',
            valueTypeRange: createRange(2, 14, 2, 19),
            number: 1,
            nameRange: createRange(2, 21, 2, 27),
            range: createRange(2, 2, 2, 31)
          }],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle negative enum values', () => {
      const content = 'syntax = "proto3";\nenum Status {\n  NEGATIVE = -1001;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        enums: [{
          type: 'enum',
          name: 'Status',
          nameRange: createRange(1, 5, 1, 11),
          range: createRange(1, 0, 3, 1),
          values: [
            {
              type: 'enum_value',
              name: 'NEGATIVE',
              number: -1001,
              nameRange: createRange(2, 2, 2, 10),
              range: createRange(2, 2, 2, 18)
            }
          ],
          options: [],
          reserved: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showEnumValues: true });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should have hint for negative value
      const negativeHint = result?.find(h => 
        typeof h.label === 'string' && h.label.includes('-0x3E9')
      );
      expect(negativeHint).toBeDefined();
    });

    it('should handle nested enums inside messages', () => {
      // Note: The InlayHintsProvider looks for `message.enums` but the AST has `nestedEnums`
      // This is a known limitation - nested enums don't get processed for hints
      const content = 'syntax = "proto3";\nmessage Outer {\n  enum Status {\n    UNKNOWN = 0;\n    ACTIVE = 2000;\n  }\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Outer',
          nameRange: createRange(1, 8, 1, 13),
          range: createRange(1, 0, 6, 1),
          fields: [],
          nestedEnums: [{
            type: 'enum',
            name: 'Status',
            nameRange: createRange(2, 7, 2, 13),
            range: createRange(2, 2, 5, 3),
            values: [
              {
                type: 'enum_value',
                name: 'UNKNOWN',
                number: 0,
                nameRange: createRange(3, 4, 3, 11),
                range: createRange(3, 4, 3, 15)
              },
              {
                type: 'enum_value',
                name: 'ACTIVE',
                number: 2000,
                nameRange: createRange(4, 4, 4, 10),
                range: createRange(4, 4, 4, 18)
              }
            ],
            options: [],
            reserved: []
          }],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showEnumValues: true });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Currently nested enums aren't processed due to AST type mismatch
      // The provider looks for `enums` but AST has `nestedEnums`
    });

    it('should handle fields without nameRange', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  string name = 1;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'name',
            fieldType: 'string',
            fieldTypeRange: createRange(2, 2, 2, 8),
            number: 1,
            // @ts-expect-error - Testing missing nameRange
            nameRange: undefined,
            range: createRange(2, 2, 2, 17)
          }],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result?.length).toBe(0);
    });

    it('should handle enum values without nameRange', () => {
      const content = 'syntax = "proto3";\nenum Status {\n  ACTIVE = 1001;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        enums: [{
          type: 'enum',
          name: 'Status',
          nameRange: createRange(1, 5, 1, 11),
          range: createRange(1, 0, 3, 1),
          values: [
            {
              type: 'enum_value',
              name: 'ACTIVE',
              number: 1001,
              // @ts-expect-error - Testing missing nameRange
              nameRange: undefined,
              range: createRange(2, 2, 2, 15)
            }
          ],
          options: [],
          reserved: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showEnumValues: true });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should skip the value without nameRange
      expect(result?.length).toBe(0);
    });

    it('should skip hints when showFieldNumbers and showDefaults are both false', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  string name = 1;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'name',
            fieldType: 'string',
            fieldTypeRange: createRange(2, 2, 2, 8),
            number: 1,
            nameRange: createRange(2, 9, 2, 13),
            range: createRange(2, 2, 2, 17)
          }],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showFieldNumbers: false, showDefaults: false });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should skip hints when showEnumValues is false', () => {
      const content = 'syntax = "proto3";\nenum Status {\n  ACTIVE = 1001;\n}';
      const uri = 'file:///test.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        enums: [{
          type: 'enum',
          name: 'Status',
          nameRange: createRange(1, 5, 1, 11),
          range: createRange(1, 0, 3, 1),
          values: [
            {
              type: 'enum_value',
              name: 'ACTIVE',
              number: 1001,
              nameRange: createRange(2, 2, 2, 8),
              range: createRange(2, 2, 2, 15)
            }
          ],
          options: [],
          reserved: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider({ showEnumValues: false });
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should have no hints since showEnumValues is false
      expect(result?.length).toBe(0);
    });

    it('should use default provider when not initialized (branch coverage)', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  int32 id = 1 [default = 0];\n}';
      const uri = 'file:///test2.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 3, 1),
          fields: [{
            type: 'field',
            name: 'id',
            fieldType: 'int32',
            fieldTypeRange: createRange(2, 2, 2, 7),
            number: 1,
            nameRange: createRange(2, 9, 2, 11),
            range: createRange(2, 2, 2, 26),
            options: [{
              type: 'field_option',
              name: 'default',
              value: 0,
              range: createRange(2, 18, 2, 26)
            }]
          }],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty file', () => {
      const content = '';
      const uri = 'file:///empty.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 0, 0)
      };

      const parsedFile = createProtoFile();
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle file with only syntax', () => {
      const content = 'syntax = "proto3";';
      const uri = 'file:///syntax.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 1, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        }
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle services with rpc methods', () => {
      const content = 'syntax = "proto3";\nservice MyService {\n  rpc Method(Request) returns (Response);\n}\nmessage Request {}\nmessage Response {}';
      const uri = 'file:///service.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        services: [{
          type: 'service',
          name: 'MyService',
          nameRange: createRange(1, 8, 1, 17),
          range: createRange(1, 0, 3, 1),
          rpcs: [],
          options: []
        }],
        messages: [
          {
            type: 'message',
            name: 'Request',
            nameRange: createRange(4, 8, 4, 15),
            range: createRange(4, 0, 4, 17),
            fields: [],
            nestedEnums: [],
            nestedMessages: [],
            oneofs: [],
            options: [],
            maps: [],
            reserved: [],
            extensions: [],
            groups: []
          },
          {
            type: 'message',
            name: 'Response',
            nameRange: createRange(5, 8, 5, 16),
            range: createRange(5, 0, 5, 17),
            fields: [],
            nestedEnums: [],
            nestedMessages: [],
            oneofs: [],
            options: [],
            maps: [],
            reserved: [],
            extensions: [],
            groups: []
          }
        ]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle oneof fields', () => {
      const content = 'syntax = "proto3";\nmessage Test {\n  oneof choice {\n    string option_a = 1;\n    int32 option_b = 2;\n  }\n}';
      const uri = 'file:///oneof.proto';
      const doc = TextDocument.create(uri, 'proto', 1, content);
      documents.get.mockReturnValue(doc);

      const params: InlayHintParams = {
        textDocument: { uri },
        range: createRange(0, 0, 10, 0)
      };

      const parsedFile = createProtoFile({
        syntax: {
          type: 'syntax',
          version: 'proto3',
          range: createRange(0, 0, 0, 18)
        },
        messages: [{
          type: 'message',
          name: 'Test',
          nameRange: createRange(1, 8, 1, 12),
          range: createRange(1, 0, 6, 1),
          fields: [],
          nestedEnums: [],
          nestedMessages: [],
          oneofs: [{
            type: 'oneof',
            name: 'choice',
            nameRange: createRange(2, 7, 2, 13),
            range: createRange(2, 2, 5, 3),
            fields: [
              {
                type: 'field',
                name: 'option_a',
                fieldType: 'string',
                fieldTypeRange: createRange(3, 14, 3, 20),
                number: 1,
                nameRange: createRange(3, 22, 3, 31),
                range: createRange(3, 4, 3, 33)
              },
              {
                type: 'field',
                name: 'option_b',
                fieldType: 'int32',
                fieldTypeRange: createRange(4, 14, 4, 19),
                number: 2,
                nameRange: createRange(4, 22, 4, 31),
                range: createRange(4, 4, 4, 33)
              }
            ]
          }],
          options: [],
          maps: [],
          reserved: [],
          extensions: [],
          groups: []
        }]
      });
      parser.parse.mockReturnValue(parsedFile);

      initializeInlayHintsProvider();
      const result = handleInlayHints(params, documents, parser);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
