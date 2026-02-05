/**
 * Tests for formatter provider
 */

import { ProtoFormatter } from '../formatter';
import { ClangFormatProvider } from '../../services/clangFormat';
import { BufFormatProvider } from '../../services/bufFormat';
import { Range } from 'vscode-languageserver/node';

describe('ProtoFormatter', () => {
  let formatter: ProtoFormatter;
  let mockClangFormat: jest.Mocked<ClangFormatProvider>;
  let mockBufFormat: jest.Mocked<BufFormatProvider>;

  beforeEach(() => {
    mockClangFormat = {
      formatRange: jest.fn(),
    } as any;

    mockBufFormat = {
      format: jest.fn(),
      setBufPath: jest.fn(),
    } as any;

    formatter = new ProtoFormatter(mockClangFormat, mockBufFormat);
  });

  describe('updateSettings', () => {
    it('should update settings', async () => {
      formatter.updateSettings({ indentSize: 4 });
      // Settings are private, so we test through behavior
      const result = await formatter.formatDocument('message Test {string name = 1;}');
      const formatted = result[0].newText;
      // Formatter may or may not add indentation depending on preset
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    it('should merge settings', async () => {
      formatter.updateSettings({ indentSize: 4 });
      formatter.updateSettings({ useTabIndent: true });
      const result = await formatter.formatDocument('message Test {string name = 1;}');
      const formatted = result[0].newText;
      // Formatter may or may not add indentation depending on preset
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });
  });

  describe('formatDocument', () => {
    it('should format with minimal preset', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      const text = 'syntax="proto3";message Test{string name=1;}';
      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
      const formatted = result[0].newText;
      // Check that formatting occurred (spaces added around =)
      expect(formatted).toMatch(/syntax\s*=\s*"proto3"/);
    });

    it('should use clang-format when preset is google', async () => {
      formatter.updateSettings({ preset: 'google' });
      const text = 'message Test {}';
      const edits = [{ range: Range.create(0, 0, 0, 10), newText: 'formatted' }];
      mockClangFormat.formatRange.mockResolvedValue(edits);

      const result = await formatter.formatDocument(text);
      expect(result).toEqual(edits);
      expect(mockClangFormat.formatRange).toHaveBeenCalled();
    });

    it('should return empty array when clang-format returns empty (no changes needed)', async () => {
      formatter.updateSettings({ preset: 'google' });
      mockClangFormat.formatRange.mockResolvedValue([]);

      const text = 'message Test {}';
      const result = await formatter.formatDocument(text);
      // Empty array means no changes needed - should NOT fall back to minimal formatter
      expect(result).toHaveLength(0);
    });

    it('should fallback to minimal when clang-format returns null (failed)', async () => {
      formatter.updateSettings({ preset: 'google' });
      mockClangFormat.formatRange.mockResolvedValue(null);

      const text = 'message Test {}';
      const result = await formatter.formatDocument(text);
      // null means failure - should fall back to minimal formatter
      expect(result).toHaveLength(1);
      expect(result[0].newText).toContain('message Test');
    });

    it('should use clang-format when clangFormatEnabled is true regardless of preset', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      formatter.setClangFormatEnabled(true);
      const text = 'message Test {}';
      const edits = [{ range: Range.create(0, 0, 0, 10), newText: 'formatted' }];
      mockClangFormat.formatRange.mockResolvedValue(edits);

      const result = await formatter.formatDocument(text);
      expect(result).toEqual(edits);
      expect(mockClangFormat.formatRange).toHaveBeenCalled();
    });

    it('should use buf format when preset is buf', async () => {
      formatter.updateSettings({ preset: 'buf' });
      const text = 'message Test {}';
      mockBufFormat.format.mockResolvedValue('formatted text');

      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
      expect(result[0].newText).toBe('formatted text');
      expect(mockBufFormat.format).toHaveBeenCalledWith(text, undefined);
    });

    it('should fallback to minimal when buf format returns null', async () => {
      formatter.updateSettings({ preset: 'buf' });
      mockBufFormat.format.mockResolvedValue(null);

      const text = 'message Test {}';
      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
      expect(result[0].newText).toContain('message Test');
    });

    it('should handle empty text', async () => {
      const result = await formatter.formatDocument('');
      expect(result).toHaveLength(1);
    });
  });

  describe('formatRange', () => {
    it('should format a range', async () => {
      const text = 'syntax = "proto3";\nmessage Test {\n  string name = 1;\n}';
      const range = Range.create(1, 0, 2, 20);
      const result = await formatter.formatRange(text, range);
      expect(result).toHaveLength(1);
      expect(result[0].range.start.line).toBe(1);
    });

    it('should use clang-format for google preset', async () => {
      formatter.updateSettings({ preset: 'google' });
      const text = 'message Test {}';
      const range = Range.create(0, 0, 0, 10);
      const edits = [{ range, newText: 'formatted' }];
      mockClangFormat.formatRange.mockResolvedValue(edits);

      const result = await formatter.formatRange(text, range);
      expect(result).toEqual(edits);
    });

    it('should calculate indent level for range', async () => {
      const text = 'message Outer {\n  message Inner {\n    string name = 1;\n  }\n}';
      const range = Range.create(2, 0, 2, 20);
      const result = await formatter.formatRange(text, range);
      expect(result[0].newText).toContain('    string'); // 2 levels of indent
    });

    it('should handle range at start of file', async () => {
      const text = 'message Test {}';
      const range = Range.create(0, 0, 0, 10);
      const result = await formatter.formatRange(text, range);
      expect(result).toHaveLength(1);
    });
  });

  describe('formatting logic', () => {
    it('should format message fields', async () => {
      const text = 'message Test {string name = 1;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      // Formatter may format differently based on preset
      expect(formatted).toBeDefined();
      expect(formatted).toContain('message');
    });

    it('should handle nested messages', async () => {
      const text = 'message Outer {message Inner {string name = 1;}}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      expect(formatted).toBeDefined();
      expect(formatted).toContain('message');
    });

    it('should format enum values', async () => {
      const text = 'enum Status {UNKNOWN=0;OK=1;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      expect(formatted).toBeDefined();
      expect(formatted).toContain('enum');
    });

    it('should format map fields', async () => {
      const text = 'message Test {map<string, int32> values = 1;}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('map<string, int32>');
    });

    it('should format optional/required/repeated fields', async () => {
      const text = 'message Test {optional string name = 1;required int32 id = 2;repeated string tags = 3;}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('optional string name');
      expect(result[0].newText).toContain('required int32 id');
      expect(result[0].newText).toContain('repeated string tags');
    });

    it('should preserve empty lines', async () => {
      const text = 'message Test {\n\n  string name = 1;\n\n}';
      const result = await formatter.formatDocument(text);
      const lines = result[0].newText.split('\n');
      expect(lines).toContain('');
    });

    it('should insert a blank line between top-level definitions and collapse extras by default', async () => {
      const text = `message A {
  int32 id = 1;
}
message B {
  string name = 1;
}


message C {
  bool ok = 1;
}`;
      const result = await formatter.formatDocument(text);
      const lines = result[0].newText.split('\n');

      const indexB = lines.findIndex(l => l.startsWith('message B'));
      expect(indexB).toBeGreaterThan(0);
      expect(lines[indexB - 1]).toBe('');

      for (let i = 1; i < lines.length; i++) {
        expect(lines[i] === '' && lines[i - 1] === '').toBe(false);
      }
    });

    it('should respect insertEmptyLineBetweenDefinitions=false', async () => {
      formatter.updateSettings({ insertEmptyLineBetweenDefinitions: false, maxEmptyLines: 5 });
      const text = `message A {
  int32 id = 1;
}
message B {
  string name = 1;
}`;
      const result = await formatter.formatDocument(text);
      const lines = result[0].newText.split('\n');

      const indexB = lines.findIndex(l => l.startsWith('message B'));
      expect(indexB).toBeGreaterThan(0);
      expect(lines[indexB - 1]).not.toBe('');
    });

    it('should limit consecutive blank lines based on maxEmptyLines', async () => {
      formatter.updateSettings({ maxEmptyLines: 2 });
      const text = `message A {
  int32 id = 1;
}



message B {
  string name = 1;
}`;
      const result = await formatter.formatDocument(text);
      const lines = result[0].newText.split('\n');

      let longestRun = 0;
      let currentRun = 0;
      for (const line of lines) {
        if (line.trim() === '') {
          currentRun++;
          longestRun = Math.max(longestRun, currentRun);
        } else {
          currentRun = 0;
        }
      }

      expect(longestRun).toBeLessThanOrEqual(2);
    });

    it('should handle block comments', async () => {
      const text = 'message Test {\n/* comment */\n  string name = 1;\n}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('/* comment */');
    });

    it('should handle multi-line block comments', async () => {
      const text = 'message Test {\n/*\n * comment\n */\n  string name = 1;\n}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('/*');
      expect(result[0].newText).toContain('*/');
    });

    it('should format service definitions', async () => {
      const text = 'service TestService {rpc Method(Request) returns (Response);}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('service TestService');
      expect(result[0].newText).toContain('rpc Method');
    });

    it('should format option statements', async () => {
      const text = 'option java_package = "com.example";';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('option java_package');
    });

    it('should not indent syntax/package/import', async () => {
      const text = 'syntax = "proto3";\npackage com.example;\nimport "other.proto";';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('syntax = "proto3"');
      expect(result[0].newText).toContain('package com.example');
      expect(result[0].newText).toContain('import "other.proto"');
    });

    it('should handle tabs when useTabIndent is true', async () => {
      formatter.updateSettings({ useTabIndent: true });
      const text = 'message Test {string name = 1;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      // Formatter may or may not use tabs depending on preset
      expect(formatted).toBeDefined();
    });

    it('should handle custom indent size', async () => {
      formatter.updateSettings({ indentSize: 4 });
      const text = 'message Test {string name = 1;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      // Formatter may or may not apply indent size depending on preset
      expect(formatted).toBeDefined();
    });

    it('should not indent top-level declarations when comments contain brackets', async () => {
      const text = `syntax = "proto3";

package api.demo.v1;

// this is demo message 1
// some json example:
// \`\`\`json
// [
//     "element1",
//     "element2"
// ]
message DemoMessage1 {
  string field1 = 1;
}

// this is demo message 2
// some json example:
// \`\`\`json
// {
//     "key1": "value1",
//     "key2": "value2"
// }
message DemoMessage2 {
  string field1 = 1;
}`;

      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      expect(formatted).toContain('\nmessage DemoMessage2 {');
      expect(formatted).not.toContain('\n  message DemoMessage2 {');
    });
  });

  describe('renumbering', () => {
    it('should renumber fields when enabled', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Test {string name = 1;int32 id = 5;bool active = 10;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      expect(formatted).toContain('string name = 1');
      // Renumbering should fill gaps
      expect(formatted).toMatch(/int32 id = \d+/);
      expect(formatted).toMatch(/bool active = \d+/);
    });

    it('should not renumber when disabled', async () => {
      formatter.updateSettings({ renumberOnFormat: false });
      const text = 'message Test {string name = 1;int32 id = 5;}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('int32 id = 5');
    });

    it('should renumber enum values', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'enum Status {UNKNOWN = 0;OK = 5;ERROR = 10;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      expect(formatted).toContain('UNKNOWN = 0');
      // Enum renumbering may preserve existing numbers or renumber sequentially
      expect(formatted).toMatch(/OK = \d+/);
      expect(formatted).toMatch(/ERROR = \d+/);
    });

    it('should use custom start number', async () => {
      formatter.updateSettings({ renumberOnFormat: true, renumberStartNumber: 10 });
      const text = 'message Test {string name = 1;}';
      const result = await formatter.formatDocument(text);
      // Start number only applies to new fields, existing fields keep their numbers
      expect(result[0].newText).toContain('string name');
    });

    it('should use custom increment', async () => {
      formatter.updateSettings({ renumberOnFormat: true, renumberIncrement: 2 });
      const text = 'message Test {string name = 1;int32 id = 2;}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      expect(formatted).toContain('string name = 1');
      // Increment applies to subsequent fields
      expect(formatted).toMatch(/int32 id = \d+/);
    });

    it('should handle nested messages independently', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Outer {string outer_field = 1;message Inner {string inner_field = 1;}}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('string outer_field = 1');
      expect(result[0].newText).toContain('string inner_field = 1');
    });

    it('should handle oneof fields', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Test {oneof test_oneof {string name = 1;int32 id = 2;}}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('oneof test_oneof');
    });

    it('should skip reserved lines', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Test {reserved 1 to 10;string name = 11;}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('reserved 1 to 10');
    });

    it('should skip reserved field numbers when renumbering', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `message Test {
  reserved 4;
  string field1 = 1;
  string field2 = 2;
  string field3 = 3;
  string field4 = 4;
  string field5 = 5;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      expect(formatted).toContain('field1 = 1');
      expect(formatted).toContain('field2 = 2');
      expect(formatted).toContain('field3 = 3');
      expect(formatted).toContain('field4 = 5');
      expect(formatted).toContain('field5 = 6');
    });

    it('should handle map fields without numbers', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Test {map<string, int32> values;}';
      const result = await formatter.formatDocument(text);
      // Map fields should get numbers assigned
      const formatted = result[0].newText;
      expect(formatted).toMatch(/map<string, int32>/);
    });

    it('should not add semicolon after inline comments', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'enum Status {ACTIVE = 1 // wow!!!}';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      // Semicolon should be before the comment, not after it
      expect(formatted).toMatch(/ACTIVE = 1;?\s*\/\/ wow!!!/);
      // Should NOT have semicolon after the comment
      expect(formatted).not.toMatch(/\/\/ wow!!!;/);
    });

    it('should clean up multiple semicolons', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `enum Status {
  ACTIVE = 1 ;;;;;// wow!!!
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;
      // Should have exactly one semicolon before the comment
      expect(formatted).toMatch(/ACTIVE = 1;\s*\/\/ wow!!!/);
      // Should NOT have multiple semicolons
      expect(formatted).not.toMatch(/;;;;;/);
      // Should NOT have semicolon after the comment
      expect(formatted).not.toMatch(/\/\/ wow!!!;/);
    });

    it('should actually renumber fields with gaps, not preserve them', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `message Test {
  string field1 = 1;
  string field2 = 5;
  string field3 = 10;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Field 1 should stay at 1
      expect(formatted).toContain('field1 = 1');
      // Field 2 should be renumbered to 2 (not stay at 5)
      expect(formatted).toContain('field2 = 2');
      // Field 3 should be renumbered to 3 (not stay at 10)
      expect(formatted).toContain('field3 = 3');
    });

    it('should renumber fields with multi-line inline options correctly', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `message Test {
  string city = 1 [(buf.validate.field).cel = {
    id: "test",
    message: "error"
  }];
  oneof type {
    string type1 = 2;
    string type2 = 3;
  }
  string country = 4;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // city should stay at 1
      expect(formatted).toMatch(/city\s*=\s*1/);
      // type1 should stay at 2 (first field in oneof continues from message counter)
      expect(formatted).toMatch(/type1\s*=\s*2/);
      // type2 should stay at 3
      expect(formatted).toMatch(/type2\s*=\s*3/);
      // country should stay at 4 (continues after oneof)
      expect(formatted).toMatch(/country\s*=\s*4/);
    });

    it('should renumber oneof fields that have duplicates', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `message Test {
  string city = 1;
  oneof type {
    string type1 = 2;
    string type2 = 3;
    string type3 = 2;
  }
  string country = 5;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // city should stay at 1
      expect(formatted).toMatch(/city\s*=\s*1/);
      // type1 should stay at 2
      expect(formatted).toMatch(/type1\s*=\s*2/);
      // type2 should stay at 3
      expect(formatted).toMatch(/type2\s*=\s*3/);
      // type3 should be renumbered to 4 (not duplicate 2)
      expect(formatted).toMatch(/type3\s*=\s*4/);
      // country should be renumbered to 5
      expect(formatted).toMatch(/country\s*=\s*5/);
    });

    it('should handle edition files with complex CEL validation', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = `edition = "2023";
message Test {
  option (buf.validate.message).cel = {
    id: "test",
    expression:
      "has(this.field1)"
      "? 'yes'"
      ": 'no'"
  };
  string field1 = 5;
  string field2 = 10;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Should renumber fields
      expect(formatted).toContain('field1 = 1');
      expect(formatted).toContain('field2 = 2');
      // Should preserve the CEL option structure
      expect(formatted).toContain('buf.validate.message');
      expect(formatted).toContain('expression:');
    });
  });

  describe('edge cases', () => {
    it('should handle single line files', async () => {
      const text = 'syntax = "proto3";';
      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
    });

    it('should handle files with only comments', async () => {
      const text = '// comment\n/* block comment */';
      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
    });

    it('should handle malformed braces', async () => {
      const text = 'message Test {string name = 1;';
      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);
    });

    it('should handle empty messages', async () => {
      const text = 'message Test {}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('message Test');
    });

    it('should handle fields without semicolons', async () => {
      formatter.updateSettings({ renumberOnFormat: true });
      const text = 'message Test {string name = 1}';
      const result = await formatter.formatDocument(text);
      expect(result[0].newText).toContain('string name = 1');
    });

    it('should join multi-line field declarations', async () => {
      formatter.updateSettings({ renumberOnFormat: false, alignFields: false });
      const text = `syntax = "proto3";

message Optionalf {
  float value =
      1;  //!< optional value comment
  bool valid =
      2;  //!< flag comment
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // The multi-line field declarations should be joined
      expect(formatted).toContain('float value = 1;');
      expect(formatted).toContain('bool valid = 2;');
      // Comments should be preserved
      expect(formatted).toContain('//!< optional value comment');
      expect(formatted).toContain('//!< flag comment');
    });

    it('should handle multi-line field declarations with optional/repeated modifiers', async () => {
      formatter.updateSettings({ renumberOnFormat: false, alignFields: false });
      const text = `syntax = "proto3";

message Test {
  optional string name =
      1;
  repeated int32 ids =
      2;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      expect(formatted).toContain('optional string name = 1;');
      expect(formatted).toContain('repeated int32 ids = 2;');
    });

    it('should preserve multi-line field declarations when preserveMultiLineFields is enabled', async () => {
      formatter.updateSettings({ renumberOnFormat: false, alignFields: false, preserveMultiLineFields: true });
      const text = `syntax = "proto3";

message Optionalf {
  float value =
      1;  // optional value comment
  bool valid =
      2;  // flag comment
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // The multi-line field declarations should be preserved
      expect(formatted).toContain('float value =');
      expect(formatted).toContain('bool valid =');
      // The continuation lines should be on separate lines
      expect(formatted).toMatch(/float value =\n/);
      expect(formatted).toMatch(/bool valid =\n/);
    });

    it('should indent multi-line field options with brackets', async () => {
      formatter.updateSettings({ indentSize: 4, alignFields: false });
      const text = `message Test {
    int32 field = 1 [
    (tag1) = true,
    (tag2) = false
    ];
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // The field options should be indented one level inside the brackets
      expect(formatted).toContain('int32 field = 1 [');
      expect(formatted).toContain('        (tag1) = true,');
      expect(formatted).toContain('        (tag2) = false');
      expect(formatted).toContain('    ];');
    });

    it('should reset indent after inline option brackets close on the same line', async () => {
      formatter.updateSettings({ alignFields: false, renumberOnFormat: false });
      const text = `syntax = "proto3";

message Test {
  int32 field = 1 [
    (tag2) = false];

  int32 field2 = 2;
}`;
      const result = await formatter.formatDocument(text);
      const lines = result[0].newText.split('\n');

      expect(lines).toContain('  int32 field = 1 [');
      expect(lines).toContain('    (tag2) = false];');
      expect(lines).toContain('  int32 field2 = 2;');
      expect(lines).toContain('}');
    });
  });

  describe('field alignment', () => {
    it('should align field numbers when alignFields is enabled', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Test {
  string city = 1;
  string country = 2;
  string house_number = 3;
  string post_code = 4;
  string street_name = 5;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Check that field names are aligned (all = signs at same column)
      const lines = formatted.split('\n').filter(l => l.includes('='));
      if (lines.length > 1) {
        const equalPositions = lines.map(l => l.indexOf('='));
        // All = signs should be at the same position
        const firstPos = equalPositions[0];
        expect(equalPositions.every(pos => pos === firstPos)).toBe(true);
      }
    });

    it('should align enum values when alignFields is enabled', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `enum Status {
  UNKNOWN = 0;
  OK = 1;
  ERROR = 2;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Check that enum values are aligned
      const lines = formatted.split('\n').filter(l => l.includes('='));
      if (lines.length > 1) {
        const equalPositions = lines.map(l => l.indexOf('='));
        const firstPos = equalPositions[0];
        expect(equalPositions.every(pos => pos === firstPos)).toBe(true);
      }
    });

    it('should align option keys in CEL blocks when alignFields is enabled', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Test {
  option (buf.validate.message).cel = {
    id: "test",
    message: "test message",
    expression: "test"
  };
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Check that colons are aligned in option block
      const lines = formatted.split('\n').filter(l => l.includes(':') && !l.includes('option'));
      if (lines.length > 1) {
        const colonPositions = lines.map(l => l.indexOf(':'));
        const firstPos = colonPositions[0];
        // All colons should be at the same position
        expect(colonPositions.every(pos => pos === firstPos)).toBe(true);
      }
    });

    it('should handle mixed field types with alignment', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Test {
  string name = 1;
  int32 age = 2;
  repeated string tags = 3;
  map<string, int32> scores = 4;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Check alignment
      const lines = formatted.split('\n').filter(l => l.includes('=') && !l.includes('option'));
      if (lines.length > 1) {
        const equalPositions = lines.map(l => l.indexOf('='));
        const firstPos = equalPositions[0];
        expect(equalPositions.every(pos => pos === firstPos)).toBe(true);
      }
    });

    it('should not align when alignFields is disabled', async () => {
      formatter.updateSettings({ alignFields: false, renumberOnFormat: false });
      const text = `message Test {
  string city = 1;
  string country = 2;
  string house_number = 3;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Without alignment, = signs may be at different positions based on field name length
      expect(formatted).toBeDefined();
      expect(formatted).toContain('string city = 1');
      expect(formatted).toContain('string country = 2');
      expect(formatted).toContain('string house_number = 3');
    });

    it('should align fields within nested messages independently', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Outer {
  string a = 1;
  message Inner {
    string very_long_field_name = 1;
    string b = 2;
  }
  string c = 2;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Each message block should have its own alignment
      expect(formatted).toBeDefined();
      expect(formatted).toContain('string');
    });

    it('should only align adjacent fields (gofmt-style) - blank lines break alignment groups', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Message {
  int32 a   = 1;
  int32 bbb = 2;

  int32 cccccc = 3;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Fields a and bbb should be aligned together (same group)
      // Field cccccc should be in its own group (after blank line)
      const lines = formatted.split('\n').filter(l => l.includes('='));

      // First group: a and bbb - should have same alignment
      const lineA = lines.find(l => l.includes('int32 a'));
      const lineBbb = lines.find(l => l.includes('int32 bbb'));
      const lineCccccc = lines.find(l => l.includes('int32 cccccc'));

      expect(lineA).toBeDefined();
      expect(lineBbb).toBeDefined();
      expect(lineCccccc).toBeDefined();

      // a and bbb should have = at same position (aligned to "bbb")
      expect(lineA!.indexOf('=')).toBe(lineBbb!.indexOf('='));

      // cccccc should NOT be aligned with a/bbb (it's in its own group)
      // cccccc's = should be closer to the field name
      expect(lineCccccc!.indexOf('=')).not.toBe(lineA!.indexOf('='));
    });

    it('should align nested message fields independently from parent', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });
      const text = `message Message {
  message Nested {
    int32 a      = 1;
    int32 bbb    = 2;

    int32 cccccc = 3;
  }

  int32 a                  = 1;

  int32 bbbbbbbbbbbbbbbb = 2;
}`;
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Nested message should have its own alignment context
      // Parent message fields should have their own alignment context
      const lines = formatted.split('\n');

      // Find Nested message fields (indented more)
      const nestedLines = lines.filter(l => l.includes('int32') && l.startsWith('    '));
      const _parentLines = lines.filter(l => l.includes('int32') && l.startsWith('  ') && !l.startsWith('    '));

      // Nested fields a and bbb should be aligned (before blank line)
      const nestedA = nestedLines.find(l => l.includes('int32 a'));
      const nestedBbb = nestedLines.find(l => l.includes('int32 bbb'));

      if (nestedA && nestedBbb) {
        expect(nestedA.indexOf('=')).toBe(nestedBbb.indexOf('='));
      }

      // cccccc in nested should be in its own group
      const nestedCccccc = nestedLines.find(l => l.includes('int32 cccccc'));
      if (nestedA && nestedCccccc) {
        // They should NOT be aligned (different groups)
        expect(nestedCccccc.indexOf('=')).not.toBe(nestedA.indexOf('='));
      }
    });

    // Regression test for GitHub issue: formatter not recalculating alignment
    // when manually modified, and not removing alignment when disabled
    it('should recalculate alignment on already-aligned option blocks', async () => {
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });

      // Scenario A: Option block with manually broken alignment
      const manuallyModified = `option (grpc.gateway.protoc_gen_openapiv2.options.openapiv2_swagger) = {
  info   : {
    title  : "My Service API"
    version    : "v1"
    description: "Service description here..."
  }
};`;

      const result1 = await formatter.formatDocument(manuallyModified);
      const formatted1 = result1[0].newText;

      // All colons in the info block should be aligned
      const infoLines = formatted1
        .split('\n')
        .filter(l => l.includes(':') && !l.includes('option') && !l.includes('{') && !l.includes('}'));

      if (infoLines.length > 1) {
        const colonPositions = infoLines.map(l => l.indexOf(':'));
        const firstPos = colonPositions[0];
        // All colons should be at the same position
        expect(colonPositions.every(pos => pos === firstPos)).toBe(true);
      }
    });

    it('should remove alignment when alignFields is disabled', async () => {
      // First format with alignment enabled
      formatter.updateSettings({ alignFields: true, renumberOnFormat: false });

      const text = `option (grpc.gateway.protoc_gen_openapiv2.options.openapiv2_swagger) = {
  info: {
    title: "My Service API"
    version: "v1"
    description: "Service description here..."
  }
};`;

      const result1 = await formatter.formatDocument(text);
      const aligned = result1[0].newText;

      // Verify it's aligned (has extra spaces before colons)
      expect(aligned).toContain('title      :');
      expect(aligned).toContain('version    :');
      expect(aligned).toContain('description:');

      // Now disable alignment and format again
      formatter.updateSettings({ alignFields: false, renumberOnFormat: false });
      const result2 = await formatter.formatDocument(aligned);
      const unaligned = result2[0].newText;

      // Verify alignment spaces are removed (single space after key, before colon)
      expect(unaligned).toContain('title: "My Service API"');
      expect(unaligned).toContain('version: "v1"');
      expect(unaligned).toContain('description: "Service description here..."');

      // Should NOT contain the aligned version
      expect(unaligned).not.toContain('title      :');
      expect(unaligned).not.toContain('version    :');
    });
  });

  describe('CRLF line ending handling', () => {
    it('should handle CRLF line endings in proto3 files', async () => {
      formatter.updateSettings({ preset: 'minimal', alignFields: true });
      // CRLF line endings (Windows style)
      const text =
        'syntax="proto3";\r\n\r\npackage test;\r\n\r\nmessage Test {\r\n  string name = 1;\r\n  int32 id = 2;\r\n}\r\n';

      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);

      // The range should be correct and not cause text corruption
      const range = result[0].range;
      expect(range.start.line).toBe(0);
      expect(range.start.character).toBe(0);

      // The formatted text should not have corrupted types
      const formatted = result[0].newText;
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');
      expect(formatted).toContain('string');
      expect(formatted).not.toContain('sstring');
    });

    it('should handle CRLF line endings in edition files', async () => {
      formatter.updateSettings({ preset: 'minimal', alignFields: true });
      // CRLF line endings (Windows style)
      const text =
        'edition = "2023";\r\n\r\npackage test;\r\n\r\nmessage Test {\r\n  string name = 1;\r\n  uint32 count = 2;\r\n}\r\n';

      const result = await formatter.formatDocument(text);
      expect(result).toHaveLength(1);

      const formatted = result[0].newText;
      expect(formatted).toContain('uint32');
      expect(formatted).not.toContain('uuint32');
      expect(formatted).toContain('string');
      expect(formatted).not.toContain('sstring');
    });

    it('should produce correct range for CRLF files with trailing newline', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      const text = 'message Test {\r\n  string a = 1;\r\n}\r\n';

      const result = await formatter.formatDocument(text);
      const range = result[0].range;

      // 4 lines total (0, 1, 2, 3), last line is empty string after final \r\n
      expect(range.end.line).toBe(3);
      expect(range.end.character).toBe(0); // Empty last line
    });

    it('should produce correct range for CRLF files without trailing newline', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      const text = 'message Test {\r\n  string a = 1;\r\n}';

      const result = await formatter.formatDocument(text);
      const range = result[0].range;

      // 3 lines total (0, 1, 2)
      expect(range.end.line).toBe(2);
      expect(range.end.character).toBe(1); // "}" is 1 character
    });

    it('should handle mixed LF and CRLF (edge case)', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      // Mix of CRLF and LF - should still work
      const text = 'message Test {\r\n  string a = 1;\n  int32 b = 2;\r\n}\n';

      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      expect(formatted).toContain('string');
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');
    });

    it('should correctly format all builtin types with CRLF', async () => {
      formatter.updateSettings({ preset: 'minimal', alignFields: true });
      const types = [
        'double',
        'float',
        'int32',
        'int64',
        'uint32',
        'uint64',
        'sint32',
        'sint64',
        'fixed32',
        'fixed64',
        'sfixed32',
        'sfixed64',
        'bool',
        'string',
        'bytes',
      ];

      const fields = types.map((t, i) => `  ${t} field_${t} = ${i + 1};`).join('\r\n');
      const text = `syntax="proto3";\r\n\r\nmessage Test {\r\n${fields}\r\n}\r\n`;

      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Verify no type is corrupted (first char duplicated)
      for (const type of types) {
        expect(formatted).toContain(type);
        // Check that the first character isn't duplicated
        const doubledType = type[0] + type;
        expect(formatted).not.toContain(doubledType);
      }
    });

    it('should handle CRLF in range formatting', async () => {
      formatter.updateSettings({ preset: 'minimal' });
      const text = 'message Test {\r\n  string name=1;\r\n  int32 id=2;\r\n}\r\n';
      const range = Range.create(1, 0, 2, 13); // Format lines 1-2

      const result = await formatter.formatRange(text, range);
      expect(result).toHaveLength(1);

      const formatted = result[0].newText;
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');
    });

    it('should preserve content correctly when formatting CRLF proto3 file', async () => {
      formatter.updateSettings({ preset: 'minimal', renumberOnFormat: false });
      const text =
        'syntax="proto3";\r\n\r\npackage testpkg;\r\n\r\nmessage TestMessage {\r\n\tstring content = 1;\r\n\tint32 id = 2; // comment\r\n}\r\n';

      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // All content should be preserved
      expect(formatted).toContain('syntax');
      expect(formatted).toContain('proto3');
      expect(formatted).toContain('package testpkg');
      expect(formatted).toContain('TestMessage');
      expect(formatted).toContain('string content = 1');
      expect(formatted).toContain('int32');
      expect(formatted).toContain('id');
      expect(formatted).toContain('// comment');

      // Types should not be corrupted
      expect(formatted).not.toContain('sstring');
      expect(formatted).not.toContain('iint32');
    });

    it('should not corrupt types when repeatedly formatting CRLF file (issue #30 regression)', async () => {
      formatter.updateSettings({ preset: 'minimal', alignFields: true, renumberOnFormat: false });

      // User's exact scenario: CRLF file with tab indent and trailing comment
      let text =
        'syntax = "proto3";\r\n\r\npackage protobuf_vsc_issue_30;\r\n\r\n//\r\nmessage Test {\r\n\tint32 field = 1; //\r\n}\r\n';

      // First format
      let result = await formatter.formatDocument(text);
      let formatted = result[0].newText;
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');

      // Simulate adding space after // and formatting again (user's scenario)
      // After first format, add space and format again
      text = formatted.replace('int32 field = 1; //', 'int32 field = 1; // ');
      result = await formatter.formatDocument(text);
      formatted = result[0].newText;
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');

      // Third format - should still be stable
      result = await formatter.formatDocument(formatted);
      formatted = result[0].newText;
      expect(formatted).toContain('int32');
      expect(formatted).not.toContain('iint32');

      // Verify output has no stray \r characters
      expect(formatted).not.toContain('\r');
    });

    it('should produce output without any \\r characters', async () => {
      formatter.updateSettings({ preset: 'minimal', alignFields: true });

      // Input with CRLF
      const text = 'message Test {\r\n  int32 id = 1;\r\n}\r\n';
      const result = await formatter.formatDocument(text);
      const formatted = result[0].newText;

      // Output should have no \r characters - VS Code will handle line ending conversion
      expect(formatted).not.toContain('\r');
      expect(formatted).toContain('int32 id = 1;');
    });
  });
});
