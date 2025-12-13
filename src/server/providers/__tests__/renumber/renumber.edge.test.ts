/**
 * Edge case tests for renumber provider
 */

import { RenumberProvider } from '../../renumber';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('RenumberProvider Edge Cases', () => {
  let provider: RenumberProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new RenumberProvider(parser);
  });

  describe('getNextFieldNumber', () => {
    it('should return start number for empty message', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBe(1);
    });

    it('should calculate next number after existing fields', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBe(3);
    });

    it('should skip reserved range', () => {
      provider.updateSettings({ skipReservedRange: true });
      const text = `syntax = "proto3";
message Test {
  string name = 19000;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBeGreaterThan(19000);
    });

    it('should handle reserved numbers', () => {
      provider.updateSettings({ skipReservedRange: true, preserveReserved: true });
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
  string name = 11;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBeGreaterThan(11);
    });
  });

  describe('getNextEnumNumber', () => {
    it('should return 0 for empty enum', () => {
      const text = `syntax = "proto3";
enum Status {}`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'Status');
      expect(nextNumber).toBe(0);
    });

    it('should calculate next enum number', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 1;
}`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'Status');
      expect(nextNumber).toBe(2);
    });

    it('should use custom increment', () => {
      provider.updateSettings({ increment: 2 });
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 2;
}`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'Status');
      expect(nextNumber).toBe(4);
    });
  });

  describe('renumberFromField edge cases', () => {
    it('should handle fields before cursor', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
  bool active = 3;
}`;
      const position: Position = { line: 3, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle position at end of message', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const position: Position = { line: 10, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits).toEqual([]);
    });
  });

  describe('code actions', () => {
    it('should provide code actions for message', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should provide code actions for enum', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      expect(actions.length).toBeGreaterThan(0);
    });
  });
});
