/**
 * Branch coverage tests for code actions provider
 */

import { CodeActionsProvider } from './codeActions';
import { SemanticAnalyzer } from '../core/analyzer';
import { RenumberProvider } from './renumber';
import { ProtoParser } from '../core/parser';
import { Range, Diagnostic, DiagnosticSeverity, CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider Branch Coverage', () => {
  let provider: CodeActionsProvider;
  let analyzer: SemanticAnalyzer;
  let renumberProvider: RenumberProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    renumberProvider = new RenumberProvider(parser);
    provider = new CodeActionsProvider(analyzer, renumberProvider);
  });

  describe('organize imports', () => {
    it('should organize imports when requested', () => {
      const text = `syntax = "proto3";
import "zebra.proto";
import "apple.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(
        uri,
        range,
        { diagnostics: [], only: [CodeActionKind.SourceOrganizeImports] },
        text
      );

      expect(actions.length).toBeGreaterThan(0);
    });
  });

  describe('quick fixes', () => {
    it('should provide quick fix for missing import', () => {
      const text = `syntax = "proto3";
message Test {
  UnknownType field = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const diagnostics: Diagnostic[] = [{
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 3, 2, 13),
        message: 'Type "UnknownType" is not imported',
        source: 'protobuf',
        code: 'missing-import'
      }];

      const range = Range.create(2, 3, 2, 13);
      const actions = provider.getCodeActions(uri, range, { diagnostics }, text);

      expect(actions.length).toBeGreaterThan(0);
    });

    it('should provide quick fix for deprecated usage', () => {
      const text = `syntax = "proto3";
message Test {
  string old_field = 1 [deprecated = true];
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const diagnostics: Diagnostic[] = [{
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 3, 2, 12),
        message: 'Field "old_field" is deprecated',
        source: 'protobuf',
        code: 'deprecated-field'
      }];

      const range = Range.create(2, 3, 2, 12);
      const actions = provider.getCodeActions(uri, range, { diagnostics }, text);

      expect(actions.length).toBeGreaterThan(0);
    });
  });

  describe('renumber actions', () => {
    it('should provide renumber action when fields have gaps', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 10;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(1, 0, 3, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const renumberActions = actions.filter(a => a.title && a.title.includes('Renumber'));
      expect(renumberActions.length).toBeGreaterThan(0);
    });
  });

  describe('oneof scaffolding', () => {
    it('should create snippets for oneof with multiple fields', () => {
      const text = `syntax = "proto3";
message Test {
  oneof test_oneof {
    string name = 1;
    int32 id = 2;
    bool active = 3;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 2, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const snippetActions = actions.filter(a =>
        a.title && (a.title.includes('TypeScript') || a.title.includes('Go'))
      );
      expect(snippetActions.length).toBeGreaterThan(0);
    });
  });
});
