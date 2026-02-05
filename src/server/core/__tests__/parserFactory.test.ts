/**
 * Tests for Parser Factory
 */

import { ParserFactory, IProtoParser } from '../../core/parserFactory';
import { ProtoParser } from '../../core/parser';
import { ProtoFile } from '../../core/ast';

// Mock the treeSitterParser module
jest.mock('../../core/treeSitterParser', () => ({
  isTreeSitterInitialized: jest.fn(() => false),
  getTreeSitterInitError: jest.fn(() => null),
  TreeSitterProtoParser: jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockReturnValue({
      type: 'file',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      imports: [],
      options: [],
      messages: [],
      enums: [],
      services: [],
      extends: [],
    }),
  })),
  TreeSitterInitError: class TreeSitterInitError extends Error {
    constructor(
      public errorType: string,
      message: string
    ) {
      super(message);
      this.name = 'TreeSitterInitError';
    }
  },
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
        extends: [],
      }),
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
        messages: [
          {
            name: 'TreeSitterParsed',
            type: 'message',
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
            nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          },
        ],
        enums: [],
        services: [],
        extends: [],
      }),
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

// Tests for getStats, resetStats, and getDiagnosticReport
describe('ParserFactory statistics and diagnostics', () => {
  let factory: ParserFactory;
  let mockTreeSitterParser: any;
  const treeSitterModule = require('../../core/treeSitterParser');

  beforeEach(() => {
    jest.clearAllMocks();
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(true);
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(null);

    mockTreeSitterParser = {
      parse: jest.fn().mockReturnValue({
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: [],
      }),
    };
    (treeSitterModule.TreeSitterProtoParser as jest.Mock).mockImplementation(() => mockTreeSitterParser);

    factory = new ParserFactory();
  });

  afterEach(() => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(null);
  });

  describe('getStats', () => {
    it('should return initial stats with zeros', () => {
      const stats = factory.getStats();

      expect(stats.treeSitterAttempts).toBe(0);
      expect(stats.treeSitterSuccesses).toBe(0);
      expect(stats.treeSitterFailures).toBe(0);
      expect(stats.fallbackUses).toBe(0);
      expect(stats.lastError).toBeNull();
      expect(stats.lastErrorTime).toBeNull();
    });

    it('should track successful tree-sitter parses', () => {
      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const stats = factory.getStats();

      expect(stats.treeSitterAttempts).toBe(1);
      expect(stats.treeSitterSuccesses).toBe(1);
      expect(stats.treeSitterFailures).toBe(0);
    });

    it('should track tree-sitter failures and fallbacks', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Parse failed');
      });

      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const stats = factory.getStats();

      expect(stats.treeSitterAttempts).toBe(1);
      expect(stats.treeSitterSuccesses).toBe(0);
      expect(stats.treeSitterFailures).toBe(1);
      expect(stats.fallbackUses).toBe(1);
      expect(stats.lastError).toBeDefined();
      expect(stats.lastError?.message).toBe('Parse failed');
      expect(stats.lastErrorTime).toBeInstanceOf(Date);
    });

    it('should track fallback uses when tree-sitter is disabled', () => {
      factory.setUseTreeSitter(false);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const stats = factory.getStats();

      expect(stats.treeSitterAttempts).toBe(0);
      expect(stats.fallbackUses).toBe(1);
    });

    it('should return a copy of stats (not the original)', () => {
      const stats1 = factory.getStats();
      const stats2 = factory.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics to initial values', () => {
      factory.setUseTreeSitter(true);

      // Generate some stats
      factory.parse('syntax = "proto3";', 'file:///test1.proto');

      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Parse failed');
      });
      factory.parse('syntax = "proto3";', 'file:///test2.proto');

      // Verify stats are non-zero
      let stats = factory.getStats();
      expect(stats.treeSitterAttempts).toBeGreaterThan(0);

      // Reset stats
      factory.resetStats();

      stats = factory.getStats();
      expect(stats.treeSitterAttempts).toBe(0);
      expect(stats.treeSitterSuccesses).toBe(0);
      expect(stats.treeSitterFailures).toBe(0);
      expect(stats.fallbackUses).toBe(0);
      expect(stats.lastError).toBeNull();
      expect(stats.lastErrorTime).toBeNull();
    });
  });

  describe('getDiagnosticReport', () => {
    it('should generate diagnostic report with basic info', () => {
      const report = factory.getDiagnosticReport();

      expect(report).toContain('=== Parser Factory Diagnostic Report ===');
      expect(report).toContain('Tree-sitter enabled:');
      expect(report).toContain('Tree-sitter initialized:');
      expect(report).toContain('Tree-sitter parser available:');
      expect(report).toContain('--- Statistics ---');
    });

    it('should include success rate when there are attempts', () => {
      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const report = factory.getDiagnosticReport();

      expect(report).toContain('Success rate:');
      expect(report).toContain('100.0%');
    });

    it('should include last error info when there was an error', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Test error message');
      });

      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const report = factory.getDiagnosticReport();

      expect(report).toContain('--- Last Error ---');
      expect(report).toContain('Time:');
      expect(report).toContain('Message: Test error message');
    });

    it('should include initialization error when present', () => {
      const initError = new Error('Init failed');
      (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(initError);

      const report = factory.getDiagnosticReport();

      expect(report).toContain('--- Initialization Error ---');
      expect(report).toContain('Message: Init failed');
    });

    it('should include TreeSitterInitError type when applicable', () => {
      const { TreeSitterInitError } = treeSitterModule;
      const initError = new TreeSitterInitError('WASM_LOAD_FAILED', 'Failed to load WASM');
      (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(initError);

      const report = factory.getDiagnosticReport();

      expect(report).toContain('--- Initialization Error ---');
      expect(report).toContain('Type: WASM_LOAD_FAILED');
    });
  });

  describe('parse error handling', () => {
    it('should handle non-Error thrown values', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'String error';
      });

      factory.setUseTreeSitter(true);
      const result = factory.parse('syntax = "proto3";', 'file:///test.proto');

      expect(result).toBeDefined();
      const stats = factory.getStats();
      expect(stats.lastError?.message).toBe('String error');
    });

    it('should log warning every 10 failures', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Parse failed');
      });

      factory.setUseTreeSitter(true);

      // Parse 10 times to trigger the warning
      for (let i = 0; i < 10; i++) {
        factory.parse('syntax = "proto3";', `file:///test${i}.proto`);
      }

      const stats = factory.getStats();
      expect(stats.treeSitterFailures).toBe(10);
    });

    it('should use fallback parser for invalid proto content', () => {
      // Make tree-sitter fail
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Tree-sitter failed');
      });

      factory.setUseTreeSitter(true);

      // Invalid proto content - custom parser handles it gracefully
      const invalidContent = '{{{{invalid proto content}}}}';

      // Should not throw - custom parser handles gracefully
      const result = factory.parse(invalidContent, 'file:///invalid.proto');
      expect(result).toBeDefined();
      expect(result.type).toBe('file');

      // Stats should show the fallback was used
      const stats = factory.getStats();
      expect(stats.treeSitterFailures).toBe(1);
      expect(stats.fallbackUses).toBe(1);
    });

    it('should accumulate stats correctly across multiple parses', () => {
      factory.setUseTreeSitter(true);

      // First parse succeeds
      factory.parse('syntax = "proto3";', 'file:///test1.proto');

      // Second parse fails
      mockTreeSitterParser.parse.mockImplementationOnce(() => {
        throw new Error('Parse failed');
      });
      factory.parse('syntax = "proto3";', 'file:///test2.proto');

      // Third parse succeeds again
      mockTreeSitterParser.parse.mockReturnValueOnce({
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: [],
      });
      factory.parse('syntax = "proto3";', 'file:///test3.proto');

      const stats = factory.getStats();
      expect(stats.treeSitterAttempts).toBe(3);
      expect(stats.treeSitterSuccesses).toBe(2);
      expect(stats.treeSitterFailures).toBe(1);
      expect(stats.fallbackUses).toBe(1);
    });

    it('should track lastError and lastErrorTime correctly', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Specific error message');
      });

      factory.setUseTreeSitter(true);

      const beforeParse = new Date();
      factory.parse('syntax = "proto3";', 'file:///test.proto');
      const afterParse = new Date();

      const stats = factory.getStats();
      expect(stats.lastError).toBeDefined();
      expect(stats.lastError?.message).toBe('Specific error message');
      expect(stats.lastErrorTime).toBeDefined();
      expect(stats.lastErrorTime!.getTime()).toBeGreaterThanOrEqual(beforeParse.getTime());
      expect(stats.lastErrorTime!.getTime()).toBeLessThanOrEqual(afterParse.getTime());
    });
  });

  describe('getDiagnosticReport edge cases', () => {
    it('should show 0% success rate when all attempts fail', () => {
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw new Error('Always fails');
      });

      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test1.proto');
      factory.parse('syntax = "proto3";', 'file:///test2.proto');

      const report = factory.getDiagnosticReport();

      expect(report).toContain('Success rate: 0.0%');
    });

    it('should show correct percentage for mixed results', () => {
      factory.setUseTreeSitter(true);

      // 3 successes
      factory.parse('syntax = "proto3";', 'file:///test1.proto');
      factory.parse('syntax = "proto3";', 'file:///test2.proto');
      factory.parse('syntax = "proto3";', 'file:///test3.proto');

      // 1 failure
      mockTreeSitterParser.parse.mockImplementationOnce(() => {
        throw new Error('Parse failed');
      });
      factory.parse('syntax = "proto3";', 'file:///test4.proto');

      const report = factory.getDiagnosticReport();

      // 3 out of 4 = 75%
      expect(report).toContain('Success rate: 75.0%');
    });

    it('should include error stack trace info in last error', () => {
      const errorWithStack = new Error('Test error');
      errorWithStack.stack = 'Error: Test error\n    at TestFunction\n    at AnotherFunction';
      mockTreeSitterParser.parse.mockImplementation(() => {
        throw errorWithStack;
      });

      factory.setUseTreeSitter(true);
      factory.parse('syntax = "proto3";', 'file:///test.proto');

      const report = factory.getDiagnosticReport();
      expect(report).toContain('Message: Test error');
    });
  });
});

// Tests for setUseTreeSitter warning messages
describe('ParserFactory setUseTreeSitter warnings', () => {
  const treeSitterModule = require('../../core/treeSitterParser');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(null);
  });

  it('should warn with TreeSitterInitError when initialization failed', () => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    const { TreeSitterInitError } = treeSitterModule;
    const initError = new TreeSitterInitError('WASM_LOAD_FAILED', 'Failed to load WASM module');
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(initError);

    const factory = new ParserFactory();
    factory.setUseTreeSitter(true);

    expect(factory.isUsingTreeSitter()).toBe(false);
  });

  it('should warn with generic error when initialization failed', () => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    const genericError = new Error('Generic init error');
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(genericError);

    const factory = new ParserFactory();
    factory.setUseTreeSitter(true);

    expect(factory.isUsingTreeSitter()).toBe(false);
  });

  it('should warn when tree-sitter not initialized and no error available', () => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    (treeSitterModule.getTreeSitterInitError as jest.Mock).mockReturnValue(null);

    const factory = new ParserFactory();
    factory.setUseTreeSitter(true);

    expect(factory.isUsingTreeSitter()).toBe(false);
  });
});

// Additional edge case tests
describe('ParserFactory edge cases', () => {
  let factory: ParserFactory;
  const treeSitterModule = require('../../core/treeSitterParser');

  beforeEach(() => {
    jest.clearAllMocks();
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(false);
    factory = new ParserFactory();
  });

  it('should parse empty proto file', () => {
    const content = '';
    const result = factory.parse(content, 'file:///empty.proto');
    expect(result).toBeDefined();
    expect(result.type).toBe('file');
  });

  it('should parse proto file with only comments', () => {
    const content = `// This is a comment
/* This is a block comment */`;
    const result = factory.parse(content, 'file:///comments.proto');
    expect(result).toBeDefined();
    expect(result.type).toBe('file');
  });

  it('should handle URIs with special characters', () => {
    const content = 'syntax = "proto3";';
    const uri = 'file:///path/with spaces/and%20encoded/file.proto';
    const result = factory.parse(content, uri);
    expect(result).toBeDefined();
  });

  it('should handle very long proto content', () => {
    // Generate a proto with many messages
    let content = 'syntax = "proto3";\n';
    for (let i = 0; i < 100; i++) {
      content += `message Message${i} { string field${i} = 1; }\n`;
    }
    const result = factory.parse(content, 'file:///large.proto');
    expect(result).toBeDefined();
    expect(result.messages.length).toBe(100);
  });

  it('should parse proto2 syntax', () => {
    const content = `syntax = "proto2";
message User {
  required string name = 1;
  optional string email = 2;
}`;
    const result = factory.parse(content, 'file:///proto2.proto');
    expect(result).toBeDefined();
    expect(result.messages.length).toBe(1);
  });

  it('should parse file without syntax declaration', () => {
    const content = `message User {
  string name = 1;
}`;
    const result = factory.parse(content, 'file:///nosyntax.proto');
    expect(result).toBeDefined();
    expect(result.messages.length).toBe(1);
  });

  it('should use fallback parser when tree-sitter disabled after enabling', () => {
    (treeSitterModule.isTreeSitterInitialized as jest.Mock).mockReturnValue(true);
    const mockParser = {
      parse: jest.fn().mockReturnValue({
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: [],
      }),
    };
    (treeSitterModule.TreeSitterProtoParser as jest.Mock).mockImplementation(() => mockParser);

    const factory2 = new ParserFactory();
    factory2.setUseTreeSitter(true);
    expect(factory2.isUsingTreeSitter()).toBe(true);

    factory2.setUseTreeSitter(false);
    expect(factory2.isUsingTreeSitter()).toBe(false);

    const result = factory2.parse('syntax = "proto3";', 'file:///test.proto');
    expect(result).toBeDefined();
    expect(mockParser.parse).not.toHaveBeenCalled();
  });
});
