import { ProviderRegistry } from '../../../utils';
import { GOOGLE_WELL_KNOWN_PROTOS } from '../../../utils/googleWellKnown';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

describe('DiagnosticsProvider missing imports', () => {
  let providers: ProviderRegistry;

  beforeAll(() => {
    providers = new ProviderRegistry();
    // Preload minimal google.type.Date stub
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS['google/type/date.proto'];
    const dateUri = 'builtin:///google/type/date.proto';
    providers.analyzer.updateFile(dateUri, providers.parser.parse(dateContent, dateUri));
  });

  it('reports missing import for google.type.Date usage', async () => {
    const content = `syntax = "proto3";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    const diags = await providers.diagnostics.validate(uri, file, providers);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeDefined();
    expect(missingImport?.severity).toBe(DiagnosticSeverity.Error);
    expect(missingImport?.message).toContain('google/type/date.proto');
  });

  it('does not report missing import when import exists', async () => {
    const content = `syntax = "proto3";
import "google/type/date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_imported.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    const diags = await providers.diagnostics.validate(uri, file, providers);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeUndefined();
  });

  it('reports incorrect import path when using non-canonical name', async () => {
    const content = `syntax = "proto3";
import "date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_wrong_import.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    const diags = await providers.diagnostics.validate(uri, file, providers);
    const wrongImport = diags.find(d => d.message.includes('should be imported via'));

    expect(wrongImport).toBeDefined();
    expect(wrongImport?.message).toContain('google/type/date.proto');
  });

  it('allows imports with additional directory prefixes when they resolve to the same file', async () => {
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace/project']);

    const dependencyUri = 'file:///workspace/project/protobuf/common.proto';
    const dependencyContent = `syntax = "proto3";
package demo;

message Common {
  string id = 1;
}`;
    const dependencyFile = localProviders.parser.parse(dependencyContent, dependencyUri);
    localProviders.analyzer.updateFile(dependencyUri, dependencyFile);

    const mainContent = `syntax = "proto3";
import "protobuf/common.proto";
package demo;

message UsesCommon {
  Common thing = 1;
}`;
    const mainUri = 'file:///workspace/project/protobuf/uses.proto';
    const mainFile = localProviders.parser.parse(mainContent, mainUri);
    localProviders.analyzer.updateFile(mainUri, mainFile);

    const diags = await localProviders.diagnostics.validate(mainUri, mainFile, localProviders);
    const mismatch = diags.find(d => d.message.includes('should be imported via'));
    const missing = diags.find(d => d.message.includes('not imported'));

    expect(mismatch).toBeUndefined();
    expect(missing).toBeUndefined();
  });

  it('allows absolute-style imports when canonical suggestion is relative path with parent traversal', async () => {
    // This test covers the case where the user imports via an absolute-style path (e.g., from proto_path root)
    // but the suggested import is a relative path with ../ traversal. Since the import resolves correctly,
    // it should not flag an error.
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);
    localProviders.analyzer.setImportPaths(['/workspace']);

    // The type definition is at /workspace/sh/t/message.proto
    const messageUri = 'file:///workspace/sh/t/message.proto';
    const messageContent = `syntax = "proto3";
package sh.t;

message BotId {
  string id = 1;
}`;
    const messageFile = localProviders.parser.parse(messageContent, messageUri);
    localProviders.analyzer.updateFile(messageUri, messageFile);

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
    const botFile = localProviders.parser.parse(botContent, botUri);
    localProviders.analyzer.updateFile(botUri, botFile);

    const diags = await localProviders.diagnostics.validate(botUri, botFile, localProviders);
    const mismatch = diags.find(d => d.message.includes('should be imported via'));
    const missing = diags.find(d => d.message.includes('not imported'));

    // Should not report any import-related errors since the import resolves correctly
    expect(mismatch).toBeUndefined();
    expect(missing).toBeUndefined();
  });

  it('should not suggest importing a type when it is already imported from another file, even if same-named type exists elsewhere', async () => {
    // This test verifies that when a file imports "user.proto" which defines test.user.User,
    // and we use "test.user.User" in a field, it should NOT suggest importing "example.proto"
    // even if example.proto also has a User type (example.v1.User).
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);

    // File 1: example.proto with example.v1.User (NOT imported by order.proto)
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `syntax = "proto3";
package example.v1;

message User {
  string id = 1;
  string name = 2;
}`;
    const exampleFile = localProviders.parser.parse(exampleContent, exampleUri);
    localProviders.analyzer.updateFile(exampleUri, exampleFile);

    // File 2: user.proto with test.user.User (imported by order.proto)
    const userUri = 'file:///workspace/user.proto';
    const userContent = `syntax = "proto3";
package test.user;

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}`;
    const userFile = localProviders.parser.parse(userContent, userUri);
    localProviders.analyzer.updateFile(userUri, userFile);

    // File 3: order.proto which imports user.proto and uses test.user.User
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `syntax = "proto3";
package test.order;

import "user.proto";

message Order {
  string id = 1;
  test.user.User customer = 2;
}`;
    const orderFile = localProviders.parser.parse(orderContent, orderUri);
    localProviders.analyzer.updateFile(orderUri, orderFile);

    const diags = await localProviders.diagnostics.validate(orderUri, orderFile, localProviders);

    // Should NOT report any "not imported" error for test.user.User
    // since user.proto IS imported
    const missingImport = diags.find(d => d.message.includes('not imported'));
    const wrongSuggestion = diags.find(d => d.message.includes('example.proto'));

    expect(missingImport).toBeUndefined();
    expect(wrongSuggestion).toBeUndefined();
  });

  it('should prefer same-file type over non-imported type with same name', async () => {
    // When UserProfile uses "User" (defined in same file), it should NOT suggest
    // importing example.proto which also has a User type
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);

    // File 1: example.proto with example.v1.User (NOT imported)
    const exampleUri = 'file:///workspace/example.proto';
    const exampleContent = `syntax = "proto3";
package example.v1;

message User {
  string id = 1;
}`;
    const exampleFile = localProviders.parser.parse(exampleContent, exampleUri);
    localProviders.analyzer.updateFile(exampleUri, exampleFile);

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
    const userFile = localProviders.parser.parse(userContent, userUri);
    localProviders.analyzer.updateFile(userUri, userFile);

    const diags = await localProviders.diagnostics.validate(userUri, userFile, localProviders);

    // Should NOT report any "not imported" error for User since it's in the same file
    const missingImport = diags.find(d => d.message.includes('not imported'));
    const wrongSuggestion = diags.find(d => d.message.includes('example.proto'));

    expect(missingImport).toBeUndefined();
    expect(wrongSuggestion).toBeUndefined();
  });

  it('should resolve simple type name from imported file by simple name', async () => {
    // When a file imports example.proto and uses "Address" (simple name without package prefix),
    // it should be found in the imported file even though it's in a different package
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);

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
    const exampleFile = localProviders.parser.parse(exampleContent, exampleUri);
    localProviders.analyzer.updateFile(exampleUri, exampleFile);

    // File 2: order.proto that imports example.proto and uses Address WITHOUT package prefix
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `edition = "2023";
package order.v1;

import "example.proto";

message Order {
  string id = 1;
  Address shipping_address = 2;
}`;
    const orderFile = localProviders.parser.parse(orderContent, orderUri);
    localProviders.analyzer.updateFile(orderUri, orderFile);

    const diags = await localProviders.diagnostics.validate(orderUri, orderFile, localProviders);

    // Should NOT report "Unknown type 'Address'" since example.proto is imported
    const unknownType = diags.find(d => d.message.includes("Unknown type 'Address'"));
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(unknownType).toBeUndefined();
    expect(missingImport).toBeUndefined();
  });

  it('should resolve simple type name even when order.proto is loaded BEFORE example.proto', async () => {
    // This tests the scenario where the importing file is loaded before the imported file
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);

    // Load order.proto FIRST (before example.proto is known)
    const orderUri = 'file:///workspace/order.proto';
    const orderContent = `edition = "2023";
package order.v1;

import "example.proto";

message Order {
  string id = 1;
  Address shipping_address = 2;
}`;
    const orderFile = localProviders.parser.parse(orderContent, orderUri);
    localProviders.analyzer.updateFile(orderUri, orderFile);

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
    const exampleFile = localProviders.parser.parse(exampleContent, exampleUri);
    localProviders.analyzer.updateFile(exampleUri, exampleFile);

    // Now validate order.proto - the import should now be resolved
    const diags = await localProviders.diagnostics.validate(orderUri, orderFile, localProviders);

    // Should NOT report "Unknown type 'Address'" since example.proto is now loaded and imported
    const unknownType = diags.find(d => d.message.includes("Unknown type 'Address'"));
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(unknownType).toBeUndefined();
    expect(missingImport).toBeUndefined();
  });

  it('should correctly resolve simple filename imports when multiple files with same name exist', async () => {
    // This tests that import "example.proto" in different directories resolves to the correct file
    const localProviders = new ProviderRegistry();
    // const localAnalyzer = new SemanticAnalyzer();
    // const localDiagnostics = new DiagnosticsProvider(localAnalyzer);
    localProviders.analyzer.setWorkspaceRoots(['/workspace']);

    // File 1: /workspace/dir_a/example.proto with package_a.Address
    const exampleAUri = 'file:///workspace/dir_a/example.proto';
    const exampleAContent = `edition = "2023";
package package_a;

message Address {
  string street_a = 1;
}`;
    const exampleAFile = localProviders.parser.parse(exampleAContent, exampleAUri);
    localProviders.analyzer.updateFile(exampleAUri, exampleAFile);

    // File 2: /workspace/dir_b/example.proto with package_b.Address
    const exampleBUri = 'file:///workspace/dir_b/example.proto';
    const exampleBContent = `edition = "2023";
package package_b;

message Address {
  string street_b = 1;
}`;
    const exampleBFile = localProviders.parser.parse(exampleBContent, exampleBUri);
    localProviders.analyzer.updateFile(exampleBUri, exampleBFile);

    // File 3: /workspace/dir_a/order.proto imports "example.proto" (should resolve to dir_a/example.proto)
    const orderAUri = 'file:///workspace/dir_a/order.proto';
    const orderAContent = `edition = "2023";
package package_a;

import "example.proto";

message Order {
  Address addr = 1;
}`;
    const orderAFile = localProviders.parser.parse(orderAContent, orderAUri);
    localProviders.analyzer.updateFile(orderAUri, orderAFile);

    // File 4: /workspace/dir_b/order.proto imports "example.proto" (should resolve to dir_b/example.proto)
    const orderBUri = 'file:///workspace/dir_b/order.proto';
    const orderBContent = `edition = "2023";
package package_b;

import "example.proto";

message Order {
  Address addr = 1;
}`;
    const orderBFile = localProviders.parser.parse(orderBContent, orderBUri);
    localProviders.analyzer.updateFile(orderBUri, orderBFile);

    // Validate both order files - neither should have unknown type errors
    const diagsA = await localProviders.diagnostics.validate(orderAUri, orderAFile, localProviders);
    const diagsB = await localProviders.diagnostics.validate(orderBUri, orderBFile, localProviders);

    // Both should resolve their Address type correctly from their local example.proto
    const unknownTypeA = diagsA.find(d => d.message.includes("Unknown type 'Address'"));
    const unknownTypeB = diagsB.find(d => d.message.includes("Unknown type 'Address'"));

    expect(unknownTypeA).toBeUndefined();
    expect(unknownTypeB).toBeUndefined();
  });
});
