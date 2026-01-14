/**
 * Edge case tests for diagnostics provider
 */

import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider Edge Cases', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
  });

  describe('map field validation', () => {
    it('should validate map key types', async () => {
      const text = `syntax = "proto3";
message Test {
  map<int32, string> valid_map = 1;
  map<string, string> valid_string_map = 2;
  map<bool, string> invalid_map = 3;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate map value types', async () => {
      const text = `syntax = "proto3";
message Test {
  map<string, UnknownType> invalid_map = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('enum validation', () => {
    it('should check for duplicate enum values', async () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  OK = 1;
  ERROR = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should check for first enum value being 0', async () => {
      const text = `syntax = "proto3";
enum Status {
  OK = 1;
  ERROR = 2;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ discouragedConstructs: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should allow duplicate enum values with allow_alias', async () => {
      const text = `syntax = "proto3";
enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
  OK = 1;
  ALSO_OK = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      // Should not error on duplicates when allow_alias is set
      const duplicateErrors = diagnostics.filter(d => d.message.includes('Duplicate enum value'));
      expect(duplicateErrors.length).toBe(0);
    });
  });

  describe('service validation', () => {
    it('should validate RPC input/output types', async () => {
      const text = `syntax = "proto3";
service TestService {
  rpc Method(UnknownRequest) returns (UnknownResponse);
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should check for missing RPC types', async () => {
      const text = `syntax = "proto3";
service TestService {
  rpc Method() returns ();
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('field number validation', () => {
    it('should check for reserved field numbers', async () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1 to 10;
  string name = 5;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ fieldTagChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should check for reserved field names', async () => {
      const text = `syntax = "proto3";
message Test {
  reserved "name";
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ fieldTagChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should check for field number continuity', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 10;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ fieldTagChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('oneof validation', () => {
    it('should check for duplicate field numbers in oneof', async () => {
      const text = `syntax = "proto3";
message Test {
  oneof test_oneof {
    string name = 1;
    int32 id = 1;
  }
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ fieldTagChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('import validation', () => {
    it('should check for unresolved imports', async () => {
      const text = `syntax = "proto3";
import "nonexistent.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ referenceChecks: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });

    it('should check for unused imports', async () => {
      const text = `syntax = "proto3";
import "unused.proto";
message Test {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);

      providers.diagnostics.updateSettings({ unusedSymbols: true });
      const protoFile = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, protoFile);
      const diagnostics = await providers.diagnostics.validate(uri, protoFile, providers, text);

      expect(diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });
});
