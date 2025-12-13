/**
 * Tests for Enhanced Completion Features
 */

import { CompletionProvider } from '../../completion';
import { ProtoParser } from '../../../core/parser';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { Position } from 'vscode-languageserver/node';

describe('CompletionProvider Enhanced Features', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let completionProvider: CompletionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    completionProvider = new CompletionProvider(analyzer);
  });

  describe('Field Name Suggestions', () => {
    it('should suggest field names for string type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('string');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('name');
      expect(suggestions).toContain('id');
    });

    it('should suggest field names for int32 type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('int32');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('count');
      expect(suggestions).toContain('size');
    });

    it('should suggest field names for bool type', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('bool');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('enabled');
      expect(suggestions).toContain('active');
    });

    it('should suggest field names for message types', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('UserMessage');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('user_message'))).toBe(true);
    });

    it('should limit suggestions to top 5', () => {
      const suggestions = completionProvider.getFieldNameSuggestions('string');

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Import Path Completions', () => {
    it('should suggest Google well-known types', () => {
      const uri = 'file:///test.proto';
      const lineText = 'import "';
      const position: Position = { line: 0, character: lineText.length };

      const completions = completionProvider.getCompletions(uri, position, lineText);

      const googleCompletions = completions.filter(c =>
        c.label.includes('google/protobuf/') || c.label.includes('google/type/')
      );

      expect(googleCompletions.length).toBeGreaterThan(0);
    });

    it('should suggest workspace proto files', () => {
      const content1 = `syntax = "proto3";
package test.v1;

message User {
  string name = 1;
}`;

      const _content2 = `syntax = "proto3";
package test.v1;
import "`;

      const uri1 = 'file:///user.proto';
      const uri2 = 'file:///test.proto';

      const file1 = parser.parse(content1, uri1);
      analyzer.updateFile(uri1, file1);

      const lineText = 'import "';
      const position: Position = { line: 2, character: lineText.length };

      const completions = completionProvider.getCompletions(uri2, position, lineText);

      const workspaceCompletions = completions.filter(c =>
        c.label.includes('user.proto') || c.label.includes('User')
      );

      expect(workspaceCompletions.length).toBeGreaterThan(0);
    });
  });

  describe('Field Name Context Completions', () => {
    it('should provide field name suggestions in field name context', () => {
      const uri = 'file:///test.proto';
      const lineText = '  string ';
      const position: Position = { line: 0, character: lineText.length };

      const completions = completionProvider.getCompletions(uri, position, lineText);

      const fieldNameCompletions = completions.filter(c =>
        c.kind === 5 && // Field kind
        (c.label === 'name' || c.label === 'id' || c.label === 'title')
      );

      expect(fieldNameCompletions.length).toBeGreaterThan(0);
    });
  });

  describe('Field assignment assist', () => {
    it('suggests auto assignment only when nothing follows the cursor', () => {
      const uri = 'file:///user.proto';
      const documentText = `syntax = "proto3";

message User {
  string id
}`;
      const lineText = '  string id';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const assignment = completions.find(c => c.detail === 'Insert next field tag and semicolon');
      expect(assignment?.insertText).toContain('= 1;');
    });

    it('does not suggest auto assignment when an assignment already exists after the cursor', () => {
      const uri = 'file:///user.proto';
      const documentText = `syntax = "proto3";

message User {
  string id = 1;
}`;
      const lineText = '  string id = 1;';
      const position: Position = { line: 3, character: lineText.indexOf('=') };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const assignment = completions.find(c => c.detail === 'Insert next field tag and semicolon');
      const fieldNumber = completions.find(c => c.detail === 'Next available field number');

      expect(assignment).toBeUndefined();
      expect(fieldNumber).toBeUndefined();
    });
  });

  describe('CEL Expression Completions', () => {
    it('should provide field completions in CEL expressions after this.', () => {
      const uri = 'file:///test.proto';
      const documentText = `syntax = "proto3";

message BillingAddress {
  option (buf.validate.message).cel = {
    id: "test",
    expression: "this."
  };
  string city = 1;
  string country = 2;
  optional string street = 3;
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      // The cursor is after "this." in the expression
      const lineText = '    expression: "this.';
      const position: Position = { line: 5, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      // Debug: log what we get
      // console.log('Completions:', completions.map(c => c.label));

      // Should find field completions
      const cityCompletion = completions.find(c => c.label === 'city');
      const countryCompletion = completions.find(c => c.label === 'country');
      const streetCompletion = completions.find(c => c.label === 'street');

      expect(cityCompletion).toBeDefined();
      expect(cityCompletion?.detail).toContain('string');
      expect(countryCompletion).toBeDefined();
      expect(streetCompletion).toBeDefined();
      expect(streetCompletion?.detail).toContain('optional');
    });

    it('should provide CEL function completions in expressions', () => {
      const uri = 'file:///test.proto';
      const documentText = `syntax = "proto3";

message BillingAddress {
  option (buf.validate.message).cel = {
    id: "test",
    expression: "h"
  };
  string city = 1;
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '    expression: "h';
      const position: Position = { line: 5, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      // Should find has() function
      const hasCompletion = completions.find(c => c.label === 'has');
      expect(hasCompletion).toBeDefined();
      expect(hasCompletion?.detail).toContain('Check if field is set');
    });

    it('should provide this keyword suggestion at start of expression', () => {
      const uri = 'file:///test.proto';
      const documentText = `syntax = "proto3";

message BillingAddress {
  option (buf.validate.message).cel = {
    id: "test",
    expression: ""
  };
  string city = 1;
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '    expression: "';
      const position: Position = { line: 5, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      // Should suggest 'this' keyword
      const thisCompletion = completions.find(c => c.label === 'this');
      expect(thisCompletion).toBeDefined();
      expect(thisCompletion?.insertText).toBe('this.');
    });

    it('should provide CEL option field completions', () => {
      const uri = 'file:///test.proto';
      const documentText = `syntax = "proto3";

message BillingAddress {
  option (buf.validate.message).cel = {

  };
  string city = 1;
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '    ';
      const position: Position = { line: 4, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      // Should provide id, message, expression options
      const idCompletion = completions.find(c => c.label === 'id');
      const messageCompletion = completions.find(c => c.label === 'message');
      const expressionCompletion = completions.find(c => c.label === 'expression');

      expect(idCompletion).toBeDefined();
      expect(messageCompletion).toBeDefined();
      expect(expressionCompletion).toBeDefined();
    });
  });

  describe('buf.validate Option Completions', () => {
    const uri = 'file:///test/validate.proto';

    it('should provide buf.validate top-level options', () => {
      const documentText = `syntax = "proto3";

message User {
  option (buf.validate.
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  option (buf.validate.';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const fieldOption = completions.find(c => c.label === 'field');
      const messageOption = completions.find(c => c.label === 'message');
      const oneofOption = completions.find(c => c.label === 'oneof');

      expect(fieldOption).toBeDefined();
      expect(messageOption).toBeDefined();
      expect(oneofOption).toBeDefined();
    });

    it('should provide buf.validate.field options', () => {
      const documentText = `syntax = "proto3";

message User {
  string name = 1 [(buf.validate.field).
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  string name = 1 [(buf.validate.field).';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const celOption = completions.find(c => c.label === 'cel');
      const requiredOption = completions.find(c => c.label === 'required');
      const stringOption = completions.find(c => c.label === 'string');
      const int32Option = completions.find(c => c.label === 'int32');

      expect(celOption).toBeDefined();
      expect(requiredOption).toBeDefined();
      expect(stringOption).toBeDefined();
      expect(int32Option).toBeDefined();
    });

    it('should provide buf.validate.field.string constraints', () => {
      const documentText = `syntax = "proto3";

message User {
  string email = 1 [(buf.validate.field).string.
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  string email = 1 [(buf.validate.field).string.';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const emailOption = completions.find(c => c.label === 'email');
      const minLenOption = completions.find(c => c.label === 'min_len');
      const patternOption = completions.find(c => c.label === 'pattern');
      const uriOption = completions.find(c => c.label === 'uri');

      expect(emailOption).toBeDefined();
      expect(minLenOption).toBeDefined();
      expect(patternOption).toBeDefined();
      expect(uriOption).toBeDefined();
    });

    it('should provide buf.validate.message options', () => {
      const documentText = `syntax = "proto3";

message User {
  option (buf.validate.message).
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  option (buf.validate.message).';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const celOption = completions.find(c => c.label === 'cel');
      const disabledOption = completions.find(c => c.label === 'disabled');

      expect(celOption).toBeDefined();
      expect(disabledOption).toBeDefined();
    });

    it('should provide buf.validate.field.int32 constraints', () => {
      const documentText = `syntax = "proto3";

message Order {
  int32 quantity = 1 [(buf.validate.field).int32.
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  int32 quantity = 1 [(buf.validate.field).int32.';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const gtOption = completions.find(c => c.label === 'gt');
      const gteOption = completions.find(c => c.label === 'gte');
      const ltOption = completions.find(c => c.label === 'lt');
      const lteOption = completions.find(c => c.label === 'lte');

      expect(gtOption).toBeDefined();
      expect(gteOption).toBeDefined();
      expect(ltOption).toBeDefined();
      expect(lteOption).toBeDefined();
    });

    it('should provide buf.validate.field.repeated constraints', () => {
      const documentText = `syntax = "proto3";

message Order {
  repeated string items = 1 [(buf.validate.field).repeated.
}`;
      const file = parser.parse(documentText, uri);
      analyzer.updateFile(uri, file);

      const lineText = '  repeated string items = 1 [(buf.validate.field).repeated.';
      const position: Position = { line: 3, character: lineText.length };

      const completions = completionProvider.getCompletions(
        uri,
        position,
        lineText,
        undefined,
        documentText
      );

      const minItemsOption = completions.find(c => c.label === 'min_items');
      const maxItemsOption = completions.find(c => c.label === 'max_items');
      const uniqueOption = completions.find(c => c.label === 'unique');

      expect(minItemsOption).toBeDefined();
      expect(maxItemsOption).toBeDefined();
      expect(uniqueOption).toBeDefined();
    });
  });
});
