/**
 * Edge case tests for rename provider
 */

import { RenameProvider } from './rename';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtoParser } from '../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('RenameProvider Edge Cases', () => {
  let provider: RenameProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new RenameProvider(analyzer);
  });

  describe('renameLocalSymbol', () => {
    it('should rename field names in same message', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  string name_copy = 2;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 2, character: 10 };
      const lineText = '  string name = 1;';
      const result = provider.rename(uri, position, lineText, 'newName');

      expect(result.changes.size).toBeGreaterThan(0);
    });

    it('should rename nested message fields', () => {
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

      const position: Position = { line: 3, character: 12 };
      const lineText = '    string name = 1;';
      const result = provider.rename(uri, position, lineText, 'newName');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('cross-file rename', () => {
    it('should rename message type across files', () => {
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

      const position: Position = { line: 0, character: 9 };
      const lineText = 'message User {}';
      const result = provider.rename(uri1, position, lineText, 'RenamedUser');

      expect(result.changes.size).toBeGreaterThan(0);
    });
  });

  describe('invalid renames', () => {
    it('should return empty result for invalid identifier', () => {
      const text = 'syntax = "proto3";\nmessage Test {}';
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'message Test {}';
      const result = provider.rename(uri, position, lineText, '123invalid');

      expect(result.changes.size).toBe(0);
    });

    it('should return empty result when word not found', () => {
      const text = 'syntax = "proto3";';
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const position: Position = { line: 0, character: 0 };
      const lineText = '';
      const result = provider.rename(uri, position, lineText, 'NewName');

      expect(result.changes.size).toBe(0);
    });
  });
});
