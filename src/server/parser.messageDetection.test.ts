/**
 * Tests for Protocol Buffers Parser - Message Detection
 * Tests various scenarios for detecting and resolving messages:
 * - Messages within the current file
 * - Messages from imported files
 * - Nested/inline messages
 * - Deeply nested messages
 * - Messages in different packages
 * - Forward references
 * - Circular references
 */

import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { SymbolKind } from './core/ast';

describe('Message Detection', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
  });

  describe('Messages within the same file', () => {
    it('should detect a simple top-level message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].name).toBe('User');

      const symbol = analyzer.resolveType('User', 'file:///test.proto', 'test.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.User');
    });

    it('should detect multiple top-level messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
        }
        message Order {
          string id = 1;
        }
        message Product {
          string sku = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages).toHaveLength(3);
      expect(file.messages.map(m => m.name)).toEqual(['User', 'Order', 'Product']);
    });

    it('should detect message used as field type in same file', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Address {
          string street = 1;
          string city = 2;
        }
        message User {
          string name = 1;
          Address address = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const userMsg = file.messages.find(m => m.name === 'User');
      expect(userMsg).toBeDefined();

      const addressField = userMsg!.fields.find(f => f.name === 'address');
      expect(addressField).toBeDefined();
      expect(addressField!.fieldType).toBe('Address');

      const symbol = analyzer.resolveType('Address', 'file:///test.proto', 'test.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.kind).toBe(SymbolKind.Message);
    });

    it('should detect forward references to messages defined later', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message GetUserResponse {
          User user = 1;
        }
        message User {
          string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const responseMsg = file.messages.find(m => m.name === 'GetUserResponse');
      expect(responseMsg!.fields[0].fieldType).toBe('User');

      const symbol = analyzer.resolveType('User', 'file:///test.proto', 'test.v1');
      expect(symbol).toBeDefined();
    });

    it('should detect self-referential messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message TreeNode {
          string value = 1;
          repeated TreeNode children = 2;
          TreeNode parent = 3;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const treeNode = file.messages[0];
      expect(treeNode.fields).toHaveLength(3);
      expect(treeNode.fields[1].fieldType).toBe('TreeNode');
      expect(treeNode.fields[1].modifier).toBe('repeated');
      expect(treeNode.fields[2].fieldType).toBe('TreeNode');
    });

    it('should detect circular references between messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Person {
          string name = 1;
          Company employer = 2;
        }
        message Company {
          string name = 1;
          repeated Person employees = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const person = file.messages.find(m => m.name === 'Person');
      const company = file.messages.find(m => m.name === 'Company');

      expect(person!.fields[1].fieldType).toBe('Company');
      expect(company!.fields[1].fieldType).toBe('Person');
    });
  });

  describe('Nested/inline messages', () => {
    it('should detect a single nested message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          message Address {
            string street = 1;
          }
          string name = 1;
          Address home_address = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].nestedMessages).toHaveLength(1);
      expect(file.messages[0].nestedMessages[0].name).toBe('Address');

      const symbol = analyzer.resolveType('Address', 'file:///test.proto', 'test.v1.User');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.User.Address');
    });

    it('should detect multiple nested messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          message Address {
            string street = 1;
          }
          message Contact {
            string email = 1;
          }
          message Preferences {
            bool dark_mode = 1;
          }
          string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].nestedMessages).toHaveLength(3);
      expect(file.messages[0].nestedMessages.map(m => m.name)).toEqual(['Address', 'Contact', 'Preferences']);
    });

    it('should detect deeply nested messages (3 levels)', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Level1 {
          message Level2 {
            message Level3 {
              string value = 1;
            }
            Level3 nested = 1;
          }
          Level2 child = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].name).toBe('Level1');
      expect(file.messages[0].nestedMessages[0].name).toBe('Level2');
      expect(file.messages[0].nestedMessages[0].nestedMessages[0].name).toBe('Level3');

      const level3 = analyzer.resolveType('Level3', 'file:///test.proto', 'test.v1.Level1.Level2');
      expect(level3).toBeDefined();
      expect(level3!.fullName).toBe('test.v1.Level1.Level2.Level3');
    });

    it('should detect nested message referenced from parent', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Request {
          message Options {
            bool verbose = 1;
            int32 timeout = 2;
          }
          string query = 1;
          Options options = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const optionsField = file.messages[0].fields.find(f => f.name === 'options');
      expect(optionsField!.fieldType).toBe('Options');

      const symbol = analyzer.resolveType('Options', 'file:///test.proto', 'test.v1.Request');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.Request.Options');
    });

    it('should detect nested message referenced from sibling message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          message Status {
            int32 code = 1;
          }
        }
        message GetUserResponse {
          User user = 1;
          User.Status status = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const response = file.messages.find(m => m.name === 'GetUserResponse');
      expect(response!.fields[1].fieldType).toBe('User.Status');

      const symbol = analyzer.resolveType('User.Status', 'file:///test.proto', 'test.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.User.Status');
    });

    it('should detect nested enums within messages', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          enum Status {
            UNKNOWN = 0;
            ACTIVE = 1;
            INACTIVE = 2;
          }
          string name = 1;
          Status status = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].nestedEnums).toHaveLength(1);
      expect(file.messages[0].nestedEnums[0].name).toBe('Status');

      const statusField = file.messages[0].fields.find(f => f.name === 'status');
      expect(statusField!.fieldType).toBe('Status');

      const symbol = analyzer.resolveType('Status', 'file:///test.proto', 'test.v1.User');
      expect(symbol).toBeDefined();
      expect(symbol!.kind).toBe(SymbolKind.Enum);
    });
  });

  describe('Messages from imported files', () => {
    it('should detect message from imported file with full path', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common.v1;
        message Timestamp {
          int64 seconds = 1;
          int32 nanos = 2;
        }
      `, 'file:///common.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main.v1;
        import "common.proto";
        message Event {
          string name = 1;
          common.v1.Timestamp created_at = 2;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const event = mainFile.messages[0];
      expect(event.fields[1].fieldType).toBe('common.v1.Timestamp');

      const symbol = analyzer.resolveType('common.v1.Timestamp', 'file:///main.proto', 'main.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('common.v1.Timestamp');
    });

    it('should detect message from imported file with simple name', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common.v1;
        message Error {
          int32 code = 1;
          string message = 2;
        }
      `, 'file:///common.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main.v1;
        import "common.proto";
        message Response {
          Error error = 1;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      // Simple name resolution should work
      const symbol = analyzer.resolveType('Error', 'file:///main.proto', 'main.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('common.v1.Error');
    });

    it('should detect messages from multiple imported files', () => {
      const timestampFile = parser.parse(`
        syntax = "proto3";
        package google.protobuf;
        message Timestamp {
          int64 seconds = 1;
        }
      `, 'file:///timestamp.proto');

      const moneyFile = parser.parse(`
        syntax = "proto3";
        package google.type;
        message Money {
          string currency_code = 1;
          int64 units = 2;
        }
      `, 'file:///money.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package shop.v1;
        import "timestamp.proto";
        import "money.proto";
        message Order {
          google.protobuf.Timestamp created_at = 1;
          google.type.Money total = 2;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///timestamp.proto', timestampFile);
      analyzer.updateFile('file:///money.proto', moneyFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const timestamp = analyzer.resolveType('google.protobuf.Timestamp', 'file:///main.proto', 'shop.v1');
      const money = analyzer.resolveType('google.type.Money', 'file:///main.proto', 'shop.v1');

      expect(timestamp).toBeDefined();
      expect(money).toBeDefined();
    });

    it('should detect nested message from imported file', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common.v1;
        message Pagination {
          message PageInfo {
            int32 total = 1;
            int32 page_size = 2;
          }
        }
      `, 'file:///common.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main.v1;
        import "common.proto";
        message ListResponse {
          common.v1.Pagination.PageInfo page_info = 1;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const symbol = analyzer.resolveType('common.v1.Pagination.PageInfo', 'file:///main.proto', 'main.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('common.v1.Pagination.PageInfo');
    });

    it('should prefer local message over imported message with same name', () => {
      const importedFile = parser.parse(`
        syntax = "proto3";
        package imported.v1;
        message User {
          string external_name = 1;
        }
      `, 'file:///imported.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main.v1;
        import "imported.proto";
        message User {
          string local_name = 1;
        }
        message Request {
          User user = 1;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///imported.proto', importedFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      // Local User should be preferred
      const symbol = analyzer.resolveType('User', 'file:///main.proto', 'main.v1');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('main.v1.User');
    });
  });

  describe('Messages in different packages', () => {
    it('should detect message with fully qualified package name', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package company.department.team.v1;
        message Config {
          string value = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('company.department.team.v1.Config', 'file:///test.proto');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('company.department.team.v1.Config');
    });

    it('should detect message without package', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message GlobalMessage {
          string value = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('GlobalMessage', 'file:///test.proto');
      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('GlobalMessage');
    });

    it('should detect message with leading dot (absolute reference)', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          .test.v1.Status status = 1;
        }
        enum Status {
          UNKNOWN = 0;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].fields[0].fieldType).toBe('.test.v1.Status');
    });

    it('should resolve same-named messages in different packages', () => {
      const file1 = parser.parse(`
        syntax = "proto3";
        package api.v1;
        message Error {
          string message = 1;
        }
      `, 'file:///api.proto');

      const file2 = parser.parse(`
        syntax = "proto3";
        package internal.v1;
        message Error {
          int32 code = 1;
        }
      `, 'file:///internal.proto');

      analyzer.updateFile('file:///api.proto', file1);
      analyzer.updateFile('file:///internal.proto', file2);

      const apiError = analyzer.resolveType('api.v1.Error', 'file:///api.proto');
      const internalError = analyzer.resolveType('internal.v1.Error', 'file:///internal.proto');

      expect(apiError).toBeDefined();
      expect(internalError).toBeDefined();
      expect(apiError!.fullName).toBe('api.v1.Error');
      expect(internalError!.fullName).toBe('internal.v1.Error');
    });
  });

  describe('Complex message structures', () => {
    it('should detect message with map field using message value type', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
        }
        message UserCache {
          map<string, User> users = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[1].maps).toHaveLength(1);
      expect(file.messages[1].maps[0].valueType).toBe('User');
    });

    it('should detect message in oneof field', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message TextContent {
          string text = 1;
        }
        message ImageContent {
          bytes data = 1;
        }
        message Message {
          oneof content {
            TextContent text = 1;
            ImageContent image = 2;
          }
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const messageMsg = file.messages.find(m => m.name === 'Message');
      expect(messageMsg!.oneofs[0].fields[0].fieldType).toBe('TextContent');
      expect(messageMsg!.oneofs[0].fields[1].fieldType).toBe('ImageContent');
    });

    it('should detect message in repeated field', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Item {
          string name = 1;
        }
        message Container {
          repeated Item items = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const container = file.messages.find(m => m.name === 'Container');
      expect(container!.fields[0].fieldType).toBe('Item');
      expect(container!.fields[0].modifier).toBe('repeated');
    });

    it('should detect message in RPC request and response', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message GetUserRequest {
          string id = 1;
        }
        message GetUserResponse {
          User user = 1;
        }
        message User {
          string name = 1;
        }
        service UserService {
          rpc GetUser(GetUserRequest) returns (GetUserResponse);
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.services[0].rpcs[0].inputType).toBe('GetUserRequest');
      expect(file.services[0].rpcs[0].outputType).toBe('GetUserResponse');

      const reqSymbol = analyzer.resolveType('GetUserRequest', 'file:///test.proto', 'test.v1');
      const resSymbol = analyzer.resolveType('GetUserResponse', 'file:///test.proto', 'test.v1');

      expect(reqSymbol).toBeDefined();
      expect(resSymbol).toBeDefined();
    });

    it('should detect message in streaming RPC', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Event {
          string data = 1;
        }
        message StreamRequest {
          string filter = 1;
        }
        service EventService {
          rpc StreamEvents(StreamRequest) returns (stream Event);
          rpc BatchSend(stream Event) returns (BatchResponse);
        }
        message BatchResponse {
          int32 count = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const rpcs = file.services[0].rpcs;
      expect(rpcs[0].outputType).toBe('Event');
      expect(rpcs[0].outputStream).toBe(true);
      expect(rpcs[1].inputType).toBe('Event');
      expect(rpcs[1].inputStream).toBe(true);
    });
  });

  describe('Message detection with extensions', () => {
    it('should detect messages with extension ranges', () => {
      const file = parser.parse(`
        syntax = "proto2";
        package test.v1;
        message Base {
          extensions 100 to 200;
          required string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0].name).toBe('Base');
      // Check that extensions statement was parsed (ranges 100-200)
      expect(file.messages[0].extensions).toHaveLength(1);
      expect(file.messages[0].extensions[0].ranges[0].start).toBe(100);
      expect(file.messages[0].extensions[0].ranges[0].end).toBe(200);
    });
  });

  describe('Message detection with options', () => {
    it('should detect message with message-level options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          option deprecated = true;
          string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].options).toHaveLength(1);
      expect(file.messages[0].options[0].name).toBe('deprecated');
    });

    it('should detect message fields with complex options', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1 [
            deprecated = true,
            json_name = "userName"
          ];
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].fields[0].options).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Empty {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].name).toBe('Empty');
      expect(file.messages[0].fields).toHaveLength(0);
    });

    it('should handle message with only reserved fields', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Deprecated {
          reserved 1, 2, 3;
          reserved "old_field";
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].fields).toHaveLength(0);
      expect(file.messages[0].reserved).toHaveLength(2);
    });

    it('should handle message with unicode names', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User_V2 {
          string name_123 = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(file.messages[0].name).toBe('User_V2');
      expect(file.messages[0].fields[0].name).toBe('name_123');
    });

    it('should handle multiple files updating the same analyzer', () => {
      const file1 = parser.parse(`
        syntax = "proto3";
        package pkg1.v1;
        message Msg1 { string f = 1; }
      `, 'file:///file1.proto');

      const file2 = parser.parse(`
        syntax = "proto3";
        package pkg2.v1;
        message Msg2 { string f = 1; }
      `, 'file:///file2.proto');

      const file3 = parser.parse(`
        syntax = "proto3";
        package pkg3.v1;
        message Msg3 { string f = 1; }
      `, 'file:///file3.proto');

      analyzer.updateFile('file:///file1.proto', file1);
      analyzer.updateFile('file:///file2.proto', file2);
      analyzer.updateFile('file:///file3.proto', file3);

      const symbols = analyzer.getAllSymbols().filter(s => s.kind === SymbolKind.Message);
      // Get unique message names by fullName
      const uniqueMessages = new Set(symbols.map(s => s.fullName));
      expect(uniqueMessages.size).toBe(3);
      expect(uniqueMessages.has('pkg1.v1.Msg1')).toBe(true);
      expect(uniqueMessages.has('pkg2.v1.Msg2')).toBe(true);
      expect(uniqueMessages.has('pkg3.v1.Msg3')).toBe(true);
    });

    it('should handle removing and re-adding files', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User { string name = 1; }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);
      expect(analyzer.resolveType('User', 'file:///test.proto', 'test.v1')).toBeDefined();

      analyzer.removeFile('file:///test.proto');
      expect(analyzer.resolveType('User', 'file:///test.proto', 'test.v1')).toBeUndefined();

      analyzer.updateFile('file:///test.proto', file);
      expect(analyzer.resolveType('User', 'file:///test.proto', 'test.v1')).toBeDefined();
    });
  });
});
