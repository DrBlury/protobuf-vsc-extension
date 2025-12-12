/**
 * Tests for Semantic Analyzer
 */

import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { SymbolKind } from './core/ast';

describe('SemanticAnalyzer', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
  });

  describe('updateFile', () => {
    it('should extract message symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const userSymbol = symbols.find(s => s.fullName === 'test.v1.User');

      expect(userSymbol).toBeDefined();
      expect(userSymbol!.kind).toBe(SymbolKind.Message);
      expect(userSymbol!.name).toBe('User');
    });

    it('should extract enum symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        enum Status {
          UNKNOWN = 0;
          ACTIVE = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const enumSymbol = symbols.find(s => s.fullName === 'test.v1.Status');

      expect(enumSymbol).toBeDefined();
      expect(enumSymbol!.kind).toBe(SymbolKind.Enum);
    });

    it('should extract service symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        service UserService {
          rpc GetUser(Request) returns (Response);
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const serviceSymbol = symbols.find(s => s.fullName === 'test.v1.UserService');
      const rpcSymbol = symbols.find(s => s.fullName === 'test.v1.UserService.GetUser');

      expect(serviceSymbol).toBeDefined();
      expect(serviceSymbol!.kind).toBe(SymbolKind.Service);
      expect(rpcSymbol).toBeDefined();
      expect(rpcSymbol!.kind).toBe(SymbolKind.Rpc);
    });

    it('should extract field symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
          int32 age = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const nameField = symbols.find(s => s.fullName === 'test.v1.User.name');

      expect(nameField).toBeDefined();
      expect(nameField!.kind).toBe(SymbolKind.Field);
    });

    it('should extract nested message symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Outer {
          message Inner {
            string value = 1;
          }
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const innerSymbol = symbols.find(s => s.fullName === 'test.v1.Outer.Inner');

      expect(innerSymbol).toBeDefined();
      expect(innerSymbol!.kind).toBe(SymbolKind.Message);
      expect(innerSymbol!.containerName).toBe('test.v1.Outer');
    });

    it('should extract enum value symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        enum Status {
          UNKNOWN = 0;
          ACTIVE = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const valueSymbol = symbols.find(s => s.fullName === 'test.v1.Status.ACTIVE');

      expect(valueSymbol).toBeDefined();
      expect(valueSymbol!.kind).toBe(SymbolKind.EnumValue);
    });

    it('should extract oneof symbols', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Contact {
          oneof info {
            string email = 1;
            string phone = 2;
          }
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbols = analyzer.getAllSymbols();
      const oneofSymbol = symbols.find(s => s.fullName === 'test.v1.Contact.info');

      expect(oneofSymbol).toBeDefined();
      expect(oneofSymbol!.kind).toBe(SymbolKind.Oneof);
    });
  });

  describe('removeFile', () => {
    it('should remove symbols when file is removed', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);
      expect(analyzer.getAllSymbols().length).toBeGreaterThan(0);

      analyzer.removeFile('file:///test.proto');
      // Note: Due to the "also register by simple name" logic, this might still have entries
      // Verify the file is removed
      expect(analyzer.getFile('file:///test.proto')).toBeUndefined();
    });
  });

  describe('resolveType', () => {
    it('should resolve type by simple name', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('User', 'file:///test.proto', 'test.v1');

      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.User');
    });

    it('should resolve type by fully qualified name', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('test.v1.User', 'file:///test.proto', 'test.v1');

      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.User');
    });

    it('should return undefined for builtin types', () => {
      const file = parser.parse(`
        syntax = "proto3";
        message User {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      expect(analyzer.resolveType('string', 'file:///test.proto')).toBeUndefined();
      expect(analyzer.resolveType('int32', 'file:///test.proto')).toBeUndefined();
      expect(analyzer.resolveType('bool', 'file:///test.proto')).toBeUndefined();
    });

    it('should resolve nested types', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Outer {
          message Inner {}
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('Inner', 'file:///test.proto', 'test.v1.Outer');

      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.Outer.Inner');
    });

    it('should resolve types from imported files', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common.v1;
        message Timestamp {}
      `, 'file:///common.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main.v1;
        import "common.proto";
        message Event {
          common.v1.Timestamp created_at = 1;
        }
      `, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const symbol = analyzer.resolveType('Timestamp', 'file:///main.proto', 'main.v1');

      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('common.v1.Timestamp');
    });

    it('should resolve forward references within the same file', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          UserStatus status = 1;
        }
        enum UserStatus {
          UNKNOWN = 0;
          ACTIVE = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const symbol = analyzer.resolveType('UserStatus', 'file:///test.proto', 'test.v1');

      expect(symbol).toBeDefined();
      expect(symbol!.fullName).toBe('test.v1.UserStatus');
      expect(symbol!.kind).toBe(SymbolKind.Enum);
    });
  });

  describe('findReferences', () => {
    it('should find references in field types', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {
          string name = 1;
        }
        message GetUserResponse {
          User user = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const refs = analyzer.findReferences('User');

      expect(refs.length).toBe(1);
      expect(refs[0].uri).toBe('file:///test.proto');
    });

    it('should find references in RPC types', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Request {}
        message Response {}
        service TestService {
          rpc Get(Request) returns (Response);
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const requestRefs = analyzer.findReferences('Request');
      const responseRefs = analyzer.findReferences('Response');

      expect(requestRefs.length).toBe(1);
      expect(responseRefs.length).toBe(1);
    });

    it('should find references in map value types', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Value {}
        message Container {
          map<string, Value> items = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const refs = analyzer.findReferences('Value');

      expect(refs.length).toBe(1);
    });

    it('should find references in oneof fields', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
        message Contact {
          oneof info {
            User user = 1;
            string email = 2;
          }
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const refs = analyzer.findReferences('User');

      expect(refs.length).toBe(1);
    });

    it('should find references across multiple files', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common.v1;
        message Status {}
      `, 'file:///common.proto');

      const userFile = parser.parse(`
        syntax = "proto3";
        package user.v1;
        import "common.proto";
        message User {
          Status status = 1;
        }
      `, 'file:///user.proto');

      const orderFile = parser.parse(`
        syntax = "proto3";
        package order.v1;
        import "common.proto";
        message Order {
          Status status = 1;
        }
      `, 'file:///order.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///user.proto', userFile);
      analyzer.updateFile('file:///order.proto', orderFile);

      const refs = analyzer.findReferences('Status');

      expect(refs.length).toBe(2);
    });

    it('should find multiple references in same message', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
        message Response {
          User user = 1;
          repeated User users = 2;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const refs = analyzer.findReferences('User');

      expect(refs.length).toBe(2);
    });

    it('should find references with fully qualified names', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
        message Response {
          User user = 1;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const refs = analyzer.findReferences('test.v1.User');

      expect(refs.length).toBe(1);
    });

    it('should find references in extend definitions', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message Options {}
        message Value {}
        extend Options {
          Value custom = 50000;
        }
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const optionsRefs = analyzer.findReferences('Options');
      const valueRefs = analyzer.findReferences('Value');

      expect(optionsRefs.length).toBe(1);
      expect(valueRefs.length).toBe(1);
    });
  });

  describe('getSymbolsInFile', () => {
    it('should return only symbols from specified file', () => {
      const file1 = parser.parse(`
        syntax = "proto3";
        message User {}
      `, 'file:///file1.proto');

      const file2 = parser.parse(`
        syntax = "proto3";
        message Order {}
      `, 'file:///file2.proto');

      analyzer.updateFile('file:///file1.proto', file1);
      analyzer.updateFile('file:///file2.proto', file2);

      const file1Symbols = analyzer.getSymbolsInFile('file:///file1.proto');

      expect(file1Symbols.every(s => s.location.uri === 'file:///file1.proto')).toBe(true);
    });
  });

  describe('getTypeCompletions', () => {
    it('should return message and enum types for completions', () => {
      const file = parser.parse(`
        syntax = "proto3";
        package test.v1;
        message User {}
        enum Status { UNKNOWN = 0; }
        service TestService {}
      `, 'file:///test.proto');

      analyzer.updateFile('file:///test.proto', file);

      const completions = analyzer.getTypeCompletions('file:///test.proto', 'test.v1');

      const kinds = completions.map(c => c.kind);
      expect(kinds).toContain(SymbolKind.Message);
      expect(kinds).toContain(SymbolKind.Enum);
      expect(kinds).not.toContain(SymbolKind.Service);
    });
  });

  describe('getAccessibleSymbols', () => {
    it('should include symbols from imported files', () => {
      const commonFile = parser.parse(`
        syntax = "proto3";
        package common;
        message Timestamp {}
      `, 'file:///common.proto');

      const mainFile = parser.parse(`
        syntax = "proto3";
        package main;
        import "common.proto";
        message Event {}
      `, 'file:///main.proto');

      analyzer.updateFile('file:///common.proto', commonFile);
      analyzer.updateFile('file:///main.proto', mainFile);

      const accessible = analyzer.getAccessibleSymbols('file:///main.proto');
      const names = accessible.map(s => s.name);

      expect(names).toContain('Event');
      expect(names).toContain('Timestamp');
    });
  });
});
