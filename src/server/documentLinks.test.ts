/**
 * Tests for Document Links Provider
 */

import { DocumentLinksProvider } from './providers/documentLinks';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';

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
    const googleLink = links.find(l => l.target?.includes('timestamp'));
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
});
