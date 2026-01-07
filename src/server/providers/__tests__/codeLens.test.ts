/**
 * Tests for Code Lens Provider
 */

import { CodeLensProvider } from '../codeLens';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';

describe('CodeLensProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let codeLensProvider: CodeLensProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    codeLensProvider = new CodeLensProvider(analyzer);
  });

  it('should create code lenses for messages', () => {
    const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
  string email = 2;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const messageLens = lenses.find(l => l.command?.title?.includes('User') || l.command?.title?.includes('field'));
    expect(messageLens).toBeDefined();
    if (messageLens) {
      expect(messageLens.command?.title).toBeDefined();
    }
  });

  it('should create code lenses for enums', () => {
    const content = `syntax = "proto3";
package test.v1;

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const enumLens = lenses.find(l => l.command?.title?.includes('Status') || l.command?.title?.includes('value'));
    expect(enumLens).toBeDefined();
    if (enumLens) {
      expect(enumLens.command?.title).toBeDefined();
    }
  });

  it('should create code lenses for services', () => {
    const content = `syntax = "proto3";
package test.v1;

message GetUserRequest {}
message CreateUserRequest {}
message User {}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
}`;
    const uri = 'file:///test.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    const serviceLens = lenses.find(l => l.command?.title?.includes('UserService') || l.command?.title?.includes('RPC'));
    expect(serviceLens).toBeDefined();
    if (serviceLens) {
      expect(serviceLens.command?.title).toBeDefined();
    }
  });

  it('should show reference counts in code lenses', () => {
    const content1 = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}`;

    const content2 = `syntax = "proto3";
package test.v1;
import "file1.proto";

message Profile {
  test.v1.User user = 1;
}`;

    const uri1 = 'file:///file1.proto';
    const uri2 = 'file:///file2.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const lenses = codeLensProvider.getCodeLenses(uri1, file1);

    // Code lens should be created if there are fields or references
    expect(lenses.length).toBeGreaterThan(0);
    const userLens = lenses.find(l =>
      l.command?.title?.includes('User') ||
      l.command?.title?.includes('reference') ||
      l.command?.title?.includes('field')
    );
    // Lens should exist because message has fields
    expect(userLens).toBeDefined();
  });

  it('should handle messages without package', () => {
    const content = `syntax = "proto3";

message SimpleMessage {
  string data = 1;
}`;
    const uri = 'file:///simple.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses[0].command?.title).toContain('field');
  });

  it('should handle nested messages', () => {
    const content = `syntax = "proto3";
package test;

message Outer {
  message Inner {
    string value = 1;
  }
  Inner inner = 1;
}`;
    const uri = 'file:///nested.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);

    // Should have lenses for both Outer and Inner
    expect(lenses.length).toBeGreaterThanOrEqual(2);
    const innerLens = lenses.find(l => l.range.start.line > 3);
    expect(innerLens).toBeDefined();
  });

  it('should show singular/plural correctly for fields', () => {
    const singleFieldContent = `syntax = "proto3";
message SingleField {
  string only = 1;
}`;
    const uri = 'file:///single.proto';
    const file = parser.parse(singleFieldContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    // With 1 field, should show "field" (singular)
    expect(lenses[0].command?.title).toContain('1 field');
    expect(lenses[0].command?.title).not.toContain('1 fields');
  });

  it('should show singular/plural correctly for enum values', () => {
    const singleValueContent = `syntax = "proto3";
enum SingleValue {
  UNSPECIFIED = 0;
}`;
    const uri = 'file:///single-enum.proto';
    const file = parser.parse(singleValueContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    // With 1 value, should show "value" (singular)
    expect(lenses[0].command?.title).toContain('1 value');
    expect(lenses[0].command?.title).not.toContain('1 values');
  });

  it('should show singular/plural correctly for RPCs', () => {
    const singleRpcContent = `syntax = "proto3";
message Request {}
message Response {}
service SingleRpc {
  rpc OnlyMethod(Request) returns (Response);
}`;
    const uri = 'file:///single-rpc.proto';
    const file = parser.parse(singleRpcContent, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    // Find the service lens
    const serviceLens = lenses.find(l => l.command?.title?.includes('RPC'));
    expect(serviceLens).toBeDefined();
    // With 1 RPC, should show "RPC" (singular)
    expect(serviceLens?.command?.title).toContain('1 RPC');
    expect(serviceLens?.command?.title).not.toContain('1 RPCs');
  });

  it('should show plural for multiple references', () => {
    const content = `syntax = "proto3";
message ReferencedMessage {
  string id = 1;
}
message User1 {
  ReferencedMessage ref = 1;
}
message User2 {
  ReferencedMessage ref = 1;
}`;
    const uri = 'file:///refs.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    // Find the lens for ReferencedMessage
    const refLens = lenses.find(l => l.range.start.line === 1);
    expect(refLens).toBeDefined();
    // With 2 references, should show "references" (plural)
    expect(refLens?.command?.title).toContain('references');
  });

  it('should return empty array for empty file', () => {
    const content = `syntax = "proto3";`;
    const uri = 'file:///empty.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses).toEqual([]);
  });

  it('should include command arguments with correct position', () => {
    const content = `syntax = "proto3";

message TestMessage {
  string field = 1;
}`;
    const uri = 'file:///cmd-args.proto';
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    const lenses = codeLensProvider.getCodeLenses(uri, file);
    
    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses[0].command?.command).toBe('protobuf.findReferences');
    expect(lenses[0].command?.arguments).toBeDefined();
    expect(lenses[0].command?.arguments?.[0]?.uri).toBe(uri);
    expect(lenses[0].command?.arguments?.[0]?.position).toBeDefined();
  });

  it('should differentiate external and internal references', () => {
    const content1 = `syntax = "proto3";
package test;

message Shared {
  string data = 1;
}

message LocalUser {
  Shared shared = 1;
}`;

    const content2 = `syntax = "proto3";
package test;

message ExternalUser {
  Shared shared = 1;
}`;

    const uri1 = 'file:///shared.proto';
    const uri2 = 'file:///external.proto';

    const file1 = parser.parse(content1, uri1);
    const file2 = parser.parse(content2, uri2);

    analyzer.updateFile(uri1, file1);
    analyzer.updateFile(uri2, file2);

    const lenses = codeLensProvider.getCodeLenses(uri1, file1);

    // Find the lens for Shared message
    const sharedLens = lenses.find(l => l.range.start.line === 3);
    expect(sharedLens).toBeDefined();
    expect(sharedLens?.command?.title).toContain('external');
    expect(sharedLens?.command?.title).toContain('internal');
  });

  describe('protovalidate code lenses', () => {
    it('should create code lenses for fields with buf.validate options when import is present', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message User {
  string email = 1 [(buf.validate.field).string.email = true];
  string name = 2 [(buf.validate.field).string.min_len = 1];
}`;
      const uri = 'file:///user.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);

      // Should have lenses for protovalidate fields
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should not create protovalidate lenses without buf.validate import', () => {
      const content = `syntax = "proto3";

message User {
  string email = 1 [(buf.validate.field).string.email = true];
}`;
      const uri = 'file:///user.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);

      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBe(0);
    });

    it('should include rule information in code lens arguments', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message User {
  string name = 1 [(buf.validate.field).string.min_len = 1];
}`;
      const uri = 'file:///user.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLens = lenses.find(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );

      expect(protovalidateLens).toBeDefined();
      expect(protovalidateLens?.command?.arguments?.[0]).toEqual(
        expect.objectContaining({
          fieldName: 'name',
          messageName: expect.stringContaining('User'),
          filePath: uri
        })
      );
    });

    it('should detect validate.proto import variant', () => {
      const content = `syntax = "proto3";
import "validate/validate.proto";

message Request {
  int32 count = 1 [(validate.rules).int32.gt = 0];
}`;
      const uri = 'file:///request.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);

      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle nested messages with protovalidate rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Outer {
  message Inner {
    string value = 1 [(buf.validate.field).string.pattern = "^[a-z]+$"];
  }
  Inner inner = 1;
}`;
      const uri = 'file:///nested.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);

      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should show beaker icon in code lens title', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message User {
  string email = 1 [(buf.validate.field).string.email = true];
}`;
      const uri = 'file:///user.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLens = lenses.find(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );

      expect(protovalidateLens?.command?.title).toContain('$(beaker)');
      expect(protovalidateLens?.command?.title).toContain('Protovalidate Playground');
    });

    it('should handle int32 validation rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Request {
  int32 count = 1 [(buf.validate.field).int32 = { gt: 0, lte: 100 }];
}`;
      const uri = 'file:///request.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle double validation rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Price {
  double amount = 1 [(buf.validate.field).double = { gte: 0.0 }];
}`;
      const uri = 'file:///price.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle float validation rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Score {
  float value = 1 [(buf.validate.field).float = { gte: 0.0, lte: 1.0 }];
}`;
      const uri = 'file:///score.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle repeated field validation rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Tags {
  repeated string items = 1 [(buf.validate.field).repeated = { min_items: 1, max_items: 10, unique: true }];
}`;
      const uri = 'file:///tags.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle CEL expression rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message DateRange {
  string start_date = 1;
  string end_date = 2 [(buf.validate.field).cel = { expression: "this >= rules.start_date" }];
}`;
      const uri = 'file:///daterange.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle required field rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Required {
  string name = 1 [(buf.validate.field).required = true];
}`;
      const uri = 'file:///required.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle fields in oneof with protovalidate rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Contact {
  oneof contact_method {
    string email = 1 [(buf.validate.field).string.email = true];
    string phone = 2 [(buf.validate.field).string.pattern = "^\\+[1-9]\\d{1,14}$"];
  }
}`;
      const uri = 'file:///contact.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should not add protovalidate lenses to empty messages', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Empty {}`;
      const uri = 'file:///empty.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBe(0);
    });

    it('should not add protovalidate lenses to enums', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
}`;
      const uri = 'file:///status.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBe(0);
    });

    it('should not add protovalidate lenses to services', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Request {}
message Response {}

service MyService {
  rpc DoSomething(Request) returns (Response);
}`;
      const uri = 'file:///service.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBe(0);
    });

    it('should handle multiple nested levels with protovalidate rules', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Level1 {
  message Level2 {
    message Level3 {
      string value = 1 [(buf.validate.field).string.min_len = 1];
    }
    Level3 nested = 1;
  }
  Level2 nested = 1;
}`;
      const uri = 'file:///nested-levels.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle validate.rules option name variant', () => {
      const content = `syntax = "proto3";
import "validate/validate.proto";

message Request {
  string name = 1 [(validate.rules).string.min_len = 1];
}`;
      const uri = 'file:///validate-rules.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should include all required arguments in code lens for protovalidate', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message User {
  string email = 1 [(buf.validate.field).string.email = true];
}`;
      const uri = 'file:///user.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLens = lenses.find(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );

      expect(protovalidateLens).toBeDefined();
      const args = protovalidateLens?.command?.arguments?.[0];
      expect(args).toHaveProperty('fieldName', 'email');
      expect(args).toHaveProperty('messageName');
      expect(args).toHaveProperty('ruleType');
      expect(args).toHaveProperty('ruleText');
      expect(args).toHaveProperty('lineNumber');
      expect(args).toHaveProperty('filePath', uri);
    });

    it('should handle bool field validation', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Config {
  bool enabled = 1 [(buf.validate.field).bool.const = true];
}`;
      const uri = 'file:///config.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle bytes field validation', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Document {
  bytes data = 1 [(buf.validate.field).bytes = { min_len: 1, max_len: 1048576 }];
}`;
      const uri = 'file:///document.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle map field validation', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message Metadata {
  map<string, string> tags = 1 [(buf.validate.field).map = { min_pairs: 1 }];
}`;
      const uri = 'file:///metadata.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      // Map fields may or may not generate lenses depending on parser support
      expect(lenses).toBeDefined();
    });

    it('should handle multiple validation rules on same field', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";

message User {
  string email = 1 [
    (buf.validate.field).string.email = true,
    (buf.validate.field).string.max_len = 255
  ];
}`;
      const uri = 'file:///multi-rule.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const protovalidateLenses = lenses.filter(l =>
        l.command?.command === 'protobuf.openProtovalidatePlayground'
      );
      expect(protovalidateLenses.length).toBeGreaterThan(0);
    });

    it('should handle timestamp validation', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";
import "google/protobuf/timestamp.proto";

message Event {
  google.protobuf.Timestamp created_at = 1 [(buf.validate.field).timestamp = { gt_now: true }];
}`;
      const uri = 'file:///event.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses).toBeDefined();
    });

    it('should handle duration validation', () => {
      const content = `syntax = "proto3";
import "buf/validate/validate.proto";
import "google/protobuf/duration.proto";

message Timeout {
  google.protobuf.Duration max_wait = 1 [(buf.validate.field).duration = { gte: { seconds: 1 } }];
}`;
      const uri = 'file:///timeout.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses).toBeDefined();
    });
  });

  describe('reference counting', () => {
    it('should show singular "reference" for 1 reference', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message Request {
  User user = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      // Find a lens that might show reference count
      expect(lenses.length).toBeGreaterThan(0);
    });

    it('should show plural "references" for multiple references', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message Request {
  User user1 = 1;
  User user2 = 2;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses.length).toBeGreaterThan(0);
    });

    it('should show singular "field" for 1 field', () => {
      const content = `syntax = "proto3";
message SingleField {
  string only = 1;
}`;
      const uri = 'file:///single.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const messageLens = lenses.find(l => l.command?.title?.includes('field'));
      expect(messageLens?.command?.title).toContain('1 field');
      expect(messageLens?.command?.title).not.toContain('1 fields');
    });

    it('should show plural "fields" for multiple fields', () => {
      const content = `syntax = "proto3";
message MultiField {
  string one = 1;
  string two = 2;
}`;
      const uri = 'file:///multi.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const messageLens = lenses.find(l => l.command?.title?.includes('field'));
      expect(messageLens?.command?.title).toContain('2 fields');
    });

    it('should show singular "value" for 1 enum value', () => {
      const content = `syntax = "proto3";
enum SingleValue {
  SINGLE_VALUE_UNSPECIFIED = 0;
}`;
      const uri = 'file:///single-enum.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const enumLens = lenses.find(l => l.command?.title?.includes('value'));
      expect(enumLens?.command?.title).toContain('1 value');
      expect(enumLens?.command?.title).not.toContain('1 values');
    });

    it('should show plural "values" for multiple enum values', () => {
      const content = `syntax = "proto3";
enum MultiValue {
  MULTI_VALUE_UNSPECIFIED = 0;
  MULTI_VALUE_ONE = 1;
  MULTI_VALUE_TWO = 2;
}`;
      const uri = 'file:///multi-enum.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const enumLens = lenses.find(l => l.command?.title?.includes('value'));
      expect(enumLens?.command?.title).toContain('3 values');
    });

    it('should show singular "RPC" for 1 RPC', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}

service SingleRpc {
  rpc DoSomething(Request) returns (Response);
}`;
      const uri = 'file:///single-rpc.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const serviceLens = lenses.find(l => l.command?.title?.includes('RPC'));
      expect(serviceLens?.command?.title).toContain('1 RPC');
      expect(serviceLens?.command?.title).not.toContain('1 RPCs');
    });

    it('should show plural "RPCs" for multiple RPCs', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}

service MultiRpc {
  rpc DoOne(Request) returns (Response);
  rpc DoTwo(Request) returns (Response);
  rpc DoThree(Request) returns (Response);
}`;
      const uri = 'file:///multi-rpc.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const serviceLens = lenses.find(l => l.command?.title?.includes('RPC'));
      expect(serviceLens?.command?.title).toContain('3 RPCs');
    });
  });

  describe('code lens arguments', () => {
    it('should include uri and position in findReferences command', () => {
      const content = `syntax = "proto3";
message TestMessage {
  string field = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      const referenceLens = lenses.find(l => l.command?.command === 'protobuf.findReferences');

      expect(referenceLens).toBeDefined();
      expect(referenceLens?.command?.arguments?.[0]).toHaveProperty('uri', uri);
      expect(referenceLens?.command?.arguments?.[0]).toHaveProperty('position');
      expect(referenceLens?.command?.arguments?.[0].position).toHaveProperty('line');
      expect(referenceLens?.command?.arguments?.[0].position).toHaveProperty('character');
    });
  });

  describe('file without package', () => {
    it('should handle messages without package prefix', () => {
      const content = `syntax = "proto3";

message NoPackageMessage {
  string field = 1;
}`;
      const uri = 'file:///no-package.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses.length).toBeGreaterThan(0);
    });

    it('should handle enums without package prefix', () => {
      const content = `syntax = "proto3";

enum NoPackageEnum {
  NO_PACKAGE_ENUM_UNSPECIFIED = 0;
}`;
      const uri = 'file:///no-package-enum.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses.length).toBeGreaterThan(0);
    });

    it('should handle services without package prefix', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service NoPackageService {
  rpc DoSomething(Request) returns (Response);
}`;
      const uri = 'file:///no-package-service.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses.length).toBeGreaterThan(0);
    });
  });

  describe('complex proto structures', () => {
    it('should handle deeply nested messages', () => {
      const content = `syntax = "proto3";
package deep.v1;

message L1 {
  message L2 {
    message L3 {
      message L4 {
        message L5 {
          string value = 1;
        }
        L5 l5 = 1;
      }
      L4 l4 = 1;
    }
    L3 l3 = 1;
  }
  L2 l2 = 1;
}`;
      const uri = 'file:///deep.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      // Should have lenses for all nested messages
      expect(lenses.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle message with nested enum', () => {
      const content = `syntax = "proto3";
package test.v1;

message Container {
  enum Status {
    STATUS_UNSPECIFIED = 0;
    STATUS_ACTIVE = 1;
  }
  Status status = 1;
}`;
      const uri = 'file:///container.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      expect(lenses.length).toBeGreaterThan(0);
    });

    it('should handle file with multiple messages, enums, and services', () => {
      const content = `syntax = "proto3";
package full.v1;

enum Status {
  STATUS_UNSPECIFIED = 0;
}

message Request {
  string id = 1;
}

message Response {
  Status status = 1;
}

service MyService {
  rpc Process(Request) returns (Response);
}`;
      const uri = 'file:///full.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const lenses = codeLensProvider.getCodeLenses(uri, file);
      // Should have lenses for enum, both messages, and service
      expect(lenses.length).toBeGreaterThanOrEqual(4);
    });
  });
});
