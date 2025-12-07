/**
 * Tests for Enhanced Completion Features
 */

import { CompletionProvider } from './completion';
import { ProtoParser } from './parser';
import { SemanticAnalyzer } from './analyzer';
import { Position } from 'vscode-languageserver/node';

describe('CompletionProvider Enhanced Features', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let completionProvider: CompletionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    completionProvider = new CompletionProvider(analyzer);
  });

  describe('Field Name Suggestions', () => {
    it('should suggest field names for string type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('string');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('name');
      expect(suggestions).toContain('id');
    });

    it('should suggest field names for int32 type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('int32');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('count');
      expect(suggestions).toContain('size');
    });

    it('should suggest field names for bool type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('bool');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('enabled');
      expect(suggestions).toContain('active');
    });

    it('should suggest field names for message types', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('UserMessage');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('user_message'))).toBe(true);
    });

    it('should limit suggestions to top 5', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('string');

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Import Path Completions', () => {
    it('should suggest Google well-known types', () => {
      const uri = 'file:///test.proto';
      const lineText = 'import "';
      const position: Position = { line: 0, character: lineText.length };

      const completions = completionProvider.getCompletions(uri, position, lineText);

      const googleCompletions = completions.filter(c =>
        c.label.includes('google/protobuf/') || c.label.includes('google/type/')
      );

      expect(googleCompletions.length).toBeGreaterThan(0);
    });

    it('should suggest workspace proto files', () => {
      const content1 = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}`;

      const content2 = `syntax = "proto3";
package test.v1;
import "`;

      const uri1 = 'file:///user.proto';
      const uri2 = 'file:///test.proto';

      const file1 = parser.parse(content1, uri1);
      analyzer.updateFile(uri1, file1);

      const lineText = 'import "';
      const position: Position = { line: 2, character: lineText.length };

      const completions = completionProvider.getCompletions(uri2, position, lineText);

      const workspaceCompletions = completions.filter(c =>
        c.label.includes('user.proto') || c.label.includes('User')
      );

      expect(workspaceCompletions.length).toBeGreaterThan(0);
    });
  });

  describe('Field Name Context Completions', () => {
    it('should provide field name suggestions in field name context', () => {
      const uri = 'file:///test.proto';
      const lineText = '  string ';
      const position: Position = { line: 0, character: lineText.length };

      const completions = completionProvider.getCompletions(uri, position, lineText);

      const fieldNameCompletions = completions.filter(c =>
        c.kind === 5 && // Field kind
        (c.label === 'name' || c.label === 'id' || c.label === 'title')
      );

      expect(fieldNameCompletions.length).toBeGreaterThan(0);
    });
  });
});
