import { SemanticAnalyzer } from '../analyzer';

describe('SemanticAnalyzer nested include paths issue', () => {
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    // Set up workspace similar to user's setup
    analyzer.setWorkspaceRoots(['/workspace']);
    analyzer.setImportPaths(['/workspace/vendor']); // protobuf.includes setting
  });

  it('should generate correct import path for nested files within include directories', () => {
    // Simulating the user's structure:
    // - test.proto (in workspace root)
    // - vendor/import.proto
    // - vendor/nested/import.proto

    const currentUri = 'file:///workspace/test.proto';
    const targetUri = 'file:///workspace/vendor/nested/import.proto';

    const importPath = analyzer.getImportPathForFile(currentUri, targetUri);

    // The import path should be "nested/import.proto" (relative to the vendor include path)
    // NOT "vendor/nested/import.proto" (which would be relative to workspace root)
    expect(importPath).toBe('nested/import.proto');
  });

  it('should generate correct import path for files directly in include directory', () => {
    const currentUri = 'file:///workspace/test.proto';
    const targetUri = 'file:///workspace/vendor/import.proto';

    const importPath = analyzer.getImportPathForFile(currentUri, targetUri);

    // Should be "import.proto" (relative to vendor include path)
    expect(importPath).toBe('import.proto');
  });

  it('should prioritize include paths over workspace roots', () => {
    // When both workspace root and import path could work, prefer import path
    const currentUri = 'file:///workspace/test.proto';
    const targetUri = 'file:///workspace/vendor/common.proto';

    const importPath = analyzer.getImportPathForFile(currentUri, targetUri);

    // Should prefer "common.proto" over "vendor/common.proto"
    expect(importPath).toBe('common.proto');
  });

  describe('exact user scenario reproduction', () => {
    it('reproduces the user reported issue scenario', () => {
      // User's exact configuration and file structure:
      // {
      //   "protobuf.includes": ["${workspaceFolder}/vendor"]
      // }
      //
      // $ fd
      // test.proto
      // vendor/
      // vendor/import.proto
      // vendor/nested/
      // vendor/nested/import.proto
      //
      // test.proto contains:
      // import "import.proto";        // Works - resolves to vendor/import.proto
      // import "nested/import.proto"; // Should work - resolves to vendor/nested/import.proto

      const currentUri = 'file:///workspace/test.proto';

      // Test the working case (import.proto)
      const directImportUri = 'file:///workspace/vendor/import.proto';
      const directImportPath = analyzer.getImportPathForFile(currentUri, directImportUri);
      expect(directImportPath).toBe('import.proto');

      // Test the previously broken case (nested/import.proto)
      const nestedImportUri = 'file:///workspace/vendor/nested/import.proto';
      const nestedImportPath = analyzer.getImportPathForFile(currentUri, nestedImportUri);
      expect(nestedImportPath).toBe('nested/import.proto');

      // The issue was that this was returning "vendor/nested/import.proto"
      // instead of "nested/import.proto"
      expect(nestedImportPath).not.toBe('vendor/nested/import.proto');
    });
  });
});
