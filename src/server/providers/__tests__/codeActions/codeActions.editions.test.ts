/**
 * Tests for Protobuf Editions code actions
 * Validates quick fixes for 'optional' and 'required' modifiers in editions files
 */

import { CodeActionContext } from '../../codeActions';
import { ERROR_CODES } from '../../../utils/constants';
import { ProviderRegistry } from '../../../utils';

describe('CodeActionsProvider editions fixes', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
  });

  describe('optional modifier fix', () => {
    it('should provide quick fix to convert optional to features.field_presence', async () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1;
}
`;
      const uri = 'test://editions-fix.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const diagnostics = await providers.diagnostics.validate(uri, file, providers, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = providers.codeActions.getCodeActions(uri, optionalDiag!.range, context, content);

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

    it('should provide quick fix to remove optional modifier', async () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1;
}
`;
      const uri = 'test://editions-remove.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const diagnostics = await providers.diagnostics.validate(uri, file, providers, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = providers.codeActions.getCodeActions(uri, optionalDiag!.range, context, content);

      const removeAction = actions.find(a =>
        a.title.includes("Remove 'optional' modifier")
      );

      expect(removeAction).toBeDefined();
      expect(removeAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = removeAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('string name = 1');
      expect(edit?.newText).not.toContain('optional');
    });

    it('should preserve existing options when converting optional', async () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1 [deprecated = true];
}
`;
      const uri = 'test://editions-options.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const diagnostics = await providers.diagnostics.validate(uri, file, providers, content);
      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [optionalDiag!]
      };

      const actions = providers.codeActions.getCodeActions(uri, optionalDiag!.range, context, content);

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
    it('should provide quick fix to convert required to features.field_presence', async () => {
      const content = `edition = "2023";

message Person {
  required string name = 1;
}
`;
      const uri = 'test://editions-required-fix.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const diagnostics = await providers.diagnostics.validate(uri, file, providers, content);
      const requiredDiag = diagnostics.find(d =>
        d.message.includes("'required' label is not allowed in editions")
      );

      expect(requiredDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [requiredDiag!]
      };

      const actions = await providers.codeActions.getCodeActions(uri, requiredDiag!.range, context, content);

      const convertAction = actions.find(a =>
        a.title.includes('features.field_presence = LEGACY_REQUIRED')
      );

      expect(convertAction).toBeDefined();
      expect(convertAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = convertAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).toContain('[features.field_presence = LEGACY_REQUIRED]');
      expect(edit?.newText).not.toContain('required');
    });

    it('should provide quick fix to remove required modifier', async () => {
      const content = `edition = "2023";

message Person {
  required string name = 1;
}
`;
      const uri = 'test://editions-required-remove.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const diagnostics = await providers.diagnostics.validate(uri, file, providers, content);
      const requiredDiag = diagnostics.find(d =>
        d.message.includes("'required' label is not allowed in editions")
      );

      expect(requiredDiag).toBeDefined();

      const context: CodeActionContext = {
        diagnostics: [requiredDiag!]
      };

      const actions = await providers.codeActions.getCodeActions(uri, requiredDiag!.range, context, content);

      const removeAction = actions.find(a =>
        a.title.includes("Remove 'required' modifier")
      );

      expect(removeAction).toBeDefined();
      expect(removeAction?.edit?.changes?.[uri]).toBeDefined();

      const edit = removeAction?.edit?.changes?.[uri]?.[0];
      expect(edit?.newText).not.toContain('required');
    });
  });

  describe('source.fixAll editions action', () => {
    it('should provide source.fixAll action to fix all optional/required modifiers', async () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1;
  optional int32 age = 2;
  required string email = 3;
}
`;
      const uri = 'test://editions-fix-all.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const context: CodeActionContext = {
        diagnostics: [],
        only: ['source.fixAll' as any]
      };

      const actions = providers.codeActions.getCodeActions(
        uri,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context,
        content
      );

      const fixAllAction = actions.find(a =>
        a.title.includes('Fix editions modifiers')
      );

      expect(fixAllAction).toBeDefined();
      expect(fixAllAction?.kind).toBe('source.fixAll');
      expect(fixAllAction?.edit?.changes?.[uri]).toBeDefined();

      const edits = fixAllAction?.edit?.changes?.[uri];
      expect(edits?.length).toBe(3); // Should fix all three fields

      // Check that optional fields get EXPLICIT
      const nameEdit = edits?.find(e => e.newText.includes('name'));
      expect(nameEdit?.newText).toContain('features.field_presence = EXPLICIT');
      expect(nameEdit?.newText).not.toContain('optional');

      const ageEdit = edits?.find(e => e.newText.includes('age'));
      expect(ageEdit?.newText).toContain('features.field_presence = EXPLICIT');
      expect(ageEdit?.newText).not.toContain('optional');

      // Check that required field gets LEGACY_REQUIRED
      const emailEdit = edits?.find(e => e.newText.includes('email'));
      expect(emailEdit?.newText).toContain('features.field_presence = LEGACY_REQUIRED');
      expect(emailEdit?.newText).not.toContain('required');
    });

    it('should not provide source.fixAll action for non-editions files', () => {
      const content = `syntax = "proto3";

message Person {
  string name = 1;
}
`;
      const uri = 'test://proto3-no-fix.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const context: CodeActionContext = {
        diagnostics: [],
        only: ['source.fixAll' as any]
      };

      const actions = providers.codeActions.getCodeActions(
        uri,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context,
        content
      );

      const fixAllAction = actions.find(a =>
        a.title.includes('Fix editions modifiers')
      );

      expect(fixAllAction).toBeUndefined();
    });

    it('should preserve existing options when fixing all', () => {
      const content = `edition = "2023";

message Person {
  optional string name = 1 [deprecated = true];
}
`;
      const uri = 'test://editions-fix-all-options.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      const context: CodeActionContext = {
        diagnostics: [],
        only: ['source.fixAll' as any]
      };

      const actions = providers.codeActions.getCodeActions(
        uri,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context,
        content
      );

      const fixAllAction = actions.find(a =>
        a.title.includes('Fix editions modifiers')
      );

      expect(fixAllAction).toBeDefined();

      const edits = fixAllAction?.edit?.changes?.[uri];
      expect(edits?.length).toBe(1);

      const edit = edits?.[0];
      expect(edit?.newText).toContain('deprecated = true');
      expect(edit?.newText).toContain('features.field_presence = EXPLICIT');
    });
  });
});
