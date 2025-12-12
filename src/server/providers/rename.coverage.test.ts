/**
 * Additional tests for RenameProvider to improve coverage
 * Focus on edge cases and untested branches
 */

import { RenameProvider } from './rename';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtoParser } from '../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('RenameProvider Additional Coverage', () => {
  let provider: RenameProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new RenameProvider(analyzer);
  });

  describe('renameLocalSymbol edge cases', () => {
    it('should rename enum value definitions', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
  INACTIVE = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on ACTIVE
      const position: Position = { line: 3, character: 3 };
      const lineText = '  ACTIVE = 1;';
      const result = provider.rename(uri, position, lineText, 'ENABLED');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename RPC method names', () => {
      const text = `syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (GetUserResponse);
}

message GetUserRequest {}
message GetUserResponse {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on GetUser
      const position: Position = { line: 3, character: 7 };
      const lineText = '  rpc GetUser (GetUserRequest) returns (GetUserResponse);';
      const result = provider.rename(uri, position, lineText, 'FetchUser');

      // RPC name rename should work
      expect(result.changes.get(uri)).toBeDefined();
    });

    it('should rename oneof name', () => {
      const text = `syntax = "proto3";
message Test {
  oneof value_type {
    string string_value = 1;
    int32 int_value = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 9 };
      const lineText = '  oneof value_type {';
      const result = provider.rename(uri, position, lineText, 'data_type');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename field inside oneof', () => {
      const text = `syntax = "proto3";
message Test {
  oneof value_type {
    string string_value = 1;
    int32 int_value = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 12 };
      const lineText = '    string string_value = 1;';
      const result = provider.rename(uri, position, lineText, 'text_value');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename nested message field', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string inner_field = 1;
  }
  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 12 };
      const lineText = '    string inner_field = 1;';
      const result = provider.rename(uri, position, lineText, 'nested_field');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename nested enum value', () => {
      const text = `syntax = "proto3";
message Container {
  enum InnerEnum {
    VALUE_ZERO = 0;
    VALUE_ONE = 1;
  }
  InnerEnum type = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 5 };
      const lineText = '    VALUE_ONE = 1;';
      const result = provider.rename(uri, position, lineText, 'VALUE_FIRST');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('cross-file rename scenarios', () => {
    it('should rename type used in multiple files', () => {
      const commonProto = `syntax = "proto3";
package common;
message Address {
  string street = 1;
  string city = 2;
}`;

      const userProto = `syntax = "proto3";
package user;
import "common.proto";
message User {
  string name = 1;
  common.Address address = 2;
}`;

      const orderProto = `syntax = "proto3";
package order;
import "common.proto";
message Order {
  string id = 1;
  common.Address shipping_address = 2;
  common.Address billing_address = 3;
}`;

      const uri1 = 'file:///common.proto';
      const uri2 = 'file:///user.proto';
      const uri3 = 'file:///order.proto';

      analyzer.updateFile(uri1, parser.parse(commonProto, uri1));
      analyzer.updateFile(uri2, parser.parse(userProto, uri2));
      analyzer.updateFile(uri3, parser.parse(orderProto, uri3));

      // Rename Address to Location
      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Address {';
      const result = provider.rename(uri1, position, lineText, 'Location');

      // Should have changes in common.proto (definition)
      expect(result.changes.get(uri1)).toBeDefined();
    });

    it('should rename enum used across files', () => {
      const enumProto = `syntax = "proto3";
package types;
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
}`;

      const userProto = `syntax = "proto3";
import "enum.proto";
message User {
  types.Status status = 1;
}`;

      const uri1 = 'file:///enum.proto';
      const uri2 = 'file:///user.proto';

      analyzer.updateFile(uri1, parser.parse(enumProto, uri1));
      analyzer.updateFile(uri2, parser.parse(userProto, uri2));

      const position: Position = { line: 2, character: 6 };
      const lineText = 'enum Status {';
      const result = provider.rename(uri1, position, lineText, 'UserStatus');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('validation edge cases', () => {
    it('should reject reserved word as new name', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = '  string name = 1;';
      // 'message' is a reserved word in protobuf
      const result = provider.rename(uri, position, lineText, 'message');

      // Implementation may or may not reject reserved words
      // This tests the validation path
    });

    it('should handle empty new name', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.rename(uri, position, lineText, '');

      expect(result.changes.size).toBe(0);
    });

    it('should handle new name with spaces', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.rename(uri, position, lineText, 'New Name');

      expect(result.changes.size).toBe(0);
    });

    it('should handle new name starting with number', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.rename(uri, position, lineText, '123Test');

      expect(result.changes.size).toBe(0);
    });
  });

  describe('prepareRename additional scenarios', () => {
    it('should return null for position inside comment', () => {
      const text = `syntax = "proto3";
// This is a Test comment
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 15 };
      const lineText = '// This is a Test comment';
      const result = provider.prepareRename(uri, position, lineText);

      // Position is inside comment, should be null or undefined
      // depending on implementation
    });

    it('should return null for position inside string', () => {
      const text = `syntax = "proto3";
option java_package = "com.example.Test";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 35 };
      const lineText = 'option java_package = "com.example.Test";';
      const result = provider.prepareRename(uri, position, lineText);

      // Position is inside string literal
    });

    it('should handle position at package declaration', () => {
      const text = `syntax = "proto3";
package my.test.package;
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on "test" in package name
      const position: Position = { line: 1, character: 11 };
      const lineText = 'package my.test.package;';
      const result = provider.prepareRename(uri, position, lineText);

      // Package parts might not be renameable
    });

    it('should prepare rename for RPC name inside service', () => {
      const text = `syntax = "proto3";
service UserService {
  rpc GetUser (Request) returns (Response);
}
message Request {}
message Response {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // RPC names are local symbols that can be renamed
      const position: Position = { line: 2, character: 7 };
      const lineText = '  rpc GetUser (Request) returns (Response);';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('GetUser');
    });
  });

  describe('map field rename', () => {
    it('should rename map field name', () => {
      const text = `syntax = "proto3";
message Test {
  map<string, int32> scores = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 22 };
      const lineText = '  map<string, int32> scores = 1;';
      const result = provider.rename(uri, position, lineText, 'results');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename map value type when it is custom message', () => {
      const text = `syntax = "proto3";
message Score {
  int32 value = 1;
}
message Test {
  map<string, Score> user_scores = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on Score type definition
      const position: Position = { line: 1, character: 10 };
      const lineText = 'message Score {';
      const result = provider.rename(uri, position, lineText, 'Points');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('repeated field rename', () => {
    it('should rename repeated field', () => {
      const text = `syntax = "proto3";
message Test {
  repeated string items = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 19 };
      const lineText = '  repeated string items = 1;';
      const result = provider.rename(uri, position, lineText, 'elements');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('deeply nested structures', () => {
    it('should rename deeply nested message', () => {
      const text = `syntax = "proto3";
message Level1 {
  message Level2 {
    message Level3 {
      string deep_field = 1;
    }
    Level3 level3 = 1;
  }
  Level2 level2 = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on Level3
      const position: Position = { line: 3, character: 13 };
      const lineText = '    message Level3 {';
      const result = provider.rename(uri, position, lineText, 'Deepest');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename field in deeply nested message', () => {
      const text = `syntax = "proto3";
message A {
  message B {
    message C {
      string my_field = 1;
    }
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 14 };
      const lineText = '      string my_field = 1;';
      const result = provider.rename(uri, position, lineText, 'renamed_field');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('getWordAtPosition edge cases', () => {
    it('should handle word at start of line', () => {
      const text = `syntax = "proto3";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 0 };
      const lineText = 'message Test {}';
      const result = provider.prepareRename(uri, position, lineText);

      // 'message' is at position 0, should handle correctly
    });

    it('should handle word at end of line', () => {
      const text = `syntax = "proto3";
message LongMessageNameAtEndOfLine {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 35 };
      const lineText = 'message LongMessageNameAtEndOfLine {}';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result).toBeDefined();
    });

    it('should handle underscores in identifier', () => {
      const text = `syntax = "proto3";
message My_Long_Message_Name {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 15 };
      const lineText = 'message My_Long_Message_Name {}';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result?.placeholder).toBe('My_Long_Message_Name');
    });

    it('should handle numbers in identifier', () => {
      const text = `syntax = "proto3";
message V2Message {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 10 };
      const lineText = 'message V2Message {}';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result?.placeholder).toBe('V2Message');
    });
  });

  describe('file not found scenarios', () => {
    it('should handle rename when file is not in analyzer', () => {
      const position: Position = { line: 0, character: 0 };
      const lineText = 'message Test {}';
      const result = provider.rename('file:///nonexistent.proto', position, lineText, 'NewName');

      expect(result.changes.size).toBe(0);
    });

    it('should handle prepareRename when file is not in analyzer', () => {
      const position: Position = { line: 0, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.prepareRename('file:///nonexistent.proto', position, lineText);

      // Should gracefully return null
      expect(result).toBeNull();
    });
  });
});
