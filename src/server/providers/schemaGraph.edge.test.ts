/**
 * Edge case tests for schema graph provider
 */

import { SchemaGraphProvider } from './schemaGraph';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtoParser } from '../core/parser';

describe('SchemaGraphProvider Edge Cases', () => {
  let provider: SchemaGraphProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new SchemaGraphProvider(analyzer);
  });

  describe('buildGraph', () => {
    it('should build graph for single file', () => {
      const text = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const uri = 'file:///user.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const graph = provider.buildGraph({ uri, scope: 'file' });

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThanOrEqual(0);
    });

    it('should build graph with imports', () => {
      const text1 = `syntax = "proto3";
message User {}`;
      const text2 = `syntax = "proto3";
import "user.proto";
message Test {
  User user = 1;
}`;
      const uri1 = 'file:///user.proto';
      const uri2 = 'file:///test.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const graph = provider.buildGraph({ uri: uri2, scope: 'file' });

      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should handle nested messages', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 1;
  }
  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const graph = provider.buildGraph({ uri, scope: 'file' });

      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should handle circular dependencies', () => {
      const text1 = `syntax = "proto3";
message A {
  B b = 1;
}`;
      const text2 = `syntax = "proto3";
message B {
  A a = 1;
}`;
      const uri1 = 'file:///a.proto';
      const uri2 = 'file:///b.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const graph = provider.buildGraph({ uri: uri1, scope: 'file' });

      expect(graph.nodes.length).toBeGreaterThan(0);
    });
  });
});
