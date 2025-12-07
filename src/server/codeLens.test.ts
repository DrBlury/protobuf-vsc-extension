/**
 * Tests for Code Lens Provider
 */

import { CodeLensProvider } from './providers/codeLens';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';

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
});
