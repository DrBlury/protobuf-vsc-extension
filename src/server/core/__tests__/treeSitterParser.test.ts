/**
 * Tests for treeSitterParser.ts
 */

// We need to mock web-tree-sitter before importing the module
const mockParse = jest.fn();
const mockSetLanguage = jest.fn();

// Mock node interface
interface MockNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  children: MockNode[];
  fieldChildren: Record<string, MockNode>;
  child(index: number): MockNode | null;
  childForFieldName(name: string): MockNode | null;
  isMissing(): boolean;
  parent: MockNode | null;
}

function createMockNode(
  type: string,
  text: string,
  children: MockNode[] = [],
  fieldChildren: Record<string, MockNode> = {},
  startRow = 0,
  startCol = 0,
  endRow = 0,
  endCol = 10
): MockNode {
  const node: MockNode = {
    type,
    text,
    startPosition: { row: startRow, column: startCol },
    endPosition: { row: endRow, column: endCol },
    childCount: children.length,
    children,
    fieldChildren,
    child: (index: number) => children[index] || null,
    childForFieldName: (name: string) => fieldChildren[name] || null,
    isMissing: () => false,
    parent: null
  };
  return node;
}

// Mock tree structure
const mockRootNode = createMockNode('source_file', '', []);
const mockTree = { rootNode: mockRootNode };

// Mock Language.load
const mockLanguageLoad = jest.fn().mockResolvedValue({});
const mockParserInit = jest.fn().mockResolvedValue(undefined);

// The module uses: const TreeSitter = require('web-tree-sitter');
// Then: const TreeSitterParser = TreeSitter.Parser;
// And: TreeSitterParser.init() and new TreeSitterParser()
// And: TreeSitter.Language.load(path)
jest.mock('web-tree-sitter', () => {
  class MockParser {
    parse = mockParse;
    setLanguage = mockSetLanguage;
  }

  // Add static init method to the class
  (MockParser as any).init = mockParserInit;

  return {
    Parser: MockParser,
    Language: {
      load: mockLanguageLoad
    }
  };
});

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('treeSitterParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParse.mockReturnValue(mockTree);
  });

  describe('initTreeSitterParser', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should initialize the parser successfully', async () => {
      const { initTreeSitterParser } = require('../treeSitterParser');
      await initTreeSitterParser('/path/to/wasm');

      expect(mockLanguageLoad).toHaveBeenCalledWith('/path/to/wasm');
      expect(mockParserInit).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      const { initTreeSitterParser } = require('../treeSitterParser');
      await initTreeSitterParser('/path/to/wasm');
      await initTreeSitterParser('/path/to/wasm');

      // Should only be called once
      expect(mockLanguageLoad).toHaveBeenCalledTimes(1);
    });

    it('should throw error on initialization failure', async () => {
      mockLanguageLoad.mockRejectedValueOnce(new Error('Failed to load'));

      const { initTreeSitterParser } = require('../treeSitterParser');
      await expect(initTreeSitterParser('/path/to/wasm')).rejects.toThrow('Failed to load');
    });
  });

  describe('isTreeSitterInitialized', () => {
    it('should return false before initialization', () => {
      jest.resetModules();
      const { isTreeSitterInitialized } = require('../treeSitterParser');
      expect(isTreeSitterInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      jest.resetModules();
      const { initTreeSitterParser, isTreeSitterInitialized } = require('../treeSitterParser');
      await initTreeSitterParser('/path/to/wasm');

      expect(isTreeSitterInitialized()).toBe(true);
    });
  });

  describe('TreeSitterProtoParser', () => {
    beforeEach(async () => {
      jest.resetModules();
      const { initTreeSitterParser } = require('../treeSitterParser');
      await initTreeSitterParser('/path/to/wasm');
    });

    describe('parse', () => {
      it('should parse empty proto file', async () => {
        const emptyRoot = createMockNode('source_file', '', []);
        mockParse.mockReturnValue({ rootNode: emptyRoot });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('', 'test.proto');

        expect(result.type).toBe('file');
        expect(result.imports).toEqual([]);
        expect(result.messages).toEqual([]);
        expect(result.enums).toEqual([]);
        expect(result.services).toEqual([]);
      });

      it('should throw error if parse returns null', async () => {
        mockParse.mockReturnValue(null);

        const { treeSitterParser } = require('../treeSitterParser');
        expect(() => treeSitterParser.parse('syntax = "proto3";', 'test.proto')).toThrow('Failed to parse proto file');
      });

      it('should parse syntax statement proto3', async () => {
        const syntaxNode = createMockNode('syntax', 'syntax = "proto3";');
        const root = createMockNode('source_file', 'syntax = "proto3";', [syntaxNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('syntax = "proto3";', 'test.proto');

        expect(result.syntax).toBeDefined();
        expect(result.syntax?.version).toBe('proto3');
      });

      it('should parse proto2 syntax', async () => {
        const syntaxNode = createMockNode('syntax', 'syntax = "proto2";');
        const root = createMockNode('source_file', 'syntax = "proto2";', [syntaxNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('syntax = "proto2";', 'test.proto');

        expect(result.syntax).toBeDefined();
        expect(result.syntax?.version).toBe('proto2');
      });

      it('should parse edition statement', async () => {
        const editionNode = createMockNode('edition', 'edition = "2023";');
        const root = createMockNode('source_file', 'edition = "2023";', [editionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('edition = "2023";', 'test.proto');

        expect(result.edition).toBeDefined();
        expect(result.edition?.edition).toBe('2023');
      });

      it('should parse package statement', async () => {
        const nameNode = createMockNode('identifier', 'mypackage');
        const packageNode = createMockNode('package', 'package mypackage;', [], { name: nameNode });
        const root = createMockNode('source_file', 'package mypackage;', [packageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('package mypackage;', 'test.proto');

        expect(result.package).toBeDefined();
        expect(result.package?.name).toBe('mypackage');
      });

      it('should parse import statement', async () => {
        const importNode = createMockNode('import', 'import "other.proto";');
        const root = createMockNode('source_file', 'import "other.proto";', [importNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('import "other.proto";', 'test.proto');

        expect(result.imports).toHaveLength(1);
        expect(result.imports[0].path).toBe('other.proto');
        expect(result.imports[0].modifier).toBeUndefined();
      });

      it('should parse public import', async () => {
        const importNode = createMockNode('import', 'import public "other.proto";');
        const root = createMockNode('source_file', 'import public "other.proto";', [importNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('import public "other.proto";', 'test.proto');

        expect(result.imports[0].modifier).toBe('public');
      });

      it('should parse weak import', async () => {
        const importNode = createMockNode('import', 'import weak "other.proto";');
        const root = createMockNode('source_file', 'import weak "other.proto";', [importNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('import weak "other.proto";', 'test.proto');

        expect(result.imports[0].modifier).toBe('weak');
      });

      it('should parse option statement with string value', async () => {
        const optionNode = createMockNode('option', 'option java_package = "com.example";');
        const root = createMockNode('source_file', 'option java_package = "com.example";', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option java_package = "com.example";', 'test.proto');

        expect(result.options).toHaveLength(1);
        expect(result.options[0].name).toBe('java_package');
        expect(result.options[0].value).toBe('com.example');
      });

      it('should parse option statement with boolean value', async () => {
        const optionNode = createMockNode('option', 'option deprecated = true;');
        const root = createMockNode('source_file', 'option deprecated = true;', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option deprecated = true;', 'test.proto');

        expect(result.options[0].value).toBe(true);
      });

      it('should parse option statement with integer value', async () => {
        const optionNode = createMockNode('option', 'option max_size = 100;');
        const root = createMockNode('source_file', 'option max_size = 100;', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option max_size = 100;', 'test.proto');

        expect(result.options[0].value).toBe(100);
      });

      it('should parse option statement with float value', async () => {
        const optionNode = createMockNode('option', 'option rate = 3.14;');
        const root = createMockNode('source_file', 'option rate = 3.14;', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option rate = 3.14;', 'test.proto');

        expect(result.options[0].value).toBe(3.14);
      });

      it('should parse message definition', async () => {
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{}', []);
        const messageNode = createMockNode(
          'message',
          'message TestMessage {}',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage {}', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage {}', 'test.proto');

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].name).toBe('TestMessage');
      });

      it('should parse message with field', async () => {
        const fieldNode = createMockNode('field', 'string name = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 1; }', 'test.proto');

        expect(result.messages[0].fields).toHaveLength(1);
        expect(result.messages[0].fields[0].name).toBe('name');
        expect(result.messages[0].fields[0].fieldType).toBe('string');
        expect(result.messages[0].fields[0].number).toBe(1);
      });

      it('should parse repeated field', async () => {
        const fieldNode = createMockNode('field', 'repeated string tags = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ repeated string tags = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { repeated string tags = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { repeated string tags = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { repeated string tags = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].modifier).toBe('repeated');
      });

      it('should parse optional field', async () => {
        const fieldNode = createMockNode('field', 'optional string name = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ optional string name = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { optional string name = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { optional string name = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { optional string name = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].modifier).toBe('optional');
      });

      it('should parse field with hex number', async () => {
        const fieldNode = createMockNode('field', 'string name = 0x10;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 0x10; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 0x10; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 0x10; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 0x10; }', 'test.proto');

        expect(result.messages[0].fields[0].number).toBe(16);
      });

      it('should parse map field', async () => {
        const mapFieldNode = createMockNode('map_field', 'map<string, int32> values = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ map<string, int32> values = 1; }', [mapFieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { map<string, int32> values = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { map<string, int32> values = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { map<string, int32> values = 1; }', 'test.proto');

        expect(result.messages[0].maps).toHaveLength(1);
        expect(result.messages[0].maps[0].keyType).toBe('string');
        expect(result.messages[0].maps[0].valueType).toBe('int32');
        expect(result.messages[0].maps[0].name).toBe('values');
      });

      it('should parse oneof definition', async () => {
        const oneofFieldNode = createMockNode('oneof_field', 'string name = 1;');
        const oneofNameNode = createMockNode('identifier', 'choice');
        const oneofNode = createMockNode(
          'oneof',
          'oneof choice { string name = 1; }',
          [oneofFieldNode],
          { name: oneofNameNode }
        );
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ oneof choice { string name = 1; } }', [oneofNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { oneof choice { string name = 1; } }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { oneof choice { string name = 1; } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { oneof choice { string name = 1; } }', 'test.proto');

        expect(result.messages[0].oneofs).toHaveLength(1);
        expect(result.messages[0].oneofs[0].name).toBe('choice');
      });

      it('should parse enum definition', async () => {
        const enumValueNode = createMockNode('enum_field', 'UNKNOWN = 0;');
        const enumNameNode = createMockNode('identifier', 'Status');
        const enumBodyNode = createMockNode('enum_body', '{ UNKNOWN = 0; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum Status { UNKNOWN = 0; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum Status { UNKNOWN = 0; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum Status { UNKNOWN = 0; }', 'test.proto');

        expect(result.enums).toHaveLength(1);
        expect(result.enums[0].name).toBe('Status');
        expect(result.enums[0].values).toHaveLength(1);
        expect(result.enums[0].values[0].name).toBe('UNKNOWN');
        expect(result.enums[0].values[0].number).toBe(0);
      });

      it('should parse enum with negative value', async () => {
        const enumValueNode = createMockNode('enum_field', 'NEG = -1;');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ NEG = -1; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { NEG = -1; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { NEG = -1; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { NEG = -1; }', 'test.proto');

        expect(result.enums[0].values[0].number).toBe(-1);
      });

      it('should parse enum with hex value', async () => {
        const enumValueNode = createMockNode('enum_field', 'HEX_VAL = 0xFF;');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ HEX_VAL = 0xFF; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { HEX_VAL = 0xFF; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { HEX_VAL = 0xFF; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { HEX_VAL = 0xFF; }', 'test.proto');

        expect(result.enums[0].values[0].number).toBe(255);
      });

      it('should parse service definition', async () => {
        const rpcNode = createMockNode('rpc', 'rpc GetData(Request) returns (Response);');
        const serviceNameNode = createMockNode('identifier', 'MyService');
        const serviceNode = createMockNode(
          'service',
          'service MyService { rpc GetData(Request) returns (Response); }',
          [rpcNode],
          { name: serviceNameNode }
        );
        const root = createMockNode('source_file', 'service MyService { rpc GetData(Request) returns (Response); }', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service MyService { rpc GetData(Request) returns (Response); }', 'test.proto');

        expect(result.services).toHaveLength(1);
        expect(result.services[0].name).toBe('MyService');
        expect(result.services[0].rpcs).toHaveLength(1);
        expect(result.services[0].rpcs[0].name).toBe('GetData');
        expect(result.services[0].rpcs[0].requestType).toBe('Request');
        expect(result.services[0].rpcs[0].responseType).toBe('Response');
      });

      it('should parse streaming RPC', async () => {
        const rpcNode = createMockNode('rpc', 'rpc StreamData(stream Request) returns (stream Response);');
        const serviceNameNode = createMockNode('identifier', 'MyService');
        const serviceNode = createMockNode(
          'service',
          'service MyService { rpc StreamData(stream Request) returns (stream Response); }',
          [rpcNode],
          { name: serviceNameNode }
        );
        const root = createMockNode('source_file', 'service MyService { rpc StreamData(stream Request) returns (stream Response); }', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service MyService { rpc StreamData(stream Request) returns (stream Response); }', 'test.proto');

        expect(result.services[0].rpcs[0].requestStreaming).toBe(true);
        expect(result.services[0].rpcs[0].responseStreaming).toBe(true);
      });

      it('should parse extend definition', async () => {
        const extendNode = createMockNode('extend', 'extend google.protobuf.MessageOptions { }');
        const root = createMockNode('source_file', 'extend google.protobuf.MessageOptions { }', [extendNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('extend google.protobuf.MessageOptions { }', 'test.proto');

        expect(result.extends).toHaveLength(1);
        expect(result.extends[0].extendType).toBe('google.protobuf.MessageOptions');
      });

      it('should parse reserved statement with ranges', async () => {
        const reservedNode = createMockNode('reserved', 'reserved 1, 2, 5 to 10;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ reserved 1, 2, 5 to 10; }', [reservedNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { reserved 1, 2, 5 to 10; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { reserved 1, 2, 5 to 10; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { reserved 1, 2, 5 to 10; }', 'test.proto');

        expect(result.messages[0].reserved).toHaveLength(1);
        expect(result.messages[0].reserved[0].ranges).toContainEqual({ start: 1, end: 1 });
        expect(result.messages[0].reserved[0].ranges).toContainEqual({ start: 2, end: 2 });
        expect(result.messages[0].reserved[0].ranges).toContainEqual({ start: 5, end: 10 });
      });

      it('should parse reserved statement with names', async () => {
        const reservedNode = createMockNode('reserved', 'reserved "foo", "bar";');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ reserved "foo", "bar"; }', [reservedNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { reserved "foo", "bar"; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { reserved "foo", "bar"; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { reserved "foo", "bar"; }', 'test.proto');

        expect(result.messages[0].reserved[0].names).toContain('foo');
        expect(result.messages[0].reserved[0].names).toContain('bar');
      });

      it('should parse extensions statement', async () => {
        const extensionsNode = createMockNode('extensions', 'extensions 100 to 200;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ extensions 100 to 200; }', [extensionsNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { extensions 100 to 200; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { extensions 100 to 200; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { extensions 100 to 200; }', 'test.proto');

        expect(result.messages[0].extensions).toHaveLength(1);
        expect(result.messages[0].extensions[0].ranges).toContainEqual({ start: 100, end: 200 });
      });

      it('should parse extensions to max', async () => {
        const extensionsNode = createMockNode('extensions', 'extensions 100 to max;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ extensions 100 to max; }', [extensionsNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { extensions 100 to max; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { extensions 100 to max; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { extensions 100 to max; }', 'test.proto');

        expect(result.messages[0].extensions[0].ranges).toContainEqual({ start: 100, end: 536870911 });
      });

      it('should parse field with options', async () => {
        const fieldNode = createMockNode('field', 'string name = 1 [deprecated = true];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 1 [deprecated = true]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 1 [deprecated = true]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 1 [deprecated = true]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 1 [deprecated = true]; }', 'test.proto');

        expect(result.messages[0].fields[0].options).toBeDefined();
        expect(result.messages[0].fields[0].options).toHaveLength(1);
        expect(result.messages[0].fields[0].options![0].name).toBe('deprecated');
        expect(result.messages[0].fields[0].options![0].value).toBe(true);
      });

      it('should parse nested message', async () => {
        const nestedNameNode = createMockNode('identifier', 'Inner');
        const nestedBodyNode = createMockNode('message_body', '{}', []);
        const nestedMessageNode = createMockNode(
          'message',
          'message Inner {}',
          [],
          { name: nestedNameNode, body: nestedBodyNode }
        );
        const outerNameNode = createMockNode('identifier', 'Outer');
        const outerBodyNode = createMockNode('message_body', '{ message Inner {} }', [nestedMessageNode]);
        const outerMessageNode = createMockNode(
          'message',
          'message Outer { message Inner {} }',
          [],
          { name: outerNameNode, body: outerBodyNode }
        );
        const root = createMockNode('source_file', 'message Outer { message Inner {} }', [outerMessageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message Outer { message Inner {} }', 'test.proto');

        expect(result.messages[0].nestedMessages).toHaveLength(1);
        expect(result.messages[0].nestedMessages[0].name).toBe('Inner');
      });

      it('should parse nested enum', async () => {
        const enumNameNode = createMockNode('identifier', 'Status');
        const enumBodyNode = createMockNode('enum_body', '{ UNKNOWN = 0; }', []);
        const enumNode = createMockNode(
          'enum',
          'enum Status { UNKNOWN = 0; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const messageNameNode = createMockNode('identifier', 'TestMessage');
        const messageBodyNode = createMockNode('message_body', '{ enum Status { UNKNOWN = 0; } }', [enumNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { enum Status { UNKNOWN = 0; } }',
          [],
          { name: messageNameNode, body: messageBodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { enum Status { UNKNOWN = 0; } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { enum Status { UNKNOWN = 0; } }', 'test.proto');

        expect(result.messages[0].nestedEnums).toHaveLength(1);
        expect(result.messages[0].nestedEnums[0].name).toBe('Status');
      });

      it('should parse group field (proto2)', async () => {
        const groupNode = createMockNode('group', 'optional group MyGroup = 1 { }');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ optional group MyGroup = 1 { } }', [groupNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { optional group MyGroup = 1 { } }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { optional group MyGroup = 1 { } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { optional group MyGroup = 1 { } }', 'test.proto');

        expect(result.messages[0].groups).toHaveLength(1);
        expect(result.messages[0].groups[0].name).toBe('MyGroup');
        expect(result.messages[0].groups[0].modifier).toBe('optional');
        expect(result.messages[0].groups[0].number).toBe(1);
      });

      it('should handle malformed option statement gracefully', async () => {
        const optionNode = createMockNode('option', 'option;');  // Malformed
        const root = createMockNode('source_file', 'option;', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option;', 'test.proto');

        expect(result.options[0].name).toBe('');
        expect(result.options[0].value).toBe('');
      });

      it('should handle malformed field gracefully', async () => {
        const fieldNode = createMockNode('field', 'invalid field');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ invalid field }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { invalid field }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { invalid field }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { invalid field }', 'test.proto');

        // Should handle gracefully without crashing
        expect(result.messages).toHaveLength(1);
      });

      it('should parse qualified type names', async () => {
        const fieldNode = createMockNode('field', 'google.protobuf.Any data = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ google.protobuf.Any data = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { google.protobuf.Any data = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { google.protobuf.Any data = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { google.protobuf.Any data = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].fieldType).toBe('google.protobuf.Any');
      });

      it('should parse absolute type names', async () => {
        const fieldNode = createMockNode('field', '.google.protobuf.Any data = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ .google.protobuf.Any data = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { .google.protobuf.Any data = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { .google.protobuf.Any data = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { .google.protobuf.Any data = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].fieldType).toBe('.google.protobuf.Any');
      });

      it('should parse option with boolean false value', async () => {
        const optionNode = createMockNode('option', 'option deprecated = false;');
        const root = createMockNode('source_file', 'option deprecated = false;', [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('option deprecated = false;', 'test.proto');

        expect(result.options[0].value).toBe(false);
      });

      it('should parse option with single-quoted string value', async () => {
        const optionNode = createMockNode('option', "option name = 'test';");
        const root = createMockNode('source_file', "option name = 'test';", [optionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse("option name = 'test';", 'test.proto');

        expect(result.options[0].value).toBe('test');
      });

      it('should parse edition without match - defaults to 2023', async () => {
        const editionNode = createMockNode('edition', 'edition;'); // Malformed
        const root = createMockNode('source_file', 'edition;', [editionNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('edition;', 'test.proto');

        expect(result.edition?.edition).toBe('2023');
      });

      it('should parse package without name node', async () => {
        const packageNode = createMockNode('package', 'package;', [], {}); // No name field
        const root = createMockNode('source_file', 'package;', [packageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('package;', 'test.proto');

        expect(result.package?.name).toBe('');
      });

      it('should parse import without path match', async () => {
        const importNode = createMockNode('import', 'import;'); // No path
        const root = createMockNode('source_file', 'import;', [importNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('import;', 'test.proto');

        expect(result.imports[0].path).toBe('');
      });

      it('should parse malformed map field gracefully', async () => {
        const mapFieldNode = createMockNode('map_field', 'map invalid;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ map invalid; }', [mapFieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { map invalid; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { map invalid; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { map invalid; }', 'test.proto');

        expect(result.messages[0].maps).toHaveLength(1);
        expect(result.messages[0].maps[0].keyType).toBe('string');
        expect(result.messages[0].maps[0].valueType).toBe('string');
        expect(result.messages[0].maps[0].name).toBe('');
      });

      it('should parse malformed oneof gracefully', async () => {
        const oneofNode = createMockNode('oneof', 'oneof { }', [], {}); // No name field
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ oneof { } }', [oneofNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { oneof { } }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { oneof { } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { oneof { } }', 'test.proto');

        expect(result.messages[0].oneofs).toHaveLength(1);
        expect(result.messages[0].oneofs[0].name).toBe('');
      });

      it('should parse malformed group gracefully', async () => {
        const groupNode = createMockNode('group', 'group;'); // No match
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ group; }', [groupNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { group; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { group; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { group; }', 'test.proto');

        expect(result.messages[0].groups).toHaveLength(1);
        expect(result.messages[0].groups[0].name).toBe('');
        expect(result.messages[0].groups[0].number).toBe(0);
      });

      it('should parse malformed enum value gracefully', async () => {
        const enumValueNode = createMockNode('enum_field', 'INVALID;'); // No match
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ INVALID; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { INVALID; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { INVALID; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { INVALID; }', 'test.proto');

        expect(result.enums[0].values[0].name).toBe('');
        expect(result.enums[0].values[0].number).toBe(0);
      });

      it('should parse malformed RPC gracefully', async () => {
        const rpcNode = createMockNode('rpc', 'rpc;'); // No match
        const serviceNameNode = createMockNode('identifier', 'MyService');
        const serviceNode = createMockNode(
          'service',
          'service MyService { rpc; }',
          [rpcNode],
          { name: serviceNameNode }
        );
        const root = createMockNode('source_file', 'service MyService { rpc; }', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service MyService { rpc; }', 'test.proto');

        expect(result.services[0].rpcs).toHaveLength(1);
        expect(result.services[0].rpcs[0].name).toBe('');
        expect(result.services[0].rpcs[0].requestType).toBe('');
      });

      it('should parse malformed extend gracefully', async () => {
        const extendNode = createMockNode('extend', 'extend;'); // No match
        const root = createMockNode('source_file', 'extend;', [extendNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('extend;', 'test.proto');

        expect(result.extends[0].extendType).toBe('');
      });

      it('should parse enum with option in body', async () => {
        const optionNode = createMockNode('option', 'option allow_alias = true;');
        const enumValueNode = createMockNode('enum_field', 'UNKNOWN = 0;');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ option allow_alias = true; UNKNOWN = 0; }', [optionNode, enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { option allow_alias = true; UNKNOWN = 0; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { option allow_alias = true; UNKNOWN = 0; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { option allow_alias = true; UNKNOWN = 0; }', 'test.proto');

        expect(result.enums[0].options).toHaveLength(1);
        expect(result.enums[0].options[0].name).toBe('allow_alias');
      });

      it('should parse enum with reserved in body', async () => {
        const reservedNode = createMockNode('reserved', 'reserved 1, 2;');
        const enumValueNode = createMockNode('enum_field', 'UNKNOWN = 0;');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ reserved 1, 2; UNKNOWN = 0; }', [reservedNode, enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { reserved 1, 2; UNKNOWN = 0; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { reserved 1, 2; UNKNOWN = 0; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { reserved 1, 2; UNKNOWN = 0; }', 'test.proto');

        expect(result.enums[0].reserved).toHaveLength(1);
      });

      it('should parse message with option in body', async () => {
        const optionNode = createMockNode('option', 'option deprecated = true;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ option deprecated = true; }', [optionNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { option deprecated = true; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { option deprecated = true; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { option deprecated = true; }', 'test.proto');

        expect(result.messages[0].options).toHaveLength(1);
      });

      it('should parse field with multiple options', async () => {
        const fieldNode = createMockNode('field', 'string name = 1 [deprecated = true, json_name = "the_name"];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 1 [deprecated = true, json_name = "the_name"]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 1 [deprecated = true, json_name = "the_name"]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 1 [deprecated = true, json_name = "the_name"]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 1 [deprecated = true, json_name = "the_name"]; }', 'test.proto');

        expect(result.messages[0].fields[0].options).toHaveLength(2);
        expect(result.messages[0].fields[0].options![0].name).toBe('deprecated');
        expect(result.messages[0].fields[0].options![1].name).toBe('json_name');
      });

      it('should parse field option with infinity value', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = inf];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = inf]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = inf]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = inf]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = inf]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(Infinity);
      });

      it('should parse field option with negative infinity value', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = -inf];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = -inf]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = -inf]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = -inf]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = -inf]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(-Infinity);
      });

      it('should parse field option with NaN value', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = nan];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = nan]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = nan]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = nan]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = nan]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBeNaN();
      });

      it('should parse field option with positive infinity value', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = +inf];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = +inf]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = +inf]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = +inf]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = +inf]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(Infinity);
      });

      it('should parse field option with negative integer', async () => {
        const fieldNode = createMockNode('field', 'int32 val = 1 [default = -10];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ int32 val = 1 [default = -10]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { int32 val = 1 [default = -10]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { int32 val = 1 [default = -10]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { int32 val = 1 [default = -10]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(-10);
      });

      it('should parse field option with float value', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = 3.14];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = 3.14]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = 3.14]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = 3.14]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = 3.14]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(3.14);
      });

      it('should parse field option with parenthesized custom option name', async () => {
        const fieldNode = createMockNode('field', 'string val = 1 [(custom.option).path = "value"];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string val = 1 [(custom.option).path = "value"]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string val = 1 [(custom.option).path = "value"]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string val = 1 [(custom.option).path = "value"]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string val = 1 [(custom.option).path = "value"]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].name).toBe('(custom.option).path');
      });

      it('should parse enum value with options', async () => {
        const enumValueNode = createMockNode('enum_field', 'VALUE = 1 [deprecated = true];');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ VALUE = 1 [deprecated = true]; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { VALUE = 1 [deprecated = true]; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { VALUE = 1 [deprecated = true]; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { VALUE = 1 [deprecated = true]; }', 'test.proto');

        expect(result.enums[0].values[0].options).toBeDefined();
        expect(result.enums[0].values[0].options![0].name).toBe('deprecated');
      });

      it('should parse reserved with "to max" range', async () => {
        const reservedNode = createMockNode('reserved', 'reserved 100 to max;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ reserved 100 to max; }', [reservedNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { reserved 100 to max; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { reserved 100 to max; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { reserved 100 to max; }', 'test.proto');

        expect(result.messages[0].reserved[0].ranges).toContainEqual({ start: 100, end: 536870911 });
      });

      it('should parse extensions single value without range', async () => {
        const extensionsNode = createMockNode('extensions', 'extensions 100;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ extensions 100; }', [extensionsNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { extensions 100; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { extensions 100; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { extensions 100; }', 'test.proto');

        expect(result.messages[0].extensions[0].ranges).toContainEqual({ start: 100, end: 100 });
      });

      it('should parse message without body node', async () => {
        const nameNode = createMockNode('identifier', 'EmptyMessage');
        const messageNode = createMockNode(
          'message',
          'message EmptyMessage',
          [],
          { name: nameNode } // No body
        );
        const root = createMockNode('source_file', 'message EmptyMessage', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message EmptyMessage', 'test.proto');

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].name).toBe('EmptyMessage');
        expect(result.messages[0].fields).toEqual([]);
      });

      it('should parse enum without body node', async () => {
        const enumNameNode = createMockNode('identifier', 'EmptyEnum');
        const enumNode = createMockNode(
          'enum',
          'enum EmptyEnum',
          [],
          { name: enumNameNode } // No body
        );
        const root = createMockNode('source_file', 'enum EmptyEnum', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum EmptyEnum', 'test.proto');

        expect(result.enums).toHaveLength(1);
        expect(result.enums[0].name).toBe('EmptyEnum');
        expect(result.enums[0].values).toEqual([]);
      });

      it('should parse message without name node', async () => {
        const bodyNode = createMockNode('message_body', '{}', []);
        const messageNode = createMockNode(
          'message',
          'message {}',
          [],
          { body: bodyNode } // No name
        );
        const root = createMockNode('source_file', 'message {}', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message {}', 'test.proto');

        expect(result.messages[0].name).toBe('');
      });

      it('should parse enum without name node', async () => {
        const enumBodyNode = createMockNode('enum_body', '{}', []);
        const enumNode = createMockNode(
          'enum',
          'enum {}',
          [],
          { body: enumBodyNode } // No name
        );
        const root = createMockNode('source_file', 'enum {}', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum {}', 'test.proto');

        expect(result.enums[0].name).toBe('');
      });

      it('should parse service without name node', async () => {
        const serviceNode = createMockNode(
          'service',
          'service {}',
          [],
          {} // No name
        );
        const root = createMockNode('source_file', 'service {}', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service {}', 'test.proto');

        expect(result.services[0].name).toBe('');
      });

      it('should parse map field with hex number', async () => {
        const mapFieldNode = createMockNode('map_field', 'map<string, int32> values = 0x10;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ map<string, int32> values = 0x10; }', [mapFieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { map<string, int32> values = 0x10; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { map<string, int32> values = 0x10; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { map<string, int32> values = 0x10; }', 'test.proto');

        expect(result.messages[0].maps[0].number).toBe(16);
      });

      it('should handle null child nodes gracefully', async () => {
        // Create a node with childCount > 0 but returns null for child()
        const rootWithNullChild: MockNode = {
          type: 'source_file',
          text: '',
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 0 },
          childCount: 1,
          children: [],
          fieldChildren: {},
          child: () => null, // Always returns null
          childForFieldName: () => null,
          isMissing: () => false,
          parent: null
        };
        mockParse.mockReturnValue({ rootNode: rootWithNullChild });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('', 'test.proto');

        expect(result.type).toBe('file');
      });

      it('should handle child parse errors gracefully and continue', async () => {
        // Create a message body with a child that has an unrecognized type
        const unknownNode = createMockNode('unknown_type', 'something');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ something }', [unknownNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { something }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { something }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { something }', 'test.proto');

        // Should parse message without crashing
        expect(result.messages).toHaveLength(1);
      });

      it('should parse required field modifier', async () => {
        const fieldNode = createMockNode('field', 'required string name = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ required string name = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { required string name = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { required string name = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { required string name = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].modifier).toBe('required');
      });

      it('should parse field with uppercase hex number', async () => {
        const fieldNode = createMockNode('field', 'string name = 0XFF;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 0XFF; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 0XFF; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 0XFF; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 0XFF; }', 'test.proto');

        expect(result.messages[0].fields[0].number).toBe(255);
      });

      it('should parse field with string concatenation in option', async () => {
        const fieldNode = createMockNode('field', "string name = 1 [json_name = \"foo\" \"bar\"];");
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', "{ string name = 1 [json_name = \"foo\" \"bar\"]; }", [fieldNode]);
        const messageNode = createMockNode(
          'message',
          "message TestMessage { string name = 1 [json_name = \"foo\" \"bar\"]; }",
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', "message TestMessage { string name = 1 [json_name = \"foo\" \"bar\"]; }", [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse("message TestMessage { string name = 1 [json_name = \"foo\" \"bar\"]; }", 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe('foobar');
      });

      it('should parse field option with nested brackets', async () => {
        const fieldNode = createMockNode('field', 'string name = 1 [(custom) = {field: "value"}];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 1 [(custom) = {field: "value"}]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 1 [(custom) = {field: "value"}]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 1 [(custom) = {field: "value"}]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 1 [(custom) = {field: "value"}]; }', 'test.proto');

        // Should not crash on nested brackets
        expect(result.messages[0].fields[0].options).toBeDefined();
      });

      it('should parse field without options - semicolon before bracket', async () => {
        const fieldNode = createMockNode('field', 'string name = 1;');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ string name = 1; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { string name = 1; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { string name = 1; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { string name = 1; }', 'test.proto');

        expect(result.messages[0].fields[0].options).toBeUndefined();
      });

      it('should parse repeated group field', async () => {
        const groupNode = createMockNode('group', 'repeated group Items = 1 { }');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ repeated group Items = 1 { } }', [groupNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { repeated group Items = 1 { } }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { repeated group Items = 1 { } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { repeated group Items = 1 { } }', 'test.proto');

        expect(result.messages[0].groups[0].modifier).toBe('repeated');
      });

      it('should parse required group field', async () => {
        const groupNode = createMockNode('group', 'required group Items = 1 { }');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ required group Items = 1 { } }', [groupNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { required group Items = 1 { } }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { required group Items = 1 { } }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { required group Items = 1 { } }', 'test.proto');

        expect(result.messages[0].groups[0].modifier).toBe('required');
      });

      it('should parse client streaming RPC only', async () => {
        const rpcNode = createMockNode('rpc', 'rpc Send(stream Request) returns (Response);');
        const serviceNameNode = createMockNode('identifier', 'MyService');
        const serviceNode = createMockNode(
          'service',
          'service MyService { rpc Send(stream Request) returns (Response); }',
          [rpcNode],
          { name: serviceNameNode }
        );
        const root = createMockNode('source_file', 'service MyService { rpc Send(stream Request) returns (Response); }', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service MyService { rpc Send(stream Request) returns (Response); }', 'test.proto');

        expect(result.services[0].rpcs[0].requestStreaming).toBe(true);
        expect(result.services[0].rpcs[0].responseStreaming).toBe(false);
      });

      it('should parse server streaming RPC only', async () => {
        const rpcNode = createMockNode('rpc', 'rpc Receive(Request) returns (stream Response);');
        const serviceNameNode = createMockNode('identifier', 'MyService');
        const serviceNode = createMockNode(
          'service',
          'service MyService { rpc Receive(Request) returns (stream Response); }',
          [rpcNode],
          { name: serviceNameNode }
        );
        const root = createMockNode('source_file', 'service MyService { rpc Receive(Request) returns (stream Response); }', [serviceNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('service MyService { rpc Receive(Request) returns (stream Response); }', 'test.proto');

        expect(result.services[0].rpcs[0].requestStreaming).toBe(false);
        expect(result.services[0].rpcs[0].responseStreaming).toBe(true);
      });

      it('should parse field option with .N format float', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = .5];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = .5]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = .5]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = .5]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = .5]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(0.5);
      });

      it('should parse field option with scientific notation', async () => {
        const fieldNode = createMockNode('field', 'double val = 1 [default = 1.5e10];');
        const nameNode = createMockNode('identifier', 'TestMessage');
        const bodyNode = createMockNode('message_body', '{ double val = 1 [default = 1.5e10]; }', [fieldNode]);
        const messageNode = createMockNode(
          'message',
          'message TestMessage { double val = 1 [default = 1.5e10]; }',
          [],
          { name: nameNode, body: bodyNode }
        );
        const root = createMockNode('source_file', 'message TestMessage { double val = 1 [default = 1.5e10]; }', [messageNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('message TestMessage { double val = 1 [default = 1.5e10]; }', 'test.proto');

        expect(result.messages[0].fields[0].options![0].value).toBe(1.5e10);
      });

      it('should parse negative hex enum value', async () => {
        const enumValueNode = createMockNode('enum_field', 'NEG_HEX = -0x10;');
        const enumNameNode = createMockNode('identifier', 'TestEnum');
        const enumBodyNode = createMockNode('enum_body', '{ NEG_HEX = -0x10; }', [enumValueNode]);
        const enumNode = createMockNode(
          'enum',
          'enum TestEnum { NEG_HEX = -0x10; }',
          [],
          { name: enumNameNode, body: enumBodyNode }
        );
        const root = createMockNode('source_file', 'enum TestEnum { NEG_HEX = -0x10; }', [enumNode]);
        mockParse.mockReturnValue({ rootNode: root });

        const { treeSitterParser } = require('../treeSitterParser');
        const result = treeSitterParser.parse('enum TestEnum { NEG_HEX = -0x10; }', 'test.proto');

        expect(result.enums[0].values[0].number).toBe(-16);
      });
    });
  });
});
