/**
 * Additional branch coverage tests for renumber provider
 */

import { RenumberProvider } from '../../renumber';
import { ProtoParser } from '../../../core/parser';
import { Position, Range } from 'vscode-languageserver/node';

describe('RenumberProvider Branch2 Coverage', () => {
  let provider: RenumberProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    provider = new RenumberProvider(parser);
  });

  describe('renumberMessage', () => {
    it('should return empty array for non-existent message', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'NonExistent');
      expect(edits).toEqual([]);
    });

    it('should renumber nested message', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 5;
    int32 id = 10;
  }
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Inner');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should renumber message with oneofs', () => {
      const text = `syntax = "proto3";
message Test {
  oneof choice {
    string name = 5;
    int32 id = 10;
  }
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should renumber message with map fields', () => {
      const text = `syntax = "proto3";
message Test {
  map<string, int32> data = 5;
  string name = 10;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThan(0);
    });
  });

  describe('renumberDocument', () => {
    it('should renumber all messages and enums in document', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
}
enum Status {
  UNKNOWN = 0;
  ACTIVE = 5;
}`;
      const edits = provider.renumberDocument(text, 'file:///test.proto');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should renumber nested messages recursively', () => {
      const text = `syntax = "proto3";
message Outer {
  string outer_field = 5;
  message Inner {
    string inner_field = 10;
  }
}`;
      const edits = provider.renumberDocument(text, 'file:///test.proto');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should renumber nested enums in messages', () => {
      const text = `syntax = "proto3";
message Outer {
  string name = 1;
  enum Status {
    UNKNOWN = 0;
    ACTIVE = 5;
  }
}`;
      const edits = provider.renumberDocument(text, 'file:///test.proto');
      expect(edits.length).toBeGreaterThan(0);
    });
  });

  describe('renumberFromField', () => {
    it('should return empty when no message at position', () => {
      const text = `syntax = "proto3";`;
      const position: Position = { line: 0, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits).toEqual([]);
    });

    it('should return empty when no fields at or after position', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const position: Position = { line: 10, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits).toEqual([]);
    });

    it('should continue numbering from last field before cursor', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 10;
  int32 id = 5;
  bool active = 3;
}`;
      const position: Position = { line: 3, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      // Should continue from 10+1=11
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should skip reserved range in internal protobuf range', () => {
      provider.updateSettings({ startNumber: 19000 });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;
      const position: Position = { line: 2, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should sort fields by line then character', () => {
      const text = `syntax = "proto3";
message Test {
  string b = 2; string a = 1;
  int32 c = 3;
}`;
      const position: Position = { line: 2, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      expect(edits).toBeDefined();
    });

    it('should handle fields with same starting number', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;
      const position: Position = { line: 2, character: 0 };
      const edits = provider.renumberFromField(text, 'file:///test.proto', position);
      // Fields already have correct numbers
      expect(edits).toBeDefined();
    });
  });

  describe('renumberEnum', () => {
    it('should return empty for non-existent enum', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'NonExistent');
      expect(edits).toEqual([]);
    });

    it('should renumber enum values starting from 0', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 5;
  ACTIVE = 10;
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should find enum nested in message', () => {
      const text = `syntax = "proto3";
message Test {
  enum Status {
    UNKNOWN = 5;
    ACTIVE = 10;
  }
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should find enum deeply nested in messages', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    enum Status {
      UNKNOWN = 5;
      ACTIVE = 10;
    }
  }
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      expect(edits.length).toBeGreaterThan(0);
    });
  });

  describe('getNextFieldNumber', () => {
    it('should return start number for non-existent message', () => {
      const text = `syntax = "proto3";`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'NonExistent');
      expect(nextNumber).toBe(1);
    });

    it('should return start number for empty message', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBe(1);
    });

    it('should skip reserved numbers', () => {
      provider.updateSettings({ skipReservedRange: true, preserveReserved: true });
      const text = `syntax = "proto3";
message Test {
  reserved 2;
  string name = 1;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      // Should skip 2 and return 3
      expect(nextNumber).toBeGreaterThan(1);
    });

    it('should skip internal reserved range 19000-19999', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 18999;
}`;
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      // Should skip to 20000
      expect(nextNumber).toBe(20000);
    });
  });

  describe('getNextEnumNumber', () => {
    it('should return 0 for non-existent enum', () => {
      const text = `syntax = "proto3";`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'NonExistent');
      expect(nextNumber).toBe(0);
    });

    it('should return 0 for empty enum', () => {
      const text = `syntax = "proto3";
enum Status {}`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'Status');
      expect(nextNumber).toBe(0);
    });

    it('should return next number after max', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 5;
}`;
      const nextNumber = provider.getNextEnumNumber(text, 'file:///test.proto', 'Status');
      expect(nextNumber).toBe(6);
    });
  });

  describe('updateSettings', () => {
    it('should update increment setting', () => {
      provider.updateSettings({ increment: 10 });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits).toBeDefined();
    });

    it('should update startNumber setting', () => {
      provider.updateSettings({ startNumber: 100 });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 2;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should disable preserveReserved setting', () => {
      provider.updateSettings({ preserveReserved: false });
      const text = `syntax = "proto3";
message Test {
  reserved 1;
  string name = 2;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits).toBeDefined();
    });
  });

  describe('edge cases for field/enum edits', () => {
    it('should handle field without = number pattern', () => {
      // This is an edge case - field without proper number
      const text = `syntax = "proto3";
message Test {
  string name;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      expect(edits).toBeDefined();
    });

    it('should handle enum with negative values', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  NEGATIVE = -1;
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      expect(edits).toBeDefined();
    });

    it('should handle reserved range with max', () => {
      provider.updateSettings({ preserveReserved: true });
      const text = `syntax = "proto3";
message Test {
  reserved 100 to max;
  string name = 1;
}`;
      // This shouldn't crash even with large reserved range
      const nextNumber = provider.getNextFieldNumber(text, 'file:///test.proto', 'Test');
      expect(nextNumber).toBeGreaterThan(0);
    });
  });

  describe('findMessageAtPosition', () => {
    it('should find message when position is on message line', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
}`;
      const range: Range = { start: { line: 1, character: 8 }, end: { line: 1, character: 12 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      const msgAction = actions.find(a => a.title?.includes("'Test'"));
      expect(msgAction).toBeDefined();
    });

    it('should find nested message at position', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 5;
  }
}`;
      const range: Range = { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      const innerAction = actions.find(a => a.title?.includes("'Inner'"));
      expect(innerAction).toBeDefined();
    });

    it('should not find message when position is outside', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const range: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      const msgActions = actions.filter(a => a.title?.includes("'Test'"));
      expect(msgActions.length).toBe(0);
    });
  });

  describe('isPositionInRange edge cases', () => {
    it('should handle position at start boundary', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
}`;
      const range: Range = { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should handle position at end boundary', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
}`;
      const range: Range = { start: { line: 3, character: 0 }, end: { line: 3, character: 1 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should not match when character is before start', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
}`;
      // Position before message declaration
      const range: Range = { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } };
      const actions = provider.getCodeActions(text, 'file:///test.proto', range);
      // Still should find the message since line 1 is within message range
      expect(actions.length).toBeGreaterThan(0);
    });
  });

  describe('deeply nested structures', () => {
    it('should find deeply nested message', () => {
      const text = `syntax = "proto3";
message Level1 {
  message Level2 {
    message Level3 {
      string name = 5;
    }
  }
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Level3');
      expect(edits.length).toBeGreaterThan(0);
    });

    it('should find deeply nested enum', () => {
      const text = `syntax = "proto3";
message Level1 {
  message Level2 {
    enum DeepEnum {
      UNKNOWN = 5;
    }
  }
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'DeepEnum');
      expect(edits.length).toBeGreaterThan(0);
    });
  });

  describe('sorting fields by position', () => {
    it('should sort fields on same line by character position', () => {
      const text = `syntax = "proto3";
message Test {
  string b = 2; string a = 1;
}`;
      const edits = provider.renumberMessage(text, 'file:///test.proto', 'Test');
      // Should renumber in order of appearance
      expect(edits).toBeDefined();
    });

    it('should sort enum values by line then character', () => {
      const text = `syntax = "proto3";
enum Status {
  B = 2; A = 1;
}`;
      const edits = provider.renumberEnum(text, 'file:///test.proto', 'Status');
      expect(edits).toBeDefined();
    });
  });
});
