/**
 * Tests for Parser Factory
 */

import { ParserFactory, IProtoParser } from '../../core/parserFactory';
import { ProtoParser } from '../../core/parser';
import { ProtoFile } from '../../core/ast';

// Mock the treeSitterParser module
jest.mock('../../core/treeSitterParser', () => ({
  isTreeSitterInitialized: jest.fn(() => false),
  TreeSitterProtoParser: jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockReturnValue({
      type: 'file',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      imports: [],
      options: [],
      messages: [],
      enums: [],
      services: [],
      extends: []
    })
  }))
}));

describe('ParserFactory', () => {
  let factory: ParserFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    factory = new ParserFactory();
  });

  describe('constructor', () => {
    it('should create instance with custom parser', () => {
      expect(factory).toBeDefined();
    });
  });

  describe('setUseTreeSitter', () => {
    it('should set useTreeSitter to false when tree-sitter is not initialized', () => {
      factory.setUseTreeSitter(true);
      expect(factory.isUsingTreeSitter()).toBe(false);
    });

    it('should handle setting useTreeSitter to false', () => {
      factory.setUseTreeSitter(false);
      expect(factory.isUsingTreeSitter()).toBe(false);
    });
  });

  describe('isUsingTreeSitter', () => {
    it('should return false by default', () => {
      expect(factory.isUsingTreeSitter()).toBe(false);
    });
  });

  describe('initializeTreeSitter', () => {
    it('should not initialize tree-sitter when not available', () => {
      factory.initializeTreeSitter();
      expect(factory.isUsingTreeSitter()).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse using custom parser when tree-sitter is not enabled', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      
      const result = factory.parse(content, 'file:///test.proto');
      
      expect(result).toBeDefined();
      expect(result.type).toBe('file');
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].name).toBe('User');
    });

    it('should fall back to custom parser on tree-sitter error', () => {
      const content = `syntax = "proto3";
message Test {}`;
      
      // Even with tree-sitter requested, should fall back to custom parser
      factory.setUseTreeSitter(true);
      const result = factory.parse(content, 'file:///test.proto');
      
      expect(result).toBeDefined();
      expect(result.type).toBe('file');
    });
  });

  describe('getParser', () => {
    it('should return custom parser when tree-sitter is not enabled', () => {
      const parser = factory.getParser();
      
      expect(parser).toBeDefined();
      expect(parser).toBeInstanceOf(ProtoParser);
    });
  });
});

describe('IProtoParser interface', () => {
  it('should define parse method signature', () => {
    const mockParser: IProtoParser = {
      parse: (_text: string, _uri: string): ProtoFile => ({
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: []
      })
    };
    
    const result = mockParser.parse('', 'file:///test.proto');
    expect(result.type).toBe('file');
  });
});

// Additional tests with tree-sitter initialized
describe('ParserFactory with Tree-sitter initialized', () => {
  let factory: ParserFactory;
  let mockTreeSitterParser: any;
  const treeSitterModule = require('../../core/treeSitterParser');
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Configure mock to return tree-sitter as initialized
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(true);
    
    mockTreeSitterParser = {
      parse: jest.fn().mockReturnValue({
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        imports: [],
        options: [],
        messages: [{ name: 'TreeSitterParsed', type: 'message', fields: [], nestedMessages: [], nestedEnums: [], oneofs: [], options: [], reserved: [], extensions: [], maps: [], groups: [], nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }],
        enums: [],
        services: [],
        extends: []
      })
    };
    (treeSitterModule.TreeSitterProtoParser as jest.Mock).mockImplementation(() => mockTreeSitterParser);
    
    factory = new ParserFactory();
  });

  afterEach(() => {
    // Reset to default behavior
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
  });

  describe('constructor', () => {
    it('should initialize tree-sitter parser when available', () => {
      expect(factory).toBeDefined();
      expect(treeSitterModule.TreeSitterProtoParser).toHaveBeenCalled();
    });
  });

  describe('setUseTreeSitter', () => {
    it('should enable tree-sitter when initialized', () => {
      factory.setUseTreeSitter(true);
      expect(factory.isUsingTreeSitter()).toBe(true);
    });
  });

  describe('initializeTreeSitter', () => {
    it('should create tree-sitter parser when initialized and not already created', () => {
      // Create a new factory without tree-sitter parser initially
      (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
      const factoryWithoutTreeSitter = new ParserFactory();
      
      // Now enable tree-sitter
      (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(true);
      factoryWithoutTreeSitter.initializeTreeSitter();
      
      // Should have called TreeSitterProtoParser
      expect(treeSitterModule.TreeSitterProtoParser).toHaveBeenCalled();
    });
  });

  describe('parse', () => {
    it('should use tree-sitter parser when enabled', () => {
      factory.setUseTreeSitter(true);
      
      const content = `syntax = "proto3";
message Test {}`;
      
      const result = factory.parse(content, 'file:///test.proto');
      
      expect(mockTreeSitterParser.parse).toHaveBeenCalledWith(content, 'file:///test.proto');
      expect(result.messages[0].name).toBe('TreeSitterParsed');
    });

    it('should fall back to custom parser when tree-sitter throws', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Tree-sitter parse error');
      });
      
      factory.setUseTreeSitter(true);
      
      const content = `syntax = "proto3";
message Test {}`;
      
      const result = factory.parse(content, 'file:///test.proto');
      
      // Should fall back to custom parser
      expect(result).toBeDefined();
      expect(result.type).toBe('file');
      expect(result.messages[0].name).toBe('Test');
    });
  });

  describe('getParser', () => {
    it('should return tree-sitter parser when enabled', () => {
      factory.setUseTreeSitter(true);
      
      const parser = factory.getParser();
      
      expect(parser).toBe(mockTreeSitterParser);
    });
  });
});
