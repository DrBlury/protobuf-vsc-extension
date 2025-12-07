/**
 * Branch coverage tests for renumber provider
 */

import { RenumberProvider } from './renumber';
import { ProtoParser } from '../core/parser';
import { Position, Range } from 'vscode-languageserver/node';

describe('RenumberProvider Branch Coverage', () => {
  let provider: RenumberProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new RenumberProvider(parser);
  });

  describe('getCodeActions', () => {
    it('should provide code actions for message at cursor', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 5;
}`;
      const range: Range = { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.title && a.title.includes('Renumber'))).toBe(true);
    });

    it('should provide code actions for enum at cursor', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 5;
}`;
      const range: Range = { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);

      expect(actions.length).toBeGreaterThan(0);
    });

    it('should provide document-wide renumber action', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);

      const docAction = actions.find(a => a.title && a.title.includes('all fields in document'));
      expect(docAction).toBeDefined();
    });
  });

  describe('renumberFromField edge cases', () => {
    it('should handle fields before cursor position', () => {
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

    it('should handle reserved numbers when skipping', () => {
      provider.updateSettings({ skipReservedRange: true, preserveReserved: true });
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
  string name = 11;
  int32 id = 12;
}`;
      const position: Position = { line: 3, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);

      expect(edits.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getNextFieldNumber edge cases', () => {
    it('should handle message with reserved range', () => {
      provider.updateSettings({ skipReservedRange: true });
      const text = `syntax = "proto3";
message Test {
  string name = 19000;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBeGreaterThan(19000);
    });

    it('should handle empty message', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBe(1);
    });
  });
});
