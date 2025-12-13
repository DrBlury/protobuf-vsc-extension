/**
 * Tests for completion provider with package namespaces
 * Validates that IntelliSense respects package boundaries
 */
import { CompletionProvider } from './providers/completion';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';

describe('CompletionProvider - Package Namespaces', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: CompletionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new CompletionProvider(analyzer);
  });

  it('should suggest fully qualified type name when type is from different package', () => {
    // test/testb/testb.proto
    const testbContent = `syntax = "proto3";

package test.testb;

message TestB {
  string message = 1;
}
`;
    const testbUri = 'file:///workspace/test/testb/testb.proto';
    analyzer.updateFile(testbUri, parser.parse(testbContent, testbUri));

    // test/testa/testa.proto
    const testaContent = `syntax = "proto3";

package test.testa;

import "test/testb/testb.proto";

message TestA {
  TestB
}`;
    const testaUri = 'file:///workspace/test/testa/testa.proto';
    analyzer.updateFile(testaUri, parser.parse(testaContent, testaUri));

    const lineText = '  TestB';
    const position = { line: 7, character: lineText.length };

    const completions = provider.getCompletions(testaUri, position, lineText);
    const testBCompletion = completions.find(c => c.label === 'TestB');

    expect(testBCompletion).toBeDefined();
    expect(testBCompletion?.detail).toBe('test.testb.TestB');
    
    // The crucial assertion: when a type is from a different package,
    // the text edit should insert the fully qualified name
    const textEdit = testBCompletion?.textEdit;
    expect(textEdit).toBeDefined();
    if (textEdit && 'newText' in textEdit) {
      expect(textEdit.newText).toBe('test.testb.TestB');
    }
  });

  it('should suggest short name when type is in same package', () => {
    const content = `syntax = "proto3";

package test.testa;

message TestA {
  string id = 1;
}

message TestB {
  TestA
}`;
    const uri = 'file:///workspace/test/testa/testa.proto';
    analyzer.updateFile(uri, parser.parse(content, uri));

    const lineText = '  TestA';
    const position = { line: 9, character: lineText.length };

    const completions = provider.getCompletions(uri, position, lineText);
    const testACompletion = completions.find(c => c.label === 'TestA');

    expect(testACompletion).toBeDefined();
    
    // When a type is in the same package, short name should be used
    const textEdit = testACompletion?.textEdit;
    expect(textEdit).toBeDefined();
    if (textEdit && 'newText' in textEdit) {
      expect(textEdit.newText).toBe('TestA');
    }
  });

  it('should suggest short name when type is nested in same package', () => {
    const content = `syntax = "proto3";

package test;

message Outer {
  message Inner {
    string value = 1;
  }
}

message TestMessage {
  Inner
}`;
    const uri = 'file:///workspace/test/test.proto';
    analyzer.updateFile(uri, parser.parse(content, uri));

    const lineText = '  Inner';
    const position = { line: 11, character: lineText.length };

    const completions = provider.getCompletions(uri, position, lineText);
    const innerCompletion = completions.find(c => c.label === 'Inner');

    expect(innerCompletion).toBeDefined();
    
    // Nested types in same package should still be qualified with parent
    const textEdit = innerCompletion?.textEdit;
    expect(textEdit).toBeDefined();
    if (textEdit && 'newText' in textEdit) {
      expect(textEdit.newText).toBe('Outer.Inner');
    }
  });

  it('should suggest fully qualified name for types from imported file with different package', () => {
    // api/v1/common.proto
    const commonContent = `syntax = "proto3";

package api.v1;

message User {
  string id = 1;
  string name = 2;
}
`;
    const commonUri = 'file:///workspace/api/v1/common.proto';
    analyzer.updateFile(commonUri, parser.parse(commonContent, commonUri));

    // api/v2/service.proto
    const serviceContent = `syntax = "proto3";

package api.v2;

import "api/v1/common.proto";

message Request {
  User
}`;
    const serviceUri = 'file:///workspace/api/v2/service.proto';
    analyzer.updateFile(serviceUri, parser.parse(serviceContent, serviceUri));

    const lineText = '  User';
    const position = { line: 7, character: lineText.length };

    const completions = provider.getCompletions(serviceUri, position, lineText);
    const userCompletion = completions.find(c => c.label === 'User');

    expect(userCompletion).toBeDefined();
    expect(userCompletion?.detail).toBe('api.v1.User');
    
    const textEdit = userCompletion?.textEdit;
    expect(textEdit).toBeDefined();
    if (textEdit && 'newText' in textEdit) {
      expect(textEdit.newText).toBe('api.v1.User');
    }
  });

  it('should suggest short name when no package is defined', () => {
    const content1 = `syntax = "proto3";

message SharedMessage {
  string value = 1;
}
`;
    const uri1 = 'file:///workspace/shared.proto';
    analyzer.updateFile(uri1, parser.parse(content1, uri1));

    const content2 = `syntax = "proto3";

import "shared.proto";

message MyMessage {
  SharedMessage
}`;
    const uri2 = 'file:///workspace/my.proto';
    analyzer.updateFile(uri2, parser.parse(content2, uri2));

    const lineText = '  SharedMessage';
    const position = { line: 5, character: lineText.length };

    const completions = provider.getCompletions(uri2, position, lineText);
    const sharedCompletion = completions.find(c => c.label === 'SharedMessage');

    expect(sharedCompletion).toBeDefined();
    
    // When both files have no package, short name should work
    const textEdit = sharedCompletion?.textEdit;
    expect(textEdit).toBeDefined();
    if (textEdit && 'newText' in textEdit) {
      expect(textEdit.newText).toBe('SharedMessage');
    }
  });
});
