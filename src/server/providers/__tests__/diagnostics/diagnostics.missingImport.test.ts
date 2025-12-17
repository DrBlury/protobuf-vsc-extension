/* eslint-env jest */
import { DiagnosticsProvider } from '../../diagnostics';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { GOOGLE_WELL_KNOWN_PROTOS } from '../../../utils/googleWellKnown';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

describe('DiagnosticsProvider missing imports', () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const diagnosticsProvider = new DiagnosticsProvider(analyzer);

  beforeAll(() => {
    // Preload minimal google.type.Date stub
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS['google/type/date.proto'];
    const dateUri = 'builtin:///google/type/date.proto';
    analyzer.updateFile(dateUri, parser.parse(dateContent, dateUri));
  });

  it('reports missing import for google.type.Date usage', () => {
    const content = `syntax = "proto3";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeDefined();
    expect(missingImport?.severity).toBe(DiagnosticSeverity.Error);
    expect(missingImport?.message).toContain('google/type/date.proto');
  });

  it('does not report missing import when import exists', () => {
    const content = `syntax = "proto3";
import "google/type/date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_imported.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeUndefined();
  });

  it('reports incorrect import path when using non-canonical name', () => {
    const content = `syntax = "proto3";
import "date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_wrong_import.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const wrongImport = diags.find(d => d.message.includes('should be imported via'));

    expect(wrongImport).toBeDefined();
    expect(wrongImport?.message).toContain('google/type/date.proto');
  });

  it('allows imports with additional directory prefixes when they resolve to the same file', () => {
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace/project']);

    const dependencyUri = 'file:///workspace/project/protobuf/common.proto';
    const dependencyContent = `syntax = "proto3";
package demo;

message Common {
  string id = 1;
}`;
    const dependencyFile = localParser.parse(dependencyContent, dependencyUri);
    localAnalyzer.updateFile(dependencyUri, dependencyFile);

    const mainContent = `syntax = "proto3";
import "protobuf/common.proto";
package demo;

message UsesCommon {
  Common thing = 1;
}`;
    const mainUri = 'file:///workspace/project/protobuf/uses.proto';
    const mainFile = localParser.parse(mainContent, mainUri);
    localAnalyzer.updateFile(mainUri, mainFile);

    const diags = localDiagnostics.validate(mainUri, mainFile);
    const mismatch = diags.find(d => d.message.includes('should be imported via'));
    const missing = diags.find(d => d.message.includes('not imported'));

    expect(mismatch).toBeUndefined();
    expect(missing).toBeUndefined();
  });

  it('allows absolute-style imports when canonical suggestion is relative path with parent traversal', () => {
    // This test covers the case where the user imports via an absolute-style path (e.g., from proto_path root)
    // but the suggested import is a relative path with ../ traversal. Since the import resolves correctly,
    // it should not flag an error.
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);
    localAnalyzer.setImportPaths(['/workspace']);

    // The type definition is at /workspace/sh/t/message.proto
    const messageUri = 'file:///workspace/sh/t/message.proto';
    const messageContent = `syntax = "proto3";
package sh.t;

message BotId {
  string id = 1;
}`;
    const messageFile = localParser.parse(messageContent, messageUri);
    localAnalyzer.updateFile(messageUri, messageFile);

    // The main file is at /workspace/sh/bot/api/bot.proto
    // It imports via the absolute-style path "sh/t/message.proto" (from workspace root)
    // but the canonical relative path would be "../../t/message.proto"
    const botUri = 'file:///workspace/sh/bot/api/bot.proto';
    const botContent = `syntax = "proto3";
package sh.bot.api;

import "sh/t/message.proto";

message Bot {
  sh.t.BotId bot_id = 1;
}`;
    const botFile = localParser.parse(botContent, botUri);
    localAnalyzer.updateFile(botUri, botFile);

    const diags = localDiagnostics.validate(botUri, botFile);
    const mismatch = diags.find(d => d.message.includes('should be imported via'));
    const missing = diags.find(d => d.message.includes('not imported'));

    // Should not report any import-related errors since the import resolves correctly
    expect(mismatch).toBeUndefined();
    expect(missing).toBeUndefined();
  });

  it('should not suggest importing a type when it is already imported from another file, even if same-named type exists elsewhere', () => {
    // This test verifies that when a file imports "user.proto" which defines test.user.User,
    // and we use "test.user.User" in a field, it should NOT suggest importing "example.proto"
    // even if example.proto also has a User type (example.v1.User).
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);

    // File 1: example.proto with example.v1.User (NOT imported by order.proto)
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `syntax = "proto3";
package example.v1;

message User {
  string id = 1;
  string name = 2;
}`;
    const exampleFile = localParser.parse(exampleContent, exampleUri);
    localAnalyzer.updateFile(exampleUri, exampleFile);

    // File 2: user.proto with test.user.User (imported by order.proto)
    const userUri = 'file:///workspace/user.proto';
    const userContent = `syntax = "proto3";
package test.user;

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}`;
    const userFile = localParser.parse(userContent, userUri);
    localAnalyzer.updateFile(userUri, userFile);

    // File 3: order.proto which imports user.proto and uses test.user.User
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `syntax = "proto3";
package test.order;

import "user.proto";

message Order {
  string id = 1;
  test.user.User customer = 2;
}`;
    const orderFile = localParser.parse(orderContent, orderUri);
    localAnalyzer.updateFile(orderUri, orderFile);

    const diags = localDiagnostics.validate(orderUri, orderFile);

    // Should NOT report any "not imported" error for test.user.User
    // since user.proto IS imported
    const missingImport = diags.find(d => d.message.includes('not imported'));
    const wrongSuggestion = diags.find(d => d.message.includes('example.proto'));

    expect(missingImport).toBeUndefined();
    expect(wrongSuggestion).toBeUndefined();
  });

  it('should prefer same-file type over non-imported type with same name', () => {
    // When UserProfile uses "User" (defined in same file), it should NOT suggest
    // importing example.proto which also has a User type
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);

    // File 1: example.proto with example.v1.User (NOT imported)
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `syntax = "proto3";
package example.v1;

message User {
  string id = 1;
}`;
    const exampleFile = localParser.parse(exampleContent, exampleUri);
    localAnalyzer.updateFile(exampleUri, exampleFile);

    // File 2: user.proto with test.user.User AND UserProfile that references User
    const userUri = 'file:///workspace/user.proto';
    const userContent = `syntax = "proto3";
package test.user;

message User {
  string id = 1;
  string name = 2;
}

message UserProfile {
  User user = 1;
  string bio = 2;
}`;
    const userFile = localParser.parse(userContent, userUri);
    localAnalyzer.updateFile(userUri, userFile);

    const diags = localDiagnostics.validate(userUri, userFile);

    // Should NOT report any "not imported" error for User since it's in the same file
    const missingImport = diags.find(d => d.message.includes('not imported'));
    const wrongSuggestion = diags.find(d => d.message.includes('example.proto'));

    expect(missingImport).toBeUndefined();
    expect(wrongSuggestion).toBeUndefined();
  });

  it('should resolve simple type name from imported file by simple name', () => {
    // When a file imports example.proto and uses "Address" (simple name without package prefix),
    // it should be found in the imported file even though it's in a different package
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);

    // File 1: example.proto with example.v1.Address
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `edition = "2023";
package example.v1;

message User {
  string id = 1;
}

message Address {
  string street = 1;
  string city = 2;
}`;
    const exampleFile = localParser.parse(exampleContent, exampleUri);
    localAnalyzer.updateFile(exampleUri, exampleFile);

    // File 2: order.proto that imports example.proto and uses Address WITHOUT package prefix
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `edition = "2023";
package order.v1;

import "example.proto";

message Order {
  string id = 1;
  Address shipping_address = 2;
}`;
    const orderFile = localParser.parse(orderContent, orderUri);
    localAnalyzer.updateFile(orderUri, orderFile);

    const diags = localDiagnostics.validate(orderUri, orderFile);

    // Should NOT report "Unknown type 'Address'" since example.proto is imported
    const unknownType = diags.find(d => d.message.includes("Unknown type 'Address'"));
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(unknownType).toBeUndefined();
    expect(missingImport).toBeUndefined();
  });

  it('should resolve simple type name even when order.proto is loaded BEFORE example.proto', () => {
    // This tests the scenario where the importing file is loaded before the imported file
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);

    // Load order.proto FIRST (before example.proto is known)
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `edition = "2023";
package order.v1;

import "example.proto";

message Order {
  string id = 1;
  Address shipping_address = 2;
}`;
    const orderFile = localParser.parse(orderContent, orderUri);
    localAnalyzer.updateFile(orderUri, orderFile);

    // At this point, the import is unresolved
    // Now load example.proto SECOND
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `edition = "2023";
package example.v1;

message User {
  string id = 1;
}

message Address {
  string street = 1;
  string city = 2;
}`;
    const exampleFile = localParser.parse(exampleContent, exampleUri);
    localAnalyzer.updateFile(exampleUri, exampleFile);

    // Now validate order.proto - the import should now be resolved
    const diags = localDiagnostics.validate(orderUri, orderFile);

    // Should NOT report "Unknown type 'Address'" since example.proto is now loaded and imported
    const unknownType = diags.find(d => d.message.includes("Unknown type 'Address'"));
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(unknownType).toBeUndefined();
    expect(missingImport).toBeUndefined();
  });

  it('should correctly resolve simple filename imports when multiple files with same name exist', () => {
    // This tests that import "example.proto" in different directories resolves to the correct file
    const localParser = new ProtoParser();
    const localAnalyzer = new SemanticAnalyzer();
    const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localAnalyzer.setWorkspaceRoots(['/workspace']);

    // File 1: /workspace/dir_a/example.proto with package_a.Address
    const exampleAUri = 'file:///workspace/dir_a/example.proto';
    const exampleAContent = `edition = "2023";
package package_a;

message Address {
  string street_a = 1;
}`;
    const exampleAFile = localParser.parse(exampleAContent, exampleAUri);
    localAnalyzer.updateFile(exampleAUri, exampleAFile);

    // File 2: /workspace/dir_b/example.proto with package_b.Address
    const exampleBUri = 'file:///workspace/dir_b/example.proto';
    const exampleBContent = `edition = "2023";
package package_b;

message Address {
  string street_b = 1;
}`;
    const exampleBFile = localParser.parse(exampleBContent, exampleBUri);
    localAnalyzer.updateFile(exampleBUri, exampleBFile);

    // File 3: /workspace/dir_a/order.proto imports "example.proto" (should resolve to dir_a/example.proto)
    const orderAUri = 'file:///workspace/dir_a/order.proto';
    const orderAContent = `edition = "2023";
package package_a;

import "example.proto";

message Order {
  Address addr = 1;
}`;
    const orderAFile = localParser.parse(orderAContent, orderAUri);
    localAnalyzer.updateFile(orderAUri, orderAFile);

    // File 4: /workspace/dir_b/order.proto imports "example.proto" (should resolve to dir_b/example.proto)
    const orderBUri = 'file:///workspace/dir_b/order.proto';
    const orderBContent = `edition = "2023";
package package_b;

import "example.proto";

message Order {
  Address addr = 1;
}`;
    const orderBFile = localParser.parse(orderBContent, orderBUri);
    localAnalyzer.updateFile(orderBUri, orderBFile);

    // Validate both order files - neither should have unknown type errors
    const diagsA = localDiagnostics.validate(orderAUri, orderAFile);
    const diagsB = localDiagnostics.validate(orderBUri, orderBFile);

    // Both should resolve their Address type correctly from their local example.proto
    const unknownTypeA = diagsA.find(d => d.message.includes("Unknown type 'Address'"));
    const unknownTypeB = diagsB.find(d => d.message.includes("Unknown type 'Address'"));

    expect(unknownTypeA).toBeUndefined();
    expect(unknownTypeB).toBeUndefined();
  });
});
