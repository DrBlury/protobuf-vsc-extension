/**
 * Code Actions Provider - Renumber Setting Tests
 * Tests that the duplicate field number quick fix respects the renumberOnFormat setting
 */

import { SemanticAnalyzer } from '../../../core/analyzer';
import { RenumberProvider } from '../../renumber';
import { CodeActionsProvider } from '../../codeActions';
import { ProtoParser } from '../../../core/parser';
import { Diagnostic, DiagnosticSeverity, Range, CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider - Renumber Setting', () => {
  let analyzer: SemanticAnalyzer;
  let renumberProvider: RenumberProvider;
  let codeActionsProvider: CodeActionsProvider;
  let parser: ProtoParser;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    parser = new ProtoParser();
    renumberProvider = new RenumberProvider(parser);
    codeActionsProvider = new CodeActionsProvider(analyzer, renumberProvider);
  });

  it('should offer duplicate field number fix when renumberOnFormat is enabled', () => {
    const uri = 'file:///test.proto';
    const documentText = `
syntax = "proto3";

message Test {
  string name = 1;
  string email = 1;  // duplicate
}
`;

    // Parse and analyze
    const protoFile = parser.parse(documentText, uri);
    if (protoFile) {
      analyzer.updateFile(uri, protoFile);
    }

    // Enable renumbering
    codeActionsProvider.updateSettings({ renumberOnFormat: true });

    // Create a diagnostic for duplicate field number
    const diagnostic: Diagnostic = {
      range: Range.create(5, 2, 5, 21),
      message: 'Field "email" has duplicate field number 1',
      severity: DiagnosticSeverity.Error,
      source: 'protobuf'
    };

    const actions = codeActionsProvider.getCodeActions(
      uri,
      diagnostic.range,
      { diagnostics: [diagnostic] },
      documentText
    );

    // Should have a quick fix
    const quickFixes = actions.filter(a => a.title.includes('Change field number'));
    expect(quickFixes.length).toBeGreaterThan(0);
    expect(quickFixes[0]?.title).toContain('Change field number to 2');
  });

  it('should NOT offer duplicate field number fix when renumberOnFormat is disabled', () => {
    const uri = 'file:///test.proto';
    const documentText = `
syntax = "proto3";

message Test {
  string name = 1;
  string email = 1;  // duplicate
}
`;

    // Parse and analyze
    const protoFile = parser.parse(documentText, uri);
    if (protoFile) {
      analyzer.updateFile(uri, protoFile);
    }

    // Disable renumbering (default)
    codeActionsProvider.updateSettings({ renumberOnFormat: false });

    // Create a diagnostic for duplicate field number
    const diagnostic: Diagnostic = {
      range: Range.create(5, 2, 5, 21),
      message: 'Field "email" has duplicate field number 1',
      severity: DiagnosticSeverity.Error,
      source: 'protobuf'
    };

    const actions = codeActionsProvider.getCodeActions(
      uri,
      diagnostic.range,
      { diagnostics: [diagnostic] },
      documentText
    );

    // Should NOT have a quick fix for field numbers
    const quickFixes = actions.filter(a => a.title.includes('Change field number'));
    expect(quickFixes.length).toBe(0);
  });

  it('should default to disabled renumbering', () => {
    const uri = 'file:///test.proto';
    const documentText = `
syntax = "proto3";

message Test {
  string name = 1;
  string email = 1;  // duplicate
}
`;

    // Parse and analyze
    const protoFile = parser.parse(documentText, uri);
    if (protoFile) {
      analyzer.updateFile(uri, protoFile);
    }

    // Don't set any settings - should default to disabled

    // Create a diagnostic for duplicate field number
    const diagnostic: Diagnostic = {
      range: Range.create(5, 2, 5, 21),
      message: 'Field "email" has duplicate field number 1',
      severity: DiagnosticSeverity.Error,
      source: 'protobuf'
    };

    const actions = codeActionsProvider.getCodeActions(
      uri,
      diagnostic.range,
      { diagnostics: [diagnostic] },
      documentText
    );

    // Should NOT have a quick fix by default
    const quickFixes = actions.filter(a => a.title.includes('Change field number'));
    expect(quickFixes.length).toBe(0);
  });

  it('should NOT return source renumber actions on source.fixAll when renumberOnFormat is disabled', () => {
    const uri = 'file:///test.proto';
    const documentText = `
syntax = "proto3";

message Test {
  string a = 1;
  string b = 3; // gap to trigger renumber edits
}
`;

    // Disable renumbering
    codeActionsProvider.updateSettings({ renumberOnFormat: false });

    const actions = codeActionsProvider.getCodeActions(
      uri,
      Range.create(0, 0, 0, 0),
      { diagnostics: [], only: [CodeActionKind.SourceFixAll] },
      documentText
    );

    const renumberActions = actions.filter(a =>
      (a.title ?? '').includes('Assign/normalize field numbers') ||
      (a.title ?? '').includes('Assign field numbers in message')
    );
    expect(renumberActions.length).toBe(0);
  });

  it('should return source renumber actions on source.fixAll when renumberOnFormat is enabled', () => {
    const uri = 'file:///test.proto';
    const documentText = `
syntax = "proto3";

message Test {
  string a = 1;
  string b = 3; // gap to trigger renumber edits
}
`;

    codeActionsProvider.updateSettings({ renumberOnFormat: true });

    const actions = codeActionsProvider.getCodeActions(
      uri,
      Range.create(0, 0, 0, 0),
      { diagnostics: [], only: [CodeActionKind.SourceFixAll] },
      documentText
    );

    const renumberActions = actions.filter(a =>
      (a.title ?? '').includes('Assign/normalize field numbers') ||
      (a.title ?? '').includes('Assign field numbers in message')
    );
    expect(renumberActions.length).toBeGreaterThan(0);
  });
});
