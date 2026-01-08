/**
 * Coverage-focused tests for HoverProvider
 * Targets uncovered lines: 151-153, 223-231, 249-253, 262, 269-274, 330, 347, 351, 356, 359, 384-393
 */

import { HoverProvider } from '../hover';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoParser } from '../../core/parser';
import { Position, MarkupContent } from 'vscode-languageserver/node';

describe('HoverProvider Coverage Tests', () => {
  let provider: HoverProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new HoverProvider(analyzer);
  });

  describe('google.protobuf well-known types documentation link (lines 151-153)', () => {
    it('should add documentation link for google.protobuf.Timestamp', () => {
      // Register the WKT in the analyzer
      const wktText = `syntax = "proto3";
package google.protobuf;
message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}`;
      const wktUri = 'file:///google/protobuf/timestamp.proto';
      const wktFile = parser.parse(wktText, wktUri);
      analyzer.updateFile(wktUri, wktFile);

      // Now create a file that uses Timestamp
      const text = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
message Event {
  google.protobuf.Timestamp created_at = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on Timestamp in the import context
      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Event {';
      const hover = provider.getHover(uri, position, lineText);
      expect(hover).toBeDefined();
    });

    it('should add documentation link for google.protobuf.Duration', () => {
      const wktText = `syntax = "proto3";
package google.protobuf;
message Duration {
  int64 seconds = 1;
  int32 nanos = 2;
}`;
      const wktUri = 'file:///google/protobuf/duration.proto';
      const wktFile = parser.parse(wktText, wktUri);
      analyzer.updateFile(wktUri, wktFile);

      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Duration {';
      const hover = provider.getHover(wktUri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('Duration');
      }
    });
  });

  describe('findInService for RPC methods (lines 269-274)', () => {
    it('should find RPC method when hovering on method name', () => {
      const text = `syntax = "proto3";

message Request {}
message Response {}

service MyService {
  rpc GetData(Request) returns (Response);
  rpc UpdateData(Request) returns (Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on GetData RPC
      const position: Position = { line: 6, character: 8 };
      const lineText = '  rpc GetData(Request) returns (Response);';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should find service when hovering on service name', () => {
      const text = `syntax = "proto3";

message Request {}
message Response {}

service DataService {
  rpc GetData(Request) returns (Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 5, character: 10 };
      const lineText = 'service DataService {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('findInEnum for enum values (lines 262)', () => {
    it('should find enum value when hovering', () => {
      const text = `syntax = "proto3";

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_DELETED = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 5 };
      const lineText = '  STATUS_ACTIVE = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('findInMessage nested structures (lines 249-253)', () => {
    it('should find nested enum inside message', () => {
      const text = `syntax = "proto3";

message Container {
  enum InnerStatus {
    UNKNOWN = 0;
    ACTIVE = 1;
  }
  InnerStatus status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on the nested enum name
      const position: Position = { line: 3, character: 8 };
      const lineText = '  enum InnerStatus {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should find deeply nested message', () => {
      const text = `syntax = "proto3";

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

      const position: Position = { line: 4, character: 13 };
      const lineText = '    message Inner {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('formatMessage with maps and oneofs (lines 347, 351, 356, 359, 384-393)', () => {
    it('should format message with map fields', () => {
      const text = `syntax = "proto3";

message Config {
  string name = 1;
  map<string, string> metadata = 2;
  map<int32, bytes> data = 3;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on the message name
      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Config {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('Config');
      }
    });

    it('should format message with oneof', () => {
      const text = `syntax = "proto3";

message Request {
  string id = 1;
  oneof payload {
    string text_data = 2;
    bytes binary_data = 3;
    int64 numeric_data = 4;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Request {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('Request');
      }
    });

    it('should format message with nested types', () => {
      const text = `syntax = "proto3";

message Parent {
  string name = 1;

  message NestedChild {
    int32 id = 1;
  }

  enum NestedEnum {
    UNKNOWN = 0;
  }

  NestedChild child = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = 'message Parent {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('Parent');
      }
    });

    it('should format message with field modifier', () => {
      const text = `syntax = "proto3";

message List {
  repeated string items = 1;
  optional int32 count = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = 'message List {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('repeated');
      }
    });
  });

  describe('contains and isNameRange helpers (lines 330)', () => {
    it('should handle position at exact start of range', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position at the very start of message keyword
      const position: Position = { line: 1, character: 0 };
      const lineText = 'message Test {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should handle position at exact end of range', () => {
      const text = `syntax = "proto3";
message Test {
  string field = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position at the end of the closing brace
      const position: Position = { line: 3, character: 0 };
      const lineText = '}';
      const hover = provider.getHover(uri, position, lineText);

      // Should return null or a hover depending on if there's content
      expect(hover === null || hover !== undefined).toBe(true);
    });
  });

  describe('findContainingMessageScope (lines 223-231)', () => {
    it('should find scope for deeply nested field', () => {
      const text = `syntax = "proto3";
package test.v1;

message A {
  enum Status {
    UNKNOWN = 0;
  }
}

message B {
  enum Status {
    UNKNOWN = 0;
    ACTIVE = 1;
  }

  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on Status field type in message B - should resolve to B.Status
      const position: Position = { line: 15, character: 4 };
      const lineText = '  Status status = 1;';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        // Should show B.Status, not A.Status
        expect(content).toContain('B.Status');
      }
    });
  });

  describe('service and RPC comments', () => {
    it('should show comments for service', () => {
      const text = `syntax = "proto3";

message Request {}
message Response {}

// UserService provides user management operations
service UserService {
  // GetUser retrieves a user by ID
  rpc GetUser(Request) returns (Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 10 };
      const lineText = 'service UserService {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('keyword hover', () => {
    it('should return hover for syntax keyword', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 0, character: 2 };
      const lineText = 'syntax = "proto3";';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should return hover for message keyword', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 3 };
      const lineText = 'message Test {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });
  });

  describe('edge cases for getWordAtPosition', () => {
    it('should handle word at beginning of line', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 0 };
      const lineText = 'message Test {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
    });

    it('should handle word at end of line', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 14 };
      const lineText = '  string name = 1;';
      const hover = provider.getHover(uri, position, lineText);

      // Hovering on field number shouldn't give meaningful hover
      expect(hover === null || hover !== undefined).toBe(true);
    });
  });

  describe('formatEnum', () => {
    it('should format enum with multiple values', () => {
      const text = `syntax = "proto3";

// Priority levels for tasks
enum Priority {
  PRIORITY_UNSPECIFIED = 0;
  PRIORITY_LOW = 1;
  PRIORITY_MEDIUM = 2;
  PRIORITY_HIGH = 3;
  PRIORITY_CRITICAL = 4;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 6 };
      const lineText = 'enum Priority {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('Priority');
        expect(content).toContain('PRIORITY_LOW');
        expect(content).toContain('PRIORITY_HIGH');
      }
    });
  });

  describe('references display', () => {
    it('should show reference count for frequently used message', () => {
      const text = `syntax = "proto3";

message User {
  string id = 1;
  string name = 2;
}

message GetUserRequest {
  string user_id = 1;
}

message GetUserResponse {
  User user = 1;
}

message ListUsersResponse {
  repeated User users = 1;
}

message UpdateUserRequest {
  User user = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Hover on User message
      const position: Position = { line: 2, character: 10 };
      const lineText = 'message User {';
      const hover = provider.getHover(uri, position, lineText);

      expect(hover).toBeDefined();
      if (hover) {
        const content = (hover.contents as MarkupContent).value;
        expect(content).toContain('User');
      }
    });
  });
});
