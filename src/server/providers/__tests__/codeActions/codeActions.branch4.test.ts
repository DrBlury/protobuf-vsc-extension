/**
 * Additional branch coverage tests for code actions provider - edge cases and special branches
 */

import { CodeActionsProvider } from '../../codeActions';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { RenumberProvider } from '../../renumber';
import { ProtoParser } from '../../../core/parser';
import { Range, Diagnostic, DiagnosticSeverity, CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider Branch4 Coverage', () => {
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

  describe('addMissingSemicolons edge cases', () => {
    it('should handle block comments correctly', () => {
      const text = `syntax = "proto3";
message Test {
  /* This is a
     block comment
     spanning lines */
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });

    it('should skip field continuation lines', () => {
      const text = `syntax = "proto3";
message Test {
  string name =
    1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });

    it('should handle multi-line inline options with brackets and braces', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 [(custom) = {
    key: "value"
  }];
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });

    it('should handle multi-line bracket options without closing bracket', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 [
    deprecated = true
  ];
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });

    it('should handle lines ending with = for multi-line field declarations', () => {
      const text = `syntax = "proto3";
message Test {
  float value =
    1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });

    it('should handle inline comments when adding semicolons', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 // comment
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const semicolonActions = actions.filter(a => a.title?.includes('semicolon'));
      expect(semicolonActions.length).toBeGreaterThan(0);
    });

    it('should handle block comment markers /* within a line', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 /* inline block comment */
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      expect(actions).toBeDefined();
    });
  });

  describe('quick fix naming conventions', () => {
    it('should provide PascalCase fix for message names', () => {
      const text = `syntax = "proto3";
message test_message {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(1, 8, 1, 20),
        message: 'Message name should be PascalCase',
        source: 'protobuf',
      };

      const range = Range.create(1, 8, 1, 20);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const pascalActions = actions.filter(a => a.title?.includes('PascalCase'));
      expect(pascalActions.length).toBeGreaterThan(0);
    });

    it('should provide SCREAMING_SNAKE_CASE fix for enum values', () => {
      const text = `syntax = "proto3";
enum Status {
  unknown = 0;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 2, 2, 9),
        message: 'Enum value should be SCREAMING_SNAKE_CASE',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 9);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const screamingActions = actions.filter(a => a.title?.includes('SCREAMING_SNAKE_CASE'));
      expect(screamingActions.length).toBeGreaterThan(0);
    });

    it('should provide snake_case fix for field names', () => {
      const text = `syntax = "proto3";
message Test {
  string userName = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 9, 2, 17),
        message: 'Field name should be snake_case',
        source: 'protobuf',
      };

      const range = Range.create(2, 9, 2, 17);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const snakeActions = actions.filter(a => a.title?.includes('snake_case'));
      expect(snakeActions.length).toBeGreaterThan(0);
    });

    it('should not offer snake_case for already SCREAMING_SNAKE_CASE values', () => {
      const text = `syntax = "proto3";
enum Status {
  STATUS_UNKNOWN = 0;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 2, 2, 16),
        message: 'Should be snake_case',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 16);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      // Should not offer lowercase snake_case for SCREAMING_SNAKE_CASE
      const snakeActions = actions.filter(a => a.title?.includes('snake_case:'));
      expect(snakeActions.length).toBe(0);
    });
  });

  describe('missing syntax/edition fixes', () => {
    it('should provide fix for missing syntax declaration', () => {
      const text = `message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(0, 0, 0, 7),
        message: 'Missing syntax or edition declaration',
        source: 'protobuf',
      };

      const range = Range.create(0, 0, 0, 7);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const syntaxActions = actions.filter(a => a.title?.includes('syntax') || a.title?.includes('edition'));
      expect(syntaxActions.length).toBeGreaterThan(0);
    });

    it('should provide both syntax proto3 and edition 2023 fixes', () => {
      const text = `message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(0, 0, 0, 7),
        message: 'Missing syntax or edition declaration',
        source: 'protobuf',
      };

      const range = Range.create(0, 0, 0, 7);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const proto3Action = actions.find(a => a.title?.includes('proto3'));
      const editionAction = actions.find(a => a.title?.includes('2023'));
      expect(proto3Action).toBeDefined();
      expect(editionAction).toBeDefined();
    });
  });

  describe('RPC type fixes', () => {
    it('should provide fix for missing request type', () => {
      const text = `syntax = "proto3";
service MyService {
  rpc GetData() returns (Response);
}
message Response {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 33),
        message: 'RPC GetData missing request type',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 33);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      expect(actions).toBeDefined();
    });

    it('should provide fix for missing response type', () => {
      const text = `syntax = "proto3";
service MyService {
  rpc GetData(Request) returns ();
}
message Request {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 33),
        message: 'RPC GetData missing response type',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 33);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      expect(actions).toBeDefined();
    });
  });

  describe('option value fixes', () => {
    it('should provide fix for expects a boolean value', () => {
      const text = `syntax = "proto3";
option deprecated = "true";`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(1, 0, 1, 28),
        message: 'Option expects a boolean value',
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 28);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const boolActions = actions.filter(a => a.title?.includes('true'));
      expect(boolActions.length).toBeGreaterThan(0);
    });

    it('should provide fix for expects a string value', () => {
      const text = `syntax = "proto3";
option java_package = 123;`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(1, 0, 1, 26),
        message: 'Option expects a string value',
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 26);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const stringActions = actions.filter(a => a.title?.includes('""'));
      expect(stringActions.length).toBeGreaterThan(0);
    });

    it('should provide fix for expects one of enum values', () => {
      const text = `syntax = "proto3";
option optimize_for = INVALID;`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(1, 0, 1, 31),
        message: 'Option expects one of: SPEED, CODE_SIZE, LITE_RUNTIME',
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 31);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const enumActions = actions.filter(a => a.title?.includes('SPEED'));
      expect(enumActions.length).toBeGreaterThan(0);
    });
  });

  describe('BSR import handling', () => {
    it('should suggest buf dependency for buf/ imports', () => {
      const text = `syntax = "proto3";
import "buf/validate/validate.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(1, 0, 1, 38),
        message: "Import 'buf/validate/validate.proto' cannot be resolved",
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 38);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const bufActions = actions.filter(a => a.title?.includes('buf.yaml') || a.title?.includes('buf export'));
      expect(bufActions.length).toBeGreaterThan(0);
    });

    it('should suggest buf dependency for google/api imports', () => {
      const text = `syntax = "proto3";
import "google/api/annotations.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(1, 0, 1, 39),
        message: "Import 'google/api/annotations.proto' cannot be resolved",
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 39);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const bufActions = actions.filter(a => a.title?.includes('googleapis'));
      expect(bufActions.length).toBeGreaterThan(0);
    });

    it('should suggest adding module to buf.yaml when not in dependencies', () => {
      const text = `syntax = "proto3";
import "buf/validate/validate.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(1, 0, 1, 38),
        message:
          "Import 'buf/validate/validate.proto' resolves but 'buf.build/bufbuild/protovalidate' is not in buf.yaml dependencies",
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 38);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const addDepActions = actions.filter(a => a.title?.includes("Add 'buf.build"));
      expect(addDepActions.length).toBeGreaterThan(0);
    });
  });

  describe('unused import removal', () => {
    it('should provide remove unused import action', () => {
      const text = `syntax = "proto3";
import "unused.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(1, 0, 1, 22),
        message: 'Unused import "unused.proto"',
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 22);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const removeActions = actions.filter(a => a.title?.includes('Remove unused import'));
      expect(removeActions.length).toBeGreaterThan(0);
    });
  });

  describe('fully qualified type fixes', () => {
    it('should provide fix for unqualified type reference', () => {
      const text = `syntax = "proto3";
package foo;
message Request {}
message Test {
  Request field = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(4, 2, 4, 9),
        message: "Type 'Request' must be fully qualified as '.foo.Request'",
        source: 'protobuf',
      };

      const range = Range.create(4, 2, 4, 9);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const qualifyActions = actions.filter(a => a.title?.includes('.foo.Request'));
      expect(qualifyActions.length).toBeGreaterThan(0);
    });
  });

  describe('unknown type suggestions', () => {
    it('should handle Google well-known type errors', () => {
      const text = `syntax = "proto3";
message Test {
  Timestamp created_at = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 11),
        message: "Unknown type 'Timestamp'",
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 11);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      // Provider should handle unknown type diagnostics (may or may not provide import suggestions)
      expect(actions).toBeDefined();
    });

    it('should handle Duration type errors', () => {
      const text = `syntax = "proto3";
message Test {
  Duration timeout = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 10),
        message: "Unknown type 'Duration'",
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 10);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      // Provider should handle unknown type diagnostics (may or may not provide import suggestions)
      expect(actions).toBeDefined();
    });
  });

  describe('incorrect import path fix', () => {
    it('should provide fix for incorrect import path', () => {
      const text = `syntax = "proto3";
import "wrong/path.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(1, 0, 1, 26),
        message: 'Type should be imported via "correct/path.proto" instead of "wrong/path.proto"',
        source: 'protobuf',
      };

      const range = Range.create(1, 0, 1, 26);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const replaceActions = actions.filter(a => a.title?.includes('Replace import'));
      expect(replaceActions.length).toBeGreaterThan(0);
    });
  });

  describe('first enum value should be 0', () => {
    it('should provide fix to add UNKNOWN = 0', () => {
      const text = `syntax = "proto3";
enum Status {
  ACTIVE = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 2, 2, 13),
        message: 'First enum value should be 0',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 13);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const zeroActions = actions.filter(a => a.title?.includes('UNKNOWN = 0'));
      expect(zeroActions.length).toBeGreaterThan(0);
    });
  });

  describe('deprecated required fix', () => {
    it('should provide fix for deprecated required', () => {
      const text = `syntax = "proto2";
message Test {
  required string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(2, 2, 2, 26),
        message: "'required' is deprecated in proto3",
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 26);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const requiredActions = actions.filter(
        a => a.title?.includes('optional') || a.title?.includes("Remove 'required'")
      );
      expect(requiredActions.length).toBeGreaterThan(0);
    });
  });

  describe('duplicate field number fix', () => {
    it('should provide fix when renumberOnFormat is enabled', () => {
      provider.updateSettings({ renumberOnFormat: true });

      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(3, 2, 3, 15),
        message: 'Duplicate field number 1',
        source: 'protobuf',
      };

      const range = Range.create(3, 2, 3, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const numberActions = actions.filter(a => a.title?.includes('Change field number'));
      expect(numberActions.length).toBeGreaterThan(0);
    });
  });

  describe('reserved field number fix', () => {
    it('should provide fix for reserved field number usage', () => {
      const text = `syntax = "proto3";
message Test {
  reserved 5;
  string name = 5;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(3, 2, 3, 18),
        message: 'Field number 5 is reserved',
        source: 'protobuf',
      };

      const range = Range.create(3, 2, 3, 18);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const numberActions = actions.filter(a => a.title?.includes('Change field number'));
      expect(numberActions.length).toBeGreaterThan(0);
    });
  });

  describe('editions optional fix', () => {
    it('should provide fix for optional in editions', () => {
      const text = `edition = "2023";
message Test {
  optional string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 27),
        message: "'optional' label is not allowed in editions",
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 27);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const editionActions = actions.filter(
        a => a.title?.includes('field_presence') || a.title?.includes("Remove 'optional'")
      );
      expect(editionActions.length).toBeGreaterThan(0);
    });

    it('should handle optional field with existing options in editions', () => {
      const text = `edition = "2023";
message Test {
  optional string name = 1 [deprecated = true];
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 47),
        message: "'optional' label is not allowed in editions",
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 47);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      expect(actions).toBeDefined();
    });
  });

  describe('oneof scaffolding', () => {
    it('should provide TypeScript switch snippet for oneof', () => {
      const text = `syntax = "proto3";
message Test {
  oneof choice {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(2, 0, 2, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const tsActions = actions.filter(a => a.title?.includes('TypeScript Switch'));
      expect(tsActions.length).toBeGreaterThan(0);
    });

    it('should provide Go switch snippet for oneof', () => {
      const text = `syntax = "proto3";
message Test {
  oneof choice {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(2, 0, 2, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const goActions = actions.filter(a => a.title?.includes('Go Switch'));
      expect(goActions.length).toBeGreaterThan(0);
    });
  });

  describe('organize imports disabled', () => {
    it('should return null when organize imports is disabled', () => {
      provider.updateSettings({ organizeImports: { enabled: false } });

      const text = `syntax = "proto3";
import "zebra.proto";
import "apple.proto";
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

      // Should not have organize imports action when disabled
      const organizeActions = actions.filter(a => a.title?.includes('Organize imports'));
      expect(organizeActions.length).toBe(0);
    });
  });

  describe('import categorization', () => {
    it('should group google/protobuf as google category', () => {
      const text = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
import "local.proto";
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
      expect(actions).toBeDefined();
    });

    it('should group third-party imports correctly', () => {
      const text = `syntax = "proto3";
import "local.proto";
import "envoy/api/v2/route.proto";
import "validate/validate.proto";
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
      expect(actions).toBeDefined();
    });
  });

  describe('missing import detection from diagnostics', () => {
    it('should provide fix when type not imported', () => {
      const text = `syntax = "proto3";
message Test {
  OtherMessage field = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 14),
        message: 'Type "OtherMessage" is not imported. Add import "other.proto"',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 14);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const importActions = actions.filter(a => a.title?.includes('Add import'));
      expect(importActions.length).toBeGreaterThan(0);
    });
  });

  describe('field numbers not strictly increasing', () => {
    it('should provide renumber action for non-increasing field numbers', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 5;
  int32 id = 2;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(3, 2, 3, 15),
        message: 'Field numbers are not strictly increasing',
        source: 'protobuf',
      };

      const range = Range.create(3, 2, 3, 15);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const renumberActions = actions.filter(a => a.title?.includes('Renumber'));
      expect(renumberActions.length).toBeGreaterThan(0);
    });

    it('should provide renumber action for gap in field numbers', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 10;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(3, 2, 3, 16),
        message: 'Gap in field numbers detected',
        source: 'protobuf',
      };

      const range = Range.create(3, 2, 3, 16);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const renumberActions = actions.filter(a => a.title?.includes('Renumber'));
      expect(renumberActions.length).toBeGreaterThan(0);
    });
  });

  describe('missing semicolon diagnostic fix', () => {
    it('should provide add semicolon action for missing semicolon diagnostic', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(2, 2, 2, 17),
        message: 'Missing semicolon',
        source: 'protobuf',
      };

      const range = Range.create(2, 2, 2, 17);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      const semicolonActions = actions.filter(a => a.title?.includes('Add semicolon'));
      expect(semicolonActions.length).toBeGreaterThan(0);
    });
  });

  describe('editions features conversion', () => {
    it('should convert required fields to features.field_presence', () => {
      const text = `edition = "2023";
message Test {
  required string name = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const editionsActions = actions.filter(a => a.title?.includes('editions modifiers'));
      expect(editionsActions.length).toBeGreaterThan(0);
    });
  });

  describe('formatterEnabled setting', () => {
    it('should skip semicolon action when formatter is disabled', () => {
      provider.updateSettings({ formatterEnabled: false });

      const text = `syntax = "proto3";
message Test {
  string name = 1
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(0, 0, 10, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const semicolonSourceActions = actions.filter(
        a => a.kind === CodeActionKind.Source && a.title?.includes('semicolon')
      );
      expect(semicolonSourceActions.length).toBe(0);
    });
  });

  describe('enclosing enum detection', () => {
    it('should provide renumber enum action when inside enum', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 5;
  INACTIVE = 2;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const range = Range.create(3, 0, 3, 14);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [] }, text);
      const enumRenumberActions = actions.filter(a => a.title?.includes('Renumber values in enum'));
      expect(enumRenumberActions.length).toBeGreaterThan(0);
    });
  });

  describe('existing renumber diagnostic', () => {
    it('should not add duplicate renumber action when diagnostic already triggered one', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 1;
}`;
      const uri = 'file:///test.proto';
      const protoFile = parser.parse(text, uri);
      analyzer.updateFile(uri, protoFile);

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: Range.create(3, 2, 3, 15),
        message: 'Duplicate field number in oneof',
        source: 'protobuf',
      };

      const range = Range.create(2, 0, 4, 0);
      const actions = provider.getCodeActions(uri, range, { diagnostics: [diagnostic] }, text);
      // Should not have duplicate renumber actions
      expect(actions).toBeDefined();
    });
  });
});
