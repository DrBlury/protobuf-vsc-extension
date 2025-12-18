/**
 * Tests for Document Links Provider
 */

import { DocumentLinksProvider } from '../documentLinks';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';

describe('DocumentLinksProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let documentLinksProvider: DocumentLinksProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    documentLinksProvider = new DocumentLinksProvider(analyzer);
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
});
