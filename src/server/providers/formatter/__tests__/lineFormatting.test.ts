/**
 * Tests for line formatting utilities
 */

import { getIndent, formatLine, formatLineWithAlignment, formatOptionLine } from '../lineFormatting';
import type { AlignmentData, FormatterSettings } from '../types';

describe('Line Formatting', () => {
  const defaultSettings: FormatterSettings = {
    indentSize: 2,
    useTabIndent: false,
    alignFields: false,
    preserveMultiLineFields: false,
  };

  describe('getIndent', () => {
    it('should return empty string for level 0', () => {
      expect(getIndent(0, defaultSettings)).toBe('');
    });

    it('should return spaces based on indent size', () => {
      expect(getIndent(1, defaultSettings)).toBe('  ');
      expect(getIndent(2, defaultSettings)).toBe('    ');
    });

    it('should return tabs when useTabIndent is true', () => {
      const tabSettings = { ...defaultSettings, useTabIndent: true };
      expect(getIndent(1, tabSettings)).toBe('\t');
      expect(getIndent(2, tabSettings)).toBe('\t\t');
    });

    it('should handle custom indent size', () => {
      const settings = { ...defaultSettings, indentSize: 4 };
      expect(getIndent(1, settings)).toBe('    ');
      expect(getIndent(2, settings)).toBe('        ');
    });
  });

  describe('formatLine', () => {
    describe('comment-only lines', () => {
      it('should preserve original indent for line comments', () => {
        const result = formatLine('// comment', 1, defaultSettings, '    // comment');
        expect(result).toBe('    // comment');
      });

      it('should add indent when no original line provided for line comments', () => {
        const result = formatLine('// comment', 1, defaultSettings);
        expect(result).toBe('  // comment');
      });

      it('should preserve original indent for block comments', () => {
        const result = formatLine('/* comment */', 1, defaultSettings, '      /* comment */');
        expect(result).toBe('      /* comment */');
      });
    });

    describe('field definitions', () => {
      it('should format field with modifier', () => {
        const result = formatLine('optional string name = 1;', 1, defaultSettings);
        expect(result).toBe('  optional string name = 1;');
      });

      it('should format field without modifier', () => {
        const result = formatLine('string name = 1;', 1, defaultSettings);
        expect(result).toBe('  string name = 1;');
      });

      it('should format repeated field', () => {
        const result = formatLine('repeated string items = 1;', 1, defaultSettings);
        expect(result).toBe('  repeated string items = 1;');
      });

      it('should format required field', () => {
        const result = formatLine('required int32 id = 1;', 1, defaultSettings);
        expect(result).toBe('  required int32 id = 1;');
      });
    });

    describe('map fields', () => {
      it('should format map field correctly', () => {
        const result = formatLine('map<string,int32> counts = 1;', 1, defaultSettings);
        expect(result).toContain('map<string');
        expect(result).toContain('int32>');
        expect(result).toContain('counts');
      });

      it('should format map field with message value type', () => {
        const result = formatLine('map<string,User> users = 1;', 1, defaultSettings);
        expect(result).toContain('map<string');
        expect(result).toContain('User>');
        expect(result).toContain('users');
      });
    });

    describe('enum values', () => {
      it('should format enum value', () => {
        const result = formatLine('UNKNOWN = 0;', 1, defaultSettings);
        expect(result).toBe('  UNKNOWN = 0;');
      });

      it('should format enum value with negative number', () => {
        const result = formatLine('NEGATIVE = -1;', 1, defaultSettings);
        expect(result).toBe('  NEGATIVE = -1;');
      });

      it('should not format lines that start with option', () => {
        const result = formatLine('option allow_alias = true;', 1, defaultSettings);
        expect(result).toBe('  option allow_alias = true;');
      });
    });

    describe('declarations', () => {
      it('should format message declaration', () => {
        const result = formatLine('message User {', 0, defaultSettings);
        expect(result).toBe('message User {');
      });

      it('should format enum declaration', () => {
        const result = formatLine('enum Status {', 0, defaultSettings);
        expect(result).toBe('enum Status {');
      });

      it('should format service declaration', () => {
        const result = formatLine('service UserService {', 0, defaultSettings);
        expect(result).toBe('service UserService {');
      });

      it('should format oneof declaration', () => {
        const result = formatLine('oneof choice {', 1, defaultSettings);
        expect(result).toBe('  oneof choice {');
      });

      it('should format extend declaration', () => {
        const result = formatLine('extend BaseMessage {', 0, defaultSettings);
        expect(result).toBe('extend BaseMessage {');
      });

      it('should format rpc declaration', () => {
        const result = formatLine('rpc GetUser(GetUserRequest) returns (User);', 1, defaultSettings);
        expect(result).toBe('  rpc GetUser(GetUserRequest) returns (User);');
      });
    });

    describe('option statements', () => {
      it('should format option statement', () => {
        const result = formatLine('option java_package = "com.example";', 0, defaultSettings);
        expect(result).toBe('option java_package = "com.example";');
      });
    });

    describe('option key-value pairs', () => {
      it('should format key-value pair inside option block', () => {
        const result = formatLine('title: "API"', 2, defaultSettings);
        expect(result).toBe('    title: "API"');
      });
    });

    describe('top-level statements', () => {
      it('should not indent syntax statement', () => {
        const result = formatLine('syntax = "proto3";', 0, defaultSettings);
        expect(result).toBe('syntax = "proto3";');
      });

      it('should not indent edition statement', () => {
        const result = formatLine('edition = "2023";', 0, defaultSettings);
        expect(result).toBe('edition = "2023";');
      });

      it('should not indent package statement', () => {
        const result = formatLine('package example;', 0, defaultSettings);
        expect(result).toBe('package example;');
      });

      it('should not indent import statement', () => {
        const result = formatLine('import "google/protobuf/any.proto";', 0, defaultSettings);
        expect(result).toBe('import "google/protobuf/any.proto";');
      });
    });

    describe('multi-line field handling', () => {
      it('should format multi-line field start with modifier', () => {
        const result = formatLine('optional float value =', 1, defaultSettings);
        expect(result).toBe('  optional float value =');
      });

      it('should format multi-line field start without modifier', () => {
        const result = formatLine('float value =', 1, defaultSettings);
        expect(result).toBe('  float value =');
      });

      it('should format multi-line field start with comment', () => {
        const result = formatLine('float value = // comment', 1, defaultSettings);
        expect(result).toBe('  float value = // comment');
      });

      it('should format multi-line field continuation', () => {
        const result = formatLine('1;', 1, defaultSettings);
        expect(result).toBe('      1;');
      });

      it('should format multi-line field continuation with rest', () => {
        const result = formatLine('1; // field number', 1, defaultSettings);
        expect(result).toBe('      1; // field number');
      });
    });

    describe('general lines', () => {
      it('should add indent to general lines', () => {
        const result = formatLine('some other content', 1, defaultSettings);
        expect(result).toBe('  some other content');
      });
    });
  });

  describe('formatLineWithAlignment', () => {
    const alignmentData: AlignmentData = {
      maxTypeLength: 10,
      maxFieldNameLength: 8,
      maxKeyLength: 5,
      isOptionBlock: false
    };

    it('should use standard formatting when no alignment data', () => {
      const result = formatLineWithAlignment('string name = 1;', 1, undefined, defaultSettings);
      expect(result).toBe('  string name = 1;');
    });

    it('should use standard formatting for option blocks', () => {
      const optionAlignment: AlignmentData = { ...alignmentData, isOptionBlock: true };
      const result = formatLineWithAlignment('title: "API"', 1, optionAlignment, defaultSettings);
      expect(result).toBe('  title: "API"');
    });

    it('should preserve original indent for comment lines', () => {
      const result = formatLineWithAlignment('// comment', 1, alignmentData, defaultSettings, '    // comment');
      expect(result).toBe('    // comment');
    });

    it('should add alignment padding to fields with modifier', () => {
      const result = formatLineWithAlignment('optional string name = 1;', 1, alignmentData, defaultSettings);
      expect(result).toContain('optional string');
      expect(result).toContain('name');
      expect(result).toContain('= 1');
    });

    it('should add alignment padding to fields without modifier', () => {
      const result = formatLineWithAlignment('string name = 1;', 1, alignmentData, defaultSettings);
      expect(result).toContain('string');
      expect(result).toContain('name');
    });

    it('should add alignment to map fields', () => {
      const result = formatLineWithAlignment('map<string,int32> counts = 1;', 1, alignmentData, defaultSettings);
      expect(result).toContain('map<string');
      expect(result).toContain('counts');
    });

    it('should add alignment to enum values', () => {
      const result = formatLineWithAlignment('UNKNOWN = 0;', 1, alignmentData, defaultSettings);
      expect(result).toContain('UNKNOWN');
      expect(result).toContain('= 0');
    });

    it('should handle multi-line field start with alignment', () => {
      const result = formatLineWithAlignment('float value =', 1, alignmentData, defaultSettings);
      expect(result).toBe('  float value =');
    });

    it('should handle multi-line field continuation with alignment', () => {
      const result = formatLineWithAlignment('1;', 1, alignmentData, defaultSettings);
      expect(result).toBe('      1;');
    });

    it('should fall back to standard formatting for unrecognized lines', () => {
      const result = formatLineWithAlignment('unrecognized content', 1, alignmentData, defaultSettings);
      expect(result).toBe('  unrecognized content');
    });
  });

  describe('formatOptionLine', () => {
    const optionAlignment: AlignmentData = {
      maxTypeLength: 0,
      maxFieldNameLength: 0,
      maxKeyLength: 10,
      isOptionBlock: true
    };

    it('should add indent for lines without alignment data', () => {
      const result = formatOptionLine('title: "API"', 1, undefined, defaultSettings);
      expect(result).toBe('  title: "API"');
    });

    it('should add indent for non-option block alignment', () => {
      const nonOptionAlignment: AlignmentData = { ...optionAlignment, isOptionBlock: false };
      const result = formatOptionLine('title: "API"', 1, nonOptionAlignment, defaultSettings);
      expect(result).toBe('  title: "API"');
    });

    it('should align key-value pairs in option blocks', () => {
      const result = formatOptionLine('id: "test"', 1, optionAlignment, defaultSettings);
      expect(result).toContain('id');
      expect(result).toContain(': "test"');
    });

    it('should handle keys of various lengths', () => {
      const result = formatOptionLine('description: "A long description"', 1, optionAlignment, defaultSettings);
      expect(result).toContain('description');
      expect(result).toContain(': "A long description"');
    });

    it('should add indent to non-key-value lines', () => {
      const result = formatOptionLine('}', 1, optionAlignment, defaultSettings);
      expect(result).toBe('  }');
    });

    it('should handle expressions in option blocks', () => {
      const result = formatOptionLine('this.field > 0', 2, optionAlignment, defaultSettings);
      expect(result).toBe('    this.field > 0');
    });
  });
});
