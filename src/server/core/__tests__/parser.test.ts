/**
 * Tests for Protocol Buffers Parser
 */

import { ProtoParser } from '../parser';

describe('ProtoParser', () => {
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
  });

  describe('parse', () => {
    it('should parse empty file', () => {
      const file = parser.parse('', 'file:///test.proto');
      expect(file.type).toBe('file');
      expect(file.messages).toEqual([]);
      expect(file.enums).toEqual([]);
      expect(file.services).toEqual([]);
    });

    it('should parse syntax statement', () => {
      const file = parser.parse('syntax = "proto3";', 'file:///test.proto');
      expect(file.syntax?.version).toBe('proto3');
    });

    it('should parse proto2 syntax', () => {
      const file = parser.parse('syntax = "proto2";', 'file:///test.proto');
      expect(file.syntax?.version).toBe('proto2');
    });

    it('should parse package statement', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
      `, 'file:///test.proto');
      expect(file.package?.name).toBe('test.v1');
    });

    it('should parse import statements', () => {
      const file = parser.parse(`
        syntax = "proto3";
        import "google/protobuf/timestamp.proto";
        import public "other.proto";
        import weak "optional.proto";
      `, 'file:///test.proto');

      expect(file.imports).toHaveLength(3);
      expect(file.imports[0].path).toBe('google/protobuf/timestamp.proto');
      expect(file.imports[1].path).toBe('other.proto');
      expect(file.imports[1].modifier).toBe('public');
      expect(file.imports[2].path).toBe('optional.proto');
      expect(file.imports[2].modifier).toBe('weak');
    });

    it('should parse option statements', () => {
      const file = parser.parse(`
        syntax = "proto3";
        option java_package = "com.example";
        option optimize_for = SPEED;
      `, 'file:///test.proto');

      expect(file.options).toHaveLength(2);
      expect(file.options[0].name).toBe('java_package');
      expect(file.options[0].value).toBe('com.example');
    });
  });

  describe('message parsing', () => {
    it('should parse simple message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          string name = 1;
          int32 age = 2;
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].name).toBe('User');
      expect(file.messages[0].fields).toHaveLength(2);
    });

    it('should parse field modifiers', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          optional string name = 1;
          repeated string tags = 2;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].modifier).toBe('optional');
      expect(file.messages[0].fields[1].modifier).toBe('repeated');
    });

    it('should parse nested messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message Outer {
          message Inner {
            string value = 1;
          }
          Inner inner = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].nestedMessages).toHaveLength(1);
      expect(file.messages[0].nestedMessages[0].name).toBe('Inner');
    });

    it('should parse oneof fields', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message Contact {
          oneof contact_info {
            string email = 1;
            string phone = 2;
          }
        }
      `, 'file:///test.proto');

      expect(file.messages[0].oneofs).toHaveLength(1);
      expect(file.messages[0].oneofs[0].name).toBe('contact_info');
      expect(file.messages[0].oneofs[0].fields).toHaveLength(2);
    });

    it('should parse map fields', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          map<string, string> metadata = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].maps).toHaveLength(1);
      expect(file.messages[0].maps[0].keyType).toBe('string');
      expect(file.messages[0].maps[0].valueType).toBe('string');
      expect(file.messages[0].maps[0].name).toBe('metadata');
    });

    it('should parse reserved statements', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          reserved 1, 2, 10 to 20;
          reserved "old_field", "legacy";
          string name = 3;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].reserved).toHaveLength(2);
      expect(file.messages[0].reserved[0].ranges).toEqual([
        { start: 1, end: 1 },
        { start: 2, end: 2 },
        { start: 10, end: 20 }
      ]);
      expect(file.messages[0].reserved[1].names).toEqual(['old_field', 'legacy']);
    });

    it('should parse field options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          string name = 1 [deprecated = true, json_name = "userName"];
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].options).toHaveLength(2);
      expect(file.messages[0].fields[0].options![0].name).toBe('deprecated');
      expect(file.messages[0].fields[0].options![0].value).toBe(true);
    });

    it('should capture field type range correctly', () => {
      const content = `syntax = "proto3";
message Response {
  User user = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');

      const field = file.messages[0].fields[0];
      expect(field.fieldType).toBe('User');
      expect(field.fieldTypeRange.start.line).toBe(2);
      // "  User user = 1;" - User starts at character 2
      expect(field.fieldTypeRange.start.character).toBe(2);
    });

    it('should parse hexadecimal field numbers', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message MsgHex {
          int32 f1 = 1234;
          int32 f2 = 0x5678;
          int32 f3 = 0x90ab;
          int32 f4 = 0xCDEF;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields).toHaveLength(4);
      expect(file.messages[0].fields[0].number).toBe(1234);
      expect(file.messages[0].fields[1].number).toBe(0x5678);  // 22136
      expect(file.messages[0].fields[2].number).toBe(0x90ab);  // 37035
      expect(file.messages[0].fields[3].number).toBe(0xCDEF);  // 52719
    });

    it('should parse hexadecimal field numbers with uppercase prefix', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message MsgHex {
          int32 f1 = 0X1234;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].number).toBe(0x1234);
    });

    it('should parse octal field numbers', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message MsgOctal {
          int32 f1 = 010;
          int32 f2 = 0777;
          int32 f3 = 0123;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields).toHaveLength(3);
      expect(file.messages[0].fields[0].number).toBe(8);    // 010 octal = 8 decimal
      expect(file.messages[0].fields[1].number).toBe(511);  // 0777 octal = 511 decimal
      expect(file.messages[0].fields[2].number).toBe(83);   // 0123 octal = 83 decimal
    });

    it('should parse negative enum values', () => {
      const file = parser.parse(`
        syntax = "proto2";
        enum SignedEnum {
          NEGATIVE = -1;
          ZERO = 0;
          POSITIVE = 1;
        }
      `, 'file:///test.proto');

      expect(file.enums[0].values).toHaveLength(3);
      expect(file.enums[0].values[0].number).toBe(-1);
      expect(file.enums[0].values[1].number).toBe(0);
      expect(file.enums[0].values[2].number).toBe(1);
    });

    it('should parse hexadecimal reserved ranges', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          reserved 0x10 to 0x20;
          string name = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].reserved[0].ranges).toEqual([
        { start: 16, end: 32 }
      ]);
    });

    it('should parse hexadecimal map field numbers', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          map<string, string> metadata = 0xFF;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].maps[0].number).toBe(255);
    });

    it('should parse positive prefixed field numbers', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          string name = +1;
          int32 age = +2;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].number).toBe(1);
      expect(file.messages[0].fields[1].number).toBe(2);
    });

    it('should parse fully-qualified type names with leading dot', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          .google.protobuf.Timestamp created_at = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].fieldType).toBe('.google.protobuf.Timestamp');
    });

    it('should parse string concatenation in options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        option java_package = "com.example" ".foo";
      `, 'file:///test.proto');

      expect(file.options[0].value).toBe('com.example.foo');
    });

    it('should parse inf and nan float literals in options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        option (my_option).max_value = inf;
        option (my_option).min_value = nan;
      `, 'file:///test.proto');

      expect(file.options[0].value).toBe(Infinity);
      expect(file.options[1].value).toBeNaN();
    });

    it('should parse string concatenation in field options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          string name = 1 [json_name = "user" "Name"];
        }
      `, 'file:///test.proto');

      expect(file.messages[0].fields[0].options![0].value).toBe('userName');
    });
    it('should parse complex aggregate option with multi-line string concatenation', () => {
      const file = parser.parse(`
        edition = "2023";
        message Test {
          option (buf.validate.message).cel = {
            id: "test",
            expression:
              "has(this.field1)"
              "? 'yes'"
              ": 'no'"
          };
          string field1 = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].name).toBe('Test');
      expect(file.messages[0].options).toHaveLength(1);
      expect(file.messages[0].options[0].name).toBe('(buf.validate.message).cel');
      // The aggregate value should be captured as a string
      expect(typeof file.messages[0].options[0].value).toBe('string');
      expect(file.messages[0].options[0].value).toContain('expression');
    });

    it('should parse dotted field option names like features.field_presence', () => {
      const file = parser.parse(`
        edition = "2023";
        message Test {
          string field1 = 1 [features.field_presence = EXPLICIT];
          string field2 = 2 [features.field_presence = IMPLICIT];
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].fields).toHaveLength(2);
      expect(file.messages[0].fields[0].options?.[0]?.name).toBe('features.field_presence');
      expect(file.messages[0].fields[0].options?.[0]?.value).toBe('EXPLICIT');
      expect(file.messages[0].fields[1].options?.[0]?.name).toBe('features.field_presence');
      expect(file.messages[0].fields[1].options?.[0]?.value).toBe('IMPLICIT');
    });
  });

  describe('enum parsing', () => {
    it('should parse simple enum', () => {
      const file = parser.parse(`
        syntax = "proto3";
        enum Status {
          STATUS_UNSPECIFIED = 0;
          STATUS_ACTIVE = 1;
          STATUS_INACTIVE = 2;
        }
      `, 'file:///test.proto');

      expect(file.enums).toHaveLength(1);
      expect(file.enums[0].name).toBe('Status');
      expect(file.enums[0].values).toHaveLength(3);
    });

    it('should parse enum with options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        enum Status {
          option allow_alias = true;
          STATUS_UNSPECIFIED = 0;
        }
      `, 'file:///test.proto');

      expect(file.enums[0].options).toHaveLength(1);
      expect(file.enums[0].options[0].name).toBe('allow_alias');
    });

    it('should parse nested enums in messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {
          enum Status {
            UNKNOWN = 0;
            ACTIVE = 1;
          }
          Status status = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages[0].nestedEnums).toHaveLength(1);
      expect(file.messages[0].nestedEnums[0].name).toBe('Status');
    });
  });

  describe('service parsing', () => {
    it('should parse simple service', () => {
      const file = parser.parse(`
        syntax = "proto3";
        service UserService {
          rpc GetUser(GetUserRequest) returns (GetUserResponse);
        }
      `, 'file:///test.proto');

      expect(file.services).toHaveLength(1);
      expect(file.services[0].name).toBe('UserService');
      expect(file.services[0].rpcs).toHaveLength(1);
    });

    it('should parse RPC with streams', () => {
      const file = parser.parse(`
        syntax = "proto3";
        service StreamService {
          rpc ClientStream(stream Request) returns (Response);
          rpc ServerStream(Request) returns (stream Response);
          rpc BidiStream(stream Request) returns (stream Response);
        }
      `, 'file:///test.proto');

      expect(file.services[0].rpcs[0].inputStream).toBe(true);
      expect(file.services[0].rpcs[0].outputStream).toBe(false);
      expect(file.services[0].rpcs[1].inputStream).toBe(false);
      expect(file.services[0].rpcs[1].outputStream).toBe(true);
      expect(file.services[0].rpcs[2].inputStream).toBe(true);
      expect(file.services[0].rpcs[2].outputStream).toBe(true);
    });

    it('should capture RPC type ranges correctly', () => {
      const content = `syntax = "proto3";
service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}`;
      const file = parser.parse(content, 'file:///test.proto');

      const rpc = file.services[0].rpcs[0];
      expect(rpc.inputType).toBe('GetUserRequest');
      expect(rpc.inputTypeRange.start.line).toBe(2);
      expect(rpc.outputType).toBe('GetUserResponse');
      expect(rpc.outputTypeRange.start.line).toBe(2);
    });
  });

  describe('extend parsing', () => {
    it('should parse extend definition', () => {
      const file = parser.parse(`
        syntax = "proto3";
        extend google.protobuf.FieldOptions {
          string custom_option = 50000;
        }
      `, 'file:///test.proto');

      expect(file.extends).toHaveLength(1);
      expect(file.extends[0].messageName).toBe('google.protobuf.FieldOptions');
      expect(file.extends[0].fields).toHaveLength(1);
    });
  });

  describe('comment handling', () => {
    it('should skip single-line comments', () => {
      const file = parser.parse(`
        syntax = "proto3";
        // This is a comment
        message User {
          // Field comment
          string name = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].fields).toHaveLength(1);
    });

    it('should skip multi-line comments', () => {
      const file = parser.parse(`
        syntax = "proto3";
        /* Multi-line
           comment */
        message User {
          /* Another
             comment */
          string name = 1;
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].fields).toHaveLength(1);
    });
  });

  describe('complex proto files', () => {
    it('should parse a complete proto file', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package example.v1;

        import "google/protobuf/timestamp.proto";

        option java_package = "com.example.v1";

        message User {
          string id = 1;
          string name = 2;
          UserStatus status = 3;
          repeated string tags = 4;
          map<string, string> metadata = 5;

          oneof contact {
            string email = 6;
            string phone = 7;
          }

          message Address {
            string street = 1;
            string city = 2;
          }

          Address address = 8;

          reserved 100, 200 to 299;
        }

        enum UserStatus {
          USER_STATUS_UNSPECIFIED = 0;
          USER_STATUS_ACTIVE = 1;
          USER_STATUS_INACTIVE = 2;
        }

        service UserService {
          rpc GetUser(GetUserRequest) returns (GetUserResponse);
          rpc ListUsers(ListUsersRequest) returns (stream User);
        }

        message GetUserRequest {
          string id = 1;
        }

        message GetUserResponse {
          User user = 1;
        }

        message ListUsersRequest {
          int32 page_size = 1;
        }
      `, 'file:///test.proto');

      expect(file.syntax?.version).toBe('proto3');
      expect(file.package?.name).toBe('example.v1');
      expect(file.imports).toHaveLength(1);
      expect(file.options).toHaveLength(1);
      expect(file.messages).toHaveLength(4); // User, GetUserRequest, GetUserResponse, ListUsersRequest
      expect(file.enums).toHaveLength(1);
      expect(file.services).toHaveLength(1);

      // Check nested message
      const userMessage = file.messages[0];
      expect(userMessage.nestedMessages).toHaveLength(1);
      expect(userMessage.nestedMessages[0].name).toBe('Address');

      // Check oneof
      expect(userMessage.oneofs).toHaveLength(1);
      expect(userMessage.oneofs[0].name).toBe('contact');

      // Check map
      expect(userMessage.maps).toHaveLength(1);
    });
  });

  describe('group parsing (proto2)', () => {
    it('should parse repeated group', () => {
      const file = parser.parse(`
        syntax = "proto2";
        message SearchResponse {
          repeated group Result = 1 {
            required string url = 2;
            optional string title = 3;
          }
        }
      `, 'file:///test.proto');

      expect(file.messages).toHaveLength(1);
      const msg = file.messages[0];
      expect(msg.name).toBe('SearchResponse');
      expect(msg.groups).toHaveLength(1);

      const group = msg.groups[0];
      expect(group.name).toBe('Result');
      expect(group.modifier).toBe('repeated');
      expect(group.number).toBe(1);
      expect(group.fields).toHaveLength(2);
      expect(group.fields[0].name).toBe('url');
      expect(group.fields[0].modifier).toBe('required');
      expect(group.fields[1].name).toBe('title');
      expect(group.fields[1].modifier).toBe('optional');
    });

    it('should parse optional group', () => {
      const file = parser.parse(`
        syntax = "proto2";
        message TestMessage {
          optional group OptionalGroup = 1 {
            optional string value = 2;
          }
        }
      `, 'file:///test.proto');

      const group = file.messages[0].groups[0];
      expect(group.modifier).toBe('optional');
      expect(group.name).toBe('OptionalGroup');
    });

    it('should parse required group', () => {
      const file = parser.parse(`
        syntax = "proto2";
        message TestMessage {
          required group RequiredGroup = 1 {
            required string value = 2;
          }
        }
      `, 'file:///test.proto');

      const group = file.messages[0].groups[0];
      expect(group.modifier).toBe('required');
      expect(group.name).toBe('RequiredGroup');
    });

    it('should parse group without modifier', () => {
      const file = parser.parse(`
        syntax = "proto2";
        message TestMessage {
          group SimpleGroup = 1 {
            optional string value = 2;
          }
        }
      `, 'file:///test.proto');

      const group = file.messages[0].groups[0];
      expect(group.modifier).toBeUndefined();
      expect(group.name).toBe('SimpleGroup');
    });

    it('should parse nested structures within groups', () => {
      const file = parser.parse(`
        syntax = "proto2";
        message TestMessage {
          repeated group Result = 1 {
            required string url = 2;
            message NestedInGroup {
              optional int32 id = 1;
            }
            enum StatusInGroup {
              UNKNOWN = 0;
              OK = 1;
            }
          }
        }
      `, 'file:///test.proto');

      const group = file.messages[0].groups[0];
      expect(group.nestedMessages).toHaveLength(1);
      expect(group.nestedMessages[0].name).toBe('NestedInGroup');
      expect(group.nestedEnums).toHaveLength(1);
      expect(group.nestedEnums[0].name).toBe('StatusInGroup');
    });
  });
});
