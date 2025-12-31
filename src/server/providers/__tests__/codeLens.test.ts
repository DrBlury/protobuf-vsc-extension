/**
 * Tests for Code Lens Provider
 */

import { CodeLensProvider } from '../codeLens';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';

describe('CodeLensProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let codeLensProvider: CodeLensProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    codeLensProvider = new CodeLensProvider(analyzer);
  });

  it('should create code lenses for messages', () => {
    const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
  string email = 2;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const messageLens = lenses.find(l => l.command?.title?.includes('User') || l.command?.title?.includes('field'));
    expect(messageLens).toBeDefined();
    if (messageLens) {
      expect(messageLens.command?.title).toBeDefined();
    }
  });

  it('should create code lenses for enums', () => {
    const content = `syntax = "proto3";
package test.v1;

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const enumLens = lenses.find(l => l.command?.title?.includes('Status') || l.command?.title?.includes('value'));
    expect(enumLens).toBeDefined();
    if (enumLens) {
      expect(enumLens.command?.title).toBeDefined();
    }
  });

  it('should create code lenses for services', () => {
    const content = `syntax = "proto3";
package test.v1;

message GetUserRequest {}
message CreateUserRequest {}
message User {}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const serviceLens = lenses.find(l => l.command?.title?.includes('UserService') || l.command?.title?.includes('RPC'));
    expect(serviceLens).toBeDefined();
    if (serviceLens) {
      expect(serviceLens.command?.title).toBeDefined();
    }
  });

  it('should show reference counts in code lenses', () => {
    const content1 = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}`;

    const content2 = `syntax = "proto3";
package test.v1;
import "file1.proto";

message Profile {
  test.v1.User user = 1;
}`;

    const uri1 = 'file:///file1.proto';
    const uri2 = 'file:///file2.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const lenses = codeLensProvider.getCodeLenses(uri1, file1);

    // Code lens should be created if there are fields or references
    expect(lenses.length).toBeGreaterThan(0);
    const userLens = lenses.find(l =>
      l.command?.title?.includes('User') ||
      l.command?.title?.includes('reference') ||
      l.command?.title?.includes('field')
    );
    // Lens should exist because message has fields
    expect(userLens).toBeDefined();
  });

  it('should handle messages without package', () => {
    const content = `syntax = "proto3";

message SimpleMessage {
  string data = 1;
}`;
    const uri = 'file:///simple.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses[0].command?.title).toContain('field');
  });

  it('should handle nested messages', () => {
    const content = `syntax = "proto3";
package test;

message Outer {
  message Inner {
    string value = 1;
  }
  Inner inner = 1;
}`;
    const uri = 'file:///nested.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    // Should have lenses for both Outer and Inner
    expect(lenses.length).toBeGreaterThanOrEqual(2);
    const innerLens = lenses.find(l => l.range.start.line > 3);
    expect(innerLens).toBeDefined();
  });

  it('should show singular/plural correctly for fields', () => {
    const singleFieldContent = `syntax = "proto3";
message SingleField {
  string only = 1;
}`;
    const uri = 'file:///single.proto';
    const file = parser.parse(singleFieldContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    // With 1 field, should show "field" (singular)
    expect(lenses[0].command?.title).toContain('1 field');
    expect(lenses[0].command?.title).not.toContain('1 fields');
  });

  it('should show singular/plural correctly for enum values', () => {
    const singleValueContent = `syntax = "proto3";
enum SingleValue {
  UNSPECIFIED = 0;
}`;
    const uri = 'file:///single-enum.proto';
    const file = parser.parse(singleValueContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    // With 1 value, should show "value" (singular)
    expect(lenses[0].command?.title).toContain('1 value');
    expect(lenses[0].command?.title).not.toContain('1 values');
  });

  it('should show singular/plural correctly for RPCs', () => {
    const singleRpcContent = `syntax = "proto3";
message Request {}
message Response {}
service SingleRpc {
  rpc OnlyMethod(Request) returns (Response);
}`;
    const uri = 'file:///single-rpc.proto';
    const file = parser.parse(singleRpcContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    // Find the service lens
    const serviceLens = lenses.find(l => l.command?.title?.includes('RPC'));
    expect(serviceLens).toBeDefined();
    // With 1 RPC, should show "RPC" (singular)
    expect(serviceLens?.command?.title).toContain('1 RPC');
    expect(serviceLens?.command?.title).not.toContain('1 RPCs');
  });

  it('should show plural for multiple references', () => {
    const content = `syntax = "proto3";
message ReferencedMessage {
  string id = 1;
}
message User1 {
  ReferencedMessage ref = 1;
}
message User2 {
  ReferencedMessage ref = 1;
}`;
    const uri = 'file:///refs.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    // Find the lens for ReferencedMessage
    const refLens = lenses.find(l => l.range.start.line === 1);
    expect(refLens).toBeDefined();
    // With 2 references, should show "references" (plural)
    expect(refLens?.command?.title).toContain('references');
  });

  it('should return empty array for empty file', () => {
    const content = `syntax = "proto3";`;
    const uri = 'file:///empty.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses).toEqual([]);
  });

  it('should include command arguments with correct position', () => {
    const content = `syntax = "proto3";

message TestMessage {
  string field = 1;
}`;
    const uri = 'file:///cmd-args.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses[0].command?.command).toBe('protobuf.findReferences');
    expect(lenses[0].command?.arguments).toBeDefined();
    expect(lenses[0].command?.arguments?.[0]?.uri).toBe(uri);
    expect(lenses[0].command?.arguments?.[0]?.position).toBeDefined();
  });

  it('should differentiate external and internal references', () => {
    const content1 = `syntax = "proto3";
package test;

message Shared {
  string data = 1;
}

message LocalUser {
  Shared shared = 1;
}`;

    const content2 = `syntax = "proto3";
package test;

message ExternalUser {
  Shared shared = 1;
}`;

    const uri1 = 'file:///shared.proto';
    const uri2 = 'file:///external.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const lenses = codeLensProvider.getCodeLenses(uri1, file1);
    
    // Find the lens for Shared message
    const sharedLens = lenses.find(l => l.range.start.line === 3);
    expect(sharedLens).toBeDefined();
    expect(sharedLens?.command?.title).toContain('external');
    expect(sharedLens?.command?.title).toContain('internal');
  });
});
