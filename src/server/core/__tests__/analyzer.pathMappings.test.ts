import { ProtoParser } from '../parser';
import { SemanticAnalyzer } from '../analyzer';

describe('SemanticAnalyzer path mappings', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    analyzer.setWorkspaceRoots(['/workspace']);
    analyzer.setImportPathMappings([
      { virtual: 'example.com/org/my-project', actual: '/workspace' },
    ]);
  });

  it('should resolve imports using virtual path mappings', () => {
    const depUri = 'file:///workspace/proto/common/types.proto';
    const depFile = parser.parse('syntax = "proto3"; package common;', depUri);
    analyzer.updateFile(depUri, depFile);

    const mainUri = 'file:///workspace/proto/api.proto';
    const mainContent = `syntax = "proto3";
package myproject;

import "example.com/org/my-project/proto/common/types.proto";`;
    const mainFile = parser.parse(mainContent, mainUri);
    analyzer.updateFile(mainUri, mainFile);

    const resolved = analyzer.resolveImportToUri(
      mainUri,
      'example.com/org/my-project/proto/common/types.proto'
    );
    expect(resolved).toBe(depUri);
  });

  it('should generate virtual import paths for mapped files', () => {
    const depUri = 'file:///workspace/proto/common/types.proto';
    const depFile = parser.parse('syntax = "proto3"; package common;', depUri);
    analyzer.updateFile(depUri, depFile);

    const mainUri = 'file:///workspace/proto/api.proto';
    const mainFile = parser.parse('syntax = "proto3"; package myproject;', mainUri);
    analyzer.updateFile(mainUri, mainFile);

    const importPath = analyzer.getImportPathForFile(mainUri, depUri);
    expect(importPath).toBe('example.com/org/my-project/proto/common/types.proto');
  });
});
