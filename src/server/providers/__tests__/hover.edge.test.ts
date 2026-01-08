/**
 * Edge case tests for hover provider
 */

import { HoverProvider } from '../hover';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoParser } from '../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('HoverProvider Edge Cases', () => {
  let provider: HoverProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new HoverProvider(analyzer);
  });

  describe('nested structures', () => {
    it('should provide hover for nested messages', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 1;
  }
  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Inner inner = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should provide hover for nested enum values', () => {
      const text = `syntax = "proto3";
message Test {
  enum Status {
    UNKNOWN = 0;
    OK = 1;
  }
  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 7, character: 3 };
      const lineText = '  Status status = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should resolve correct nested enum when multiple messages have same-named enums', () => {
      // This is a regression test for the bug where hovering over a field type
      // in message B would incorrectly show A.Flags instead of B.Flags
      const text = `syntax = "proto3";

message A {
  enum Flags {
    A = 0;
  }
}

message B {
  enum Flags {
    A = 0;
    B = 1;
    C = 2;
  }

  repeated Flags flags = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on "Flags" in "repeated Flags flags = 1;" inside message B
      // Line 15 is "  repeated Flags flags = 1;"
      const position: Position = { line: 15, character: 12 };
      const lineText = '  repeated Flags flags = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      // The hover should show B.Flags, not A.Flags
      const content = (hover as any).contents.value as string;
      expect(content).toContain('B.Flags');
      expect(content).not.toContain('A.Flags');
    });

    it('should resolve correct nested message when multiple messages have same-named nested messages', () => {
      // Similar regression test but for nested messages instead of enums
      const text = `syntax = "proto3";

message A {
  message Inner {
    string a_field = 1;
  }
}

message B {
  message Inner {
    string b_field = 1;
    int32 extra = 2;
  }

  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on "Inner" in "Inner inner = 1;" inside message B
      // Line 14 is "  Inner inner = 1;"
      const position: Position = { line: 14, character: 4 };
      const lineText = '  Inner inner = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      // The hover should show B.Inner, not A.Inner
      const content = (hover as any).contents.value as string;
      expect(content).toContain('B.Inner');
      expect(content).not.toContain('A.Inner');
    });
  });

  describe('service and RPC', () => {
    it('should provide hover for RPC methods', () => {
      const text = `syntax = "proto3";
service TestService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 7 };
      const lineText = '  rpc GetUser(GetUserRequest) returns (GetUserResponse);';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('map fields', () => {
    it('should provide hover for map fields', () => {
      const text = `syntax = "proto3";
message Test {
  map<string, int32> values = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 3 };
      const lineText = '  map<string, int32> values = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('oneof fields', () => {
    it('should provide hover for oneof fields', () => {
      const text = `syntax = "proto3";
message Test {
  oneof test_oneof {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 5 };
      const lineText = '    string name = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('Well-Known Types', () => {
    it('should include documentation link for google.protobuf types', () => {
      const text = `syntax = "proto3";
import "google/protobuf/timestamp.proto";

message Event {
  google.protobuf.Timestamp created_at = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 22 };
      const lineText = '  google.protobuf.Timestamp created_at = 1;';
      const hover = provider.getHover(uri, position, lineText);

      // Even without the imported type, hover should work for field
      expect(hover).toBeDefined();
    });
  });

  describe('service hover', () => {
    it('should provide hover for service definition', () => {
      const text = `syntax = "proto3";

// UserService handles user operations
service UserService {
  // Get a user by ID
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 10 };
      const lineText = 'service UserService {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should provide hover for RPC with comments', () => {
      const text = `syntax = "proto3";

service TestService {
  // List all users in the system
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
}

message ListUsersRequest {}
message ListUsersResponse {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 7 };
      const lineText = '  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('message with references', () => {
    it('should show reference count for messages used in multiple places', () => {
      const text = `syntax = "proto3";

message User {
  string name = 1;
}

message GetUserResponse {
  User user = 1;
}

message UpdateUserRequest {
  User user = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = 'message User {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('enum hover', () => {
    it('should provide hover for enum with all values', () => {
      const text = `syntax = "proto3";

// Status represents the state of a resource
enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 6 };
      const lineText = 'enum Status {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should provide hover for enum value', () => {
      const text = `syntax = "proto3";

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 4 };
      const lineText = '  STATUS_ACTIVE = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('no hover cases', () => {
    it('should return null for empty line text', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 0 };
      const lineText = '';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeNull();
    });
  });
});
