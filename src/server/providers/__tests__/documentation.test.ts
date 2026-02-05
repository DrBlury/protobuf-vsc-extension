/**
 * Tests for DocumentationProvider
 */

import { SemanticAnalyzer } from '../../core/analyzer';
import { ProtoParser } from '../../core/parser';
import { DocumentationProvider } from '../documentation';

describe('DocumentationProvider', () => {
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;
  let docProvider: DocumentationProvider;

  const parseAndUpdate = (uri: string, content: string) => {
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);
  };

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    parser = new ProtoParser();
    docProvider = new DocumentationProvider(analyzer);
  });

  describe('getDocumentation', () => {
    it('should return null for non-existent file', () => {
      const doc = docProvider.getDocumentation('file:///nonexistent.proto');
      expect(doc).toBeNull();
    });

    it('should return basic documentation for simple proto file', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";
        package mypackage;

        message User {
          string name = 1;
          int32 age = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc).not.toBeNull();
      expect(doc!.fileName).toBe('test.proto');
      expect(doc!.syntax).toBe('proto3');
      expect(doc!.package).toBe('mypackage');
      expect(doc!.messages).toHaveLength(1);
      expect(doc!.messages[0]!.name).toBe('User');
    });

    it('should extract field information', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message Person {
          optional string name = 1;
          repeated int32 scores = 2;
          bool active = 3;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.fields).toHaveLength(3);

      expect(message.fields![0]!.name).toBe('name');
      expect(message.fields![0]!.type).toBe('string');
      expect(message.fields![0]!.number).toBe(1);
      expect(message.fields![0]!.modifier).toBe('optional');

      expect(message.fields![1]!.name).toBe('scores');
      expect(message.fields![1]!.type).toBe('int32');
      expect(message.fields![1]!.number).toBe(2);
      expect(message.fields![1]!.modifier).toBe('repeated');

      expect(message.fields![2]!.name).toBe('active');
      expect(message.fields![2]!.number).toBe(3);
    });

    it('should extract enum information', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        enum Status {
          UNKNOWN = 0;
          ACTIVE = 1;
          INACTIVE = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.enums).toHaveLength(1);

      const enumDef = doc!.enums[0]!;
      expect(enumDef.name).toBe('Status');
      expect(enumDef.values).toHaveLength(3);
      expect(enumDef.values![0]!.name).toBe('UNKNOWN');
      expect(enumDef.values![0]!.number).toBe(0);
      expect(enumDef.values![1]!.name).toBe('ACTIVE');
      expect(enumDef.values![1]!.number).toBe(1);
    });

    it('should extract service information', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        service UserService {
          rpc GetUser (GetUserRequest) returns (GetUserResponse);
          rpc ListUsers (stream ListUsersRequest) returns (stream ListUsersResponse);
        }

        message GetUserRequest {}
        message GetUserResponse {}
        message ListUsersRequest {}
        message ListUsersResponse {}
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.services).toHaveLength(1);

      const service = doc!.services[0]!;
      expect(service.name).toBe('UserService');
      expect(service.rpcs).toHaveLength(2);

      expect(service.rpcs![0]!.name).toBe('GetUser');
      expect(service.rpcs![0]!.requestType).toBe('GetUserRequest');
      expect(service.rpcs![0]!.responseType).toBe('GetUserResponse');
      expect(service.rpcs![0]!.requestStreaming).toBe(false);
      expect(service.rpcs![0]!.responseStreaming).toBe(false);

      expect(service.rpcs![1]!.name).toBe('ListUsers');
      expect(service.rpcs![1]!.requestStreaming).toBe(true);
      expect(service.rpcs![1]!.responseStreaming).toBe(true);
    });

    it('should extract imports', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";
        import "google/protobuf/timestamp.proto";
        import "other/file.proto";

        message Test {
          string id = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.imports).toHaveLength(2);
      expect(doc!.imports).toContain('google/protobuf/timestamp.proto');
      expect(doc!.imports).toContain('other/file.proto');
    });

    it('should extract comments as documentation', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        // User represents a system user
        message User {
          // The user's unique identifier
          string id = 1;
          // The user's display name
          string name = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.comments).toContain('User represents a system user');
      expect(message.fields![0]!.comments).toContain("user's unique identifier");
      expect(message.fields![1]!.comments).toContain("user's display name");
    });

    it('should extract trailing comments on same line', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        // A date representation
        message Date {
          int32 year  = 1; // the year value
          int32 month = 2; // the month value
          int32 day   = 3; // the day value
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.comments).toContain('A date representation');
      expect(message.fields![0]!.name).toBe('year');
      expect(message.fields![0]!.comments).toContain('the year value');
      expect(message.fields![1]!.name).toBe('month');
      expect(message.fields![1]!.comments).toContain('the month value');
      expect(message.fields![2]!.name).toBe('day');
      expect(message.fields![2]!.comments).toContain('the day value');
    });

    it('should extract trailing comments on enum values', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        enum Status {
          UNKNOWN = 0;  // unknown status
          ACTIVE = 1;   // active status
          INACTIVE = 2; // inactive status
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const enumDef = doc!.enums[0]!;

      expect(enumDef.values![0]!.name).toBe('UNKNOWN');
      expect(enumDef.values![0]!.comments).toContain('unknown status');
      expect(enumDef.values![1]!.name).toBe('ACTIVE');
      expect(enumDef.values![1]!.comments).toContain('active status');
      expect(enumDef.values![2]!.name).toBe('INACTIVE');
      expect(enumDef.values![2]!.comments).toContain('inactive status');
    });

    it('should not bleed message comment into first field when field has no comment', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        // This is the message description
        message TestMessage {
          string no_comment_field = 1;
          string another_field = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      // Message should have its comment
      expect(message.comments).toContain('This is the message description');

      // First field should NOT have the message's comment
      expect(message.fields![0]!.name).toBe('no_comment_field');
      expect(message.fields![0]!.comments).toBeUndefined();

      // Second field should also have no comment
      expect(message.fields![1]!.name).toBe('another_field');
      expect(message.fields![1]!.comments).toBeUndefined();
    });

    it('should correctly separate message and field comments when both exist', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        // This is the message description
        message TestMessage {
          // First field comment
          string first_field = 1;
          // Second field comment
          string second_field = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      // Message should only have its own comment
      expect(message.comments).toBe('This is the message description');

      // Fields should only have their own comments
      expect(message.fields![0]!.comments).toBe('First field comment');
      expect(message.fields![1]!.comments).toBe('Second field comment');
    });

    it('should detect deprecated fields', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message User {
          string id = 1;
          string old_name = 2 [deprecated = true];
          string name = 3;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.fields![0]!.deprecated).toBe(false);
      expect(message.fields![1]!.deprecated).toBe(true);
      expect(message.fields![2]!.deprecated).toBe(false);
    });

    it('should extract nested messages', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message Outer {
          string id = 1;

          message Inner {
            string value = 1;
          }

          Inner inner = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const outer = doc!.messages[0]!;

      expect(outer.name).toBe('Outer');
      expect(outer.nestedMessages).toHaveLength(1);
      expect(outer.nestedMessages![0]!.name).toBe('Inner');
      expect(outer.nestedMessages![0]!.fullName).toBe('Outer.Inner');
    });

    it('should extract nested enums', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message User {
          enum Status {
            UNKNOWN = 0;
            ACTIVE = 1;
          }

          Status status = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.nestedEnums).toHaveLength(1);
      expect(message.nestedEnums![0]!.name).toBe('Status');
      expect(message.nestedEnums![0]!.fullName).toBe('User.Status');
    });

    it('should extract map fields', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message User {
          map<string, int32> scores = 1;
          map<string, Address> addresses = 2;
        }

        message Address {
          string city = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      expect(message.fields).toHaveLength(2);
      expect(message.fields![0]!.name).toBe('scores');
      expect(message.fields![0]!.type).toBe('map<string, int32>');
      expect(message.fields![1]!.name).toBe('addresses');
      expect(message.fields![1]!.type).toBe('map<string, Address>');
    });

    it('should handle oneof fields', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message Message {
          oneof content {
            string text = 1;
            bytes data = 2;
          }
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const message = doc!.messages[0]!;

      // Oneof fields should be included in the fields list
      expect(message.fields!.length).toBeGreaterThanOrEqual(2);
      const textField = message.fields!.find(f => f.name === 'text');
      const dataField = message.fields!.find(f => f.name === 'data');

      expect(textField).toBeDefined();
      expect(dataField).toBeDefined();

      // Check oneof annotation in options
      expect(textField!.options).toBeDefined();
      expect(textField!.options!.some(o => o.includes('oneof: content'))).toBe(true);
    });

    it('should extract file options', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";
        option java_package = "com.example";
        option go_package = "example.com/pkg";

        message Test {}
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.options).toBeDefined();
      expect(doc!.options).toContain('java_package = "com.example"');
      expect(doc!.options).toContain('go_package = "example.com/pkg"');
    });

    it('should handle proto2 syntax', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto2";
        package legacy;

        message OldMessage {
          required string id = 1;
          optional string name = 2;
          repeated int32 values = 3;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.syntax).toBe('proto2');

      const message = doc!.messages[0]!;
      expect(message.fields![0]!.modifier).toBe('required');
      expect(message.fields![1]!.modifier).toBe('optional');
      expect(message.fields![2]!.modifier).toBe('repeated');
    });

    it('should handle edition syntax', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        edition = "2023";
        package modern;

        message ModernMessage {
          string id = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.edition).toBe('2023');
    });

    it('should sort fields by number', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message Unordered {
          string z = 3;
          string a = 1;
          string m = 2;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const fields = doc!.messages[0]!.fields!;

      expect(fields[0]!.number).toBe(1);
      expect(fields[1]!.number).toBe(2);
      expect(fields[2]!.number).toBe(3);
    });

    it('should handle complex nested structures', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";
        package complex;

        message Level1 {
          string id = 1;

          message Level2 {
            int32 value = 1;

            enum Level2Enum {
              UNKNOWN = 0;
            }

            message Level3 {
              bool flag = 1;
            }
          }
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const level1 = doc!.messages[0]!;

      expect(level1.name).toBe('Level1');
      expect(level1.nestedMessages).toHaveLength(1);

      const level2 = level1.nestedMessages![0]!;
      expect(level2.name).toBe('Level2');
      expect(level2.fullName).toBe('Level1.Level2');
      expect(level2.nestedEnums).toHaveLength(1);
      expect(level2.nestedMessages).toHaveLength(1);

      const level3 = level2.nestedMessages![0]!;
      expect(level3.fullName).toBe('Level1.Level2.Level3');
    });

    it('should detect deprecated messages', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        message ActiveMessage {
          string id = 1;
        }

        message DeprecatedMessage {
          option deprecated = true;
          string id = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');

      expect(doc!.messages[0]!.deprecated).toBe(false);
      expect(doc!.messages[1]!.deprecated).toBe(true);
    });

    it('should detect deprecated enum values', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        enum Status {
          UNKNOWN = 0;
          ACTIVE = 1;
          LEGACY = 2 [deprecated = true];
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      const enumDef = doc!.enums[0]!;

      expect(enumDef.values![0]!.deprecated).toBe(false);
      expect(enumDef.values![1]!.deprecated).toBe(false);
      expect(enumDef.values![2]!.deprecated).toBe(true);
    });

    it('should detect deprecated services and RPCs', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";

        service DeprecatedService {
          option deprecated = true;
          rpc Method (Request) returns (Response);
        }

        message Request {}
        message Response {}
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');
      expect(doc!.services[0]!.deprecated).toBe(true);
    });

    it('should handle empty file', () => {
      parseAndUpdate(
        'file:///empty.proto',
        `
        syntax = "proto3";
      `
      );

      const doc = docProvider.getDocumentation('file:///empty.proto');
      expect(doc).not.toBeNull();
      expect(doc!.messages).toHaveLength(0);
      expect(doc!.enums).toHaveLength(0);
      expect(doc!.services).toHaveLength(0);
    });

    it('should handle file without syntax', () => {
      parseAndUpdate(
        'file:///nosyntax.proto',
        `
        message SimpleMessage {
          optional string value = 1;
        }
      `
      );

      const doc = docProvider.getDocumentation('file:///nosyntax.proto');
      expect(doc).not.toBeNull();
      expect(doc!.syntax).toBeUndefined();
    });
  });

  describe('fullName computation', () => {
    it('should compute full names correctly with package', () => {
      parseAndUpdate(
        'file:///test.proto',
        `
        syntax = "proto3";
        package foo.bar;

        message Outer {
          message Inner {}
        }

        enum TopEnum {
          UNKNOWN = 0;
        }

        service MyService {
          rpc Call (Request) returns (Response);
        }

        message Request {}
        message Response {}
      `
      );

      const doc = docProvider.getDocumentation('file:///test.proto');

      expect(doc!.messages[0]!.fullName).toBe('Outer');
      expect(doc!.messages[0]!.nestedMessages![0]!.fullName).toBe('Outer.Inner');
      expect(doc!.enums[0]!.fullName).toBe('TopEnum');
      expect(doc!.services[0]!.fullName).toBe('MyService');
    });
  });
});
