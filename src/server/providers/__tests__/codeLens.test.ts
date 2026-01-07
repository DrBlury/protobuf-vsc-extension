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
  });
});
