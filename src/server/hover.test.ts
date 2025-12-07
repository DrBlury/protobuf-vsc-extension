/**
 * Tests for Hover Provider
 */

import { Hover, MarkupContent } from 'vscode-languageserver/node';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { HoverProvider } from './providers/hover';

describe('HoverProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: HoverProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new HoverProvider(analyzer);
  });

  describe('getHover', () => {
    it('should return hover for builtin types', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      const lineText = '  string name = 1;';
      const position = { line: 2, character: 4 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('string');
    });

    it('should return hover for message types', () => {
      const content = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}

message GetUserResponse {
  User user = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Hover on "User" in the field type
      const lineText = '  User user = 1;';
      const position = { line: 8, character: 3 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('message');
      expect((hover.contents as MarkupContent).value).toContain('User');
    });

    it('should return hover for enum types', () => {
      const content = `syntax = "proto3";
package test.v1;

enum Status {
  UNKNOWN = 0;
  ACTIVE = 1;
}

message User {
  Status status = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Hover on "Status" in the field type
      const lineText = '  Status status = 1;';
      const position = { line: 9, character: 4 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('enum');
    });

    it('should return null when not on a type', () => {
      const content = `syntax = "proto3";
message User {
  string name = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Empty line
      const lineText = '';
      const position = { line: 0, character: 0 };

      const hover = provider.getHover('file:///test.proto', position, lineText);

      expect(hover).toBeNull();
    });

    it('should handle keywords', () => {
      const content = `syntax = "proto3";
message User {
  repeated string tags = 1;
}`;

      const file = parser.parse(content, 'file:///test.proto');
      analyzer.updateFile('file:///test.proto', file);

      // Hover on "repeated"
      const lineText = '  repeated string tags = 1;';
      const position = { line: 2, character: 4 };

      const hover = provider.getHover('file:///test.proto', position, lineText);

      // Should return hover for the keyword
      expect(hover).not.toBeNull();
    });
  });
});
