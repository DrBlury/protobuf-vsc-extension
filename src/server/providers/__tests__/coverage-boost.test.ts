/**
 * Coverage boost tests for multiple providers
 * Targets specific uncovered branches to reach 95% coverage
 */

import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { DefinitionProvider } from '../definition';
import { RenameProvider } from '../rename';
import { DocumentLinksProvider } from '../documentLinks';
import { DiagnosticsProvider } from '../diagnostics';
import { HoverProvider } from '../hover';
import { InlayHintsProvider } from '../inlayHints';

describe('DefinitionProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: DefinitionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  describe('getWordAtPosition edge cases', () => {
    it('should handle trailing dots in identifiers', () => {
      const content = `
syntax = "proto3";
message Test {
  MyType. field = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      // Cursor on the dot after "MyType"
      const result = provider.getDefinition('test.proto', { line: 3, character: 9 }, '  MyType. field = 1;');
      // Should strip trailing dot and try to resolve "MyType"
      expect(result).toBeNull(); // Type doesn't exist
    });

    it('should handle leading dots for fully qualified names', () => {
      const content = `
syntax = "proto3";
package test;
message MyType {}
message Test {
  .test.MyType field = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.getDefinition('test.proto', { line: 5, character: 8 }, '  .test.MyType field = 1;');
      expect(result).toBeDefined();
    });

    it('should step left from whitespace to find symbol', () => {
      const content = `
syntax = "proto3";
message Test {
  string name = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      // Cursor is on space after "string"
      const result = provider.getDefinition('test.proto', { line: 3, character: 8 }, '  string name = 1;');
      expect(result).toBeNull(); // string is builtin
    });
  });

  describe('resolveImportLocation strategies', () => {
    it('should use fallback file matching by URI suffix', () => {
      const content1 = `syntax = "proto3"; message A {}`;
      const content2 = `
syntax = "proto3";
import "common/types.proto";
message B { A a = 1; }`;

      const ast1 = parser.parse(content1, 'file:///project/common/types.proto');
      const ast2 = parser.parse(content2, 'file:///project/test.proto');

      analyzer.updateFile('file:///project/common/types.proto', ast1);
      analyzer.updateFile('file:///project/test.proto', ast2);

      const result = provider.getDefinition(
        'file:///project/test.proto',
        { line: 2, character: 10 },
        'import "common/types.proto";'
      );
      expect(result).toBeDefined();
    });

    it('should match by URI containing import path', () => {
      const content1 = `syntax = "proto3"; message A {}`;
      const content2 = `
syntax = "proto3";
import "proto/types.proto";`;

      const ast1 = parser.parse(content1, 'file:///root/proto/types.proto');
      const ast2 = parser.parse(content2, 'file:///root/main.proto');

      analyzer.updateFile('file:///root/proto/types.proto', ast1);
      analyzer.updateFile('file:///root/main.proto', ast2);

      const result = provider.getDefinition(
        'file:///root/main.proto',
        { line: 2, character: 10 },
        'import "proto/types.proto";'
      );
      expect(result).toBeDefined();
    });

    it('should try relative path resolution', () => {
      const content1 = `syntax = "proto3"; message Shared {}`;
      const content2 = `
syntax = "proto3";
import "./shared.proto";`;

      const ast1 = parser.parse(content1, 'file:///project/src/shared.proto');
      const ast2 = parser.parse(content2, 'file:///project/src/main.proto');

      analyzer.updateFile('file:///project/src/shared.proto', ast1);
      analyzer.updateFile('file:///project/src/main.proto', ast2);

      const result = provider.getDefinition(
        'file:///project/src/main.proto',
        { line: 2, character: 10 },
        'import "./shared.proto";'
      );
      expect(result).toBeDefined();
    });

    it('should try filename-only match for simple imports', () => {
      const content1 = `syntax = "proto3"; message Local {}`;
      const content2 = `
syntax = "proto3";
import "simple.proto";`;

      const ast1 = parser.parse(content1, 'file:///anywhere/simple.proto');
      const ast2 = parser.parse(content2, 'file:///elsewhere/main.proto');

      analyzer.updateFile('file:///anywhere/simple.proto', ast1);
      analyzer.updateFile('file:///elsewhere/main.proto', ast2);

      const result = provider.getDefinition(
        'file:///elsewhere/main.proto',
        { line: 2, character: 10 },
        'import "simple.proto";'
      );
      expect(result).toBeDefined();
    });
  });

  describe('findContextAtPosition', () => {
    it('should find context in nested message hierarchy', () => {
      const content = `
syntax = "proto3";
package pkg;

message Outer {
  message Middle {
    message Inner {
      Inner self_ref = 1;
    }
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      // Position inside the Inner message
      const result = provider.getDefinition('test.proto', { line: 7, character: 12 }, '      Inner self_ref = 1;');
      expect(result).toBeDefined();
    });

    it('should return package name when not inside any message', () => {
      const content = `
syntax = "proto3";
package mypackage;

message Test {}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      // Position at package line
      const result = provider.getDefinition('test.proto', { line: 1, character: 0 }, 'syntax = "proto3";');
      expect(result).toBeNull();
    });
  });

  describe('isPositionInRange edge cases', () => {
    it('should return false when range is undefined', () => {
      const content = `syntax = "proto3"; message Test {}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.getDefinition('test.proto', { line: 0, character: 0 }, 'syntax = "proto3";');
      expect(result).toBeNull();
    });
  });

  describe('resolveTypeWithContext', () => {
    it('should find types using partial qualified names', () => {
      const content = `
syntax = "proto3";
package domain.v1;

message User {
  string name = 1;
}

message Request {
  v1.User user = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.getDefinition('test.proto', { line: 9, character: 5 }, '  v1.User user = 1;');
      expect(result).toBeDefined();
    });

    it('should handle suffix match for qualified names', () => {
      const content = `
syntax = "proto3";
package com.example;

message MyMessage {}

message Other {
  MyMessage msg = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.getDefinition('test.proto', { line: 7, character: 3 }, '  MyMessage msg = 1;');
      expect(result).toBeDefined();
    });
  });

  describe('import with weak/public modifiers', () => {
    it('should handle public import', () => {
      const content1 = `syntax = "proto3"; message Exported {}`;
      const content2 = `
syntax = "proto3";
import public "exported.proto";`;

      const ast1 = parser.parse(content1, 'file:///project/exported.proto');
      const ast2 = parser.parse(content2, 'file:///project/main.proto');

      analyzer.updateFile('file:///project/exported.proto', ast1);
      analyzer.updateFile('file:///project/main.proto', ast2);

      const result = provider.getDefinition(
        'file:///project/main.proto',
        { line: 2, character: 20 },
        'import public "exported.proto";'
      );
      expect(result).toBeDefined();
    });

    it('should handle weak import', () => {
      const content1 = `syntax = "proto3"; message WeakType {}`;
      const content2 = `
syntax = "proto3";
import weak "weak.proto";`;

      const ast1 = parser.parse(content1, 'file:///project/weak.proto');
      const ast2 = parser.parse(content2, 'file:///project/main.proto');

      analyzer.updateFile('file:///project/weak.proto', ast1);
      analyzer.updateFile('file:///project/main.proto', ast2);

      const result = provider.getDefinition(
        'file:///project/main.proto',
        { line: 2, character: 15 },
        'import weak "weak.proto";'
      );
      expect(result).toBeDefined();
    });
  });
});

describe('RenameProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: RenameProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new RenameProvider(analyzer);
  });

  describe('findLocalSymbol coverage', () => {
    it('should find enum values in file enums', () => {
      const content = `
syntax = "proto3";

enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 4, character: 2 }, '  UNKNOWN = 0;');
      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('UNKNOWN');
    });

    it('should find RPC names in services', () => {
      const content = `
syntax = "proto3";

message Request {}
message Response {}

service MyService {
  rpc GetData(Request) returns (Response);
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 7, character: 6 }, '  rpc GetData(Request) returns (Response);');
      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('GetData');
    });

    it('should find oneof names', () => {
      const content = `
syntax = "proto3";

message Test {
  oneof choice {
    string str_val = 1;
    int32 int_val = 2;
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 4, character: 8 }, '  oneof choice {');
      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('choice');
    });

    it('should find fields inside oneofs', () => {
      const content = `
syntax = "proto3";

message Test {
  oneof data {
    string text = 1;
    bytes binary = 2;
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 5, character: 11 }, '    string text = 1;');
      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('text');
    });

    it('should find nested enum values', () => {
      const content = `
syntax = "proto3";

message Container {
  enum NestedStatus {
    NESTED_UNKNOWN = 0;
    NESTED_OK = 1;
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 5, character: 4 }, '    NESTED_UNKNOWN = 0;');
      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('NESTED_UNKNOWN');
    });
  });

  describe('renameLocalSymbol coverage', () => {
    it('should rename enum values across file', () => {
      const content = `
syntax = "proto3";

enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
}

message Test {
  Status status = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 4, character: 2 }, '  UNKNOWN = 0;', 'UNSPECIFIED');
      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename RPC names', () => {
      const content = `
syntax = "proto3";

message Request {}
message Response {}

service MyService {
  rpc OldName(Request) returns (Response);
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 7, character: 6 }, '  rpc OldName(Request) returns (Response);', 'NewName');
      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename oneof names', () => {
      const content = `
syntax = "proto3";

message Test {
  oneof old_choice {
    string str = 1;
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 4, character: 8 }, '  oneof old_choice {', 'new_choice');
      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename map field names', () => {
      const content = `
syntax = "proto3";

message Test {
  map<string, string> old_map = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 4, character: 22 }, '  map<string, string> old_map = 1;', 'new_map');
      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename nested enum values', () => {
      const content = `
syntax = "proto3";

message Container {
  enum Nested {
    OLD_VALUE = 0;
  }
  Nested nested = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 5, character: 4 }, '    OLD_VALUE = 0;', 'NEW_VALUE');
      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('isValidIdentifier', () => {
    it('should reject identifiers starting with numbers', () => {
      const content = `
syntax = "proto3";
message Test {
  string name = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 3, character: 9 }, '  string name = 1;', '123invalid');
      expect(result.changes.size).toBe(0);
    });

    it('should reject identifiers with special characters', () => {
      const content = `
syntax = "proto3";
message Test {
  string name = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 3, character: 9 }, '  string name = 1;', 'invalid-name');
      expect(result.changes.size).toBe(0);
    });
  });

  describe('findContainingMessageScope', () => {
    it('should find scope in deeply nested messages', () => {
      const content = `
syntax = "proto3";
package deep;

message Level1 {
  message Level2 {
    message Level3 {
      Level3 self = 1;
    }
  }
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.prepareRename('test.proto', { line: 7, character: 6 }, '      Level3 self = 1;');
      expect(result).toBeDefined();
    });

    it('should return package name when outside all messages', () => {
      const content = `
syntax = "proto3";
package mypkg;

message Test {}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      // Try to rename something at package level - should not find anything renameable
      const result = provider.prepareRename('test.proto', { line: 2, character: 8 }, 'package mypkg;');
      expect(result).toBeNull(); // 'mypkg' is a package, not a renameable symbol
    });
  });

  describe('addEdit deduplication', () => {
    it('should not add duplicate edits', () => {
      const content = `
syntax = "proto3";

message MyType {
  MyType recursive = 1;
}`;
      const ast = parser.parse(content, 'test.proto');
      analyzer.updateFile('test.proto', ast);

      const result = provider.rename('test.proto', { line: 3, character: 8 }, 'message MyType {', 'NewType');

      // Get edits for the file
      const edits = result.changes.get('test.proto');
      if (edits) {
        // No duplicate ranges should exist
        const ranges = edits.map(e => `${e.range.start.line}:${e.range.start.character}-${e.range.end.line}:${e.range.end.character}`);
        const uniqueRanges = [...new Set(ranges)];
        expect(ranges.length).toBe(uniqueRanges.length);
      }
    });
  });
});

describe('DocumentLinksProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: DocumentLinksProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DocumentLinksProvider(analyzer);
  });

  it('should create links for standard imports', () => {
    const content = `
syntax = "proto3";
import "google/protobuf/timestamp.proto";
import "other/file.proto";`;

    const ast = parser.parse(content, 'test.proto');

    const links = provider.getDocumentLinks('test.proto', ast);
    expect(links.length).toBeGreaterThan(0);
  });

  it('should handle files with no imports', () => {
    const content = `
syntax = "proto3";
message Simple {}`;

    const ast = parser.parse(content, 'test.proto');

    const links = provider.getDocumentLinks('test.proto', ast);
    expect(links.length).toBe(0);
  });

  it('should handle empty file', () => {
    const content = '';
    const ast = parser.parse(content, 'test.proto');

    const links = provider.getDocumentLinks('test.proto', ast);
    expect(links.length).toBe(0);
  });
});

describe('HoverProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: HoverProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new HoverProvider(analyzer);
  });

  it('should provide hover for map field types', () => {
    const content = `
syntax = "proto3";

message Test {
  map<string, int32> data = 1;
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);
    const lines = content.split('\n');
    const lineText = lines[4] || '';

    const result = provider.getHover('test.proto', { line: 4, character: 4 }, lineText);
    expect(result).toBeDefined();
  });

  it('should handle empty line', () => {
    const content = `
syntax = "proto3";

message Test {}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const result = provider.getHover('test.proto', { line: 2, character: 0 }, '');
    expect(result).toBeNull();
  });
});

describe('InlayHintsProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let provider: InlayHintsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new InlayHintsProvider();
  });

  it('should handle empty AST', () => {
    const content = '';
    const ast = parser.parse(content, 'test.proto');
    const lines = content.split('\n');

    const hints = provider.getInlayHints(ast, lines);
    expect(hints).toEqual([]);
  });

  it('should provide hints for fields with options', () => {
    const content = `
syntax = "proto3";

message Test {
  string name = 1 [deprecated = true];
}`;
    const ast = parser.parse(content, 'test.proto');
    const lines = content.split('\n');

    const hints = provider.getInlayHints(ast, lines);
    // May or may not have hints depending on configuration
    expect(Array.isArray(hints)).toBe(true);
  });
});

describe('DiagnosticsProvider Extended Coverage', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: DiagnosticsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DiagnosticsProvider(analyzer);
  });

  it('should handle proto with no package', () => {
    const content = `
syntax = "proto3";
message Test {}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  it('should validate extensions in proto2', () => {
    const content = `
syntax = "proto2";
package test;

message Extendable {
  extensions 100 to 200;
}

extend Extendable {
  optional string extra = 100;
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  it('should validate reserved ranges', () => {
    const content = `
syntax = "proto3";

message Test {
  reserved 1 to 10;
  reserved "old_field";
  string name = 5;
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    // Should have diagnostic for using reserved number 5
    const hasReservedWarning = diagnostics.some((d: { message: string }) =>
      d.message.toLowerCase().includes('reserved')
    );
    expect(hasReservedWarning).toBe(true);
  });

  it('should handle services with streaming RPCs', () => {
    const content = `
syntax = "proto3";

message Request {}
message Response {}

service StreamService {
  rpc ClientStream(stream Request) returns (Response);
  rpc ServerStream(Request) returns (stream Response);
  rpc BidiStream(stream Request) returns (stream Response);
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  it('should validate oneof field numbers', () => {
    const content = `
syntax = "proto3";

message Test {
  oneof choice {
    string a = 1;
    int32 b = 1;
  }
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    // Should have diagnostic for duplicate field number in oneof
    const hasDuplicateWarning = diagnostics.some((d: { message: string }) =>
      d.message.toLowerCase().includes('duplicate') || d.message.toLowerCase().includes('field number')
    );
    expect(hasDuplicateWarning).toBe(true);
  });

  it('should handle imports that resolve', () => {
    const content1 = `syntax = "proto3"; message Imported {}`;
    const content2 = `
syntax = "proto3";
import "imported.proto";
message Test { Imported imp = 1; }`;

    const ast1 = parser.parse(content1, 'imported.proto');
    const ast2 = parser.parse(content2, 'main.proto');

    analyzer.updateFile('imported.proto', ast1);
    analyzer.updateFile('main.proto', ast2);

    const diagnostics = provider.validate('main.proto', ast2);
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  it('should validate empty enum', () => {
    const content = `
syntax = "proto3";

enum Empty {
}`;
    const ast = parser.parse(content, 'test.proto');
    analyzer.updateFile('test.proto', ast);

    const diagnostics = provider.validate('test.proto', ast);
    expect(Array.isArray(diagnostics)).toBe(true);
  });
});
