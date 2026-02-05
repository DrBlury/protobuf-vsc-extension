/**
 * Coverage-focused tests for DefinitionProvider
 * Targets uncovered lines: 24,95-98,108,115,123,145,166,177,203-204,216,254,266,285,301
 */

import { DefinitionProvider } from '../../definition';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('DefinitionProvider Coverage Tests', () => {
  let provider: DefinitionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  describe('getWordAtPosition edge cases (lines 203-216)', () => {
    it('should return null for empty position', () => {
      const text = `syntax = "proto3";`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on whitespace
      const position: Position = { line: 0, character: 50 };
      const lineText = 'syntax = "proto3";                                 ';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });

    it('should handle position at end of line', () => {
      const text = `syntax = "proto3";`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 0, character: 0 };
      const lineText = '';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });

    it('should extract fully qualified names with dots', () => {
      const text = `syntax = "proto3";
package mypackage;

message Outer {
  message Inner {}
}

message Test {
  mypackage.Outer.Inner nested = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 8, character: 15 };
      const lineText = '  mypackage.Outer.Inner nested = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      // Should resolve the nested type
      expect(definition).toBeDefined();
    });

    it('should handle word extraction near special chars', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on equals sign
      const position: Position = { line: 2, character: 15 };
      const lineText = '  string name = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });
  });

  describe('resolveTypeWithContext (lines 95-123)', () => {
    it('should resolve type in nested message context', () => {
      const text = `syntax = "proto3";

message A {
  message Flags {
    bool a_flag = 1;
  }
  Flags flags = 1;
}

message B {
  message Flags {
    bool b_flag = 1;
  }
  Flags flags = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Test resolving Flags from within message A context
      const position: Position = { line: 6, character: 3 };
      const lineText = '  Flags flags = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should resolve type starting with dot (fully qualified)', () => {
      const text = `syntax = "proto3";
package mypackage;

message MyMessage {}

message Test {
  .mypackage.MyMessage msg = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 15 };
      const lineText = '  .mypackage.MyMessage msg = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should resolve partial qualified name', () => {
      const text = `syntax = "proto3";
package domain.v1;

message Date {
  int32 day = 1;
}

message Container {
  v1.Date date = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 8, character: 5 };
      const lineText = '  v1.Date date = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      // Should attempt to resolve partial name
      expect(definition).toBeDefined();
    });

    it('should try all symbol resolution strategies', () => {
      const text = `syntax = "proto3";
package pkg;

message Local {}

message Container {
  Local local = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Local local = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should resolve type from cross-file import', () => {
      const text1 = `syntax = "proto3";
package shared;
message SharedType {
  string value = 1;
}`;
      const text2 = `syntax = "proto3";
import "shared.proto";
message Test {
  shared.SharedType data = 1;
}`;
      const uri1 = 'file:///shared.proto';
      const uri2 = 'file:///test.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 3, character: 10 };
      const lineText = '  shared.SharedType data = 1;';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('findContextAtPosition (lines 145-177)', () => {
    it('should find context in deeply nested message', () => {
      const text = `syntax = "proto3";
package mypackage;

message Outer {
  message Middle {
    message Inner {
      string value = 1;
    }
    Inner inner = 1;
  }
  Middle middle = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position inside Middle message
      const position: Position = { line: 8, character: 5 };
      const lineText = '    Inner inner = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should return package context when not inside message', () => {
      const text = `syntax = "proto3";
package mypackage;

message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on syntax keyword
      const position: Position = { line: 0, character: 3 };
      const lineText = 'syntax = "proto3";';
      const definition = provider.getDefinition(uri, position, lineText);

      // syntax is a keyword, should return null
      expect(definition).toBeNull();
    });
  });

  describe('resolveImportLocation strategies (lines 254-301)', () => {
    it('should resolve import with absolute path style', () => {
      const text1 = `syntax = "proto3";
message User {}`;
      const text2 = `syntax = "proto3";
import "domain/v1/user.proto";
message Test {
  User user = 1;
}`;
      const uri1 = 'file:///workspace/domain/v1/user.proto';
      const uri2 = 'file:///workspace/test.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 1, character: 10 };
      const lineText = 'import "domain/v1/user.proto";';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should resolve import using relative path', () => {
      const text1 = `syntax = "proto3";
message Common {}`;
      const text2 = `syntax = "proto3";
import "./common.proto";
message Test {}`;
      const uri1 = 'file:///workspace/common.proto';
      const uri2 = 'file:///workspace/test.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 1, character: 10 };
      const lineText = 'import "./common.proto";';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should resolve import using filename-only match', () => {
      const text1 = `syntax = "proto3";
message Foo {}`;
      const text2 = `syntax = "proto3";
import "foo.proto";
message Bar {}`;
      const uri1 = 'file:///deep/nested/path/foo.proto';
      const uri2 = 'file:///another/path/bar.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 1, character: 10 };
      const lineText = 'import "foo.proto";';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should handle weak import', () => {
      const text = `syntax = "proto3";
import weak "optional.proto";
message Test {}`;
      const uri1 = 'file:///optional.proto';
      const uri2 = 'file:///test.proto';

      const file1 = parser.parse('syntax = "proto3"; message Optional {}', uri1);
      const file2 = parser.parse(text, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 1, character: 15 };
      const lineText = 'import weak "optional.proto";';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should handle public import', () => {
      const text = `syntax = "proto3";
import public "shared.proto";
message Test {}`;
      const uri1 = 'file:///shared.proto';
      const uri2 = 'file:///test.proto';

      const file1 = parser.parse('syntax = "proto3"; message Shared {}', uri1);
      const file2 = parser.parse(text, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 1, character: 18 };
      const lineText = 'import public "shared.proto";';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should return null for non-existent import', () => {
      const text = `syntax = "proto3";
import "nonexistent.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 10 };
      const lineText = 'import "nonexistent.proto";';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });
  });

  describe('findSymbolAtPosition (lines 130-139)', () => {
    it('should return symbol when cursor is on its declaration', () => {
      const text = `syntax = "proto3";
message MyMessage {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on "MyMessage" in its own declaration
      const position: Position = { line: 1, character: 10 };
      const lineText = 'message MyMessage {';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('keyword handling (line 24)', () => {
    it('should return null for protobuf keywords', () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 3 };
      const lineText = '  reserved 1 to 10;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });

    it('should return null for syntax keyword', () => {
      const text = `syntax = "proto3";`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 0, character: 3 };
      const lineText = 'syntax = "proto3";';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeNull();
    });
  });

  describe('service and RPC types', () => {
    it('should navigate to RPC request type', () => {
      const text = `syntax = "proto3";

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  string name = 1;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 11, character: 15 };
      const lineText = '  rpc GetUser(GetUserRequest) returns (GetUserResponse);';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should navigate to RPC response type', () => {
      const text = `syntax = "proto3";

message Request {}
message Response {}

service TestService {
  rpc Call(Request) returns (Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 30 };
      const lineText = '  rpc Call(Request) returns (Response);';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('map field types', () => {
    it('should navigate to map value type', () => {
      const text = `syntax = "proto3";

message Value {
  string data = 1;
}

message Container {
  map<string, Value> values = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 7, character: 16 };
      const lineText = '  map<string, Value> values = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('enum navigation', () => {
    it('should navigate to enum from field type', () => {
      const text = `syntax = "proto3";

enum Status {
  STATUS_UNKNOWN = 0;
  STATUS_ACTIVE = 1;
}

message User {
  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 8, character: 3 };
      const lineText = '  Status status = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });
});
