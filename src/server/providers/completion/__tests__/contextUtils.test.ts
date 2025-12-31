/**
 * Branch coverage tests for contextUtils
 */

import {
  isTypeContext,
  getTypePrefix,
  isKeywordContext,
  isFieldAssignmentContext,
  isEnumValueContext,
  isFieldNameContext,
  getContainerBounds,
  getContainerInfo
} from '../contextUtils';
import { Position } from 'vscode-languageserver/node';

describe('contextUtils Branch Coverage', () => {
  describe('isTypeContext', () => {
    it('should return true for empty text', () => {
      expect(isTypeContext('')).toBe(true);
    });

    it('should return true for whitespace only', () => {
      expect(isTypeContext('   ')).toBe(true);
    });

    it('should return true for modifier with type', () => {
      expect(isTypeContext('optional string')).toBe(true);
      expect(isTypeContext('required int32')).toBe(true);
      expect(isTypeContext('repeated bytes')).toBe(true);
    });

    it('should return true for bare type name', () => {
      expect(isTypeContext('string')).toBe(true);
      expect(isTypeContext('int32')).toBe(true);
      expect(isTypeContext('MyMessage')).toBe(true);
    });

    it('should return true for qualified type name', () => {
      expect(isTypeContext('google.protobuf.Timestamp')).toBe(true);
      expect(isTypeContext('my.package.MyMessage')).toBe(true);
    });

    it('should return false for complete field declaration', () => {
      expect(isTypeContext('string name = 1')).toBe(false);
    });
  });

  describe('getTypePrefix', () => {
    it('should return undefined for empty string', () => {
      expect(getTypePrefix('')).toBeUndefined();
    });

    it('should return undefined for non-matching text', () => {
      expect(getTypePrefix('123')).toBeUndefined();
      expect(getTypePrefix('=')).toBeUndefined();
    });

    it('should return partial only for single word', () => {
      const result = getTypePrefix('Mess');
      expect(result).toEqual({ partial: 'Mess' });
    });

    it('should return qualifier and partial for qualified name', () => {
      const result = getTypePrefix('google.protobuf.Time');
      expect(result).toEqual({
        qualifier: 'google.protobuf',
        partial: 'Time'
      });
    });

    it('should handle trailing dot', () => {
      const result = getTypePrefix('google.');
      expect(result).toEqual({
        qualifier: 'google',
        partial: ''
      });
    });

    it('should extract from longer text', () => {
      const result = getTypePrefix('optional google.protobuf.Time');
      expect(result).toEqual({
        qualifier: 'google.protobuf',
        partial: 'Time'
      });
    });
  });

  describe('isKeywordContext', () => {
    it('should return true for empty text', () => {
      expect(isKeywordContext('')).toBe(true);
    });

    it('should return true for partial word', () => {
      expect(isKeywordContext('  mes')).toBe(true);
      expect(isKeywordContext('  en')).toBe(true);
    });

    it('should return true after message declaration', () => {
      expect(isKeywordContext('message Test {')).toBe(true);
      expect(isKeywordContext('message Test { ')).toBe(true);
    });

    it('should return true after enum declaration', () => {
      expect(isKeywordContext('enum Status {')).toBe(true);
    });

    it('should return true after service declaration', () => {
      expect(isKeywordContext('service MyService {')).toBe(true);
    });

    it('should return true after oneof declaration', () => {
      expect(isKeywordContext('oneof choice {')).toBe(true);
    });
  });

  describe('isFieldAssignmentContext', () => {
    it('should return true for field without number', () => {
      expect(isFieldAssignmentContext('  string name')).toBe(true);
      expect(isFieldAssignmentContext('  string name ')).toBe(true);
    });

    it('should return true for field with modifier', () => {
      expect(isFieldAssignmentContext('  optional string name')).toBe(true);
      expect(isFieldAssignmentContext('  required int32 id')).toBe(true);
      expect(isFieldAssignmentContext('  repeated bytes data')).toBe(true);
    });

    it('should return true for complex types', () => {
      expect(isFieldAssignmentContext('  map<string,int32> data')).toBe(true);
      expect(isFieldAssignmentContext('  MyMessage.NestedType field')).toBe(true);
    });

    it('should return false for complete field', () => {
      expect(isFieldAssignmentContext('string name = 1')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isFieldAssignmentContext('')).toBe(false);
    });
  });

  describe('isEnumValueContext', () => {
    it('should return false without document text', () => {
      expect(isEnumValueContext('  STATUS_UNKNOWN', { line: 2, character: 0 })).toBe(false);
    });

    it('should return true for enum value in enum block', () => {
      const documentText = `syntax = "proto3";
enum Status {
  STATUS_UNKNOWN
}`;
      const position: Position = { line: 2, character: 10 };
      expect(isEnumValueContext('  STATUS_UNKNOWN', position, documentText)).toBe(true);
    });

    it('should return false for non-enum value pattern', () => {
      const documentText = `syntax = "proto3";
enum Status {
  lowercase_name
}`;
      const position: Position = { line: 2, character: 10 };
      expect(isEnumValueContext('  lowercase_name', position, documentText)).toBe(false);
    });

    it('should return false in message block', () => {
      const documentText = `syntax = "proto3";
message Test {
  STATUS_UNKNOWN
}`;
      const position: Position = { line: 2, character: 10 };
      expect(isEnumValueContext('  STATUS_UNKNOWN', position, documentText)).toBe(false);
    });
  });

  describe('isFieldNameContext', () => {
    it('should return true after type', () => {
      expect(isFieldNameContext('string ')).toBe(true);
      expect(isFieldNameContext('int32 ')).toBe(true);
    });

    it('should return true after modifier and type', () => {
      expect(isFieldNameContext('optional string ')).toBe(true);
      expect(isFieldNameContext('repeated bytes ')).toBe(true);
    });

    it('should return true after complex type', () => {
      expect(isFieldNameContext('map<string,int32> ')).toBe(true);
      expect(isFieldNameContext('google.protobuf.Timestamp ')).toBe(true);
    });

    it('should return false without trailing space', () => {
      expect(isFieldNameContext('string')).toBe(false);
    });
  });

  describe('getContainerBounds', () => {
    it('should return undefined at file level', () => {
      const lines = ['syntax = "proto3";', 'package test;'];
      const position: Position = { line: 0, character: 5 };
      expect(getContainerBounds(position, lines)).toBeUndefined();
    });

    it('should find message container bounds', () => {
      const lines = [
        'syntax = "proto3";',
        'message Test {',
        '  string name = 1;',
        '}'
      ];
      const position: Position = { line: 2, character: 5 };
      const bounds = getContainerBounds(position, lines);
      expect(bounds).toEqual({ start: 1, end: 3 });
    });

    it('should handle nested braces', () => {
      const lines = [
        'message Outer {',
        '  message Inner {',
        '    string name = 1;',
        '  }',
        '}'
      ];
      const position: Position = { line: 2, character: 5 };
      const bounds = getContainerBounds(position, lines);
      expect(bounds).toEqual({ start: 1, end: 3 });
    });

    it('should handle position at start of line', () => {
      const lines = [
        'message Test {',
        '  string name = 1;',
        '}'
      ];
      const position: Position = { line: 1, character: 0 };
      const bounds = getContainerBounds(position, lines);
      expect(bounds).toEqual({ start: 0, end: 2 });
    });

    it('should handle braces on same line', () => {
      const lines = [
        'message Test { string name = 1; }'
      ];
      const position: Position = { line: 0, character: 20 };
      const bounds = getContainerBounds(position, lines);
      expect(bounds).toEqual({ start: 0, end: 0 });
    });

    it('should handle closing brace at start of scan', () => {
      const lines = [
        'message Outer {',
        '  message Inner { }',
        '  string name = 1;',
        '}'
      ];
      const position: Position = { line: 2, character: 5 };
      const bounds = getContainerBounds(position, lines);
      expect(bounds).toEqual({ start: 0, end: 3 });
    });
  });

  describe('getContainerInfo', () => {
    it('should return undefined at file level', () => {
      const documentText = 'syntax = "proto3";\npackage test;';
      const position: Position = { line: 0, character: 5 };
      expect(getContainerInfo(position, documentText)).toBeUndefined();
    });

    it('should identify enum container', () => {
      const documentText = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const position: Position = { line: 2, character: 5 };
      const info = getContainerInfo(position, documentText);
      expect(info?.kind).toBe('enum');
    });

    it('should identify message container', () => {
      const documentText = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const position: Position = { line: 2, character: 5 };
      const info = getContainerInfo(position, documentText);
      expect(info?.kind).toBe('message');
    });

    it('should identify service container', () => {
      const documentText = `syntax = "proto3";
service MyService {
  rpc GetData(Request) returns (Response);
}`;
      const position: Position = { line: 2, character: 5 };
      const info = getContainerInfo(position, documentText);
      expect(info?.kind).toBe('service');
    });

    it('should return undefined kind for unknown container', () => {
      const documentText = `syntax = "proto3";
option foo = {
  key: "value"
};`;
      const position: Position = { line: 2, character: 5 };
      const info = getContainerInfo(position, documentText);
      expect(info).toBeDefined();
      expect(info?.kind).toBeUndefined();
    });

    it('should include bounds in container info', () => {
      const documentText = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const position: Position = { line: 2, character: 5 };
      const info = getContainerInfo(position, documentText);
      expect(info?.start).toBe(1);
      expect(info?.end).toBe(3);
    });
  });
});
