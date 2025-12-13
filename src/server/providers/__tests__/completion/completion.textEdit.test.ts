/**
 * Tests for completion provider textEdit functionality
 * Ensures proper text replacement to prevent duplication bugs
 */

import { CompletionProvider } from '../../completion';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';
import { Position } from 'vscode-languageserver/node';

describe('CompletionProvider TextEdit', () => {
  let provider: CompletionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  const parseAndUpdate = (uri: string, content: string) => {
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);
  };

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
    parser = new ProtoParser();
    provider = new CompletionProvider(analyzer);
  });

  describe('type completion textEdit', () => {
    it('should include textEdit that replaces partial type (prevents duplication)', () => {
      const text = `syntax = "proto3";
message Test {
  u
}`;
      parseAndUpdate('file:///test.proto', text);

      // User typed "u" and wants uint32
      const position: Position = { line: 2, character: 3 };
      const lineText = '  u';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const uint32Completion = completions.find(c => c.label === 'uint32');
      expect(uint32Completion).toBeDefined();
      expect(uint32Completion!.textEdit).toBeDefined();

      // The textEdit should replace from character 2 to 3 (the "u")
      if (uint32Completion!.textEdit && 'range' in uint32Completion!.textEdit) {
        const range = uint32Completion!.textEdit.range;
        expect(range.start.character).toBe(2);
        expect(range.end.character).toBe(3);
        expect(uint32Completion!.textEdit.newText).toBe('uint32');
      }
    });

    it('should replace longer partial types correctly', () => {
      const text = `syntax = "proto3";
message Test {
  int
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 5 };
      const lineText = '  int';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const int32Completion = completions.find(c => c.label === 'int32');
      expect(int32Completion).toBeDefined();
      expect(int32Completion!.textEdit).toBeDefined();

      if (int32Completion!.textEdit && 'range' in int32Completion!.textEdit) {
        const range = int32Completion!.textEdit.range;
        // Should replace "int" (3 characters)
        expect(range.end.character - range.start.character).toBe(3);
      }
    });

    it('should handle empty prefix (cursor at start)', () => {
      const text = `syntax = "proto3";
message Test {

}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 2 };
      const lineText = '  ';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const stringCompletion = completions.find(c => c.label === 'string');
      expect(stringCompletion).toBeDefined();
      expect(stringCompletion!.textEdit).toBeDefined();

      if (stringCompletion!.textEdit && 'range' in stringCompletion!.textEdit) {
        const range = stringCompletion!.textEdit.range;
        // Empty prefix, start and end should be same
        expect(range.start.character).toBe(range.end.character);
      }
    });

    it('should handle qualified type prefix', () => {
      const text = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
message Test {
  google.protobuf.Time
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 3, character: 22 };
      const lineText = '  google.protobuf.Time';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      // Should suggest Timestamp
      const timestampCompletion = completions.find(c => c.label === 'Timestamp');
      if (timestampCompletion?.textEdit && 'range' in timestampCompletion.textEdit) {
        // The range should include the full "google.protobuf.Time" prefix
        expect(timestampCompletion.textEdit.range.start.character).toBe(2);
      }
    });

    it('should handle type after optional modifier', () => {
      const text = `syntax = "proto3";
message Test {
  optional s
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 12 };
      const lineText = '  optional s';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const stringCompletion = completions.find(c => c.label === 'string');
      expect(stringCompletion).toBeDefined();
      expect(stringCompletion!.textEdit).toBeDefined();

      if (stringCompletion!.textEdit && 'range' in stringCompletion!.textEdit) {
        // Should only replace "s", not "optional s"
        const range = stringCompletion!.textEdit.range;
        expect(range.end.character - range.start.character).toBe(1);
      }
    });

    it('should handle type after repeated modifier', () => {
      const text = `syntax = "proto3";
message Test {
  repeated boo
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 14 };
      const lineText = '  repeated boo';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const boolCompletion = completions.find(c => c.label === 'bool');
      expect(boolCompletion).toBeDefined();
      expect(boolCompletion!.textEdit).toBeDefined();
    });
  });

  describe('keyword completion textEdit', () => {
    it('should include textEdit for keyword completions', () => {
      const text = `syntax = "proto3";
message Test {
  opt
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 5 };
      const lineText = '  opt';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const optionalCompletion = completions.find(c => c.label === 'optional');
      expect(optionalCompletion).toBeDefined();
      expect(optionalCompletion!.textEdit).toBeDefined();

      if (optionalCompletion!.textEdit && 'range' in optionalCompletion!.textEdit) {
        const range = optionalCompletion!.textEdit.range;
        // Should replace "opt" (3 characters)
        expect(range.end.character - range.start.character).toBe(3);
      }
    });

    it('should handle single character keyword prefix', () => {
      const text = `syntax = "proto3";
message Test {
  r
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 3 };
      const lineText = '  r';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const repeatedCompletion = completions.find(c => c.label === 'repeated');
      expect(repeatedCompletion).toBeDefined();
      expect(repeatedCompletion!.textEdit).toBeDefined();
    });

    it('should handle empty line (no prefix) for keywords', () => {
      const text = `syntax = "proto3";
message Test {

}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 0 };
      const lineText = '';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      // Should have keyword completions with textEdit
      const optionalCompletion = completions.find(c => c.label === 'optional');
      if (optionalCompletion?.textEdit && 'range' in optionalCompletion.textEdit) {
        expect(optionalCompletion.textEdit.range.start.character).toBe(0);
        expect(optionalCompletion.textEdit.range.end.character).toBe(0);
      }
    });
  });

  describe('custom type completion textEdit', () => {
    it('should include textEdit for custom message types', () => {
      const text = `syntax = "proto3";
message User {
  string name = 1;
}
message Order {
  Us
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 5, character: 4 };
      const lineText = '  Us';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const userCompletion = completions.find(c => c.label === 'User');
      expect(userCompletion).toBeDefined();
      expect(userCompletion!.textEdit).toBeDefined();

      if (userCompletion!.textEdit && 'range' in userCompletion!.textEdit) {
        const range = userCompletion!.textEdit.range;
        expect(range.end.character - range.start.character).toBe(2); // "Us"
      }
    });

    it('should include textEdit for enum types', () => {
      const text = `syntax = "proto3";
enum Status {
  UNKNOWN = 0;
}
message Order {
  Sta
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 5, character: 5 };
      const lineText = '  Sta';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const statusCompletion = completions.find(c => c.label === 'Status');
      expect(statusCompletion).toBeDefined();
      expect(statusCompletion!.textEdit).toBeDefined();
    });

    it('should handle nested message types', () => {
      const text = `syntax = "proto3";
message Outer {
  message Inner {
    string value = 1;
  }
}
message Other {
  Outer.Inn
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 7, character: 11 };
      const lineText = '  Outer.Inn';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      // Should suggest Inner and handle the qualified name
      const innerCompletion = completions.find(c => c.label === 'Inner');
      expect(innerCompletion).toBeDefined();
    });
  });

  describe('duplication prevention regression tests', () => {
    it('should NOT duplicate first letter when completing uint32 from "u"', () => {
      const text = `syntax = "proto3";
message Test {
  u
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 3 };
      const lineText = '  u';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const uint32 = completions.find(c => c.label === 'uint32');
      expect(uint32).toBeDefined();

      // Simulate applying the completion
      if (uint32!.textEdit && 'range' in uint32!.textEdit) {
        const { range, newText } = uint32!.textEdit;
        const before = lineText.substring(0, range.start.character);
        const after = lineText.substring(range.end.character);
        const result = before + newText + after;

        // Result should be "  uint32", NOT "  uuint32"
        expect(result).toBe('  uint32');
        expect(result).not.toContain('uuint32');
      }
    });

    it('should NOT duplicate when completing "int" to "int32"', () => {
      const text = `syntax = "proto3";
message Test {
  int
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 5 };
      const lineText = '  int';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const int32 = completions.find(c => c.label === 'int32');
      expect(int32).toBeDefined();

      if (int32!.textEdit && 'range' in int32!.textEdit) {
        const { range, newText } = int32!.textEdit;
        const before = lineText.substring(0, range.start.character);
        const after = lineText.substring(range.end.character);
        const result = before + newText + after;

        // Result should be "  int32", NOT "  intint32"
        expect(result).toBe('  int32');
      }
    });

    it('should NOT duplicate when completing "opt" to "optional"', () => {
      const text = `syntax = "proto3";
message Test {
  opt
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 2, character: 5 };
      const lineText = '  opt';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const optional = completions.find(c => c.label === 'optional');
      expect(optional).toBeDefined();

      if (optional!.textEdit && 'range' in optional!.textEdit) {
        const { range, newText } = optional!.textEdit;
        const before = lineText.substring(0, range.start.character);
        const after = lineText.substring(range.end.character);
        const result = before + newText + after;

        // Result should be "  optional", NOT "  optoptional"
        expect(result).toBe('  optional');
      }
    });

    it('should NOT duplicate when completing custom type from partial', () => {
      const text = `syntax = "proto3";
message UserRequest {}
message Test {
  User
}`;
      parseAndUpdate('file:///test.proto', text);

      const position: Position = { line: 3, character: 6 };
      const lineText = '  User';
      const completions = provider.getCompletions('file:///test.proto', position, lineText, undefined, text);

      const userRequest = completions.find(c => c.label === 'UserRequest');
      expect(userRequest).toBeDefined();

      if (userRequest!.textEdit && 'range' in userRequest!.textEdit) {
        const { range, newText } = userRequest!.textEdit;
        const before = lineText.substring(0, range.start.character);
        const after = lineText.substring(range.end.character);
        const result = before + newText + after;

        // Result should be "  UserRequest", NOT "  UserUserRequest"
        expect(result).toBe('  UserRequest');
      }
    });
  });
});
