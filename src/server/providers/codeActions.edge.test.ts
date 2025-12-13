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

    it('should detect missing semicolon when next line has comment then field', () => {
      const text = `syntax = "proto3";
message User {
  // User's status
  UserStatus status = 3

  // Creation timestamp
  Timestamp created_at = 4;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 8, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should have a semicolon action because line 4 (UserStatus status = 3) is missing semicolon
      // The next non-empty/non-comment line is "Timestamp created_at = 4;" which doesn't start with [
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeDefined();
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

    it('should NOT add semicolons to multi-line inline options', () => {
      const text = `syntax = "proto3";
message Test {
  string city = 1 [(buf.validate.field).cel = {
    id: "test",
    message: "error"
  }];
  string name = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 7, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should NOT have a semicolon action for this file since all fields are valid
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeUndefined();
    });

    it('should NOT add semicolons to lines inside multi-line options with comments', () => {
      const text = `syntax = "proto3";
message Test {
  string city = 1 [(buf.validate.field).cel = {
    // This is a comment inside the option
    id: "test",
    message: "error"
  }];
  string name = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 8, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should NOT have a semicolon action
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeUndefined();
    });

    it('should NOT add semicolons when inline options start on next line after comment', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 2 // comment
    [(buf.validate.field).cel = {
        id: "name_non_empty",
        message: "Name must not be empty",
        expression: "this.size() > 0"
    }];
  string other = 3;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 9, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should NOT have a semicolon action - the field continues on the next line
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeUndefined();
    });

    it('should handle fields with multi-line array options correctly', () => {
      const text = `syntax = "proto3";
message Test {
  repeated string tags = 1 [
    (custom.option) = "value"
  ];
  string name = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(0, 0, 6, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should NOT have a semicolon action
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeUndefined();
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

  describe('CRLF line ending handling', () => {
    it('should handle CRLF line endings in code actions', () => {
      // CRLF line endings (Windows style)
      const text = 'syntax = "proto3";\r\nmessage Test {\r\n  string name = 1;\r\n  int32 id = 5;\r\n}\r\n';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 2, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should still produce valid actions
      expect(actions.length).toBeGreaterThan(0);

      // If there are edits, they should not corrupt types
      for (const action of actions) {
        if (action.edit?.changes?.[uri]) {
          for (const edit of action.edit.changes[uri]) {
            expect(edit.newText).not.toContain('iint32');
            expect(edit.newText).not.toContain('sstring');
          }
        }
      }
    });

    it('should calculate correct ranges for CRLF files', () => {
      // Proto with CRLF containing multiple types
      const text = 'syntax = "proto3";\r\nmessage Test {\r\n  uint32 count = 1;\r\n  sint64 value = 2;\r\n}\r\n';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 3, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Verify no type corruption in any action's edit
      for (const action of actions) {
        if (action.edit?.changes?.[uri]) {
          for (const edit of action.edit.changes[uri]) {
            // Types should not have first char duplicated
            expect(edit.newText).not.toContain('uuint32');
            expect(edit.newText).not.toContain('ssint64');
          }
        }
      }
    });

    it('should handle enum with CRLF line endings', () => {
      const text = 'syntax = "proto3";\r\nenum Status {\r\n  UNKNOWN = 0\r\n  ACTIVE = 1\r\n}\r\n';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(2, 0, 3, 14);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should produce fix semicolon action for enum values missing semicolons
      const semicolonAction = actions.find(a => a.title && a.title.includes('semicolon'));
      expect(semicolonAction).toBeDefined();
    });

    it('should handle mixed LF/CRLF in code actions', () => {
      // Mixed line endings - edge case
      const text = 'syntax = "proto3";\r\nmessage Test {\n  string name = 1;\r\n  int32 id = 2;\n}\r\n';
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const range = Range.create(1, 0, 4, 1);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);

      // Should still produce actions without crashing
      expect(actions).toBeDefined();
    });
  });
});
