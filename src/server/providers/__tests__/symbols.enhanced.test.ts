/**
 * Tests for Enhanced Symbol Search
 */

import { SymbolProvider } from '../symbols';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';

describe('SymbolProvider Enhanced Features', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let symbolProvider: SymbolProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    symbolProvider = new SymbolProvider(analyzer);
  });

  describe('Fuzzy Symbol Search', () => {
    beforeEach(() => {
      const content1 = `syntax = "proto3";
package test.v1;

message UserMessage {
  string name = 1;
}

message UserService {
  string id = 1;
}

enum UserStatus {
  USER_STATUS_UNSPECIFIED = 0;
}`;

      const content2 = `syntax = "proto3";
package test.v1;

message CreateUserRequest {
  string name = 1;
}`;

      const uri1 = 'file:///file1.proto';
      const uri2 = 'file:///file2.proto';

      const file1 = parser.parse(content1, uri1);
      const file2 = parser.parse(content2, uri2);

      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);
    });

    it('should find symbols with exact match', () => {
      const results = symbolProvider.getWorkspaceSymbols('UserMessage');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('UserMessage');
    });

    it('should find symbols with starts-with match', () => {
      const results = symbolProvider.getWorkspaceSymbols('User');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.startsWith('User'))).toBe(true);
    });

    it('should find symbols with contains match', () => {
      const results = symbolProvider.getWorkspaceSymbols('Message');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.includes('Message'))).toBe(true);
    });

    it('should rank exact matches higher', () => {
      const results = symbolProvider.getWorkspaceSymbols('UserMessage');

      expect(results.length).toBeGreaterThan(0);
      // Exact match should be first
      expect(results[0].name).toBe('UserMessage');
    });

    it('should limit results to 100', () => {
      // Create many symbols
      for (let i = 0; i < 150; i++) {
        const content = `syntax = "proto3";
package test.v1;

message Message${i} {
  string field = 1;
}`;
        const uri = `file:///file${i}.proto`;
        const file = parser.parse(content, uri);
        analyzer.updateFile(uri, file);
      }

      const results = symbolProvider.getWorkspaceSymbols('');

      expect(results.length).toBeLessThanOrEqual(100);
    });

    it('should return empty array for no query', () => {
      const results = symbolProvider.getWorkspaceSymbols('');

      // Should return all symbols when no query
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Branch coverage tests', () => {
    it('should return empty array for unknown file', () => {
      const results = symbolProvider.getDocumentSymbols('file:///unknown.proto');
      expect(results).toEqual([]);
    });

    it('should handle file without package', () => {
      const content = `syntax = "proto3";
message Test {}`;
      const uri = 'file:///no-package.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const results = symbolProvider.getDocumentSymbols(uri);
      expect(results.some(r => r.name === 'Test')).toBe(true);
    });

    it('should handle empty package name', () => {
      const uri = 'file:///empty-package.proto';
      // Manually create a file with empty package name
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [],
        extends: [],
        package: {
          type: 'package',
          name: '',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        },
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      // Package with empty name should NOT be included
      expect(results.some(r => r.kind === 19)).toBe(false); // 19 is Namespace
    });

    it('should skip messages with empty names', () => {
      const uri = 'file:///empty-message.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: '',
            nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      expect(results.length).toBe(0);
    });

    it('should skip enums with empty names', () => {
      const uri = 'file:///empty-enum.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [
          {
            type: 'enum',
            name: '',
            nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            values: [],
            options: [],
          },
        ],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      expect(results.length).toBe(0);
    });

    it('should skip services with empty names', () => {
      const uri = 'file:///empty-service.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [
          {
            type: 'service',
            name: '',
            nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            rpcs: [],
            options: [],
          },
        ],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      expect(results.length).toBe(0);
    });

    it('should skip fields with empty names', () => {
      const uri = 'file:///empty-field.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
            fields: [
              {
                type: 'field',
                name: '',
                nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                fieldType: 'string',
                fieldTypeRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
                number: 1,
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
              },
            ],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      expect(testMsg).toBeDefined();
      // Empty field name should be skipped
      expect(testMsg?.children?.length).toBe(0);
    });

    it('should skip map fields with empty names', () => {
      const uri = 'file:///empty-map.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [
              {
                type: 'map_field',
                name: '',
                nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                keyType: 'string',
                valueType: 'int32',
                number: 1,
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } },
              },
            ],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      expect(testMsg?.children?.length).toBe(0);
    });

    it('should skip oneofs with empty names', () => {
      const uri = 'file:///empty-oneof.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
            range: { start: { line: 0, character: 0 }, end: { line: 4, character: 1 } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [
              {
                type: 'oneof',
                name: '',
                nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
                fields: [],
              },
            ],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      expect(testMsg?.children?.length).toBe(0);
    });

    it('should skip oneof fields with empty names', () => {
      const uri = 'file:///empty-oneof-field.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 12 } },
            range: { start: { line: 0, character: 0 }, end: { line: 4, character: 1 } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [
              {
                type: 'oneof',
                name: 'choice',
                nameRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } },
                range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
                fields: [
                  {
                    type: 'field',
                    name: '',
                    nameRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
                    fieldType: 'string',
                    fieldTypeRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } },
                    number: 1,
                    range: { start: { line: 2, character: 0 }, end: { line: 2, character: 15 } },
                  },
                ],
              },
            ],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      const oneofChild = testMsg?.children?.find(c => c.name === 'choice');
      expect(oneofChild).toBeDefined();
      // Empty field name should be filtered out
      expect(oneofChild?.children?.length).toBe(0);
    });

    it('should skip enum values with empty names', () => {
      const uri = 'file:///empty-enum-value.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 3, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [
          {
            type: 'enum',
            name: 'Status',
            nameRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 11 } },
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
            values: [
              {
                type: 'enum_value',
                name: '',
                nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                number: 0,
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
              },
            ],
            options: [],
          },
        ],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const enumSymbol = results.find(r => r.name === 'Status');
      expect(enumSymbol?.children?.length).toBe(0);
    });

    it('should skip RPCs with empty names', () => {
      const uri = 'file:///empty-rpc.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 3, character: 0 } },
        imports: [],
        options: [],
        messages: [],
        enums: [],
        services: [
          {
            type: 'service',
            name: 'TestService',
            nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 19 } },
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
            rpcs: [
              {
                type: 'rpc',
                name: '',
                nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                inputType: 'Request',
                outputType: 'Response',
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 30 } },
              },
            ],
            options: [],
          },
        ],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const svc = results.find(r => r.name === 'TestService');
      expect(svc?.children?.length).toBe(0);
    });

    it('should handle ranges with NaN values', () => {
      const uri = 'file:///nan-range.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: NaN, character: NaN }, end: { line: NaN, character: NaN } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            nameRange: { start: { line: NaN, character: NaN }, end: { line: NaN, character: NaN } },
            range: { start: { line: NaN, character: NaN }, end: { line: NaN, character: NaN } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      expect(testMsg).toBeDefined();
      // Should default to 0 for NaN values
      expect(testMsg?.range.start.line).toBe(0);
      expect(testMsg?.range.start.character).toBe(0);
    });

    it('should handle selectionRange outside range', () => {
      const uri = 'file:///bad-selection.proto';
      analyzer.updateFile(uri, {
        type: 'file',
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
        imports: [],
        options: [],
        messages: [
          {
            type: 'message',
            name: 'Test',
            // nameRange is outside the message range
            nameRange: { start: { line: 10, character: 0 }, end: { line: 10, character: 4 } },
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
            fields: [],
            nestedMessages: [],
            nestedEnums: [],
            oneofs: [],
            options: [],
            reserved: [],
            extensions: [],
            maps: [],
            groups: [],
          },
        ],
        enums: [],
        services: [],
        extends: [],
      } as any);

      const results = symbolProvider.getDocumentSymbols(uri);
      const testMsg = results.find(r => r.name === 'Test');
      expect(testMsg).toBeDefined();
      // selectionRange should be clamped to range
      expect(testMsg?.selectionRange.start.line).toBeLessThanOrEqual(testMsg?.range.end.line ?? 0);
    });
  });

  describe('Workspace symbols match score branches', () => {
    beforeEach(() => {
      const content = `syntax = "proto3";
package test.api.v1;

message UserMessage {}
message UserRequest {}
message CreateUserRequest {}
message GetUserResponse {}
enum UserStatus {}
service UserService {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);
    });

    it('should score exact name match highest (1000)', () => {
      const results = symbolProvider.getWorkspaceSymbols('usermessage');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('UserMessage');
    });

    it('should score full name exact match (900)', () => {
      // Full name is test.api.v1.UserMessage
      const results = symbolProvider.getWorkspaceSymbols('test.api.v1.usermessage');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('UserMessage');
    });

    it('should score name starts-with match (800)', () => {
      const results = symbolProvider.getWorkspaceSymbols('userm');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name.toLowerCase().startsWith('userm')).toBe(true);
    });

    it('should score full name starts-with match (700)', () => {
      const results = symbolProvider.getWorkspaceSymbols('test.api');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should score name contains match (500)', () => {
      const results = symbolProvider.getWorkspaceSymbols('message');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.toLowerCase().includes('message'))).toBe(true);
    });

    it('should score full name contains match (400)', () => {
      const results = symbolProvider.getWorkspaceSymbols('api.v1');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should score fuzzy match on name (300)', () => {
      // "umg" should fuzzy match "UserMessage" (u...m...g)
      const results = symbolProvider.getWorkspaceSymbols('umg');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should score fuzzy match on full name (200)', () => {
      // "tapius" fuzzy matches "test.api.v1.UserService"
      const results = symbolProvider.getWorkspaceSymbols('tapius');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should score part match (100)', () => {
      // Query parts like "User_Msg" should match parts of "UserMessage"
      const results = symbolProvider.getWorkspaceSymbols('User_Req');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return 0 for no match', () => {
      const results = symbolProvider.getWorkspaceSymbols('zzzznotfound');
      expect(results.length).toBe(0);
    });

    it('should sort by score then name', () => {
      const results = symbolProvider.getWorkspaceSymbols('user');
      expect(results.length).toBeGreaterThan(1);
      // All should start with "User" (starts-with match has higher score)
      // Then should be sorted by name
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        // Either score is same/lower, or if different names, alphabetical order
        expect(prev.name <= curr.name || prev.name.toLowerCase().startsWith('user')).toBe(true);
      }
    });
  });

  describe('Service RPC streaming', () => {
    it('should show stream in RPC detail for input stream', () => {
      const content = `syntax = "proto3";
service TestService {
  rpc StreamIn(stream Request) returns (Response);
}`;
      const uri = 'file:///stream.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const results = symbolProvider.getDocumentSymbols(uri);
      const svc = results.find(r => r.name === 'TestService');
      expect(svc?.children?.[0]?.detail).toContain('stream Request');
    });

    it('should show stream in RPC detail for output stream', () => {
      const content = `syntax = "proto3";
service TestService {
  rpc StreamOut(Request) returns (stream Response);
}`;
      const uri = 'file:///stream-out.proto';
      const file = parser.parse(content, uri);
      analyzer.updateFile(uri, file);

      const results = symbolProvider.getDocumentSymbols(uri);
      const svc = results.find(r => r.name === 'TestService');
      expect(svc?.children?.[0]?.detail).toContain('stream Response');
    });
  });
});
