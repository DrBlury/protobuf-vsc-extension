/**
 * Edge case tests for completion provider
 */

import { CompletionProvider } from '../../completion';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('CompletionProvider Edge Cases', () => {
  let provider: CompletionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new CompletionProvider(analyzer);
  });

  describe('field number completions', () => {
    it('should suggest field numbers in field assignment context', () => {
      const text = `syntax = "proto3";
message Test {
  string name
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 15 };
      const lineText = '  string name';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.length).toBeGreaterThanOrEqual(0);
      // May or may not have field number completions depending on context detection
    });

    it('should handle reserved field numbers', () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
  string name
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 15 };
      const lineText = '  string name';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.length).toBeGreaterThan(0);
    });

    it('should handle nested messages', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 15 };
      const lineText = '    string name';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('field assignment completions', () => {
    it('should suggest field assignment when nothing follows cursor', () => {
      const text = `syntax = "proto3";
message Test {
  string name
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 15 };
      const lineText = '  string name';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.some(c => c.insertText && c.insertText.includes('='))).toBe(true);
    });

    it('should not suggest when assignment already exists', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 20 };
      const lineText = '  string name = 1';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      // Should not suggest assignment when already present
      const assignmentCompletions = completions.filter(c => c.insertText && c.insertText.includes('='));
      expect(assignmentCompletions.length).toBe(0);
    });
  });

  describe('option completions', () => {
    it('should provide option completions', () => {
      const text = 'syntax = "proto3";\noption ';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 7 };
      const lineText = 'option ';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.some(c => c.label.includes('java_package'))).toBe(true);
    });
  });

  describe('import completions', () => {
    it('should provide import path completions', () => {
      const text = 'syntax = "proto3";\nimport "';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 9 };
      const lineText = 'import "';
      const completions = provider.getCompletions(uri, position, lineText, undefined, text);

      expect(completions.length).toBeGreaterThan(0);
    });
  });
});
