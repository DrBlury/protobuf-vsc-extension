/**
 * Edge case tests for definition provider
 */

import { DefinitionProvider } from '../../definition';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('DefinitionProvider Edge Cases', () => {
  let provider: DefinitionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  describe('import statement navigation', () => {
    it('should navigate to imported file', () => {
      const importedText = `syntax = "proto3";
message ImportedMessage {}`;
      const importedUri = 'file:///imported.proto';
      const importedFile = parser.parse(importedText, importedUri);
      analyzer.updateFile(importedUri, importedFile);

      const text = `syntax = "proto3";
import "imported.proto";
message Test {
  ImportedMessage msg = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'import "imported.proto";';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should handle relative import paths', () => {
      const importedText = `syntax = "proto3";
message RelativeMessage {}`;
      const importedUri = 'file:///subdir/imported.proto';
      const importedFile = parser.parse(importedText, importedUri);
      analyzer.updateFile(importedUri, importedFile);

      const text = `syntax = "proto3";
import "subdir/imported.proto";
message Test {
  RelativeMessage msg = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'import "subdir/imported.proto";';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('nested type navigation', () => {
    it('should navigate to nested message', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 1;
  }
  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Inner inner = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });

    it('should navigate to nested enum', () => {
      const text = `syntax = "proto3";
message Test {
  enum Status {
    UNKNOWN = 0;
  }
  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Status status = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('package-qualified types', () => {
    it('should navigate to package-qualified message', () => {
      const text1 = `syntax = "proto3";
package com.example;
message User {}`;
      const text2 = `syntax = "proto3";
import "user.proto";
message Test {
  com.example.User user = 1;
}`;
      const uri1 = 'file:///user.proto';
      const uri2 = 'file:///test.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 3, character: 3 };
      const lineText = '  com.example.User user = 1;';
      const definition = provider.getDefinition(uri2, position, lineText);

      expect(definition).toBeDefined();
    });
  });

  describe('field navigation', () => {
    it('should navigate to field definition', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  string name_copy = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const lineText = '  string name = 1;';
      const definition = provider.getDefinition(uri, position, lineText);

      expect(definition).toBeDefined();
    });
  });
});
