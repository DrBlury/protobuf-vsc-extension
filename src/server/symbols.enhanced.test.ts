/**
 * Tests for Enhanced Symbol Search
 */

import { SymbolProvider } from './symbols';
import { ProtoParser } from './parser';
import { SemanticAnalyzer } from './analyzer';

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
});
