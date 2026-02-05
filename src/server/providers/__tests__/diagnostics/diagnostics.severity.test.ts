import { GOOGLE_WELL_KNOWN_PROTOS } from '../../../utils/googleWellKnown';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS } from '../../diagnostics/types';
import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider severity', () => {
  const providers = new ProviderRegistry();

  beforeAll(() => {
    // Preload minimal google.type.Date stub
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS['google/type/date.proto'];
    const dateUri = 'builtin:///google/type/date.proto';
    providers.analyzer.updateFile(dateUri, providers.parser.parse(dateContent, dateUri));
  });

  describe('nonCanonicalImportPath', () => {
    const content = `syntax = "proto3";
      import "date.proto";
      
      message Sample {
        google.type.Date date = 1;
      }`;
    const uri = 'file:///sample_wrong_import.proto';
    const file = providers.parser.parse(content, uri);
    providers.analyzer.updateFile(uri, file);

    it('reports non-canonical import path at default severity', async () => {
      const diags = await providers.diagnostics.validate(uri, file, providers);
      const wrongImport = diags.find(d => d.message.includes('should be imported via'));

      expect(wrongImport).toBeDefined();
      expect(wrongImport?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('reports non-canonical import path at specified severity', async () => {
      providers.diagnostics.updateSettings({
        severity: {
          ...DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS,
          nonCanonicalImportPath: 'hint',
        },
      });
      const diags = await providers.diagnostics.validate(uri, file, providers);
      const wrongImport = diags.find(d => d.message.includes('should be imported via'));

      expect(wrongImport).toBeDefined();
      expect(wrongImport?.severity).toBe(DiagnosticSeverity.Hint);
    });
  });
});
