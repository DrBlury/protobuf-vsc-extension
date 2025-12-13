/**
 * Tests for References Provider
 */

import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ReferencesProvider } from '../references';

describe('ReferencesProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: ReferencesProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new ReferencesProvider(analyzer);
  });

  describe('findReferences', () => {
    it('should find references to a message type', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message GetUserResponse {
  User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Position cursor on "User" in "message User {"
      const lineText = 'message User {';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      // Should find declaration + 1 usage
      expect(refs.length).toBe(2);
    });

    it('should find references from a usage site', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message GetUserResponse {
  User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Position cursor on "User" in "User user = 1;"
      const lineText = '  User user = 1;';
      const position = { line: 8, character: 3 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });

    it('should respect includeDeclaration flag', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message GetUserResponse {
  User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'message User {';
      const position = { line: 3, character: 10 };

      const withDeclaration = provider.findReferences('file:///test.proto', position, lineText, true);
      const withoutDeclaration = provider.findReferences('file:///test.proto', position, lineText, false);

      expect(withDeclaration.length).toBe(2);
      expect(withoutDeclaration.length).toBe(1);
    });

    it('should return empty array for builtin types', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = '  string name = 1;';
      const position = { line: 2, character: 4 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs).toEqual([]);
    });

    it('should find references to enum types', () => {
      const content = `syntax = "proto3";
package test.v1;

enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
}

message User {
  Status status = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'enum Status {';
      const position = { line: 3, character: 6 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });

    it('should find references in RPC definitions', () => {
      const content = `syntax = "proto3";
package test.v1;

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  string name = 1;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Find references to GetUserRequest
      const lineText = 'message GetUserRequest {';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      // Declaration + RPC usage
      expect(refs.length).toBe(2);
    });

    it('should find references across multiple files', () => {
      const commonContent = `syntax = "proto3";
package common.v1;

message Timestamp {
  int64 seconds = 1;
}`;

      const userContent = `syntax = "proto3";
package user.v1;
import "common.proto";

message User {
  Timestamp created_at = 1;
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const userFile = parser.parse(userContent, 'file:///user.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///user.proto', userFile);

      // Find references from common.proto
      const lineText = 'message Timestamp {';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///common.proto', position, lineText, true);

      // Declaration in common.proto + usage in user.proto
      expect(refs.length).toBe(2);
      expect(refs.some(r => r.uri === 'file:///common.proto')).toBe(true);
      expect(refs.some(r => r.uri === 'file:///user.proto')).toBe(true);
    });

    it('should handle fully qualified type names', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {}

message Container {
  test.v1.User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Position on "test.v1.User"
      const lineText = '  test.v1.User user = 1;';
      const position = { line: 6, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBeGreaterThan(0);
    });

    it('should return empty array when word is not found', () => {
      const content = `syntax = "proto3";
message User {}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Position on an empty part of line
      const lineText = '';
      const position = { line: 0, character: 0 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs).toEqual([]);
    });

    it('should handle repeated field types', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {}

message UserList {
  repeated User users = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'message User {}';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });

    it('should find references in map value types', () => {
      const content = `syntax = "proto3";
package test.v1;

message Value {}

message Container {
  map<string, Value> items = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'message Value {}';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });

    it('should find references in oneof fields', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {}

message Contact {
  oneof primary {
    User user = 1;
    string email = 2;
  }
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'message User {}';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });

    it('should handle stream RPC types', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {}

service UserService {
  rpc StreamUsers(StreamRequest) returns (stream User);
}

message StreamRequest {}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = 'message User {}';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///test.proto', position, lineText, true);

      expect(refs.length).toBe(2);
    });
  });

  describe('getWordAtPosition', () => {
    it('should extract word at cursor position', () => {
      const content = `syntax = "proto3";
message User {}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Different positions on "User"
      const lineText = 'message User {}';

      // Beginning of User
      const refs1 = provider.findReferences('file:///test.proto', { line: 1, character: 8 }, lineText, true);
      // Middle of User
      const refs2 = provider.findReferences('file:///test.proto', { line: 1, character: 10 }, lineText, true);
      // End of User
      const refs3 = provider.findReferences('file:///test.proto', { line: 1, character: 11 }, lineText, true);

      // All positions should find the same references
      expect(refs1.length).toBe(refs2.length);
      expect(refs2.length).toBe(refs3.length);
    });

    it('should handle dots in qualified names', () => {
      const content = `syntax = "proto3";
package test.v1;
message User {}
message Container {
  test.v1.User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Position in the middle of "test.v1.User"
      const lineText = '  test.v1.User user = 1;';
      const refs = provider.findReferences('file:///test.proto', { line: 4, character: 7 }, lineText, true);

      expect(refs.length).toBeGreaterThan(0);
    });

    it('should find references for fully qualified imported types', () => {
      const commonContent = `syntax = "proto3";
package common.v1;

message Money {
  string currency = 1;
  int64 amount = 2;
}`;

      const orderContent = `syntax = "proto3";
package order.v1;
import "common.proto";

message Order {
  common.v1.Money total = 1;
}

message LineItem {
  common.v1.Money price = 1;
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const orderFile = parser.parse(orderContent, 'file:///order.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///order.proto', orderFile);

      // Find references from the definition in common.proto
      const lineText = 'message Money {';
      const position = { line: 3, character: 10 };

      const refs = provider.findReferences('file:///common.proto', position, lineText, true);

      // Declaration + 2 usages in order.proto
      expect(refs.length).toBe(3);
      expect(refs.filter(r => r.uri === 'file:///common.proto').length).toBe(1);
      expect(refs.filter(r => r.uri === 'file:///order.proto').length).toBe(2);
    });

    it('should find references when searching from usage site with qualified name', () => {
      const commonContent = `syntax = "proto3";
package common.v1;

message Status {
  int32 code = 1;
}`;

      const orderContent = `syntax = "proto3";
package order.v1;
import "common.proto";

message Order {
  common.v1.Status status = 1;
}`;

      const userContent = `syntax = "proto3";
package user.v1;
import "common.proto";

message User {
  common.v1.Status status = 1;
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const orderFile = parser.parse(orderContent, 'file:///order.proto');
      const userFile = parser.parse(userContent, 'file:///user.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///order.proto', orderFile);
      analyzer.updateFile('file:///user.proto', userFile);

      // Find references from a usage site
      const lineText = '  common.v1.Status status = 1;';
      const position = { line: 5, character: 14 };

      const refs = provider.findReferences('file:///order.proto', position, lineText, true);

      // Declaration + usage in order.proto + usage in user.proto
      expect(refs.length).toBe(3);
    });
  });
});
