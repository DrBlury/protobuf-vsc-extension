/**
 * Regression tests for option map field go-to-definition
 */

import type { Location } from 'vscode-languageserver/node';
import { DefinitionProvider } from '../../definition';
import { SemanticAnalyzer } from '../../../core/analyzer';
import { ProtoParser } from '../../../core/parser';

describe('DefinitionProvider Option Field Navigation', () => {
  let provider: DefinitionProvider;
  let analyzer: SemanticAnalyzer;
  let parser: ProtoParser;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    provider = new DefinitionProvider(analyzer);
  });

  function loadWorkspaceFiles(): string {
    const descriptorProto = `syntax = "proto3";
package google.protobuf;

message MethodOptions {}
`;

    const httpProto = `syntax = "proto3";
package google.api;

message HttpRule {
  oneof pattern {
    string get = 2;
    string post = 4;
  }
  string body = 7;
}
`;

    const googleAnnotationsProto = `syntax = "proto3";
package google.api;

import "google/protobuf/descriptor.proto";
import "google/api/http.proto";

extend google.protobuf.MethodOptions {
  HttpRule http = 72295728;
}
`;

    const openapiProto = `syntax = "proto3";
package openapi.v3;

message PathItem {
  string post = 8;
}

message Link {
  string request_body = 1;
}
`;

    const openapiAnnotationsProto = `syntax = "proto3";
package openapi.v3;

import "openapi/v3/openapi.proto";
`;

    const demoProto = `syntax = "proto3";
package api.demo;

import "google/api/annotations.proto";
import "openapi/v3/annotations.proto";

service DemoService {
  rpc CreateDemo(CreateDemoRequest) returns (Demo) {
    option (google.api.http) = {
      post: "/v1/demos"
      body: "demo"
    };
  }
}

message Demo {}
message CreateDemoRequest {}
`;

    // Intentionally add OpenAPI files first so naive name matching picks the wrong symbol.
    analyzer.updateFile(
      'file:///third_party/openapi/v3/openapi.proto',
      parser.parse(openapiProto, 'file:///third_party/openapi/v3/openapi.proto')
    );
    analyzer.updateFile(
      'file:///third_party/openapi/v3/annotations.proto',
      parser.parse(openapiAnnotationsProto, 'file:///third_party/openapi/v3/annotations.proto')
    );
    analyzer.updateFile(
      'file:///third_party/google/protobuf/descriptor.proto',
      parser.parse(descriptorProto, 'file:///third_party/google/protobuf/descriptor.proto')
    );
    analyzer.updateFile(
      'file:///third_party/google/api/http.proto',
      parser.parse(httpProto, 'file:///third_party/google/api/http.proto')
    );
    analyzer.updateFile(
      'file:///third_party/google/api/annotations.proto',
      parser.parse(googleAnnotationsProto, 'file:///third_party/google/api/annotations.proto')
    );
    analyzer.updateFile('file:///api/demo.proto', parser.parse(demoProto, 'file:///api/demo.proto'));

    return demoProto;
  }

  it('should resolve post to google.api.HttpRule.post', () => {
    const demoProto = loadWorkspaceFiles();
    const lineText = '      post: "/v1/demos"';
    const position = { line: 9, character: 8 };

    const definition = provider.getDefinition('file:///api/demo.proto', position, lineText, demoProto) as Location;

    expect(definition).toBeDefined();
    expect(definition.uri).toBe('file:///third_party/google/api/http.proto');
    expect(definition.range.start.line).toBe(6);
  });

  it('should resolve body to google.api.HttpRule.body', () => {
    const demoProto = loadWorkspaceFiles();
    const lineText = '      body: "demo"';
    const position = { line: 10, character: 8 };

    const definition = provider.getDefinition('file:///api/demo.proto', position, lineText, demoProto) as Location;

    expect(definition).toBeDefined();
    expect(definition.uri).toBe('file:///third_party/google/api/http.proto');
    expect(definition.range.start.line).toBe(8);
  });
});
