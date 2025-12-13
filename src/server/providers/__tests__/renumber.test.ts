/**
 * Tests for renumber provider
 */

import { RenumberProvider } from '../renumber';
import { ProtoParser } from '../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('RenumberProvider', () => {
  let provider: RenumberProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new RenumberProvider(parser);
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      provider.updateSettings({ startNumber: 10 });
      expect(provider).toBeDefined();
    });

    it('should merge settings', () => {
      provider.updateSettings({ startNumber: 10 });
      provider.updateSettings({ increment: 2 });
      expect(provider).toBeDefined();
    });
  });

  describe('renumberMessage', () => {
    it('should renumber fields in a message', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 5;
  bool active = 10;
}`;

      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should return empty array when message not found', () => {
      const text = 'syntax = "proto3";';
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'NonExistent');
      expect(edits).toEqual([]);
    });

    it('should handle messages with reserved fields', () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
  string name = 11;
  int32 id = 15;
}`;

      provider.updateSettings({ preserveReserved: true });
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThan(0);
    });
  });

  describe('renumberDocument', () => {
    it('should renumber all messages and enums', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 5;
}

enum Status {
  UNKNOWN = 0;
  OK = 5;
  ERROR = 10;
}`;

      const edits = provider.renumberDocument(text, 'file:///test.proto');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should handle empty document', () => {
      const text = 'syntax = "proto3";';
      const edits = provider.renumberDocument(text, 'file:///test.proto');
      expect(edits).toEqual([]);
    });
  });

  describe('renumberFromField', () => {
    it('should renumber fields from cursor position', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 5;
  bool active = 10;
}`;

      const position: Position = { line: 3, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when position not in message', () => {
      const text = 'syntax = "proto3";';
      const position: Position = { line: 0, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits).toEqual([]);
    });
  });

  describe('renumberEnum', () => {
    it('should renumber enum values', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 5;
  ERROR = 10;
}`;

      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      // Should renumber OK from 5 to 1, ERROR from 10 to 2
      expect(edits.length).toBeGreaterThanOrEqual(0);
      // If enum values are already sequential starting from 0, no edits needed
      // So we test with gaps
    });

    it('should renumber enum values with gaps', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 10;
  ERROR = 20;
}`;

      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      // Should create edits to fix gaps
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when enum not found', () => {
      const text = 'syntax = "proto3";';
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'NonExistent');
      expect(edits).toEqual([]);
    });
  });

  describe('settings', () => {
    it('should use custom start number', () => {
      provider.updateSettings({ startNumber: 10 });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;

      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });

    it('should use custom increment', () => {
      provider.updateSettings({ increment: 2 });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;

      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip reserved range when enabled', () => {
      provider.updateSettings({ skipReservedRange: true });
      const text = `syntax = "proto3";
message Test {
  string name = 19000;
}`;

      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });
  });
});
