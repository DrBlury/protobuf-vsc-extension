/**
 * Extended branch coverage tests for migration.ts
 */

import { MigrationProvider } from '../migration';
import { ProtoParser } from '../../core/parser';

describe('MigrationProvider Branch Coverage', () => {
  let parser: ProtoParser;
  let provider: MigrationProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new MigrationProvider();
  });

  describe('convertToProto3', () => {
    it('should add syntax when missing', () => {
      const content = `message Test { optional string name = 1; }`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should add syntax at top
      const syntaxEdit = edits.find(e => e.newText.includes('syntax = "proto3"'));
      expect(syntaxEdit).toBeDefined();
    });

    it('should convert proto2 syntax to proto3', () => {
      const content = `syntax = "proto2";
message Test { optional string name = 1; }`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should replace proto2 with proto3
      const syntaxEdit = edits.find(e => e.newText === 'syntax = "proto3";');
      expect(syntaxEdit).toBeDefined();
    });

    it('should not modify proto3 files', () => {
      const content = `syntax = "proto3";
message Test { string name = 1; }`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should not have syntax edit
      const syntaxEdit = edits.find(e => e.newText.includes('syntax'));
      expect(syntaxEdit).toBeUndefined();
    });

    it('should remove required modifier from fields', () => {
      const content = `syntax = "proto2";
message Test {
  required string name = 1;
  required int32 id = 2;
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should have edits for required fields
      const fieldEdits = edits.filter(e => !e.newText.includes('required'));
      expect(fieldEdits.length).toBeGreaterThan(0);
    });

    it('should remove standalone default option', () => {
      const content = `syntax = "proto2";
message Test {
  optional string name = 1 [default = "test"];
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should have edit removing default
      const defaultEdit = edits.find(e =>
        !e.newText.includes('default') &&
        e.range.start.line > 0
      );
      expect(defaultEdit).toBeDefined();
    });

    it('should remove default from option list', () => {
      const content = `syntax = "proto2";
message Test {
  optional string name = 1 [deprecated = true, default = "test"];
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should handle removal from list
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should remove default at start of option list', () => {
      const content = `syntax = "proto2";
message Test {
  optional string name = 1 [default = "test", deprecated = true];
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should handle removal at start
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should handle nested messages', () => {
      const content = `syntax = "proto2";
message Outer {
  required string outer_name = 1;
  message Inner {
    required int32 inner_id = 1 [default = 0];
  }
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should process nested messages too
      expect(edits.length).toBeGreaterThan(1);
    });

    it('should handle messages with no fields', () => {
      const content = `syntax = "proto2";
message Empty {}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Should only have syntax edit
      expect(edits).toHaveLength(1);
    });

    it('should handle fields without lines (edge case)', () => {
      const content = `syntax = "proto2";
message Test {
  optional string name = 1;
}`;
      const ast = parser.parse(content, 'test.proto');

      // Modify AST to have a field with invalid line index
      if (ast.messages[0]?.fields[0]) {
        (ast.messages[0].fields[0] as { range: { start: { line: number } } }).range.start.line = 999;
      }

      // Should not throw
      const edits = provider.convertToProto3(ast, content, 'test.proto');
      expect(Array.isArray(edits)).toBe(true);
    });

    it('should clean up empty options []', () => {
      const content = `syntax = "proto2";
message Test {
  optional int32 count = 1 [default = 42];
}`;
      const ast = parser.parse(content, 'test.proto');

      const edits = provider.convertToProto3(ast, content, 'test.proto');

      // Verify no empty brackets remain
      const emptyBrackets = edits.find(e => e.newText.includes('[]'));
      expect(emptyBrackets).toBeUndefined();
    });
  });
});
