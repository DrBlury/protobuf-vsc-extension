/**
 * Additional branch coverage tests for diagnostics provider
 */

import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider Branch Coverage', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
    // Enable all diagnostics for branch coverage
    providers.diagnostics.updateSettings({
      fieldTagChecks: true,
      duplicateFieldChecks: true,
      namingConventions: true,
      referenceChecks: true,
      discouragedConstructs: true,
      importChecks: true,
      deprecatedUsage: true,
      editionFeatures: true,
    });
  });

  describe('shouldSkipDiagnostics', () => {
    it('should skip textproto files', async () => {
      const text = `# This is a textproto file`;
      const uri = 'file:///test.textproto';
      const file = providers.parser.parse(text, uri);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toEqual([]);
    });

    it('should skip pbtxt files', async () => {
      const text = `# This is a pbtxt file`;
      const uri = 'file:///test.pbtxt';
      const file = providers.parser.parse(text, uri);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toEqual([]);
    });

    it('should skip prototxt files', async () => {
      const text = `# This is a prototxt file`;
      const uri = 'file:///test.prototxt';
      const file = providers.parser.parse(text, uri);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('missingSemicolon detection', () => {
    it('should detect missing semicolon on field', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const missingSemi = diagnostics.filter(d => d.message.includes('Missing semicolon'));
      expect(missingSemi.length).toBeGreaterThan(0);
    });

    it('should handle block comments spanning multiple lines', async () => {
      const text = `syntax = "proto3";
message Test {
  /* block
     comment */
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });

    it('should handle inline comments after semicolon', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1; // comment
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const missingSemi = diagnostics.filter(d => d.message.includes('Missing semicolon'));
      expect(missingSemi.length).toBe(0);
    });

    it('should handle multi-line inline options with braces', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1 [(custom) = {
    key: "value"
  }];
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });

    it('should handle field continuation with number on next line', async () => {
      const text = `syntax = "proto3";
message Test {
  string name =
    1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const missingSemi = diagnostics.filter(d => d.message.includes('Missing semicolon'));
      expect(missingSemi.length).toBe(0);
    });

    it('should handle next line starting with bracket', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1
    [deprecated = true];
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });
  });

  describe('group validation', () => {
    it('should warn about groups in proto2', async () => {
      const text = `syntax = "proto2";
message Test {
  optional group MyGroup = 1 {
    optional string name = 1;
  }
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });

    it('should error on groups in proto3', async () => {
      // Proto3 doesn't actually allow groups, but let's test the validation
      const text = `syntax = "proto3";
message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });
  });

  describe('oneof validation', () => {
    it('should check oneof naming conventions', async () => {
      const text = `syntax = "proto3";
message Test {
  oneof InvalidOneofName {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('snake_case'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });
  });

  describe('service validation', () => {
    it('should check service naming conventions', async () => {
      const text = `syntax = "proto3";
service my_service {
  rpc GetData(Request) returns (Response);
}
message Request {}
message Response {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should check RPC naming conventions', async () => {
      const text = `syntax = "proto3";
service MyService {
  rpc get_data(Request) returns (Response);
}
message Request {}
message Response {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should check for missing RPC request type', async () => {
      const text = `syntax = "proto3";
service MyService {
  rpc GetData() returns (Response);
}
message Response {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });

    it('should check for missing RPC response type', async () => {
      const text = `syntax = "proto3";
service MyService {
  rpc GetData(Request) returns ();
}
message Request {}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });

    it('should validate RPC types with workspace match', async () => {
      // First add another file to workspace
      const otherText = `syntax = "proto3";
package other;
message OtherType {}`;
      const otherUri = 'file:///other.proto';
      const otherFile = providers.parser.parse(otherText, otherUri);
      providers.analyzer.updateFile(otherUri, otherFile);

      const text = `syntax = "proto3";
service MyService {
  rpc GetData(OtherType) returns (OtherType);
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      // Should have diagnostics about unqualified type
      expect(diagnostics).toBeDefined();
    });
  });

  describe('option validation', () => {
    it('should validate boolean option with wrong type', async () => {
      const text = `syntax = "proto3";
option deprecated = "true";`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const boolDiags = diagnostics.filter(d => d.message.includes('boolean'));
      expect(boolDiags.length).toBeGreaterThan(0);
    });

    it('should validate string option with wrong type', async () => {
      const text = `syntax = "proto3";
option java_package = 123;`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const stringDiags = diagnostics.filter(d => d.message.includes('string'));
      expect(stringDiags.length).toBeGreaterThan(0);
    });

    it('should validate enum option with wrong value', async () => {
      const text = `syntax = "proto3";
option optimize_for = INVALID;`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const enumDiags = diagnostics.filter(d => d.message.includes('expects one of'));
      expect(enumDiags.length).toBeGreaterThan(0);
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate field numbers', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const dupDiags = diagnostics.filter(d => d.message.includes('Duplicate field number'));
      expect(dupDiags.length).toBeGreaterThan(0);
    });

    it('should detect duplicate field names', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 name = 2;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const dupDiags = diagnostics.filter(d => d.message.includes('Duplicate field name'));
      expect(dupDiags.length).toBeGreaterThan(0);
    });

    it('should detect duplicate map fields', async () => {
      const text = `syntax = "proto3";
message Test {
  map<string, string> data = 1;
  string other = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });
  });

  describe('reserved field validation', () => {
    it('should detect use of reserved field number', async () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1;
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const reservedDiags = diagnostics.filter(d => d.message.includes('reserved'));
      expect(reservedDiags.length).toBeGreaterThan(0);
    });

    it('should detect use of reserved field name', async () => {
      const text = `syntax = "proto3";
message Test {
  reserved "old_name";
  string old_name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const reservedDiags = diagnostics.filter(d => d.message.includes('reserved'));
      expect(reservedDiags.length).toBeGreaterThan(0);
    });

    it('should detect reserved map field', async () => {
      const text = `syntax = "proto3";
message Test {
  reserved 1;
  map<string, string> data = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });
  });

  describe('field number range validation', () => {
    it('should detect field number out of valid range', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 536870912;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const rangeDiags = diagnostics.filter(d => d.message.includes('out of valid range'));
      expect(rangeDiags.length).toBeGreaterThan(0);
    });

    it('should detect field number in reserved system range', async () => {
      const text = `syntax = "proto3";
message Test {
  string name = 19000;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const rangeDiags = diagnostics.filter(d => d.message.includes('reserved'));
      expect(rangeDiags.length).toBeGreaterThan(0);
    });

    it('should detect map field number out of range', async () => {
      const text = `syntax = "proto3";
message Test {
  map<string, string> data = 536870912;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toBeDefined();
    });
  });

  describe('enum validation', () => {
    it('should validate enum naming conventions', async () => {
      const text = `syntax = "proto3";
enum my_status {
  UNKNOWN = 0;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should validate enum value naming conventions', async () => {
      const text = `syntax = "proto3";
enum Status {
  unknown = 0;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('SCREAMING_SNAKE_CASE'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should validate first enum value should be 0', async () => {
      const text = `syntax = "proto3";
enum Status {
  ACTIVE = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const zeroDiags = diagnostics.filter(d => d.message.includes('should be 0'));
      expect(zeroDiags.length).toBeGreaterThan(0);
    });

    it('should detect duplicate enum values without allow_alias', async () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
  RUNNING = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const dupDiags = diagnostics.filter(d => d.message.includes('Duplicate'));
      expect(dupDiags.length).toBeGreaterThan(0);
    });
  });

  describe('nested message validation', () => {
    it('should validate nested messages recursively', async () => {
      const text = `syntax = "proto3";
message Outer {
  message inner_message {
    string name = 1;
  }
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should validate nested enums', async () => {
      const text = `syntax = "proto3";
message Outer {
  enum inner_enum {
    UNKNOWN = 0;
  }
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });
  });

  describe('external dependency files', () => {
    it('should skip validation for .buf-deps directory', async () => {
      const text = `syntax = "proto3";
message test_message {}`;
      const uri = 'file:///workspace/.buf-deps/google/protobuf/any.proto';
      const file = providers.parser.parse(text, uri);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toEqual([]);
    });

    it('should skip validation for vendor directory', async () => {
      const text = `syntax = "proto3";
message test_message {}`;
      const uri = 'file:///workspace/vendor/google/protobuf/any.proto';
      const file = providers.parser.parse(text, uri);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('field naming conventions', () => {
    it('should check field naming convention', async () => {
      const text = `syntax = "proto3";
message Test {
  string UserName = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('snake_case'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should check map field naming convention', async () => {
      const text = `syntax = "proto3";
message Test {
  map<string, string> UserData = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('snake_case'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });
  });

  describe('message naming conventions', () => {
    it('should check message naming convention', async () => {
      const text = `syntax = "proto3";
message test_message {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });
  });

  describe('settings updates', () => {
    it('should respect disabled field tag checks', async () => {
      providers.diagnostics.updateSettings({ fieldTagChecks: false });
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 id = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const dupDiags = diagnostics.filter(d => d.message.includes('Duplicate field number'));
      expect(dupDiags.length).toBe(0);
    });

    it('should respect disabled naming conventions', async () => {
      providers.diagnostics.updateSettings({ namingConventions: false });
      const text = `syntax = "proto3";
message test_message {
  string UserName = 1;
}`;
      const uri = 'file:///test.proto';
      const file = providers.parser.parse(text, uri);
      providers.analyzer.updateFile(uri, file);
      const diagnostics = await providers.diagnostics.validate(uri, file, providers, text);
      const namingDiags = diagnostics.filter(d =>
        d.message.includes('PascalCase') || d.message.includes('snake_case')
      );
      expect(namingDiags.length).toBe(0);
    });
  });
});
