import { CompletionProvider } from './providers/completion';
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import { GOOGLE_WELL_KNOWN_PROTOS } from './utils/googleWellKnown';

describe('CompletionProvider', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let provider: CompletionProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new CompletionProvider(analyzer);
  });

  it('suggests google.protobuf well-known types when qualified', () => {
    const googleContent = GOOGLE_WELL_KNOWN_PROTOS['google/protobuf/timestamp.proto'];
    const googleUri = 'builtin:///google/protobuf/timestamp.proto';
    analyzer.updateFile(googleUri, parser.parse(googleContent, googleUri));

    const userContent = `syntax = "proto3";
import "google/protobuf/timestamp.proto";

message Foo {
  google.protobuf.
}`;
    const userUri = 'file:///user.proto';
    analyzer.updateFile(userUri, parser.parse(userContent, userUri));

    const lineText = '  google.protobuf.';
    const position = { line: 4, character: lineText.length };

    const completions = provider.getCompletions(userUri, position, lineText);
    const timestampCompletion = completions.find(c => c.label === 'Timestamp');

    expect(timestampCompletion).toBeDefined();
    expect(timestampCompletion?.filterText).toContain('google.protobuf.Timestamp');
    expect(timestampCompletion?.labelDetails?.description).toBe('google.protobuf');
  });

  it('filters out non-qualified symbols when a qualifier is typed', () => {
    const googleContent = GOOGLE_WELL_KNOWN_PROTOS['google/protobuf/timestamp.proto'];
    const googleUri = 'builtin:///google/protobuf/timestamp.proto';
    analyzer.updateFile(googleUri, parser.parse(googleContent, googleUri));

    const otherContent = `syntax = "proto3";
package example;

message GetOrderRequest { string id = 1; }
`;
    const otherUri = 'file:///other.proto';
    analyzer.updateFile(otherUri, parser.parse(otherContent, otherUri));

    const userContent = `syntax = "proto3";
import "google/protobuf/timestamp.proto";
import "other.proto";

message Foo {
  google.protobuf.
}`;
    const userUri = 'file:///user.proto';
    analyzer.updateFile(userUri, parser.parse(userContent, userUri));

    const lineText = '  google.protobuf.';
    const position = { line: 6, character: lineText.length };

    const completions = provider.getCompletions(userUri, position, lineText);
    const labels = completions.map(c => c.label);

    expect(labels).toContain('Timestamp');
    expect(labels).not.toContain('GetOrderRequest');
  });

  it('suggests google.rpc.Status when qualified', () => {
    const statusContent = GOOGLE_WELL_KNOWN_PROTOS['google/rpc/status.proto'];
    const statusUri = 'builtin:///google/rpc/status.proto';
    analyzer.updateFile(statusUri, parser.parse(statusContent, statusUri));

    const anyContent = GOOGLE_WELL_KNOWN_PROTOS['google/protobuf/any.proto'];
    const anyUri = 'builtin:///google/protobuf/any.proto';
    analyzer.updateFile(anyUri, parser.parse(anyContent, anyUri));

    const userContent = `syntax = "proto3";
import "google/rpc/status.proto";
import "google/protobuf/any.proto";

message Foo {
  google.rpc.
}`;
    const userUri = 'file:///user.proto';
    analyzer.updateFile(userUri, parser.parse(userContent, userUri));

    const lineText = '  google.rpc.';
    const position = { line: 5, character: lineText.length };

    const completions = provider.getCompletions(userUri, position, lineText);
    const labels = completions.map(c => c.label);

    expect(labels).toContain('Status');
  });

  it('offers new google imports like google/type/date.proto', () => {
    const uri = 'file:///imports.proto';
    const lineText = 'import "';
    const position = { line: 0, character: lineText.length };

    const completions = provider.getCompletions(uri, position, lineText);
    const labels = completions.map(c => c.label);

    expect(labels).toContain('google/type/date.proto');
    expect(labels).toContain('google/rpc/status.proto');
  });
});
