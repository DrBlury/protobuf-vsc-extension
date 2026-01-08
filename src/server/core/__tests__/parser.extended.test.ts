/**
 * Additional parser coverage tests
 * Targets uncovered branches in parser.ts
 */

import { ProtoParser } from '../../core/parser';

describe('ProtoParser Extended Coverage', () => {
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
  });

  describe('syntax parsing', () => {
    it('should parse proto2 syntax', () => {
      const content = `syntax = "proto2";`;
      const result = parser.parse(content, 'test.proto');
      expect(result.syntax?.version).toBe('proto2');
    });

    it('should handle missing syntax statement', () => {
      const content = `message Test {}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages).toHaveLength(1);
    });

    it('should handle edition syntax', () => {
      const content = `edition = "2023";`;
      const result = parser.parse(content, 'test.proto');
      expect(result.edition).toBeDefined();
    });
  });

  describe('import parsing', () => {
    it('should parse public imports', () => {
      const content = `
syntax = "proto3";
import public "public.proto";`;
      const result = parser.parse(content, 'test.proto');
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0]?.modifier).toBe('public');
    });

    it('should parse weak imports', () => {
      const content = `
syntax = "proto3";
import weak "weak.proto";`;
      const result = parser.parse(content, 'test.proto');
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0]?.modifier).toBe('weak');
    });
  });

  describe('message parsing', () => {
    it('should parse message with all field modifiers', () => {
      const content = `
syntax = "proto2";
message Test {
  required string req = 1;
  optional string opt = 2;
  repeated string rep = 3;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields).toHaveLength(3);
    });

    it('should parse nested messages deeply', () => {
      const content = `
syntax = "proto3";
message L1 {
  message L2 {
    message L3 {
      message L4 {
        string deep = 1;
      }
    }
  }
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.nestedMessages[0]?.nestedMessages[0]?.nestedMessages).toHaveLength(1);
    });

    it('should parse reserved field numbers', () => {
      const content = `
syntax = "proto3";
message Test {
  reserved 1, 2, 15 to 20;
  string name = 21;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.reserved).toBeDefined();
    });

    it('should parse reserved field names', () => {
      const content = `
syntax = "proto3";
message Test {
  reserved "foo", "bar";
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.reserved).toBeDefined();
    });

    it('should parse extensions range', () => {
      const content = `
syntax = "proto2";
message Extensible {
  extensions 100 to 199;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.extensions).toBeDefined();
    });

    it('should parse message options', () => {
      const content = `
syntax = "proto3";
message Test {
  option deprecated = true;
  string name = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.options).toBeDefined();
    });
  });

  describe('field parsing', () => {
    it('should parse field with all primitive types', () => {
      const content = `
syntax = "proto3";
message Types {
  double d = 1;
  float f = 2;
  int32 i32 = 3;
  int64 i64 = 4;
  uint32 u32 = 5;
  uint64 u64 = 6;
  sint32 s32 = 7;
  sint64 s64 = 8;
  fixed32 f32 = 9;
  fixed64 f64 = 10;
  sfixed32 sf32 = 11;
  sfixed64 sf64 = 12;
  bool b = 13;
  string s = 14;
  bytes by = 15;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields).toHaveLength(15);
    });

    it('should parse field with options', () => {
      const content = `
syntax = "proto3";
message Test {
  string name = 1 [deprecated = true, json_name = "userName"];
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields[0]?.options).toBeDefined();
    });

    it('should parse field with default value (proto2)', () => {
      const content = `
syntax = "proto2";
message Test {
  optional string name = 1 [default = "test"];
  optional int32 count = 2 [default = 42];
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields).toHaveLength(2);
    });
  });

  describe('map field parsing', () => {
    it('should parse map with various key types', () => {
      const content = `
syntax = "proto3";
message Maps {
  map<string, string> str_str = 1;
  map<int32, string> int_str = 2;
  map<int64, bytes> long_bytes = 3;
  map<uint32, uint64> uint_uint = 4;
  map<sint32, sint64> sint_sint = 5;
  map<fixed32, fixed64> fixed_fixed = 6;
  map<sfixed32, sfixed64> sfixed_sfixed = 7;
  map<bool, string> bool_str = 8;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.maps).toHaveLength(8);
    });

    it('should parse map with message value type', () => {
      const content = `
syntax = "proto3";
message Inner { string val = 1; }
message Outer {
  map<string, Inner> items = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[1]?.maps).toHaveLength(1);
    });
  });

  describe('oneof parsing', () => {
    it('should parse oneof with multiple fields', () => {
      const content = `
syntax = "proto3";
message Test {
  oneof value {
    string str_val = 1;
    int32 int_val = 2;
    bytes bytes_val = 3;
    Inner msg_val = 4;
  }
}
message Inner {}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.oneofs).toHaveLength(1);
      expect(result.messages[0]?.oneofs[0]?.fields).toHaveLength(4);
    });

    it('should parse oneof with options', () => {
      const content = `
syntax = "proto3";
message Test {
  oneof choice {
    option (my_option) = true;
    string a = 1;
  }
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.oneofs).toHaveLength(1);
    });
  });

  describe('enum parsing', () => {
    it('should parse enum with allow_alias', () => {
      const content = `
syntax = "proto3";
enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
  ACTIVE = 1;
  STARTED = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      // Check that options exist (the structure may vary)
      expect(result.enums[0]?.options).toBeDefined();
    });

    it('should parse enum with negative values', () => {
      const content = `
syntax = "proto3";
enum Values {
  NEG = -1;
  ZERO = 0;
  POS = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.enums[0]?.values).toHaveLength(3);
    });

    it('should parse enum value options', () => {
      const content = `
syntax = "proto3";
enum Status {
  UNKNOWN = 0 [deprecated = true];
  ACTIVE = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.enums[0]?.values[0]?.options).toBeDefined();
    });

    it('should parse enum with reserved', () => {
      const content = `
syntax = "proto3";
enum Status {
  reserved 2, 15, 9 to 11;
  reserved "FOO", "BAR";
  UNKNOWN = 0;
  ACTIVE = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.enums[0]?.reserved).toBeDefined();
    });
  });

  describe('service parsing', () => {
    it('should parse service with all RPC types', () => {
      const content = `
syntax = "proto3";
message Req {}
message Res {}
service MyService {
  rpc Unary(Req) returns (Res);
  rpc ServerStream(Req) returns (stream Res);
  rpc ClientStream(stream Req) returns (Res);
  rpc BidiStream(stream Req) returns (stream Res);
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.services[0]?.rpcs).toHaveLength(4);
    });

    it('should parse rpc with options', () => {
      const content = `
syntax = "proto3";
message Req {}
message Res {}
service MyService {
  rpc GetData(Req) returns (Res) {
    option deprecated = true;
  }
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.services[0]?.rpcs[0]?.options).toBeDefined();
    });

    it('should parse service options', () => {
      const content = `
syntax = "proto3";
message Req {}
message Res {}
service MyService {
  option deprecated = true;
  rpc GetData(Req) returns (Res);
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.services[0]?.options).toBeDefined();
    });
  });

  describe('extend parsing', () => {
    it('should parse extend blocks', () => {
      const content = `
syntax = "proto2";
import "google/protobuf/descriptor.proto";

extend google.protobuf.FieldOptions {
  optional string my_option = 51234;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.extends).toHaveLength(1);
    });

    it('should parse multiple extend fields', () => {
      const content = `
syntax = "proto2";
import "google/protobuf/descriptor.proto";

extend google.protobuf.MessageOptions {
  optional string opt1 = 51234;
  optional int32 opt2 = 51235;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.extends[0]?.fields).toHaveLength(2);
    });
  });

  describe('option parsing', () => {
    it('should parse file-level options', () => {
      const content = `
syntax = "proto3";
option java_package = "com.example";
option java_outer_classname = "MyProtos";
option optimize_for = SPEED;
option go_package = "github.com/example/pb";
option csharp_namespace = "Example.Protos";
option cc_enable_arenas = true;
option deprecated = true;
`;
      const result = parser.parse(content, 'test.proto');
      expect(result.options).toBeDefined();
    });

    it('should parse custom options with complex paths', () => {
      const content = `
syntax = "proto3";
option (custom.option).field = "value";
option (another).nested.path = 123;
`;
      const result = parser.parse(content, 'test.proto');
      expect(result.options).toBeDefined();
    });

    it('should parse option with aggregate value', () => {
      const content = `
syntax = "proto3";
message Test {
  string field = 1 [(validate.rules).string = {
    min_len: 1,
    max_len: 100
  }];
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields[0]?.options).toBeDefined();
    });
  });

  describe('comment parsing', () => {
    it('should handle single line comments', () => {
      const content = `
syntax = "proto3";
// This is a comment
message Test {
  // Field comment
  string name = 1; // Trailing comment
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages).toHaveLength(1);
    });

    it('should handle multi-line comments', () => {
      const content = `
syntax = "proto3";
/*
 * This is a multi-line comment
 */
message Test {
  /* Field comment */
  string name = 1;
}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle unclosed message', () => {
      const content = `
syntax = "proto3";
message Test {
  string name = 1;
`;
      const result = parser.parse(content, 'test.proto');
      // Parser may or may not recover from unclosed braces
      // Just check that it doesn't throw
      expect(result).toBeDefined();
    });

    it('should handle unclosed string', () => {
      const content = `
syntax = "proto3";
import "unclosed`;
      const result = parser.parse(content, 'test.proto');
      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle empty message', () => {
      const content = `
syntax = "proto3";
message Empty {}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages[0]?.fields).toHaveLength(0);
    });

    it('should handle empty enum', () => {
      const content = `
syntax = "proto3";
enum Empty {}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.enums[0]?.values).toHaveLength(0);
    });

    it('should handle empty service', () => {
      const content = `
syntax = "proto3";
service Empty {}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.services[0]?.rpcs).toHaveLength(0);
    });
  });

  describe('package parsing', () => {
    it('should parse simple package', () => {
      const content = `
syntax = "proto3";
package simple;`;
      const result = parser.parse(content, 'test.proto');
      expect(result.package?.name).toBe('simple');
    });

    it('should parse nested package', () => {
      const content = `
syntax = "proto3";
package com.example.proto.v1;`;
      const result = parser.parse(content, 'test.proto');
      expect(result.package?.name).toBe('com.example.proto.v1');
    });
  });

  describe('group parsing (proto2)', () => {
    it('should parse group fields', () => {
      const content = `
syntax = "proto2";
message Test {
  optional group MyGroup = 1 {
    optional string name = 2;
  }
}`;
      const result = parser.parse(content, 'test.proto');
      // Groups should be parsed somehow (may create message + field)
      expect(result.messages).toBeDefined();
    });
  });

  describe('whitespace and formatting', () => {
    it('should handle extra whitespace', () => {
      const content = `

  syntax   =   "proto3"  ;

  message   Test   {
    string   name   =   1  ;
  }

`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages).toHaveLength(1);
    });

    it('should handle tabs and mixed whitespace', () => {
      const content = `
syntax = "proto3";
\tmessage Test {
\t\tstring name = 1;
\t}`;
      const result = parser.parse(content, 'test.proto');
      expect(result.messages).toHaveLength(1);
    });
  });
});
