/**
 * Additional branch coverage tests for code actions provider
 */

import { CodeActionsProvider } from './codeActions';
import { SemanticAnalyzer } from '../core/analyzer';
import { RenumberProvider } from './renumber';
import { ProtoParser } from '../core/parser';
import { Range, CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider Additional Branch Coverage', () => {
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

  describe('organize imports with duplicates', () => {
    it('should remove duplicate imports', () => {
      const text = `syntax = "proto3";
import "apple.proto";
import "apple.proto";
import "banana.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

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

  describe('renumber message action', () => {
    it('should provide renumber action when message has gaps', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 10;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(1, 0, 3, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const renumberActions = actions.filter(a => a.title && a.title.includes('Renumber'));
      expect(renumberActions.length).toBeGreaterThan(0);
    });
  });

  describe('missing semicolon action', () => {
    it('should add semicolons to fields without them', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
  int32 id = 2
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(2, 0, 3, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const semicolonActions = actions.filter(a => a.title && a.title.includes('semicolon'));
      expect(semicolonActions.length).toBeGreaterThan(0);
    });
  });
});
