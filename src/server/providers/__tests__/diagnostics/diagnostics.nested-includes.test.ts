import { DiagnosticsProvider } from '../../diagnostics';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider nested include paths end-to-end', () => {
  const providers = new ProviderRegistry();

  beforeEach(() => {
    // Setup the exact user configuration
    providers.setWorkspaceRoots(['/workspace']);
    providers.analyzer.setImportPaths(['/workspace/vendor']); // protobuf.includes: ["${workspaceFolder}/vendor"]
  });

  it('should not report incorrect import path for nested includes', async () => {
    // Simulate the user's file structure:
    // test.proto (imports nested/import.proto)
    // vendor/import.proto (defines import.Message)
    // vendor/nested/import.proto (defines nested_import.Message)

    // Parse and add vendor/import.proto
    const vendorImportContent = `
      syntax = "proto3";
      package import;

      message Message {
        string id = 1;
      }
    `;

    const vendorImportFile = providers.parser.parse(vendorImportContent, 'file:///workspace/vendor/import.proto');
    providers.analyzer.updateFile('file:///workspace/vendor/import.proto', vendorImportFile);

    // Parse and add vendor/nested/import.proto
    const vendorNestedImportContent = `
      syntax = "proto3";
      package nested_import;

      message Message {
        string name = 1;
      }
    `;

    const vendorNestedImportFile = providers.parser.parse(vendorNestedImportContent, 'file:///workspace/vendor/nested/import.proto');
    providers.analyzer.updateFile('file:///workspace/vendor/nested/import.proto', vendorNestedImportFile);

    // Parse test.proto that imports both files
    const testProtoContent = `
      syntax = "proto3";

      package proto_include_vendor;

      import "import.proto";
      import "nested/import.proto";

      message Test {
        // OK
        import.Message        message1 = 1;
        // This should not report an error about wrong import path
        nested_import.Message message2 = 2;
      }
    `;

    const testProtoFile = providers.parser.parse(testProtoContent, 'file:///workspace/test.proto');
    providers.analyzer.updateFile('file:///workspace/test.proto', testProtoFile);

    // Get diagnostics for test.proto
    const diagnostics = await providers.diagnostics.validate('file:///workspace/test.proto', testProtoFile, providers);
    // Should NOT contain any "should be imported via" errors
    const importPathErrors = diagnostics.filter(d => d.message.includes('should be imported via'));
    expect(importPathErrors).toHaveLength(0);

    // Should NOT contain any "is not imported" errors
    const missingImportErrors = diagnostics.filter(d => d.message.includes('is not imported'));
    expect(missingImportErrors).toHaveLength(0);

    // The fix is successful if we have no import-related errors
    // (other diagnostics like package naming warnings are unrelated to this issue)
  });
});
