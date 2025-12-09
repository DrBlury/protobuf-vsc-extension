/**
 * Tests for Protobuf Editions code actions
 * Validates quick fixes for 'optional' and 'required' modifiers in editions files
 */

import { CodeActionsProvider, CodeActionContext } from './providers/codeActions';
import { DiagnosticsProvider } from './providers/diagnostics';
import { SemanticAnalyzer } from './core/analyzer';
import { ProtoParser } from './core/parser';
import { RenumberProvider } from './providers/renumber';
import { ERROR_CODES } from './utils/constants';

describe('CodeActionsProvider editions fixes', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let diagnosticsProvider: DiagnosticsProvider;
  let codeActionsProvider: CodeActionsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    diagnosticsProvider = new DiagnosticsProvider(analyzer);
    const renumberProvider = new RenumberProvider(parser);
    codeActionsProvider = new CodeActionsProvider(analyzer, renumberProvider);
  });

  describe('optional modifier fix', () => {
    it('should provide quick fix to convert optional to features.field_presence', () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1;
}
`;
      const uri = 'test://editions-fix.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const diagnostics = diagnosticsProvider.validate(uri, file, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = codeActionsProvider.getCodeActions(uri, optionalDiag!.range, context, content);

      const convertAction = actions.find(a =>
        a.title.includes('features.field_presence = EXPLICIT')
      );

      expect(convertAction).toBeDefined();
      expect(convertAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = convertAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('string name = 1');
      expect(edit?.newText).toContain('[features.field_presence = EXPLICIT]');
      expect(edit?.newText).not.toContain('optional');
    });

    it('should provide quick fix to remove optional modifier', () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1;
}
`;
      const uri = 'test://editions-remove.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const diagnostics = diagnosticsProvider.validate(uri, file, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = codeActionsProvider.getCodeActions(uri, optionalDiag!.range, context, content);

      const removeAction = actions.find(a =>
        a.title.includes("Remove 'optional' modifier")
      );

      expect(removeAction).toBeDefined();
      expect(removeAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = removeAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('string name = 1');
      expect(edit?.newText).not.toContain('optional');
    });

    it('should preserve existing options when converting optional', () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1 [deprecated = true];
}
`;
      const uri = 'test://editions-options.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const diagnostics = diagnosticsProvider.validate(uri, file, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = codeActionsProvider.getCodeActions(uri, optionalDiag!.range, context, content);

      const convertAction = actions.find(a =>
        a.title.includes('features.field_presence = EXPLICIT')
      );

      expect(convertAction).toBeDefined();

      const edit = convertAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('deprecated = true');
      expect(edit?.newText).toContain('features.field_presence = EXPLICIT');
    });
  });

  describe('required modifier fix', () => {
    it('should provide quick fix to convert required to features.field_presence', () => {
      const content = `edition = "2023";

message Person {
  required string name = 1;
}
`;
      const uri = 'test://editions-required-fix.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const diagnostics = diagnosticsProvider.validate(uri, file, content);
      const requiredDiag = diagnostics.find(d =>
        d.message.includes("'required' label is not allowed in editions")
      );

      expect(requiredDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [requiredDiag!]
      };

      const actions = codeActionsProvider.getCodeActions(uri, requiredDiag!.range, context, content);

      const convertAction = actions.find(a =>
        a.title.includes('features.field_presence = LEGACY_REQUIRED')
      );

      expect(convertAction).toBeDefined();
      expect(convertAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = convertAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('[features.field_presence = LEGACY_REQUIRED]');
      expect(edit?.newText).not.toContain('required');
    });

    it('should provide quick fix to remove required modifier', () => {
      const content = `edition = "2023";

message Person {
  required string name = 1;
}
`;
      const uri = 'test://editions-required-remove.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const diagnostics = diagnosticsProvider.validate(uri, file, content);
      const requiredDiag = diagnostics.find(d =>
        d.message.includes("'required' label is not allowed in editions")
      );

      expect(requiredDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [requiredDiag!]
      };

      const actions = codeActionsProvider.getCodeActions(uri, requiredDiag!.range, context, content);

      const removeAction = actions.find(a =>
        a.title.includes("Remove 'required' modifier")
      );

      expect(removeAction).toBeDefined();
      expect(removeAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = removeAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).not.toContain('required');
    });
  });
});
