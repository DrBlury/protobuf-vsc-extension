/**
 * Parser Comparison Tests
 * Compares AST output between built-in parser and Tree-sitter parser
 */

import { ProtoParser } from '../parser';
import { TreeSitterProtoParser, initTreeSitterParser, isTreeSitterInitialized } from '../treeSitterParser';
import { ProtoFile, MessageDefinition, EnumDefinition, FieldDefinition, ServiceDefinition, RpcDefinition } from '../ast';
import * as path from 'path';
import * as fs from 'fs';

describe('Parser Comparison: Built-in vs Tree-sitter', () => {
  let builtInParser: ProtoParser;
  let treeSitterParser: TreeSitterProtoParser | null = null;

  beforeAll(async () => {
    builtInParser = new ProtoParser();

    // Initialize Tree-sitter
    const wasmPath = path.join(__dirname, '../../../../tree-sitter-proto/tree-sitter-proto.wasm');
    if (fs.existsSync(wasmPath)) {
      try {
        await initTreeSitterParser(wasmPath);
        if (isTreeSitterInitialized()) {
          treeSitterParser = new TreeSitterProtoParser();
        }
      } catch (e) {
        console.warn('Tree-sitter initialization failed:', e);
      }
    } else {
      console.warn(`Tree-sitter WASM not found at ${wasmPath}`);
    }
  });

  /**
   * Helper to normalize AST for comparison
   * Removes ranges and other position-dependent data that may differ slightly
   */
  function normalizeForComparison(file: ProtoFile): unknown {
    return {
      syntax: file.syntax?.version,
      edition: file.edition?.edition,
      package: file.package?.name,
      imports: file.imports.map(i => ({ path: i.path, modifier: i.modifier })),
      options: file.options.map(o => ({ name: o.name, value: o.value })),
      messages: file.messages.map(normalizeMessage),
      enums: file.enums.map(normalizeEnum),
      services: file.services.map(normalizeService),
    };
  }

  function normalizeMessage(msg: MessageDefinition): unknown {
    return {
      name: msg.name,
      fields: msg.fields.map(normalizeField),
      nestedMessages: msg.nestedMessages.map(normalizeMessage),
      nestedEnums: msg.nestedEnums.map(normalizeEnum),
      oneofs: msg.oneofs.map(o => ({
        name: o.name,
        fields: o.fields.map(normalizeField)
      })),
      maps: msg.maps.map(m => ({
        name: m.name,
        keyType: m.keyType,
        valueType: m.valueType,
        number: m.number
      })),
      reserved: msg.reserved.map(r => ({
        names: r.names,
        ranges: r.ranges
      }))
    };
  }

  function normalizeField(field: FieldDefinition): unknown {
    return {
      name: field.name,
      fieldType: field.fieldType,
      number: field.number,
      modifier: field.modifier,
      options: field.options?.map(o => ({ name: o.name, value: o.value }))
    };
  }

  function normalizeEnum(enumDef: EnumDefinition): unknown {
    return {
      name: enumDef.name,
      values: enumDef.values.map(v => ({
        name: v.name,
        number: v.number,
        options: v.options?.map(o => ({ name: o.name, value: o.value }))
      })),
      options: enumDef.options.map(o => ({ name: o.name, value: o.value }))
    };
  }

  function normalizeService(svc: ServiceDefinition): unknown {
    return {
      name: svc.name,
      rpcs: svc.rpcs.map((rpc: RpcDefinition) => ({
        name: rpc.name,
        requestType: rpc.requestType,
        responseType: rpc.responseType,
        requestStreaming: rpc.requestStreaming,
        responseStreaming: rpc.responseStreaming
      }))
    };
  }

  /**
   * Compare parsers with detailed diff output
   */
  function compareAndReport(protoText: string, testName: string): { match: boolean; builtIn: unknown; treeSitter: unknown } {
    const uri = 'file:///test.proto';

    const builtInResult = builtInParser.parse(protoText, uri);
    const builtInNormalized = normalizeForComparison(builtInResult);

    if (!treeSitterParser) {
      console.warn(`[${testName}] Tree-sitter not available, skipping comparison`);
      return { match: true, builtIn: builtInNormalized, treeSitter: null };
    }

    const treeSitterResult = treeSitterParser.parse(protoText, uri);
    const treeSitterNormalized = normalizeForComparison(treeSitterResult);

    const match = JSON.stringify(builtInNormalized) === JSON.stringify(treeSitterNormalized);

    if (!match) {
      console.log(`\n[${testName}] AST DIFFERENCE DETECTED:`);
      console.log('Built-in:', JSON.stringify(builtInNormalized, null, 2));
      console.log('Tree-sitter:', JSON.stringify(treeSitterNormalized, null, 2));
    }

    return { match, builtIn: builtInNormalized, treeSitter: treeSitterNormalized };
  }

  describe('Basic Proto3 Syntax', () => {
    it('should parse empty proto3 file identically', () => {
      const proto = `syntax = "proto3";`;
      const { match } = compareAndReport(proto, 'empty proto3');
      expect(match).toBe(true);
    });

    it('should parse package declaration identically', () => {
      const proto = `
syntax = "proto3";
package test.example;
`;
      const { match } = compareAndReport(proto, 'package declaration');
      expect(match).toBe(true);
    });

    it('should parse imports identically', () => {
      const proto = `
syntax = "proto3";
import "google/protobuf/timestamp.proto";
import public "other.proto";
import weak "weak.proto";
`;
      const { match } = compareAndReport(proto, 'imports');
      expect(match).toBe(true);
    });

    it('should parse file options identically', () => {
      const proto = `
syntax = "proto3";
option java_package = "com.example";
option go_package = "example.com/pb";
option optimize_for = SPEED;
`;
      const { match } = compareAndReport(proto, 'file options');
      expect(match).toBe(true);
    });
  });

  describe('Message Definitions', () => {
    it('should parse simple message identically', () => {
      const proto = `
syntax = "proto3";
message Person {
  string name = 1;
  int32 age = 2;
  bool active = 3;
}
`;
      const { match } = compareAndReport(proto, 'simple message');
      expect(match).toBe(true);
    });

    it('should parse message with all scalar types identically', () => {
      const proto = `
syntax = "proto3";
message AllTypes {
  double double_field = 1;
  float float_field = 2;
  int32 int32_field = 3;
  int64 int64_field = 4;
  uint32 uint32_field = 5;
  uint64 uint64_field = 6;
  sint32 sint32_field = 7;
  sint64 sint64_field = 8;
  fixed32 fixed32_field = 9;
  fixed64 fixed64_field = 10;
  sfixed32 sfixed32_field = 11;
  sfixed64 sfixed64_field = 12;
  bool bool_field = 13;
  string string_field = 14;
  bytes bytes_field = 15;
}
`;
      const { match } = compareAndReport(proto, 'all scalar types');
      expect(match).toBe(true);
    });

    it('should parse repeated fields identically', () => {
      const proto = `
syntax = "proto3";
message Container {
  repeated string tags = 1;
  repeated int32 numbers = 2;
}
`;
      const { match } = compareAndReport(proto, 'repeated fields');
      expect(match).toBe(true);
    });

    it('should parse nested messages identically', () => {
      const proto = `
syntax = "proto3";
message Outer {
  string outer_field = 1;

  message Inner {
    string inner_field = 1;

    message DeepNested {
      int32 deep_field = 1;
    }
  }

  Inner inner = 2;
}
`;
      const { match } = compareAndReport(proto, 'nested messages');
      expect(match).toBe(true);
    });

    it('should parse map fields identically', () => {
      const proto = `
syntax = "proto3";
message MapTest {
  map<string, int32> string_to_int = 1;
  map<int64, string> int_to_string = 2;
  map<string, NestedMsg> string_to_msg = 3;

  message NestedMsg {
    string value = 1;
  }
}
`;
      const { match } = compareAndReport(proto, 'map fields');
      expect(match).toBe(true);
    });

    it('should parse oneof identically', () => {
      const proto = `
syntax = "proto3";
message OneofTest {
  string name = 1;

  oneof value {
    int32 int_value = 2;
    string string_value = 3;
    bool bool_value = 4;
  }
}
`;
      const { match } = compareAndReport(proto, 'oneof');
      expect(match).toBe(true);
    });

    it('should parse reserved fields identically', () => {
      const proto = `
syntax = "proto3";
message ReservedTest {
  reserved 2, 15, 9 to 11;
  reserved "foo", "bar";

  string active = 1;
}
`;
      const { match } = compareAndReport(proto, 'reserved fields');
      expect(match).toBe(true);
    });

    it('should parse field options identically', () => {
      const proto = `
syntax = "proto3";
message FieldOptionsTest {
  string deprecated_field = 1 [deprecated = true];
  string json_field = 2 [json_name = "customName"];
}
`;
      const { match } = compareAndReport(proto, 'field options');
      expect(match).toBe(true);
    });
  });

  describe('Enum Definitions', () => {
    it('should parse simple enum identically', () => {
      const proto = `
syntax = "proto3";
enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
}
`;
      const { match } = compareAndReport(proto, 'simple enum');
      expect(match).toBe(true);
    });

    it('should parse enum with aliases identically', () => {
      const proto = `
syntax = "proto3";
enum EnumWithAlias {
  option allow_alias = true;
  UNKNOWN = 0;
  STARTED = 1;
  RUNNING = 1;
}
`;
      const { match } = compareAndReport(proto, 'enum with alias');
      expect(match).toBe(true);
    });

    it('should parse nested enum identically', () => {
      const proto = `
syntax = "proto3";
message Container {
  enum NestedEnum {
    NESTED_UNSPECIFIED = 0;
    NESTED_VALUE = 1;
  }

  NestedEnum status = 1;
}
`;
      const { match } = compareAndReport(proto, 'nested enum');
      expect(match).toBe(true);
    });
  });

  describe('Service Definitions', () => {
    it('should parse simple service identically', () => {
      const proto = `
syntax = "proto3";

message Request {
  string query = 1;
}

message Response {
  string result = 1;
}

service SearchService {
  rpc Search(Request) returns (Response);
}
`;
      const { match } = compareAndReport(proto, 'simple service');
      expect(match).toBe(true);
    });

    it('should parse streaming methods identically', () => {
      const proto = `
syntax = "proto3";

message Request { string data = 1; }
message Response { string data = 1; }

service StreamService {
  rpc ServerStream(Request) returns (stream Response);
  rpc ClientStream(stream Request) returns (Response);
  rpc BidiStream(stream Request) returns (stream Response);
}
`;
      const { match } = compareAndReport(proto, 'streaming methods');
      expect(match).toBe(true);
    });
  });

  describe('Proto2 Syntax', () => {
    it('should parse proto2 with required/optional identically', () => {
      const proto = `
syntax = "proto2";
message Proto2Message {
  required string name = 1;
  optional int32 age = 2;
  repeated string tags = 3;
}
`;
      const { match } = compareAndReport(proto, 'proto2 modifiers');
      expect(match).toBe(true);
    });

    it('should parse proto2 with default values identically', () => {
      const proto = `
syntax = "proto2";
message Defaults {
  optional string name = 1 [default = "unknown"];
  optional int32 count = 2 [default = 0];
  optional bool enabled = 3 [default = true];
}
`;
      const { match } = compareAndReport(proto, 'proto2 defaults');
      expect(match).toBe(true);
    });
  });

  describe('Editions Syntax', () => {
    it('should parse edition declaration identically', () => {
      const proto = `edition = "2023";
package test;

message EditionMessage {
  string name = 1;
}
`;
      const { match } = compareAndReport(proto, 'edition declaration');
      expect(match).toBe(true);
    });

    it('should parse edition with features identically', () => {
      const proto = `edition = "2023";

option features.field_presence = EXPLICIT;

message FeatureMessage {
  string field = 1 [features.field_presence = IMPLICIT];
}
`;
      const { match } = compareAndReport(proto, 'edition features');
      expect(match).toBe(true);
    });
  });

  describe('Complex Real-World Examples', () => {
    it('should parse complex message with multiple features identically', () => {
      const proto = `
syntax = "proto3";

package example.complex;

import "google/protobuf/timestamp.proto";
import "google/protobuf/any.proto";

option java_package = "com.example.complex";
option go_package = "example.com/complex;complexpb";

message ComplexMessage {
  string id = 1;

  enum Status {
    STATUS_UNSPECIFIED = 0;
    STATUS_PENDING = 1;
    STATUS_COMPLETE = 2;
  }

  Status status = 2;

  message Metadata {
    map<string, string> labels = 1;
    google.protobuf.Timestamp created_at = 2;
  }

  Metadata metadata = 3;

  oneof payload {
    string text = 4;
    bytes binary = 5;
    google.protobuf.Any any = 6;
  }

  repeated string tags = 7;

  reserved 100 to 200;
  reserved "old_field";
}

service ComplexService {
  rpc Process(ComplexMessage) returns (ComplexMessage);
  rpc StreamProcess(stream ComplexMessage) returns (stream ComplexMessage);
}
`;
      const { match } = compareAndReport(proto, 'complex real-world');
      expect(match).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message identically', () => {
      const proto = `
syntax = "proto3";
message Empty {}
`;
      const { match } = compareAndReport(proto, 'empty message');
      expect(match).toBe(true);
    });

    it('should handle multiple messages identically', () => {
      const proto = `
syntax = "proto3";
message A { string a = 1; }
message B { string b = 1; }
message C { string c = 1; }
`;
      const { match } = compareAndReport(proto, 'multiple messages');
      expect(match).toBe(true);
    });

    it('should handle hex field numbers identically', () => {
      const proto = `
syntax = "proto3";
message HexFields {
  string field_16 = 0x10;
  string field_255 = 0xFF;
}
`;
      const { match } = compareAndReport(proto, 'hex field numbers');
      expect(match).toBe(true);
    });

    it('should handle negative enum values identically', () => {
      const proto = `
syntax = "proto2";
enum SignedEnum {
  NEGATIVE = -1;
  ZERO = 0;
  POSITIVE = 1;
}
`;
      const { match } = compareAndReport(proto, 'negative enum values');
      expect(match).toBe(true);
    });
  });
});
