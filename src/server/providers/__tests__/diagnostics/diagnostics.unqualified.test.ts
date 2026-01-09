/**
 * Tests for unqualified type reference diagnostics
 */

import { DiagnosticsProvider } from '../../diagnostics';
import { CodeActionsProvider } from '../../codeActions';
import { RenumberProvider } from '../../renumber';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProviderRegistry } from '../../../utils';
import { DiagnosticSeverity, CodeActionKind } from 'vscode-languageserver/node';

describe('DiagnosticsProvider - Unqualified Type References', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
  });

  it('should detect unqualified type from different package', async () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message TestB {
  string message = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    const testbFile = providers.parser.parse(testbContent, testbUri);
    providers.analyzer.updateFile(testbUri, testbFile);

    // test/testa/testa.proto
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

message TestA {
  TestB message = 1;
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    const testaFile = providers.parser.parse(testaContent, testaUri);
    providers.analyzer.updateFile(testaUri, testaFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testaUri, testaFile, providers);

    const unqualifiedDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('test.testb.TestB')
    );

    expect(unqualifiedDiag).toBeDefined();
    expect(unqualifiedDiag?.severity).toBe(DiagnosticSeverity.Error);
    expect(unqualifiedDiag?.code).toBe('PROTO206');
  });

  it('should not report error for types in same package', async () => {
    const content = `syntax = "proto3";

package test.testa;

message TestA {
  string id = 1;
}

message TestB {
  TestA message = 1;
}`;
    const uri = 'file:///workspace/test/testa/testa.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(uri, file, providers);

    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();
  });

  it('should not report error for already fully qualified types', async () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message TestB {
  string message = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    const testbFile = providers.parser.parse(testbContent, testbUri);
    providers.analyzer.updateFile(testbUri, testbFile);

    // test/testa/testa.proto (using fully qualified name)
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

message TestA {
  test.testb.TestB message = 1;
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    const testaFile = providers.parser.parse(testaContent, testaUri);
    providers.analyzer.updateFile(testaUri, testaFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testaUri, testaFile, providers);

    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();
  });

  it('should detect unqualified type in map field', async () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message Value {
  string data = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    const testbFile = providers.parser.parse(testbContent, testbUri);
    providers.analyzer.updateFile(testbUri, testbFile);

    // test/testa/testa.proto
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

message TestA {
  map<string, Value> values = 1;
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    const testaFile = providers.parser.parse(testaContent, testaUri);
    providers.analyzer.updateFile(testaUri, testaFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testaUri, testaFile, providers);

    const unqualifiedDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('test.testb.Value')
    );

    expect(unqualifiedDiag).toBeDefined();
  });

  it('should detect unqualified type in RPC methods', async () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message Request {
  string query = 1;
}

message Response {
  string result = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    const testbFile = providers.parser.parse(testbContent, testbUri);
    providers.analyzer.updateFile(testbUri, testbFile);

    // test/testa/testa.proto
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

service TestService {
  rpc Search(Request) returns (Response);
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    const testaFile = providers.parser.parse(testaContent, testaUri);
    providers.analyzer.updateFile(testaUri, testaFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testaUri, testaFile, providers);

    const requestDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('test.testb.Request')
    );
    const responseDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('test.testb.Response')
    );

    expect(requestDiag).toBeDefined();
    expect(responseDiag).toBeDefined();
  });

  it('should provide quick fix to use fully qualified name', async () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message TestB {
  string message = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    const testbFile = providers.parser.parse(testbContent, testbUri);
    providers.analyzer.updateFile(testbUri, testbFile);

    // test/testa/testa.proto
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

message TestA {
  TestB message = 1;
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    const testaFile = providers.parser.parse(testaContent, testaUri);
    providers.analyzer.updateFile(testaUri, testaFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testaUri, testaFile, providers);

    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeDefined();

    if (unqualifiedDiag) {
      const actions = providers.codeActions.getCodeActions(
        testaUri,
        unqualifiedDiag.range,
        { diagnostics: [unqualifiedDiag] },
        testaContent
      );

      const quickFix = actions.find(a =>
        a.kind === CodeActionKind.QuickFix &&
        a.title.includes('test.testb.TestB')
      );

      expect(quickFix).toBeDefined();
      expect(quickFix?.edit?.changes?.[testaUri]).toBeDefined();

      const textEdit = quickFix?.edit?.changes?.[testaUri]?.[0];
      expect(textEdit?.newText).toBe('test.testb.TestB');
    }
  });

  it('should detect unqualified type that exists in workspace but is not imported', async () => {
    // testA/test.proto - defines TestDuplicates
    const testAContent = `syntax = "proto3";

package testA;

message TestDuplicates {
  string name = 1;
}
`;
    const testAUri = 'file:///workspace/testA/test.proto';
    const testAFile = providers.parser.parse(testAContent, testAUri);
    providers.analyzer.updateFile(testAUri, testAFile);

    // testB/test.proto - uses TestDuplicates without import
    const testBContent = `syntax = "proto3";

package testB;

message SimpleMessage {
  TestDuplicates duplicates = 1;
}`;
    const testBUri = 'file:///workspace/testB/test.proto';
    const testBFile = providers.parser.parse(testBContent, testBUri);
    providers.analyzer.updateFile(testBUri, testBFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testBUri, testBFile, providers);

    // Should show PROTO206 (unqualified type) instead of "Unknown type"
    const unqualifiedDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('testA.TestDuplicates') &&
      d.message.includes('requires import')
    );

    expect(unqualifiedDiag).toBeDefined();
    expect(unqualifiedDiag?.code).toBe('PROTO206');

    // Should NOT show "Unknown type" diagnostic
    const unknownTypeDiag = diags.find(d => d.message.includes("Unknown type 'TestDuplicates'"));
    expect(unknownTypeDiag).toBeUndefined();
  });

  it('should provide code actions to qualify type and add import for workspace types', async () => {
    // testA/test.proto - defines TestDuplicates
    const testAContent = `syntax = "proto3";

package testA;

message TestDuplicates {
  string name = 1;
}
`;
    const testAUri = 'file:///workspace/testA/test.proto';
    const testAFile = providers.parser.parse(testAContent, testAUri);
    providers.analyzer.updateFile(testAUri, testAFile);

    // testB/test.proto - uses TestDuplicates without import
    const testBContent = `syntax = "proto3";

package testB;

message SimpleMessage {
  TestDuplicates duplicates = 1;
}`;
    const testBUri = 'file:///workspace/testB/test.proto';
    const testBFile = providers.parser.parse(testBContent, testBUri);
    providers.analyzer.updateFile(testBUri, testBFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(testBUri, testBFile, providers);

    const unqualifiedDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('requires import')
    );

    expect(unqualifiedDiag).toBeDefined();

    if (unqualifiedDiag) {
      const actions = providers.codeActions.getCodeActions(
        testBUri,
        unqualifiedDiag.range,
        { diagnostics: [unqualifiedDiag] },
        testBContent
      );

      // Should have combined action
      const combinedFix = actions.find(a =>
        a.kind === CodeActionKind.QuickFix &&
        a.title.includes("'testA.TestDuplicates'") &&
        a.title.includes('add import')
      );

      expect(combinedFix).toBeDefined();
      expect(combinedFix?.isPreferred).toBe(true);

      // The combined action should have two edits
      const edits = combinedFix?.edit?.changes?.[testBUri];
      expect(edits).toHaveLength(2);
    }
  });

  it('should not report error when no package is defined in either file', async () => {
    const content1 = `syntax = "proto3";

message SharedMessage {
  string value = 1;
}
`;
    const uri1 = 'file:///workspace/shared.proto';
    const file1 = providers.parser.parse(content1, uri1);
    providers.analyzer.updateFile(uri1, file1);

    const content2 = `syntax = "proto3";

import "shared.proto";

message MyMessage {
  SharedMessage shared = 1;
}`;
    const uri2 = 'file:///workspace/my.proto';
    const file2 = providers.parser.parse(content2, uri2);
    providers.analyzer.updateFile(uri2, file2);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(uri2, file2, providers);

    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();
  });

  it('should not report error when importing type from default (empty) package into packaged file', async () => {
    // mytypes.proto - no package (default/empty package)
    const mytypesContent = `syntax = "proto3";

message Int32Value {
  int32 value = 1;
}
`;
    const mytypesUri = 'file:///workspace/mytypes.proto';
    const mytypesFile = providers.parser.parse(mytypesContent, mytypesUri);
    providers.analyzer.updateFile(mytypesUri, mytypesFile);

    // protoA.proto - has a package, imports type from empty package
    const protoAContent = `syntax = "proto3";

package protoA;

import "mytypes.proto";

message MessageA {
  Int32Value option_id = 1;
}`;
    const protoAUri = 'file:///workspace/protoA.proto';
    const protoAFile = providers.parser.parse(protoAContent, protoAUri);
    providers.analyzer.updateFile(protoAUri, protoAFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(protoAUri, protoAFile, providers);

    // Should NOT report "must be fully qualified" for types from empty package
    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();

    // Should NOT report "Unknown type" either
    const unknownTypeDiag = diags.find(d => d.message.includes("Unknown type 'Int32Value'"));
    expect(unknownTypeDiag).toBeUndefined();
  });

  it('should not report error when referencing type from parent package (nested packages)', async () => {
    // foo/types.proto - defines type in parent package "foo"
    const fooTypesContent = `syntax = "proto3";

package foo;

message SharedType {
  string value = 1;
}
`;
    const fooTypesUri = 'file:///workspace/foo/types.proto';
    const fooTypesFile = providers.parser.parse(fooTypesContent, fooTypesUri);
    providers.analyzer.updateFile(fooTypesUri, fooTypesFile);

    // foo/bar/service.proto - nested package "foo.bar" imports from parent "foo"
    const fooBarServiceContent = `syntax = "proto3";

package foo.bar;

import "foo/types.proto";

message MyMessage {
  SharedType shared = 1;
}`;
    const fooBarServiceUri = 'file:///workspace/foo/bar/service.proto';
    const fooBarServiceFile = providers.parser.parse(fooBarServiceContent, fooBarServiceUri);
    providers.analyzer.updateFile(fooBarServiceUri, fooBarServiceFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(fooBarServiceUri, fooBarServiceFile, providers);

    // Should NOT report "must be fully qualified" for types from parent package
    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();

    // Should NOT report "Unknown type" either
    const unknownTypeDiag = diags.find(d => d.message.includes("Unknown type 'SharedType'"));
    expect(unknownTypeDiag).toBeUndefined();
  });

  it('should not report error for deeply nested packages referencing ancestor packages', async () => {
    // company/types.proto - defines type in top-level package
    const companyTypesContent = `syntax = "proto3";

package company;

message BaseEntity {
  string id = 1;
}
`;
    const companyTypesUri = 'file:///workspace/company/types.proto';
    const companyTypesFile = providers.parser.parse(companyTypesContent, companyTypesUri);
    providers.analyzer.updateFile(companyTypesUri, companyTypesFile);

    // company/product/api/v1/service.proto - deeply nested package
    const deeplyNestedContent = `syntax = "proto3";

package company.product.api.v1;

import "company/types.proto";

message ProductRequest {
  BaseEntity entity = 1;
}`;
    const deeplyNestedUri = 'file:///workspace/company/product/api/v1/service.proto';
    const deeplyNestedFile = providers.parser.parse(deeplyNestedContent, deeplyNestedUri);
    providers.analyzer.updateFile(deeplyNestedUri, deeplyNestedFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(deeplyNestedUri, deeplyNestedFile, providers);

    // Should NOT report "must be fully qualified" for types from ancestor package
    const unqualifiedDiag = diags.find(d => d.message.includes('must be fully qualified'));
    expect(unqualifiedDiag).toBeUndefined();
  });

  it('should still report error for sibling packages (not in parent-child relationship)', async () => {
    // foo/bar/types.proto - sibling package "foo.bar"
    const fooBarContent = `syntax = "proto3";

package foo.bar;

message BarType {
  string value = 1;
}
`;
    const fooBarUri = 'file:///workspace/foo/bar/types.proto';
    const fooBarFile = providers.parser.parse(fooBarContent, fooBarUri);
    providers.analyzer.updateFile(fooBarUri, fooBarFile);

    // foo/baz/service.proto - sibling package "foo.baz"
    const fooBazContent = `syntax = "proto3";

package foo.baz;

import "foo/bar/types.proto";

message MyMessage {
  BarType bar = 1;
}`;
    const fooBazUri = 'file:///workspace/foo/baz/service.proto';
    const fooBazFile = providers.parser.parse(fooBazContent, fooBazUri);
    providers.analyzer.updateFile(fooBazUri, fooBazFile);

    providers.diagnostics.updateSettings({ referenceChecks: true });
    const diags = await providers.diagnostics.validate(fooBazUri, fooBazFile, providers);

    // SHOULD report "must be fully qualified" for types from sibling package
    const unqualifiedDiag = diags.find(d =>
      d.message.includes('must be fully qualified') &&
      d.message.includes('foo.bar.BarType')
    );
    expect(unqualifiedDiag).toBeDefined();
  });
});
