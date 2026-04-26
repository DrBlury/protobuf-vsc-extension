import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider extend statement validation', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
  });

  it('should detect incorrect semicolon after extend', async () => {
    const content = `syntax = "proto3";
extend google.protobuf.FieldOptions;
{
    // stuff here
}
`;
    const uri = 'file:///test.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    const diags = await providers.diagnostics.validate(uri, file, providers, content);

    const syntaxError = diags.find(d => d.message.includes('Expected punctuation "{"'));
    expect(syntaxError).toBeDefined();
    expect(syntaxError?.severity).toBe(DiagnosticSeverity.Error);
  });

  it('should not report missing semicolon for extend header with brace on next line', async () => {
    const content = `syntax = "proto3";

import "google/protobuf/descriptor.proto";

extend google.protobuf.FieldOptions
{
  string extra = 50001;
}
`;
    const uri = 'file:///test.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    const diags = await providers.diagnostics.validate(uri, file, providers, content);

    expect(diags.find(d => d.message === 'Missing semicolon')).toBeUndefined();
  });
});
