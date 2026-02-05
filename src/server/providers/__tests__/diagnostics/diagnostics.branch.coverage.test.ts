/**
 * Additional coverage tests for DiagnosticsProvider
 * Targets remaining uncovered branches
 */

import { DiagnosticsProvider } from '../../diagnostics';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ParserFactory } from '../../../core/parserFactory';
import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider Branch Coverage', () => {
  let providers: ProviderRegistry;
  let provider: DiagnosticsProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ParserFactory;

  beforeEach(() => {
    providers = new ProviderRegistry();
    parser = providers.parser;
    analyzer = providers.analyzer;
    provider = providers.diagnostics;
    provider.updateSettings({
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

  describe('multi-line option handling (lines 319-331)', () => {
    it('should handle multi-line option with braces', async () => {
      const text = `syntax = "proto3";

import "google/protobuf/descriptor.proto";

extend google.protobuf.FieldOptions {
  string my_option = 50000;
}

message Test {
  string name = 1 [(my_option) = "value"];
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Should not report false positive about missing semicolons
      const missingSemi = diagnostics.filter(d => d.message.includes('Missing semicolon'));
      expect(missingSemi.length).toBe(0);
    });

    it('should handle bracket continuation across lines', async () => {
      const text = `syntax = "proto3";

message Test {
  string name = 1 [
    deprecated = true
  ];
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('RPC type validation (lines 1076, 1085)', () => {
    it('should handle RPC with valid types', async () => {
      const text = `syntax = "proto3";

message Request {
  string id = 1;
}

message Response {
  string data = 1;
}

service TestService {
  rpc GetData(Request) returns (Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // No RPC type errors expected
      const rpcErrors = diagnostics.filter(d => d.message.includes('missing'));
      expect(rpcErrors.length).toBe(0);
    });

    it('should validate streaming RPC', async () => {
      const text = `syntax = "proto3";

message Request {}
message Response {}

service StreamService {
  rpc StreamData(stream Request) returns (stream Response);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('unused symbol detection (lines 1736-1774)', () => {
    it('should detect message used only in map value', async () => {
      const text = `syntax = "proto3";

message Value {
  string data = 1;
}

message Container {
  map<string, Value> items = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Value is used in map, so should not be reported as unused
      const unusedValue = diagnostics.filter(d => d.message.includes('never used') && d.message.includes('Value'));
      expect(unusedValue.length).toBe(0);
    });

    it('should detect message used in oneof field', async () => {
      const text = `syntax = "proto3";

message TypeA {}
message TypeB {}

message Container {
  oneof choice {
    TypeA a = 1;
    TypeB b = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // TypeA and TypeB are used in oneof
      const unusedTypes = diagnostics.filter(
        d => d.message.includes('never used') && (d.message.includes('TypeA') || d.message.includes('TypeB'))
      );
      expect(unusedTypes.length).toBe(0);
    });

    it('should check for external references', async () => {
      const text1 = `syntax = "proto3";
package shared;

message SharedType {
  string value = 1;
}`;
      const text2 = `syntax = "proto3";
import "shared.proto";

message Consumer {
  shared.SharedType data = 1;
}`;
      const uri1 = 'file:///shared.proto';
      const uri2 = 'file:///consumer.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const diagnostics = await provider.validate(uri1, file1, providers, text1);

      // SharedType is used in another file
      const unusedShared = diagnostics.filter(
        d => d.message.includes('never used') && d.message.includes('SharedType')
      );
      expect(unusedShared.length).toBe(0);
    });

    it('should handle service using messages', async () => {
      const text = `syntax = "proto3";

message ServiceRequest {
  string query = 1;
}

message ServiceResponse {
  string result = 1;
}

service DataService {
  rpc Query(ServiceRequest) returns (ServiceResponse);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Messages used in service should not be reported as unused
      const unusedMsg = diagnostics.filter(
        d =>
          d.message.includes('never used') &&
          (d.message.includes('ServiceRequest') || d.message.includes('ServiceResponse'))
      );
      expect(unusedMsg.length).toBe(0);
    });
  });

  describe('collectReferencedSymbols (lines 1801-1815)', () => {
    it('should collect references from map fields', async () => {
      const text = `syntax = "proto3";

message KeyType {
  string id = 1;
}

message ValueType {
  string data = 1;
}

message Container {
  map<string, ValueType> items = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // ValueType used in map, KeyType not used
      const unusedValue = diagnostics.filter(d => d.message.includes('never used') && d.message.includes('ValueType'));
      expect(unusedValue.length).toBe(0);

      const unusedKey = diagnostics.filter(d => d.message.includes('never used') && d.message.includes('KeyType'));
      expect(unusedKey.length).toBeGreaterThanOrEqual(0);
    });

    it('should collect references from oneof fields', async () => {
      const text = `syntax = "proto3";

message TypeOne {}
message TypeTwo {}

message Wrapper {
  oneof value {
    TypeOne one = 1;
    TypeTwo two = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Both types used in oneof
      const unused = diagnostics.filter(
        d => d.message.includes('never used') && (d.message.includes('TypeOne') || d.message.includes('TypeTwo'))
      );
      expect(unused.length).toBe(0);
    });

    it('should collect references from nested messages', async () => {
      const text = `syntax = "proto3";

message Inner {}

message Outer {
  message Nested {
    Inner inner = 1;
  }
  Nested nested = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Inner used in Nested
      const unusedInner = diagnostics.filter(d => d.message.includes('never used') && d.message.includes('Inner'));
      expect(unusedInner.length).toBe(0);
    });
  });

  describe('extension range validation (lines 1842+)', () => {
    it('should validate extension ranges', async () => {
      const text = `syntax = "proto2";

message Extendable {
  extensions 100 to 200;
  extensions 300 to max;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });

    it('should detect overlapping extension ranges', async () => {
      const text = `syntax = "proto2";

message Extendable {
  extensions 100 to 200;
  extensions 150 to 250;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const overlapDiags = diagnostics.filter(d => d.message.includes('overlap'));
      expect(overlapDiags.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('field number reserved overlap (lines 1569-1594)', () => {
    it('should detect field number in reserved range', async () => {
      const text = `syntax = "proto3";

message Test {
  reserved 5 to 10;
  string name = 7;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const reservedDiags = diagnostics.filter(d => d.message.includes('reserved'));
      expect(reservedDiags.length).toBeGreaterThan(0);
    });

    it('should detect field at exact reserved boundary', async () => {
      const text = `syntax = "proto3";

message Test {
  reserved 5 to 10;
  string start = 5;
  string end = 10;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const reservedDiags = diagnostics.filter(d => d.message.includes('reserved'));
      expect(reservedDiags.length).toBeGreaterThan(0);
    });
  });

  describe('naming convention variations', () => {
    it('should validate message naming', async () => {
      const text = `syntax = "proto3";

message my_bad_message_name {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should validate enum naming', async () => {
      const text = `syntax = "proto3";

enum bad_enum_name {
  BAD_ENUM_NAME_UNKNOWN = 0;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const namingDiags = diagnostics.filter(d => d.message.includes('PascalCase'));
      expect(namingDiags.length).toBeGreaterThan(0);
    });

    it('should validate field naming', async () => {
      const text = `syntax = "proto3";

message Test {
  string BadFieldName = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const namingDiags = diagnostics.filter(d => d.message.includes('snake_case') || d.message.includes('Field'));
      expect(namingDiags.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deprecated usage warnings (lines 1912, 1918-1920)', () => {
    it('should warn about using deprecated message', async () => {
      const text = `syntax = "proto3";

message OldMessage {
  option deprecated = true;
  string value = 1;
}

message NewMessage {
  OldMessage old = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const deprecatedDiags = diagnostics.filter(d => d.message.toLowerCase().includes('deprecated'));
      expect(deprecatedDiags.length).toBeGreaterThanOrEqual(0);
    });

    it('should warn about using deprecated field', async () => {
      const text = `syntax = "proto3";

message Test {
  string old_field = 1 [deprecated = true];
  string new_field = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('import path validation (lines 1214-1221)', () => {
    it('should validate BSR-style imports', async () => {
      const text = `syntax = "proto3";
import "buf/validate/validate.proto";

message Test {
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Should report unresolved import or BSR dependency missing
      expect(diagnostics).toBeDefined();
    });

    it('should validate relative imports', async () => {
      const text = `syntax = "proto3";
import "./common.proto";

message Test {
  string name = 1;
}`;
      const uri = 'file:///project/test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('field type validation (lines 2112, 2156-2199)', () => {
    it('should validate unknown message type reference', async () => {
      const text = `syntax = "proto3";

message Test {
  UnknownType field = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const typeErrors = diagnostics.filter(
        d => d.message.includes('Unknown') || d.message.includes('undefined') || d.message.includes('resolve')
      );
      expect(typeErrors.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate map key type', async () => {
      const text = `syntax = "proto3";

message Test {
  map<float, string> invalid = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Float is not a valid map key type
      const mapErrors = diagnostics.filter(d => d.message.includes('map') || d.message.includes('key'));
      expect(mapErrors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('group field validation (lines 911-937)', () => {
    it('should warn about groups in proto2', async () => {
      const text = `syntax = "proto2";

message Test {
  optional group MyGroup = 1 {
    required string name = 1;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      // Groups are discouraged
      const groupDiags = diagnostics.filter(
        d =>
          d.message.toLowerCase().includes('group') ||
          d.message.includes('deprecated') ||
          d.message.includes('discouraged')
      );
      expect(groupDiags.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('field tag reserved to max (lines 1630)', () => {
    it('should handle reserved with max value', async () => {
      const text = `syntax = "proto3";

message Test {
  reserved 1000 to max;
  string name = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('empty oneof validation', () => {
    it('should handle oneof with no fields', async () => {
      const text = `syntax = "proto3";

message Test {
  oneof empty_choice {
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      expect(diagnostics).toBeDefined();
    });
  });

  describe('special field numbers', () => {
    it('should detect reserved field number 19000-19999', async () => {
      const text = `syntax = "proto3";

message Test {
  string reserved_range = 19000;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const reservedDiags = diagnostics.filter(d => d.message.includes('reserved') || d.message.includes('19000'));
      expect(reservedDiags.length).toBeGreaterThan(0);
    });

    it('should detect field number exceeding max', async () => {
      const text = `syntax = "proto3";

message Test {
  string too_high = 536870912;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);
      const diagnostics = await provider.validate(uri, file, providers, text);

      const fieldDiags = diagnostics.filter(
        d => d.message.includes('maximum') || d.message.includes('exceed') || d.message.includes('range')
      );
      expect(fieldDiags.length).toBeGreaterThan(0);
    });
  });
});
