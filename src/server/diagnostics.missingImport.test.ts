/* eslint-env jest */
import { DiagnosticsProvider } from './providers/diagnostics';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { GOOGLE_WELL_KNOWN_PROTOS } from './utils/googleWellKnown';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

describe('DiagnosticsProvider missing imports', () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const diagnosticsProvider = new DiagnosticsProvider(analyzer);

  beforeAll(() => {
    // Preload minimal google.type.Date stub
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS['google/type/date.proto'];
    const dateUri = 'builtin:///google/type/date.proto';
    analyzer.updateFile(dateUri, parser.parse(dateContent, dateUri));
  });

  it('reports missing import for google.type.Date usage', () => {
    const content = `syntax = "proto3";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeDefined();
    expect(missingImport?.severity).toBe(DiagnosticSeverity.Error);
    expect(missingImport?.message).toContain('google/type/date.proto');
  });

  it('does not report missing import when import exists', () => {
    const content = `syntax = "proto3";
import "google/type/date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_imported.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const missingImport = diags.find(d => d.message.includes('not imported'));

    expect(missingImport).toBeUndefined();
  });

  it('reports incorrect import path when using non-canonical name', () => {
    const content = `syntax = "proto3";
import "date.proto";

message Sample {
  google.type.Date date = 1;
}`;
    const uri = 'file:///sample_wrong_import.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file);
    const wrongImport = diags.find(d => d.message.includes('should be imported via'));

    expect(wrongImport).toBeDefined();
    expect(wrongImport?.message).toContain('google/type/date.proto');
  });
});
