import { DiagnosticsProvider } from '../../diagnostics';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

describe('DiagnosticsProvider extend statement validation', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let diagnosticsProvider: DiagnosticsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    diagnosticsProvider = new DiagnosticsProvider(analyzer);
  });

  it('should detect incorrect semicolon after extend', () => {
    const content = `syntax = "proto3";
extend google.protobuf.FieldOptions;
{
    // stuff here
}
`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const diags = diagnosticsProvider.validate(uri, file, content);

    const syntaxError = diags.find(d => d.message.includes('Expected punctuation "{"'));
    expect(syntaxError).toBeDefined();
    expect(syntaxError?.severity).toBe(DiagnosticSeverity.Error);
  });
});
