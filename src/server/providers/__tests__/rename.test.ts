/**
 * Tests for rename provider
 */

import { RenameProvider } from '../rename';
import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoParser } from '../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('RenameProvider', () => {
  let provider: RenameProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new RenameProvider(analyzer);
  });

  describe('prepareRename', () => {
    it('should prepare rename for message type', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}

message User {
  Test test = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 6, character: 3 };
      const lineText = '  Test test = 1;';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result).toBeDefined();
      expect(result?.placeholder).toBe('Test');
    });

    it('should return null for built-in types', () => {
      const text = 'syntax = "proto3";\nmessage Test { string name = 1; }';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      // Position on "string" keyword
      const position: Position = { line: 1, character: 20 };
      const lineText = 'message Test { string name = 1; }';
      const result = provider.prepareRename(uri, position, lineText);

      // Should return null for built-in types
      expect(result).toBeNull();
    });

    it('should return null when word not found', () => {
      const text = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 0, character: 0 };
      const lineText = '';
      const result = provider.prepareRename(uri, position, lineText);

      expect(result).toBeNull();
    });

    it('should prepare rename for field names', () => {
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
      const result = provider.prepareRename(uri, position, lineText);

      expect(result).toBeDefined();
    });
  });

  describe('rename', () => {
    it('should rename message type across files', () => {
      const text1 = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const text2 = `syntax = "proto3";
import "test.proto";
message User {
  Test test = 1;
}`;
      const uri1 = 'file:///test.proto';
      const uri2 = 'file:///user.proto';

      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const position: Position = { line: 0, character: 9 };
      const lineText = 'message Test {';
      const result = provider.rename(uri1, position, lineText, 'RenamedTest');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should return empty result for invalid identifier', () => {
      const text = 'syntax = "proto3";\nmessage Test {}';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.rename(uri, position, lineText, '123invalid');

      expect(result.changes.size).toBe(0);
    });

    it('should return empty result for built-in types', () => {
      const text = 'syntax = "proto3";\nmessage Test { string name = 1; }';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 20 };
      const lineText = 'message Test { string name = 1; }';
      const result = provider.rename(uri, position, lineText, 'NewName');

      expect(result.changes.size).toBe(0);
    });

    it('should rename field names', () => {
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
      const result = provider.rename(uri, position, lineText, 'newName');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });
});
