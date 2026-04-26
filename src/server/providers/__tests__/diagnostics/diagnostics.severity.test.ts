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

  describe('default diagnostic profile', () => {
    it('does not report style or suggestion diagnostics by default', async () => {
      const localProviders = new ProviderRegistry();
      localProviders.analyzer.setWorkspaceRoots(['/workspace']);

      const depUri = 'file:///workspace/dep.proto';
      const depContent = `syntax = "proto3";
package dep;

message Dep {
  string id = 1;
}`;
      localProviders.analyzer.updateFile(depUri, localProviders.parser.parse(depContent, depUri));

      const content = `package does.not.match.path;
import "dep.proto";

message bad_message {
  string CamelCase = 1;
  string later = 3;
}`;
      const uri = 'file:///workspace/sample.proto';
      const file = localProviders.parser.parse(content, uri);
      localProviders.analyzer.updateFile(uri, file);

      const diags = await localProviders.diagnostics.validate(uri, file, localProviders, content);

      expect(diags).toHaveLength(0);
    });
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

    it('reports non-canonical import path at warning severity', async () => {
      providers.diagnostics.updateSettings({
        severity: {
          ...DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS,
          nonCanonicalImportPath: 'warning',
        },
      });
      const diags = await providers.diagnostics.validate(uri, file, providers);
      const wrongImport = diags.find(d => d.message.includes('should be imported via'));

      expect(wrongImport).toBeDefined();
      expect(wrongImport?.severity).toBe(DiagnosticSeverity.Warning);
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

    it('does not report non-canonical import path when severity is none', async () => {
      providers.diagnostics.updateSettings({
        severity: {
          ...DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS,
          nonCanonicalImportPath: 'none',
        },
      });
      const diags = await providers.diagnostics.validate(uri, file, providers);
      const wrongImport = diags.find(d => d.message.includes('should be imported via'));

      expect(wrongImport).toBeUndefined();
    });
  });

  describe('none severity disables category', () => {
    it('disables naming convention diagnostics when naming severity is none', async () => {
      const content = `syntax = "proto3";
      message bad_message_name {
        string SomeCamelCaseField = 1;
      }`;
      const uri = 'file:///naming_none.proto';
      const file = providers.parser.parse(content, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({
        namingConventions: true,
        severity: {
          ...DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS,
          namingConventions: 'none',
        },
      });

      const diags = await providers.diagnostics.validate(uri, file, providers);
      const namingDiagnostics = diags.filter(d => d.message.includes('PascalCase') || d.message.includes('snake_case'));

      expect(namingDiagnostics).toHaveLength(0);
    });
  });
});
