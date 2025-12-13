/**
 * Tests for Hover Provider
 */

import { Hover, MarkupContent } from 'vscode-languageserver/node';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { HoverProvider } from '../hover';

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

  describe('CEL hover support', () => {
    it('should return hover for CEL functions like has()', () => {
      const lineText = '  expression: "has(this.email)"';
      // Position on 'has' - starts at character 15
      const position = { line: 5, character: 16 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('has');
      expect((hover.contents as MarkupContent).value).toContain('CEL function');
      expect((hover.contents as MarkupContent).value).toContain('field is set');
    });

    it('should return hover for size() function', () => {
      const lineText = '  expression: "size(this.name) > 0"';
      // Position on 'size' - starts at character 15
      const position = { line: 5, character: 16 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('size');
      expect((hover.contents as MarkupContent).value).toContain('size/length');
    });

    it('should return hover for string methods like startsWith', () => {
      // CEL functions are detected regardless of where they appear
      const lineText = 'startsWith';
      const position = { line: 5, character: 5 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('startsWith');
      expect((hover.contents as MarkupContent).value).toContain('prefix');
    });

    it('should return hover for list macros like all()', () => {
      // CEL functions work on the word directly
      const lineText = 'all';
      const position = { line: 5, character: 1 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('all');
      expect((hover.contents as MarkupContent).value).toContain('predicate');
    });

    it('should return hover for protovalidate functions like isEmail()', () => {
      // isEmail is a CEL function
      const lineText = 'isEmail';
      const position = { line: 5, character: 3 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('isEmail');
      expect((hover.contents as MarkupContent).value).toContain('valid email');
    });

    it('should return hover for "this" keyword in CEL context', () => {
      // "this" requires CEL context in the line
      const lineText = '  expression: "this.field > 0"';
      // Position on 'this' - starts at character 15
      const position = { line: 5, character: 17 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('this');
      expect((hover.contents as MarkupContent).value).toContain('current message');
    });

    it('should return hover for duration() function', () => {
      const lineText = '  expression: "duration(this.timeout)"';
      // Position on 'duration' - starts at character 15
      const position = { line: 5, character: 18 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('duration');
      expect((hover.contents as MarkupContent).value).toContain('Duration');
    });
  });

  describe('Google API hover support', () => {
    it('should return hover for field_behavior REQUIRED', () => {
      const lineText = '  string name = 1 [(google.api.field_behavior) = REQUIRED];';
      // Position on 'REQUIRED' - starts at character 49
      const position = { line: 3, character: 53 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('REQUIRED');
      expect((hover.contents as MarkupContent).value).toContain('field_behavior');
    });

    it('should return hover for field_behavior OUTPUT_ONLY', () => {
      const lineText = '  google.protobuf.Timestamp created = 2 [(google.api.field_behavior) = OUTPUT_ONLY];';
      // Position on 'OUTPUT_ONLY' - starts at character 71
      const position = { line: 3, character: 75 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('OUTPUT_ONLY');
      expect((hover.contents as MarkupContent).value).toContain('not be specified by clients');
    });

    it('should return hover for HTTP method get in google.api context', () => {
      // The line needs google.api context for HTTP method detection
      const lineText = '    get: "/v1/users/{user_id}"  // google.api.http';
      // Position on 'get' - starts at character 4
      const position = { line: 5, character: 5 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('get');
      expect((hover.contents as MarkupContent).value).toContain('HTTP GET');
    });

    it('should return hover for HTTP body field in google.api context', () => {
      // The line needs google.api context
      const lineText = '    body: "*"  // google.api.http';
      // Position on 'body' - starts at character 4
      const position = { line: 6, character: 5 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('body');
      expect((hover.contents as MarkupContent).value).toContain('HTTP request body');
    });

    it('should return hover for resource pattern field', () => {
      // Test pattern field instead of type (since type matches CEL function)
      const lineText = '  option (google.api.resource) = { pattern: "projects/{project}"';
      // Position on 'pattern' - starts at character 35
      const position = { line: 2, character: 40 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('pattern');
      expect((hover.contents as MarkupContent).value).toContain('resource');
    });
  });

  describe('Protovalidate hover support', () => {
    it('should return hover for CEL option id field', () => {
      // Need buf.validate context
      const lineText = '    id: "valid_email"  // buf.validate.cel';
      // Position on 'id' - starts at character 4
      const position = { line: 5, character: 5 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('id');
    });

    it('should return hover for string constraint min_len', () => {
      const lineText = '  string name = 1 [(buf.validate.field).string.min_len = 1];';
      // Position on 'min_len' - starts at character 47
      const position = { line: 3, character: 50 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('min_len');
      expect((hover.contents as MarkupContent).value).toContain('Minimum string length');
    });

    it('should return hover for required constraint', () => {
      const lineText = '  string email = 2 [(buf.validate.field).required = true];';
      // Position on 'required' - starts at character 41
      const position = { line: 3, character: 45 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('required');
    });

    it('should return hover for repeated constraint unique', () => {
      const lineText = '  repeated string tags = 3 [(buf.validate.field).repeated.unique = true];';
      // Position on 'unique' - starts at character 58
      const position = { line: 3, character: 61 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('unique');
    });

    it('should return hover for pattern constraint', () => {
      const lineText = '  string code = 4 [(buf.validate.field).string.pattern = "^[A-Z]{3}$"];';
      // Position on 'pattern' - starts at character 47
      const position = { line: 3, character: 50 };

      const hover = provider.getHover('file:///test.proto', position, lineText) as Hover;

      expect(hover).not.toBeNull();
      expect((hover.contents as MarkupContent).value).toContain('pattern');
      expect((hover.contents as MarkupContent).value).toContain('Regular expression');
    });
  });
});
