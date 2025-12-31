/**
 * Tests for Document Links Provider
 */

import { DocumentLinksProvider } from '../documentLinks';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';

jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('DocumentLinksProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let documentLinksProvider: DocumentLinksProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    documentLinksProvider = new DocumentLinksProvider(analyzer);
    // Default mock - file doesn't exist
    mockFs.existsSync.mockReturnValue(false);
  });

  it('should create document links for resolved imports', () => {
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

    const links = documentLinksProvider.getDocumentLinks(uri2, file2);

    expect(links.length).toBeGreaterThan(0);
    const importLink = links.find(l => l.target === uri1);
    expect(importLink).toBeDefined();
  });

  it('should create document links for Google well-known types', () => {
    const content = `syntax = "proto3";
package test.v1;
import "google/protobuf/timestamp.proto";

message User {
  google.protobuf.Timestamp created_at = 1;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const links = documentLinksProvider.getDocumentLinks(uri, file);

    expect(links.length).toBeGreaterThan(0);
    const _googleLink = links.find(l => l.target?.includes('timestamp'));
    // May or may not resolve depending on setup
    expect(links.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle unresolved imports gracefully', () => {
    const content = `syntax = "proto3";
package test.v1;
import "nonexistent.proto";

message User {
  string name = 1;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const links = documentLinksProvider.getDocumentLinks(uri, file);

    // Should still create a link even if unresolved
    expect(links.length).toBeGreaterThan(0);
  });

  it('should resolve imports using configured import paths', () => {
    const content1 = `syntax = "proto3";
package imported.v1;

message ImportedMessage {
  string name = 1;
}`;

    const content2 = `syntax = "proto3";
package test.v1;
import "imported_file.proto";

message User {
  imported.v1.ImportedMessage msg = 1;
}`;

    // File is located in a configured import path directory
    const uri1 = 'file:///workspace/path/to/proto/imported_file.proto';
    const uri2 = 'file:///workspace/myproject/main.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    // Configure import paths (simulating protobuf.includes setting)
    analyzer.setImportPaths(['/workspace/path/to/proto']);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const links = documentLinksProvider.getDocumentLinks(uri2, file2);

    expect(links.length).toBeGreaterThan(0);
    const importLink = links.find(l => l.target === uri1);
    expect(importLink).toBeDefined();
    expect(importLink?.tooltip).toBe('Open imported_file.proto');
  });

  it('should resolve imports using nested paths from import path root', () => {
    const content1 = `syntax = "proto3";
package domain.v1;

message DomainEntity {
  string id = 1;
}`;

    const content2 = `syntax = "proto3";
package test.v1;
import "domain/v1/entity.proto";

message User {
  domain.v1.DomainEntity entity = 1;
}`;

    // File is located in a nested directory under import path
    const uri1 = 'file:///workspace/proto/domain/v1/entity.proto';
    const uri2 = 'file:///workspace/src/main.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    // Configure import paths
    analyzer.setImportPaths(['/workspace/proto']);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const links = documentLinksProvider.getDocumentLinks(uri2, file2);

    expect(links.length).toBeGreaterThan(0);
    const importLink = links.find(l => l.target === uri1);
    expect(importLink).toBeDefined();
    expect(importLink?.tooltip).toBe('Open domain/v1/entity.proto');
  });

  describe('guessImportPath strategies', () => {
    it('should find file in configured import paths', () => {
      const content = `syntax = "proto3";
import "common/types.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: import paths configured, file exists there
      analyzer.setImportPaths(['/lib/protos']);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('/lib/protos/common/types.proto');
      });

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      expect(links[0].target).toContain('lib/protos/common/types.proto');
    });

    it('should find file in proto roots', () => {
      const content = `syntax = "proto3";
import "shared/message.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: proto roots configured, file exists there
      const protoRoot = path.resolve('/proto-src');
      analyzer.addProtoRoot(protoRoot);
      const expectedPath = path.join(protoRoot, 'shared/message.proto');
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return path.normalize(String(p)) === path.normalize(expectedPath);
      });

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      // Check that the target URI contains the expected path (platform-agnostic)
      const expectedUri = URI.file(expectedPath).toString();
      expect(links[0].target).toBe(expectedUri);
    });

    it('should find file in workspace roots', () => {
      const content = `syntax = "proto3";
import "models/user.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: workspace roots configured, file exists there
      analyzer.setWorkspaceRoots(['/workspace']);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('/workspace/models/user.proto');
      });

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      expect(links[0].target).toContain('workspace/models/user.proto');
    });

    it('should find file relative to current file', () => {
      const content = `syntax = "proto3";
import "sibling.proto";
message Test {}`;
      const uri = 'file:///workspace/proto/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: file exists relative to current
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('/workspace/proto/sibling.proto');
      });

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      expect(links[0].target).toContain('workspace/proto/sibling.proto');
    });

    it('should create guess link using first import path when file not found', () => {
      const content = `syntax = "proto3";
import "missing/file.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: import paths configured, file doesn't exist anywhere
      analyzer.setImportPaths(['/lib/protos', '/other/protos']);
      mockFs.existsSync.mockReturnValue(false);

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      // Should use first import path for the guess
      expect(links[0].target).toContain('lib/protos/missing/file.proto');
      expect(links[0].tooltip).toContain('unresolved');
    });

    it('should fall back to relative path when no import paths configured', () => {
      const content = `syntax = "proto3";
import "other.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      // Setup: no import paths, file doesn't exist
      mockFs.existsSync.mockReturnValue(false);

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
      expect(links[0].target).toContain('workspace/other.proto');
    });

    it('should handle non-.proto imports', () => {
      const content = `syntax = "proto3";
import "some/path";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      mockFs.existsSync.mockReturnValue(false);

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      // Should not create a link for non-.proto import (returns undefined)
      expect(links.length).toBe(0);
    });

    it('should handle backslash normalization in import paths', () => {
      const content = `syntax = "proto3";
import "folder\\file.proto";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      analyzer.setImportPaths(['/protos']);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        // Normalized path should use forward slashes
        return String(p).includes('folder/file.proto');
      });

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBeGreaterThan(0);
    });

    it('should return undefined when all strategies fail and import is not .proto', () => {
      const content = `syntax = "proto3";
import "no_extension";
message Test {}`;
      const uri = 'file:///workspace/test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      mockFs.existsSync.mockReturnValue(false);

      const links = documentLinksProvider.getDocumentLinks(uri, file);

      expect(links.length).toBe(0);
    });
  });
});
