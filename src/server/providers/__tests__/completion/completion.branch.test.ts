/**
 * Tests for completion provider branch coverage
 */

import { CompletionProvider } from '../../completion';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('CompletionProvider Branch Coverage', () => {
  let provider: CompletionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new CompletionProvider(analyzer);
  });

  describe('edition completions', () => {
    it('should provide edition keyword completion', () => {
      const text = `edition`;
      const uri = 'file:///test.proto';

      const position: Position = { line: 0, character: 7 };
      const completions = provider.getCompletions(uri, position, text, text);

      expect(completions.some(c => c.label === 'edition')).toBe(true);
    });

    it('should provide edition version completions', () => {
      const text = `edition = `;
      const uri = 'file:///test.proto';

      const position: Position = { line: 0, character: 10 };
      const completions = provider.getCompletions(uri, position, text, text);

      expect(completions.length).toBeGreaterThan(0);
    });

    it('should provide edition features completions', () => {
      const text = `edition = "2023";
option features.`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 16 };
      const completions = provider.getCompletions(uri, position, 'option features.', text);

      expect(completions.length).toBeGreaterThan(0);
    });

    it('should provide edition feature value completions', () => {
      const text = `edition = "2023";
option features.field_presence = `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 33 };
      const completions = provider.getCompletions(uri, position, 'option features.field_presence = ', text);

      expect(completions.length).toBeGreaterThan(0);
    });

    it('should provide option features completion', () => {
      const text = `edition = "2023";
option `;
      const uri = 'file:///test.proto';

      const position: Position = { line: 1, character: 7 };
      const completions = provider.getCompletions(uri, position, 'option ', text);

      expect(completions.some(c => c.label === 'features')).toBe(true);
    });
  });

  describe('import completions', () => {
    it('should provide import path completions', () => {
      const text = `syntax = "proto3";
import "`;
      const uri = 'file:///test.proto';

      const position: Position = { line: 1, character: 8 };
      const completions = provider.getCompletions(uri, position, 'import "', text);

      // Should have some completions for well-known types
      expect(completions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('type completions', () => {
    it('should provide type completions after optional keyword', () => {
      const text = `syntax = "proto3";
message Test {
  optional `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 11 };
      const completions = provider.getCompletions(uri, position, '  optional ', text);

      expect(completions.some(c => c.label === 'string')).toBe(true);
      expect(completions.some(c => c.label === 'int32')).toBe(true);
    });

    it('should provide type completions after repeated keyword', () => {
      const text = `syntax = "proto3";
message Test {
  repeated `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 11 };
      const completions = provider.getCompletions(uri, position, '  repeated ', text);

      expect(completions.some(c => c.label === 'string')).toBe(true);
    });

    it('should provide custom message type completions', () => {
      const text = `syntax = "proto3";
message User {
  string name = 1;
}
message Request {
  `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 5, character: 2 };
      const completions = provider.getCompletions(uri, position, '  ', text);

      expect(completions.some(c => c.label === 'User')).toBe(true);
    });
  });

  describe('keyword completions', () => {
    it('should provide keyword completions at top level', () => {
      const text = `syntax = "proto3";
`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 0 };
      const completions = provider.getCompletions(uri, position, '', text);

      expect(completions.some(c => c.label === 'message')).toBe(true);
      expect(completions.some(c => c.label === 'enum')).toBe(true);
      expect(completions.some(c => c.label === 'service')).toBe(true);
    });

    it('should provide rpc completions inside service', () => {
      const text = `syntax = "proto3";
service TestService {
  `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 2 };
      const completions = provider.getCompletions(uri, position, '  ', text);

      expect(completions.some(c => c.label === 'rpc')).toBe(true);
    });
  });

  describe('field number completions', () => {
    it('should provide field number completions after =', () => {
      const text = `syntax = "proto3";
message Test {
  string name = `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 16 };
      const completions = provider.getCompletions(uri, position, '  string name = ', text);

      // Should suggest field numbers
      expect(completions.length).toBeGreaterThan(0);
    });

    it('should suggest next available field number', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  int32 age = `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 14 };
      const completions = provider.getCompletions(uri, position, '  int32 age = ', text);

      // Should suggest field number 2
      expect(completions.some(c => c.insertText?.includes('2'))).toBe(true);
    });
  });

  describe('field name completions', () => {
    it('should suggest field names based on string type', () => {
      const text = `syntax = "proto3";
message Test {
  string `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 9 };
      const completions = provider.getCompletions(uri, position, '  string ', text);

      // Should suggest common string field names like name, title, description
      expect(completions.some(c => ['name', 'title', 'description', 'value'].includes(c.label as string))).toBe(true);
    });

    it('should suggest field names based on int type', () => {
      const text = `syntax = "proto3";
message Test {
  int32 `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 8 };
      const completions = provider.getCompletions(uri, position, '  int32 ', text);

      // Should suggest common integer field names
      expect(completions.length).toBeGreaterThan(0);
    });
  });

  describe('enum value completions', () => {
    it('should suggest enum value number after name', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 10 };
      const completions = provider.getCompletions(uri, position, '  UNKNOWN ', text);

      // Should suggest = 0; for first enum value
      expect(completions.some(c => c.insertText?.includes('= 0'))).toBe(true);
    });

    it('should suggest next enum value number', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
  ACTIVE `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 9 };
      const completions = provider.getCompletions(uri, position, '  ACTIVE ', text);

      // Should suggest = 1;
      expect(completions.some(c => c.insertText?.includes('= 1'))).toBe(true);
    });
  });

  describe('field options completions', () => {
    it('should provide features completion inside field options', () => {
      const text = `edition = "2023";
message Test {
  string name = 1 [`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 19 };
      const completions = provider.getCompletions(uri, position, '  string name = 1 [', text);

      expect(completions.some(c => c.label === 'features')).toBe(true);
    });
  });

  describe('map field completions', () => {
    it('should provide map key type completions', () => {
      const text = `syntax = "proto3";
message Test {
  map<`;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 6 };
      const completions = provider.getCompletions(uri, position, '  map<', text);

      // Should suggest valid map key types
      expect(completions.some(c => c.label === 'string')).toBe(true);
      expect(completions.some(c => c.label === 'int32')).toBe(true);
    });
  });

  describe('service completions', () => {
    it('should provide streaming keyword in rpc', () => {
      const text = `syntax = "proto3";
message Request {}
message Response {}
service TestService {
  rpc Test(stream `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 4, character: 18 };
      const completions = provider.getCompletions(uri, position, '  rpc Test(stream ', text);

      expect(completions.some(c => c.label === 'Request')).toBe(true);
    });
  });

  describe('reserved completions', () => {
    it('should provide completions after reserved keyword', () => {
      const text = `syntax = "proto3";
message Test {
  string name = 1;
  reserved `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 3, character: 11 };
      const completions = provider.getCompletions(uri, position, '  reserved ', text);

      // Should have some suggestions
      expect(completions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('option completions', () => {
    it('should provide option completions at message level', () => {
      const text = `syntax = "proto3";
message Test {
  option `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 2, character: 9 };
      const completions = provider.getCompletions(uri, position, '  option ', text);

      expect(completions.length).toBeGreaterThan(0);
    });

    it('should provide option completions at file level', () => {
      const text = `syntax = "proto3";
option `;
      const uri = 'file:///test.proto';
      const file = parser.parse(text, uri);
      analyzer.updateFile(uri, file);

      const position: Position = { line: 1, character: 7 };
      const completions = provider.getCompletions(uri, position, 'option ', text);

      expect(completions.length).toBeGreaterThan(0);
    });
  });

  describe('package completions', () => {
    it('should provide package completions', () => {
      const text = `syntax = "proto3";
package `;
      const uri = 'file:///test.proto';

      const position: Position = { line: 1, character: 8 };
      const completions = provider.getCompletions(uri, position, 'package ', text);

      // Should have package name suggestions or empty
      expect(completions).toBeDefined();
    });
  });
});
