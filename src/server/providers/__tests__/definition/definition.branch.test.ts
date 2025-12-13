/**
 * Branch coverage tests for definition provider
 */

import { DefinitionProvider } from '../../definition';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('DefinitionProvider Branch Coverage', () => {
  let provider: DefinitionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  describe('field type navigation', () => {
    it('should navigate to imported message type', () => {
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

      const position: Position = { line: 3, character: 3 };
      const lineText = '  User user = 1;';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should navigate to built-in types (should return null)', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 2, character: 3 };
      const lineText = '  string name = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      // Built-in types don't have definitions
      expect(definition).toBeNull();
    });
  });

  describe('import path navigation', () => {
    it('should navigate to import statement', () => {
      const text = `syntax = "proto3";
import "user.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'import "user.proto";';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('enum value navigation', () => {
    it('should navigate to enum value', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 1;
}
message Test {
  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Status status = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });
});
