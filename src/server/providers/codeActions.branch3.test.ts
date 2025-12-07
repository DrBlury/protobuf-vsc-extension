/**
 * Additional branch coverage tests for code actions provider - refactoring actions
 */

import { CodeActionsProvider } from './codeActions';
import { SemanticAnalyzer } from '../core/analyzer';
import { RenumberProvider } from './renumber';
import { ProtoParser } from '../core/parser';
import { Range } from 'vscode-languageserver/node';

describe('CodeActionsProvider Refactoring Branch Coverage', () => {
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

  describe('field option actions', () => {
    it('should provide add deprecated option action', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(2, 0, 2, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const deprecatedActions = actions.filter(a => a.title && a.title.includes('deprecated'));
      expect(deprecatedActions.length).toBeGreaterThan(0);
    });

    it('should provide add json_name option action', () => {
      const text = `syntax = "proto3";
message Test {
  string user_name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(2, 0, 2, 25);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const jsonNameActions = actions.filter(a => a.title && a.title.includes('json_name'));
      expect(jsonNameActions.length).toBeGreaterThan(0);
    });
  });

  describe('proto2 to proto3 conversion', () => {
    it('should provide proto3 conversion action for proto2 message', () => {
      const text = `syntax = "proto2";
message Test {
  required string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(1, 0, 1, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const conversionActions = actions.filter(a => a.title && a.title.includes('proto3'));
      expect(conversionActions.length).toBeGreaterThan(0);
    });
  });

  describe('number fields action', () => {
    it('should provide number fields action for message with unnumbered fields', () => {
      const text = `syntax = "proto3";
message Test {
  string name;
  int32 id;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(1, 0, 3, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const numberActions = actions.filter(a => a.title && a.title.includes('Assign field numbers'));
      expect(numberActions.length).toBeGreaterThan(0);
    });
  });
});
