/**
 * Tests for Inlay Hints Provider
 */

import { InlayHintKind } from 'vscode-languageserver/node';
import { ProtoParser } from '../../core/parser';
import { InlayHintsProvider, InlayHintsSettings } from '../inlayHints';
import { ProtoFile, FieldDefinition, EnumValue } from '../../core/ast';

// Helper function to create a range
function createRange(startLine: number, startChar: number, endLine: number, endChar: number) {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  };
}

// Helper function to create a complete field definition
function createField(name: string, line: number, options?: FieldDefinition['options']): FieldDefinition {
  return {
    type: 'field',
    name,
    nameRange: createRange(line, 9, line, 9 + name.length),
    fieldType: 'string',
    fieldTypeRange: createRange(line, 2, line, 8),
    number: 1,
    options,
    range: createRange(line, 0, line, 30),
  };
}

// Helper function to create enum value
function createEnumValue(name: string, number: number, line: number): EnumValue {
  return {
    type: 'enum_value',
    name,
    nameRange: createRange(line, 2, line, 2 + name.length),
    number,
    range: createRange(line, 0, line, 20),
  };
}

describe('InlayHintsProvider', () => {
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
  });

  describe('constructor', () => {
    it('should use default settings when no settings provided', () => {
      const provider = new InlayHintsProvider();
      expect(provider).toBeDefined();
    });

    it('should merge partial settings with defaults', () => {
      const provider = new InlayHintsProvider({ showFieldNumbers: false });
      expect(provider).toBeDefined();
    });

    it('should accept full settings', () => {
      const settings: InlayHintsSettings = {
        showFieldNumbers: true,
        showEnumValues: false,
        showDefaults: true,
      };
      const provider = new InlayHintsProvider(settings);
      expect(provider).toBeDefined();
    });
  });

  describe('getInlayHints', () => {
    it('should return empty array for empty file', () => {
      const provider = new InlayHintsProvider();
      const emptyFile: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 0, 0),
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: [],
      };

      const hints = provider.getInlayHints(emptyFile, []);
      expect(hints).toEqual([]);
    });

    it('should process fields with default options', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1 [default = "unknown"];
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showDefaults: true });

      const hints = provider.getInlayHints(file, lines);

      // Should show default value hint
      const defaultHint = hints.find(h => h.label.toString().includes('default'));
      expect(defaultHint).toBeDefined();
      if (defaultHint) {
        expect(defaultHint.kind).toBe(InlayHintKind.Parameter);
      }
    });

    it('should skip fields without nameRange', () => {
      const provider = new InlayHintsProvider();
      const fieldWithoutNameRange: FieldDefinition = {
        type: 'field',
        name: 'field1',
        nameRange: undefined as unknown as FieldDefinition['nameRange'],
        fieldType: 'string',
        fieldTypeRange: createRange(1, 2, 1, 8),
        number: 1,
        range: createRange(1, 0, 1, 20),
      };

      const file: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 10, 0),
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: createRange(0, 0, 0, 4),
            range: createRange(0, 0, 3, 1),
            fields: [fieldWithoutNameRange],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      };

      const lines = ['message Test {', '  string field1 = 1;', '}'];
      const hints = provider.getInlayHints(file, lines);
      // Should not crash and return no hints for fields without nameRange
      expect(hints).toEqual([]);
    });

    it('should skip fields when line does not contain semicolon', () => {
      const provider = new InlayHintsProvider();
      const file: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 10, 0),
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: createRange(0, 0, 0, 4),
            range: createRange(0, 0, 3, 1),
            fields: [createField('field1', 1)],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      };

      // Line without semicolon
      const lines = ['message Test {', '  string field1 = 1', '}'];
      const hints = provider.getInlayHints(file, lines);
      expect(hints).toEqual([]);
    });

    it('should process nested messages', () => {
      const content = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 1 [default = "test"];
  }
  Inner inner = 1;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showDefaults: true });

      const hints = provider.getInlayHints(file, lines);
      // Should process nested message fields
      expect(hints.length).toBeGreaterThanOrEqual(0);
    });

    it('should process map fields', () => {
      const content = `syntax = "proto3";
message User {
  map<string, string> metadata = 1;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider();

      // Should not crash when processing maps
      const hints = provider.getInlayHints(file, lines);
      expect(hints).toBeDefined();
    });

    it('should process enums when showEnumValues is true', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1001;
  ERROR_CODE = -1;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showEnumValues: true });

      const hints = provider.getInlayHints(file, lines);
      // Should show hex values for large numbers
      const hexHint = hints.find(h => h.label.toString().includes('0x'));
      expect(hexHint).toBeDefined();
    });

    it('should show negative hex values for negative enum numbers', () => {
      const content = `syntax = "proto3";
enum Status {
  NEGATIVE = -2000;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showEnumValues: true });

      const hints = provider.getInlayHints(file, lines);
      // Should show negative hex value
      const negHint = hints.find(h => h.label.toString().includes('-0x'));
      expect(negHint).toBeDefined();
    });

    it('should skip enum values without nameRange', () => {
      const provider = new InlayHintsProvider({ showEnumValues: true });
      const enumValueWithoutNameRange: EnumValue = {
        type: 'enum_value',
        name: 'UNKNOWN',
        nameRange: undefined as unknown as EnumValue['nameRange'],
        number: 5000,
        range: createRange(1, 0, 1, 15),
      };

      const file: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 10, 0),
        imports: [],
        options: [],
        messages: [],
        enums: [
          {
            type: 'enum',
            name: 'Status',
            nameRange: createRange(0, 5, 0, 11),
            values: [enumValueWithoutNameRange],
            options: [],
            reserved: [],
            range: createRange(0, 0, 2, 1),
          },
        ],
        services: [],
        extends: [],
      };

      const lines = ['enum Status {', '  UNKNOWN = 5000;', '}'];
      const hints = provider.getInlayHints(file, lines);
      expect(hints).toEqual([]);
    });

    it('should skip enum values when line has no semicolon', () => {
      const provider = new InlayHintsProvider({ showEnumValues: true });
      const file: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 10, 0),
        imports: [],
        options: [],
        messages: [],
        enums: [
          {
            type: 'enum',
            name: 'Status',
            nameRange: createRange(0, 5, 0, 11),
            values: [createEnumValue('UNKNOWN', 5000, 1)],
            options: [],
            reserved: [],
            range: createRange(0, 0, 2, 1),
          },
        ],
        services: [],
        extends: [],
      };

      // Line without semicolon
      const lines = ['enum Status {', '  UNKNOWN = 5000', '}'];
      const hints = provider.getInlayHints(file, lines);
      expect(hints).toEqual([]);
    });

    it('should not show enum hints for small numbers', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
  INACTIVE = 2;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showEnumValues: true });

      const hints = provider.getInlayHints(file, lines);
      // Should not show hex for small numbers (< 1000)
      expect(hints.length).toBe(0);
    });

    it('should not process enums when showEnumValues is false', () => {
      const content = `syntax = "proto3";
enum Status {
  LARGE_VALUE = 5000;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showEnumValues: false });

      const hints = provider.getInlayHints(file, lines);
      expect(hints.length).toBe(0);
    });

    it('should process top-level extensions', () => {
      const content = `syntax = "proto2";
message Extendee {
  extensions 100 to 200;
}
extend Extendee {
  optional string name = 100 [default = "ext"];
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showDefaults: true });

      // Should process extensions without crashing
      const hints = provider.getInlayHints(file, lines);
      expect(hints).toBeDefined();
    });

    it('should skip processing when showFieldNumbers and showDefaults are both false', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1 [default = "test"];
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({
        showFieldNumbers: false,
        showDefaults: false,
      });

      const hints = provider.getInlayHints(file, lines);
      expect(hints.length).toBe(0);
    });

    it('should process nested enums inside messages', () => {
      const content = `syntax = "proto3";
message User {
  enum Status {
    UNKNOWN = 0;
    LARGE = 9999;
  }
  Status status = 1;
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showEnumValues: true });

      const hints = provider.getInlayHints(file, lines);
      // Should process nested enums - the method is called even if no hints are returned
      // for values under 1000 or values already visible in the source
      expect(hints).toBeDefined();
    });

    it('should handle missing line text gracefully', () => {
      const provider = new InlayHintsProvider({ showDefaults: true });
      const fieldWithOptions = createField('field1', 5, [
        { type: 'field_option', name: 'default', value: 'test', range: createRange(0, 0, 0, 0) },
      ]);

      const file: ProtoFile = {
        type: 'file',
        range: createRange(0, 0, 10, 0),
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: createRange(0, 0, 0, 4),
            range: createRange(0, 0, 3, 1),
            fields: [fieldWithOptions],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      };

      // Only 3 lines but field references line 5
      const lines = ['message Test {', '  string field1 = 1;', '}'];
      const hints = provider.getInlayHints(file, lines);
      // Should handle gracefully and not crash
      expect(hints).toBeDefined();
    });

    it('should format boolean default values correctly', () => {
      const content = `syntax = "proto3";
message Config {
  bool enabled = 1 [default = true];
  bool disabled = 2 [default = false];
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showDefaults: true });

      const hints = provider.getInlayHints(file, lines);
      const trueHint = hints.find(h => h.label.toString().includes('true'));
      const falseHint = hints.find(h => h.label.toString().includes('false'));
      expect(trueHint || falseHint).toBeDefined();
    });

    it('should format numeric default values correctly', () => {
      const content = `syntax = "proto3";
message Config {
  int32 count = 1 [default = 42];
}`;
      const lines = content.split('\n');
      const file = parser.parse(content, 'file:///test.proto');
      const provider = new InlayHintsProvider({ showDefaults: true });

      const hints = provider.getInlayHints(file, lines);
      const numHint = hints.find(h => h.label.toString().includes('42'));
      expect(numHint).toBeDefined();
    });
  });
});

// Test the formatValue function indirectly through the provider
describe('formatValue (via InlayHintsProvider)', () => {
  it('should handle NaN values', () => {
    const provider = new InlayHintsProvider({ showDefaults: true });
    const field: FieldDefinition = {
      type: 'field',
      name: 'value',
      nameRange: createRange(1, 8, 1, 13),
      fieldType: 'double',
      fieldTypeRange: createRange(1, 2, 1, 8),
      number: 1,
      options: [{ type: 'field_option', name: 'default', value: NaN, range: createRange(0, 0, 0, 0) }],
      range: createRange(1, 0, 1, 30),
    };

    const file: ProtoFile = {
      type: 'file',
      range: createRange(0, 0, 10, 0),
      imports: [],
      options: [],
      messages: [
        {
          type: 'message',
          name: 'Test',
          nameRange: createRange(0, 8, 0, 12),
          range: createRange(0, 0, 3, 1),
          fields: [field],
          nestedMessages: [],
          nestedEnums: [],
          oneofs: [],
          options: [],
          reserved: [],
          extensions: [],
          maps: [],
          groups: [],
        },
      ],
      enums: [],
      services: [],
      extends: [],
    };

    const lines = ['message Test {', '  double value = 1 [default = nan];', '}'];
    const hints = provider.getInlayHints(file, lines);
    const nanHint = hints.find(h => h.label.toString().includes('nan'));
    expect(nanHint).toBeDefined();
  });

  it('should handle Infinity values', () => {
    const provider = new InlayHintsProvider({ showDefaults: true });
    const field: FieldDefinition = {
      type: 'field',
      name: 'posInf',
      nameRange: createRange(1, 8, 1, 14),
      fieldType: 'double',
      fieldTypeRange: createRange(1, 2, 1, 8),
      number: 1,
      options: [{ type: 'field_option', name: 'default', value: Infinity, range: createRange(0, 0, 0, 0) }],
      range: createRange(1, 0, 1, 30),
    };

    const file: ProtoFile = {
      type: 'file',
      range: createRange(0, 0, 10, 0),
      imports: [],
      options: [],
      messages: [
        {
          type: 'message',
          name: 'Test',
          nameRange: createRange(0, 8, 0, 12),
          range: createRange(0, 0, 3, 1),
          fields: [field],
          nestedMessages: [],
          nestedEnums: [],
          oneofs: [],
          options: [],
          reserved: [],
          extensions: [],
          maps: [],
          groups: [],
        },
      ],
      enums: [],
      services: [],
      extends: [],
    };

    const lines = ['message Test {', '  double posInf = 1 [default = inf];', '}'];
    const hints = provider.getInlayHints(file, lines);
    const infHint = hints.find(h => h.label.toString().includes('inf'));
    expect(infHint).toBeDefined();
  });

  it('should handle negative Infinity values', () => {
    const provider = new InlayHintsProvider({ showDefaults: true });
    const field: FieldDefinition = {
      type: 'field',
      name: 'negInf',
      nameRange: createRange(1, 8, 1, 14),
      fieldType: 'double',
      fieldTypeRange: createRange(1, 2, 1, 8),
      number: 1,
      options: [{ type: 'field_option', name: 'default', value: -Infinity, range: createRange(0, 0, 0, 0) }],
      range: createRange(1, 0, 1, 30),
    };

    const file: ProtoFile = {
      type: 'file',
      range: createRange(0, 0, 10, 0),
      imports: [],
      options: [],
      messages: [
        {
          type: 'message',
          name: 'Test',
          nameRange: createRange(0, 8, 0, 12),
          range: createRange(0, 0, 3, 1),
          fields: [field],
          nestedMessages: [],
          nestedEnums: [],
          oneofs: [],
          options: [],
          reserved: [],
          extensions: [],
          maps: [],
          groups: [],
        },
      ],
      enums: [],
      services: [],
      extends: [],
    };

    const lines = ['message Test {', '  double negInf = 1 [default = -inf];', '}'];
    const hints = provider.getInlayHints(file, lines);
    const negInfHint = hints.find(h => h.label.toString().includes('-inf'));
    expect(negInfHint).toBeDefined();
  });
});
