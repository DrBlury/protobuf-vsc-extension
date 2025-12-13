import { SemanticAnalyzer } from './core/analyzer';

describe('SemanticAnalyzer getImportPathForFile', () => {
  const analyzer = new SemanticAnalyzer();

  it('returns canonical path for builtin google stubs', () => {
    const current = 'file:///workspace/example.proto';
    const target = 'builtin:///google/type/date.proto';

    const path = analyzer.getImportPathForFile(current, target);
    expect(path).toBe('google/type/date.proto');
  });

  it('returns canonical google path when resolved from real file location', () => {
    const current = 'file:///workspace/example.proto';
    const target = 'file:///workspace/resources/google-protos/google/protobuf/timestamp.proto';

    const path = analyzer.getImportPathForFile(current, target);
    expect(path).toBe('google/protobuf/timestamp.proto');
  });

  describe('files in different directories (GitHub issue #35)', () => {
    let testAnalyzer: SemanticAnalyzer;

    beforeEach(() => {
      testAnalyzer = new SemanticAnalyzer();
      testAnalyzer.setWorkspaceRoots(['/workspace']);
    });

    it('returns relative path when target is in a subdirectory', () => {
      // Scenario: test_message.proto at /workspace/test_message.proto
      //           base.proto at /workspace/protos/base.proto
      // Suggested import should be "protos/base.proto", NOT "base.proto"
      const current = 'file:///workspace/test_message.proto';
      const target = 'file:///workspace/protos/base.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // Should be "protos/base.proto" since the file is in a subdirectory
      expect(result).toBe('protos/base.proto');
      // Should NOT be just the basename
      expect(result).not.toBe('base.proto');
    });

    it('returns relative path for deeply nested files', () => {
      // Scenario: test_message.proto at /workspace/test_message.proto
      //           nested.proto at /workspace/protos/nested/deep/nested.proto
      const current = 'file:///workspace/test_message.proto';
      const target = 'file:///workspace/protos/nested/deep/nested.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      expect(result).toBe('protos/nested/deep/nested.proto');
      expect(result).not.toBe('nested.proto');
    });

    it('returns just filename when files are in the same directory', () => {
      // Scenario: both files are in /workspace/protos/
      const current = 'file:///workspace/protos/message.proto';
      const target = 'file:///workspace/protos/common.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      expect(result).toBe('common.proto');
    });

    it('returns relative path when current file is nested and target is in parent', () => {
      // Scenario: current at /workspace/services/api.proto
      //           target at /workspace/common.proto
      const current = 'file:///workspace/services/api.proto';
      const target = 'file:///workspace/common.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // Could be "common.proto" (if workspace root is a proto root) or "../common.proto"
      // Either is valid as long as it resolves correctly
      expect(['common.proto', '../common.proto']).toContain(result);
    });

    it('returns relative path when importing from sibling directory', () => {
      // Scenario: current at /workspace/services/api.proto
      //           target at /workspace/models/user.proto
      const current = 'file:///workspace/services/api.proto';
      const target = 'file:///workspace/models/user.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // Should be either "models/user.proto" (from workspace root) or "../models/user.proto" (relative)
      expect(['models/user.proto', '../models/user.proto']).toContain(result);
      // Should NOT be just the basename
      expect(result).not.toBe('user.proto');
    });

    it('handles nested file referencing file in parent subdirectory', () => {
      // Scenario: current at /workspace/protos/nested/child.proto
      //           target at /workspace/protos/base.proto
      const current = 'file:///workspace/protos/nested/child.proto';
      const target = 'file:///workspace/protos/base.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // Should be "../base.proto" (relative) or "protos/base.proto" (from workspace root)
      expect(['../base.proto', 'protos/base.proto']).toContain(result);
      // Should NOT be just the basename
      expect(result).not.toBe('base.proto');
    });
  });

  describe('with proto roots configured', () => {
    let testAnalyzer: SemanticAnalyzer;

    beforeEach(() => {
      testAnalyzer = new SemanticAnalyzer();
      testAnalyzer.setWorkspaceRoots(['/workspace']);
    });

    it('returns path relative to workspace root when available', () => {
      const current = 'file:///workspace/src/api.proto';
      const target = 'file:///workspace/protos/common/types.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // Should prefer path from workspace root
      expect(result).toBe('protos/common/types.proto');
    });

    it('returns basename only for files at the workspace root when importing from nested location', () => {
      testAnalyzer.setWorkspaceRoots(['/workspace']);
      const current = 'file:///workspace/src/deep/api.proto';
      const target = 'file:///workspace/common.proto';

      const result = testAnalyzer.getImportPathForFile(current, target);

      // File is at workspace root level, so "common.proto" should work
      expect(result).toBe('common.proto');
    });
  });
});
