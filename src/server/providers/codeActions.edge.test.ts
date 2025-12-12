/**
 * Edge case tests for code actions provider
 */

import { CodeActionsProvider } from './codeActions';
import { SemanticAnalyzer } from '../core/analyzer';
import { RenumberProvider } from './renumber';
import { ProtoParser } from '../core/parser';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

describe('CodeActionsProvider Edge Cases', () => {
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

  describe('oneof scaffolding', () => {
    it('should create oneof switch snippets', () => {
      const text = `syntax = "proto3";
message Test {
  oneof test_oneof {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 2, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      expect(actions.some(a => a.title && a.title.includes('TypeScript'))).toBe(true);
      expect(actions.some(a => a.title && a.title.includes('Go'))).toBe(true);
    });
  });

  describe('missing semicolons', () => {
    it('should add missing semicolons', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
  int32 id = 2
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 3, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      expect(actions.some(a => a.title && a.title.includes('semicolon'))).toBe(true);
    });

    it('should add semicolon before inline comments', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 // wow!!!
  int32 id = 2 // another comment
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 3, 30);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeDefined();

      if (semicolonAction && semicolonAction.edit && semicolonAction.edit.changes) {
        const changes = semicolonAction.edit.changes[uri];
        if (changes) {
          // Check that the text edits insert semicolons before comments
          for (const edit of changes) {
            // Semicolon should not appear after comment markers
            expect(edit.newText).not.toMatch(/\/\/ .*?;/);
            // If there's a comment, semicolon should be before it
            if (edit.newText.includes('//')) {
              expect(edit.newText).toMatch(/;?\s*\/\//);
            }
          }
        }
      }
    });

    it('should add semicolons to enum values', () => {
      const text = `syntax = "proto3";
enum Status {
  STATUS_UNSPECIFIED = 0
  STATUS_ACTIVE = 1;
}
message Test {
  Status status = 1
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(1, 0, 6, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeDefined();
      const changes = semicolonAction?.edit?.changes?.[uri];
      expect(changes).toBeDefined();
      const combinedText = changes?.map(edit => edit.newText).join('\n') || '';
      expect(combinedText).toMatch(/STATUS_UNSPECIFIED = 0;/);
      expect(combinedText).toMatch(/Status status = 1;/);
    });
  });

  describe('renumber actions', () => {
    it('should provide renumber message action', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 5;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 2, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      expect(actions.some(a => a.title && a.title.includes('Renumber'))).toBe(true);
    });
  });

  describe('diagnostic-based actions', () => {
    it('should provide fix for deprecated field usage', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 [deprecated = true];
}

message User {
  Test test = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const diagnostics: Diagnostic[] = [{
        severity: DiagnosticSeverity.Warning,
        range: Range.create(6, 3, 6, 7),
        message: 'Field "test" uses deprecated type "Test"',
        source: 'protobuf',
        code: 'deprecated-usage'
      }];

      const range = Range.create(6, 3, 6, 7);
      const actions = provider.getCodeActions(uri, range, { diagnostics }, text);

      expect(actions.length).toBeGreaterThan(0);
    });
  });
});
