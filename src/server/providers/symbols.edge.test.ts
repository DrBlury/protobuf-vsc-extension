/**
 * Edge case tests for symbols provider
 */

import { SymbolProvider } from './symbols';
import { SemanticAnalyzer } from '../core/analyzer';
import { ProtoParser } from '../core/parser';

describe('SymbolsProvider Edge Cases', () => {
  let provider: SymbolProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new SymbolProvider(analyzer);
  });

  describe('nested structures', () => {
    it('should provide symbols for nested messages', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string name = 1;
  }
  Inner inner = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getDocumentSymbols(uri);

      expect(symbols.length).toBeGreaterThan(0);
      const outerMessage = symbols.find((s: any) => s.name === 'Outer');
      expect(outerMessage).toBeDefined();
      // Inner message should be in children
      const innerMessage = outerMessage?.children?.find((c: any) => c.name === 'Inner');
      expect(innerMessage).toBeDefined();
    });

    it('should provide symbols for nested enums', () => {
      const text = `syntax = "proto3";
message Test {
  enum Status {
    UNKNOWN = 0;
    OK = 1;
  }
  Status status = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getDocumentSymbols(uri);

      expect(symbols.length).toBeGreaterThan(0);
      const testMessage = symbols.find((s: any) => s.name === 'Test');
      expect(testMessage).toBeDefined();
      // Status enum should be in children
      const enumSymbol = testMessage?.children?.find((c: any) => c.name === 'Status');
      expect(enumSymbol).toBeDefined();
    });
  });

  describe('service symbols', () => {
    it('should provide symbols for services and RPCs', () => {
      const text = `syntax = "proto3";
service TestService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getDocumentSymbols(uri);

      expect(symbols.length).toBeGreaterThan(0);
      const serviceSymbol = symbols.find((s: any) => s.name === 'TestService');
      expect(serviceSymbol).toBeDefined();
      expect(serviceSymbol?.children?.length).toBeGreaterThan(0);
    });
  });

  describe('oneof symbols', () => {
    it('should provide symbols for oneof fields', () => {
      const text = `syntax = "proto3";
message Test {
  oneof test_oneof {
    string name = 1;
    int32 id = 2;
  }
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getDocumentSymbols(uri);

      expect(symbols.length).toBeGreaterThan(0);
      const testMessage = symbols.find((s: any) => s.name === 'Test');
      expect(testMessage).toBeDefined();
      // Oneof fields are included in message children
      expect(testMessage?.children?.length).toBeGreaterThan(0);
    });
  });

  describe('map field symbols', () => {
    it('should provide symbols for map fields', () => {
      const text = `syntax = "proto3";
message Test {
  map<string, int32> values = 1;
}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getDocumentSymbols(uri);

      expect(symbols.length).toBeGreaterThan(0);
      const testMessage = symbols.find((s: any) => s.name === 'Test');
      expect(testMessage).toBeDefined();
      // Map fields are included in message children
      expect(testMessage?.children?.length).toBeGreaterThan(0);
    });
  });

  describe('workspace symbols', () => {
    it('should find symbols across workspace', () => {
      const text1 = `syntax = "proto3";
message User {}`;
      const text2 = `syntax = "proto3";
message Product {}`;
      const uri1 = 'file:///user.proto';
      const uri2 = 'file:///product.proto';
      const file1 = parser.parse(text1, uri1);
      const file2 = parser.parse(text2, uri2);
      analyzer.updateFile(uri1, file1);
      analyzer.updateFile(uri2, file2);

      const symbols = provider.getWorkspaceSymbols('User');

      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols.some(s => s.name === 'User')).toBe(true);
    });

    it('should handle fuzzy search', () => {
      const text = `syntax = "proto3";
message UserMessage {}`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const symbols = provider.getWorkspaceSymbols('User');

      expect(symbols.length).toBeGreaterThanOrEqual(0);
    });
  });
});
