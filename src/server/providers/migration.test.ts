/**
 * Tests for migration provider
 */

import { MigrationProvider } from './migration';
import { ProtoParser } from '../core/parser';

describe('MigrationProvider', () => {
  let provider: MigrationProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    provider = new MigrationProvider();
    parser = new ProtoParser();
  });

  describe('convertToProto3', () => {
    it('should convert proto2 syntax to proto3', () => {
      const text = 'syntax = "proto2";\nmessage Test {}';
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
      const syntaxEdit = edits.find(e => e.newText.includes('proto3'));
      expect(syntaxEdit).toBeDefined();
    });

    it('should add syntax when missing', () => {
      const text = 'message Test {}';
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
      const syntaxEdit = edits.find(e => e.newText.includes('syntax = "proto3"'));
      expect(syntaxEdit).toBeDefined();
    });

    it('should remove required modifier from fields', () => {
      const text = `syntax = "proto2";
message Test {
  required string name = 1;
}`;
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
      const requiredEdit = edits.find(e => e.newText && !e.newText.includes('required'));
      expect(requiredEdit).toBeDefined();
    });

    it('should remove default option from fields', () => {
      const text = `syntax = "proto2";
message Test {
  string name = 1 [default = "test"];
}`;
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
      const defaultEdit = edits.find(e => e.newText && !e.newText.includes('default'));
      expect(defaultEdit).toBeDefined();
    });

    it('should handle nested messages', () => {
      const text = `syntax = "proto2";
message Outer {
  required string name = 1;
  message Inner {
    required int32 id = 1;
  }
}`;
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
    });

    it('should handle fields with multiple options', () => {
      const text = `syntax = "proto2";
message Test {
  string name = 1 [default = "test", deprecated = true];
}`;
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      expect(edits.length).toBeGreaterThan(0);
    });

    it('should handle already proto3 files', () => {
      const text = 'syntax = "proto3";\nmessage Test {}';
      const file = parser.parse(text, 'file:///test.proto');
      const edits = provider.convertToProto3(file, text, 'file:///test.proto');

      // Should not modify syntax
      const syntaxEdit = edits.find(e => e.newText && e.newText.includes('proto2'));
      expect(syntaxEdit).toBeUndefined();
    });
  });
});
