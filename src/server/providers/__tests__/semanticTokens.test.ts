/**
 * Tests for Semantic Tokens Provider
 */

import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { SemanticTokensProvider, tokenTypes, tokenModifiers, semanticTokensLegend } from '../semanticTokens';

describe('SemanticTokensProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: SemanticTokensProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new SemanticTokensProvider(analyzer);
  });

  describe('token type exports', () => {
    it('should export tokenTypes array', () => {
      expect(tokenTypes).toBeDefined();
      expect(Array.isArray(tokenTypes)).toBe(true);
      expect(tokenTypes.length).toBeGreaterThan(0);
    });

    it('should export tokenModifiers array', () => {
      expect(tokenModifiers).toBeDefined();
      expect(Array.isArray(tokenModifiers)).toBe(true);
      expect(tokenModifiers.length).toBeGreaterThan(0);
    });

    it('should export semanticTokensLegend', () => {
      expect(semanticTokensLegend).toBeDefined();
      expect(semanticTokensLegend.tokenTypes).toBe(tokenTypes);
      expect(semanticTokensLegend.tokenModifiers).toBe(tokenModifiers);
    });
  });

  describe('getSemanticTokens', () => {
    it('should return empty data for unknown file', () => {
      const result = provider.getSemanticTokens('file:///unknown.proto', '', 'hybrid');
      expect(result.data).toEqual([]);
    });

    it('should process syntax statement in semantic mode', () => {
      const content = `syntax = "proto3";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process edition statement', () => {
      const content = `edition = "2023";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should process package statement', () => {
      const content = `syntax = "proto3";
package test.v1;`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process import statements', () => {
      const content = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
import public "other.proto";
import weak "weak.proto";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process message definitions', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
  int32 age = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process message definitions in semantic mode', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process nested messages', () => {
      const content = `syntax = "proto3";
message Outer {
  message Inner {
    string value = 1;
  }
  Inner inner = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process fields with modifiers', () => {
      const content = `syntax = "proto3";
message User {
  optional string name = 1;
  repeated string tags = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process enum definitions', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
  INACTIVE = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process enum definitions in semantic mode', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process nested enums', () => {
      const content = `syntax = "proto3";
message User {
  enum Status {
    UNKNOWN = 0;
    ACTIVE = 1;
  }
  Status status = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process service definitions', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service UserService {
  rpc GetUser(Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process service definitions in semantic mode', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service UserService {
  rpc GetUser(Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process streaming RPCs', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service StreamService {
  rpc ClientStream(stream Request) returns (Response);
  rpc ServerStream(Request) returns (stream Response);
  rpc BidiStream(stream Request) returns (stream Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process options', () => {
      const content = `syntax = "proto3";
option java_package = "com.example";
option go_package = "example.com/pb";

message User {
  option deprecated = true;
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process numeric option values', () => {
      const content = `syntax = "proto3";
message Test {
  option max_count = 100;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should process boolean option values', () => {
      const content = `syntax = "proto3";
message Test {
  option deprecated = true;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should process map fields', () => {
      const content = `syntax = "proto3";
message User {
  map<string, string> metadata = 1;
  map<int32, User> users = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process map fields in semantic mode', () => {
      const content = `syntax = "proto3";
message User {
  map<string, string> metadata = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process oneof fields', () => {
      const content = `syntax = "proto3";
message User {
  oneof contact {
    string email = 1;
    string phone = 2;
  }
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process oneof fields in semantic mode', () => {
      const content = `syntax = "proto3";
message User {
  oneof contact {
    string email = 1;
  }
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process well-known types', () => {
      const content = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
import "google/protobuf/any.proto";

message User {
  google.protobuf.Timestamp created = 1;
  google.protobuf.Any data = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process simple well-known type names', () => {
      const content = `syntax = "proto3";
message User {
  Timestamp created = 1;
  Duration timeout = 2;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should process scalar types', () => {
      const content = `syntax = "proto3";
message AllTypes {
  double d = 1;
  float f = 2;
  int32 i32 = 3;
  int64 i64 = 4;
  uint32 u32 = 5;
  uint64 u64 = 6;
  sint32 s32 = 7;
  sint64 s64 = 8;
  fixed32 fx32 = 9;
  fixed64 fx64 = 10;
  sfixed32 sfx32 = 11;
  sfixed64 sfx64 = 12;
  bool b = 13;
  string s = 14;
  bytes by = 15;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should use hybrid mode by default', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle empty message', () => {
      const content = `syntax = "proto3";
message Empty {
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle enum with options', () => {
      const content = `syntax = "proto3";
enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
  ACTIVE = 1;
  RUNNING = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle service with options', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service TestService {
  option deprecated = true;
  rpc Test(Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle RPC with options', () => {
      const content = `syntax = "proto3";

message Request {}
message Response {}

service TestService {
  rpc Test(Request) returns (Response) {
    option deprecated = true;
  }
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle message where line does not exist', () => {
      // Create a parsed file but provide content with fewer lines
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Provide truncated content
      const truncatedContent = `syntax = "proto3";`;
      const result = provider.getSemanticTokens('file:///test.proto', truncatedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle field where line does not exist', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Provide content with only the first line
      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle enum where line does not exist', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const truncatedContent = `syntax = "proto3";`;
      const result = provider.getSemanticTokens('file:///test.proto', truncatedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle enum value where line does not exist', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Only syntax line exists
      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle service where line does not exist', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}
service UserService {
  rpc Get(Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle RPC where line does not exist', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}
service UserService {
  rpc Get(Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const truncatedContent = `syntax = "proto3";
message Request {}`;
      const result = provider.getSemanticTokens('file:///test.proto', truncatedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle oneof where line does not exist', () => {
      const content = `syntax = "proto3";
message User {
  oneof contact {
    string email = 1;
  }
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle map field where line does not exist', () => {
      const content = `syntax = "proto3";
message User {
  map<string, string> meta = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle option where line does not exist', () => {
      const content = `syntax = "proto3";
option java_package = "com.example";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle import with single quotes', () => {
      const content = `syntax = "proto3";
import 'other.proto';`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle package without package keyword in line', () => {
      const content = `syntax = "proto3";
package test;`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Modify content so 'package' keyword is not found on the package line
      const modifiedContent = `syntax = "proto3";
         test;`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should process message name when keyword not found', () => {
      const content = `syntax = "proto3";
message User {}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content where 'message' keyword is missing but message name exists
      const modifiedContent = `syntax = "proto3";
User {}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle field number not found after equals', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content where '=' is on a different line
      const modifiedContent = `syntax = "proto3";
message User {
  string name;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle request streaming where returns keyword found before stream', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}
service Svc {
  rpc Call(stream Request) returns (Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle response streaming where returns keyword not found', () => {
      const content = `syntax = "proto3";
message Request {}
message Response {}
service Svc {
  rpc Call(Request) returns (stream Response);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without 'returns' keyword
      const modifiedContent = `syntax = "proto3";
message Request {}
message Response {}
service Svc {
  rpc Call(Request) (stream Response);
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle map field with valueStart not found', () => {
      const content = `syntax = "proto3";
message User {
  map<string, int32> vals = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without comma
      const modifiedContent = `syntax = "proto3";
message User {
  map<string int32> vals = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle map field name not found after bracket', () => {
      const content = `syntax = "proto3";
message User {
  map<string, int32> vals = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without closing bracket
      const modifiedContent = `syntax = "proto3";
message User {
  map<string, int32 vals = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle enum value number when equals not found', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without '='
      const modifiedContent = `syntax = "proto3";
enum Status {
  UNKNOWN;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle service name when keyword not found', () => {
      const content = `syntax = "proto3";
message Request {}
service Svc {
  rpc Call(Request) returns (Request);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without 'service' keyword
      const modifiedContent = `syntax = "proto3";
message Request {}
Svc {
  rpc Call(Request) returns (Request);
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle RPC name when keyword not found', () => {
      const content = `syntax = "proto3";
message Request {}
service Svc {
  rpc Call(Request) returns (Request);
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without 'rpc' keyword
      const modifiedContent = `syntax = "proto3";
message Request {}
service Svc {
  Call(Request) returns (Request);
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle enum name when keyword not found', () => {
      const content = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without 'enum' keyword
      const modifiedContent = `syntax = "proto3";
Status {
  UNKNOWN = 0;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle oneof name when keyword not found', () => {
      const content = `syntax = "proto3";
message User {
  oneof contact {
    string email = 1;
  }
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without 'oneof' keyword
      const modifiedContent = `syntax = "proto3";
message User {
  contact {
    string email = 1;
  }
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle field without type', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without field type - just name
      const modifiedContent = `syntax = "proto3";
message User {
  name = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle option value not found on line', () => {
      const content = `syntax = "proto3";
option java_package = "com.example";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without the value
      const modifiedContent = `syntax = "proto3";
option java_package = ;`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle option with null value', () => {
      const content = `syntax = "proto3";
option test = null;`;
      const file = parser.parse(content, 'file:///test.proto');
      // Manually set option value to null
      if (file.options && file.options.length > 0) {
        (file.options[0] as any).value = null;
      }
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle syntax statement without version', () => {
      const content = `syntax = "proto3";`;
      const file = parser.parse(content, 'file:///test.proto');
      // Manually clear version
      if (file.syntax) {
        (file.syntax as any).version = '';
      }
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle edition statement without edition value', () => {
      const content = `edition = "2023";`;
      const file = parser.parse(content, 'file:///test.proto');
      // Manually clear edition
      if (file.edition) {
        (file.edition as any).edition = '';
      }
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle package line not found', () => {
      const content = `syntax = "proto3";
package test;`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content with only syntax line
      const modifiedContent = `syntax = "proto3";`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle keyword token where line not found', () => {
      const content = `syntax = "proto3";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Empty content
      const result = provider.getSemanticTokens('file:///test.proto', '', 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle string token where line not found', () => {
      const content = `syntax = "proto3";
import "other.proto";`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', `syntax = "proto3";`, 'semantic');
      expect(result).toBeDefined();
    });

    it('should handle map field keyStart not found', () => {
      const content = `syntax = "proto3";
message User {
  map<string, int32> vals = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without '<' bracket
      const modifiedContent = `syntax = "proto3";
message User {
  map string, int32> vals = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle negative startChar in pushToken', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content that causes name not to be found
      const modifiedContent = `syntax = "proto3";
message User {
  string = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });

    it('should handle findTypeStart with no modifier matches', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const result = provider.getSemanticTokens('file:///test.proto', content, 'hybrid');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle findFieldNameStart when type not found', () => {
      const content = `syntax = "proto3";
message User {
  MyType name = 1;
}`;
      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Content without the type
      const modifiedContent = `syntax = "proto3";
message User {
  name = 1;
}`;
      const result = provider.getSemanticTokens('file:///test.proto', modifiedContent, 'hybrid');
      expect(result).toBeDefined();
    });
  });
});
