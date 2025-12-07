/**
 * Tests for Definition Provider
 */

import { Location } from 'vscode-languageserver/node';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { DefinitionProvider } from './providers/definition';

describe('DefinitionProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: DefinitionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  describe('getDefinition', () => {
    it('should find definition of a message type', () => {
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

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///test.proto');
      expect(def.range.start.line).toBe(3); // Line where "message User" is defined
    });

    it('should return null for builtin types', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = '  string name = 1;';
      const position = { line: 2, character: 4 };

      const def = provider.getDefinition('file:///test.proto', position, lineText);

      expect(def).toBeNull();
    });

    it('should find definition of an enum type', () => {
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

      const lineText = '  Status status = 1;';
      const position = { line: 9, character: 4 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3); // Line where "enum Status" is defined
    });

    it('should find definition in RPC input type', () => {
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

      // Position on "GetUserRequest" in RPC
      const lineText = '  rpc GetUser(GetUserRequest) returns (GetUserResponse);';
      const position = { line: 12, character: 16 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3);
    });

    it('should find definition in RPC output type', () => {
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

      // Position on "GetUserResponse" in RPC
      const lineText = '  rpc GetUser(GetUserRequest) returns (GetUserResponse);';
      const position = { line: 12, character: 42 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(7);
    });

    it('should find definition across files', () => {
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

      const lineText = '  Timestamp created_at = 1;';
      const position = { line: 5, character: 4 };

      const def = provider.getDefinition('file:///user.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
    });

    it('should find definition of nested message', () => {
      const content = `syntax = "proto3";
package test.v1;

message Outer {
  message Inner {
    string value = 1;
  }
  Inner inner = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = '  Inner inner = 1;';
      const position = { line: 7, character: 4 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(4); // Line where Inner is defined
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

      const lineText = '  test.v1.User user = 1;';
      const position = { line: 6, character: 10 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3);
    });

    it('should return null for unknown types', () => {
      const content = `syntax = "proto3";
message User {
  Unknown field = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = '  Unknown field = 1;';
      const position = { line: 2, character: 4 };

      const def = provider.getDefinition('file:///test.proto', position, lineText);

      // Unknown types should return null
      expect(def).toBeNull();
    });

    it('should handle import statement navigation', () => {
      const commonContent = `syntax = "proto3";
package common;
message Data {}`;

      const mainContent = `syntax = "proto3";
import "common.proto";
message User {}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const mainFile = parser.parse(mainContent, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const lineText = 'import "common.proto";';
      const position = { line: 1, character: 10 };

      const def = provider.getDefinition('file:///main.proto', position, lineText) as Location;

      // Should navigate to the imported file
      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
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

      const lineText = '  repeated User users = 1;';
      const position = { line: 6, character: 12 };

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3);
    });

    it('should handle map value types', () => {
      const content = `syntax = "proto3";
package test.v1;

message Value {}

message Container {
  map<string, Value> items = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Note: Map fields are parsed differently, the position might vary
      const lineText = '  map<string, Value> items = 1;';
      const position = { line: 6, character: 15 }; // On "Value"

      const def = provider.getDefinition('file:///test.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3);
    });

    it('should find definition of fully qualified imported type', () => {
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
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const orderFile = parser.parse(orderContent, 'file:///order.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///order.proto', orderFile);

      // Position on "common.v1.Money"
      const lineText = '  common.v1.Money total = 1;';
      const position = { line: 5, character: 12 };

      const def = provider.getDefinition('file:///order.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
      expect(def.range.start.line).toBe(3); // Line where Money is defined
    });

    it('should find definition when clicking on package part of qualified name', () => {
      const commonContent = `syntax = "proto3";
package common.v1;

message Money {
  string currency = 1;
}`;

      const orderContent = `syntax = "proto3";
package order.v1;
import "common.proto";

message Order {
  common.v1.Money total = 1;
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const orderFile = parser.parse(orderContent, 'file:///order.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///order.proto', orderFile);

      // Position on "common" part of "common.v1.Money"
      const lineText = '  common.v1.Money total = 1;';
      const position = { line: 5, character: 4 };

      const def = provider.getDefinition('file:///order.proto', position, lineText) as Location;

      // Should still resolve the full qualified name
      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
    });

    it('should find definition for imported type without package prefix', () => {
      const commonContent = `syntax = "proto3";
package common.v1;

message Date {
  int32 year = 1;
  int32 month = 2;
  int32 day = 3;
}`;

      const orderContent = `syntax = "proto3";
package order.v1;
import "common.proto";

message Order {
  Date created = 1;
}`;

      const commonFile = parser.parse(commonContent, 'file:///common.proto');
      const orderFile = parser.parse(orderContent, 'file:///order.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///order.proto', orderFile);

      // Position on "Date" without package prefix
      const lineText = '  Date created = 1;';
      const position = { line: 5, character: 4 };

      const def = provider.getDefinition('file:///order.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
    });

    it('should find definition with buf-style imports (domain/v1/file.proto)', () => {
      // Simulating buf-style imports where the import path includes directory structure
      const dateContent = `syntax = "proto3";
package domain.v1;

message Date {
  int32 year = 1;
  int32 month = 2;
  int32 day = 3;
}`;

      const exampleContent = `syntax = "proto3";
package domain.v1;
import "domain/v1/date.proto";

message ExampleMeta {
  string requested_by = 1;
  Date desired_start_date = 2;
}`;

      // Files have paths like /workspace/buf/domain/v1/date.proto
      const dateFile = parser.parse(dateContent, 'file:///workspace/buf/domain/v1/date.proto');
      const exampleFile = parser.parse(exampleContent, 'file:///workspace/buf/domain/v1/example.proto');

      // Add files in the order that would cause issues (importing file first)
      analyzer.updateFile('file:///workspace/buf/domain/v1/example.proto', exampleFile);
      analyzer.updateFile('file:///workspace/buf/domain/v1/date.proto', dateFile);

      // Position on "Date"
      const lineText = '  Date desired_start_date = 2;';
      const position = { line: 5, character: 3 };

      const def = provider.getDefinition('file:///workspace/buf/domain/v1/example.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///workspace/buf/domain/v1/date.proto');
    });

    it('should resolve import when imported file is added after importing file', () => {
      const commonContent = `syntax = "proto3";
package common;
message Data { string value = 1; }`;

      const mainContent = `syntax = "proto3";
import "common.proto";
message Container { Data data = 1; }`;

      const mainFile = parser.parse(mainContent, 'file:///main.proto');
      const commonFile = parser.parse(commonContent, 'file:///common.proto');

      // Add main.proto first (has the import)
      analyzer.updateFile('file:///main.proto', mainFile);

      // At this point, import cannot be resolved
      expect(analyzer.getImportedFileUris('file:///main.proto')).toEqual([]);

      // Now add common.proto
      analyzer.updateFile('file:///common.proto', commonFile);

      // Import should now be resolved
      expect(analyzer.getImportedFileUris('file:///main.proto')).toEqual(['file:///common.proto']);

      // Definition should work
      const lineText = 'message Container { Data data = 1; }';
      const position = { line: 2, character: 21 };
      const def = provider.getDefinition('file:///main.proto', position, lineText) as Location;

      expect(def).not.toBeNull();
      expect(def.uri).toBe('file:///common.proto');
    });
  });
});
