/* eslint-env jest */
import { CodeActionsProvider } from './providers/codeActions';
import { DiagnosticsProvider } from './providers/diagnostics';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { RenumberProvider } from './providers/renumber';
import { GOOGLE_WELL_KNOWN_PROTOS } from './utils/googleWellKnown';
import { CodeActionKind } from 'vscode-languageserver/node';

describe('CodeActionsProvider missing import quickfix', () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const diagnosticsProvider = new DiagnosticsProvider(analyzer);
  const renumberProvider = new RenumberProvider(parser);
  const provider = new CodeActionsProvider(analyzer, renumberProvider);

  beforeAll(() => {
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS['google/type/date.proto'];
    const dateUri = 'builtin:///google/type/date.proto';
    analyzer.updateFile(dateUri, parser.parse(dateContent, dateUri));
  });

  it('offers quick fix to add import when diagnostic flags missing import', () => {
    const content = `syntax = "proto3";

message Example {
  google.type.Date date = 1;
}`;
    const uri = 'file:///example.proto';
    const doc = parser.parse(content, uri);
    analyzer.updateFile(uri, doc);

    const diags = diagnosticsProvider.validate(uri, doc);
    const missing = diags.find(d => d.message.includes('not imported'));
    expect(missing).toBeDefined();

    const actions = provider.getCodeActions(uri, missing!.range, { diagnostics: [missing!] }, content);
    const addImport = actions.find(a => a.title.includes('google/type/date.proto'));

    expect(addImport).toBeDefined();
    expect(addImport?.kind).toBe(CodeActionKind.QuickFix);
    expect(addImport?.edit).toBeDefined();
  });

  it('offers source.organizeImports action to add all missing imports', () => {
    const content = `syntax = "proto3";

message Example {
  google.type.Date date = 1;
}`;
    const uri = 'file:///example2.proto';
    const doc = parser.parse(content, uri);
    analyzer.updateFile(uri, doc);

    const diags = diagnosticsProvider.validate(uri, doc);
    const actions = provider.getCodeActions(
      uri,
      { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      { diagnostics: diags, only: [CodeActionKind.SourceOrganizeImports] },
      content
    );

    const organize = actions.find(a => a.kind === CodeActionKind.SourceOrganizeImports);
    expect(organize).toBeDefined();
    expect(JSON.stringify(organize?.edit || {})).toContain('google/type/date.proto');
  });

  it('offers quick fix to replace non-canonical import path', () => {
    const content = `syntax = "proto3";
import "date.proto";

message Example {
  google.type.Date date = 1;
}`;
    const uri = 'file:///example_wrong_import.proto';
    const doc = parser.parse(content, uri);
    analyzer.updateFile(uri, doc);

    const diags = diagnosticsProvider.validate(uri, doc);
    const wrong = diags.find(d => d.message.includes('should be imported via'));
    expect(wrong).toBeDefined();

    const actions = provider.getCodeActions(uri, wrong!.range, { diagnostics: [wrong!] }, content);
    const replace = actions.find(a => a.title.includes('Replace import'));

    expect(replace).toBeDefined();
    expect(JSON.stringify(replace?.edit || {})).toContain('google/type/date.proto');
  });
});
