/**
 * Template Provider for Protocol Buffers
 * Generates common proto file templates
 */

export interface ProtoTemplate {
  name: string;
  description: string;
  content: string;
}

export class TemplateProvider {
  getTemplates(): ProtoTemplate[] {
    return [
      {
        name: 'Basic Message',
        description: 'A simple message with a few fields',
        content: `syntax = "proto3";

package example.v1;

message ExampleMessage {
  string id = 1;
  string name = 2;
  int32 count = 3;
}
`,
      },
      {
        name: 'Service with RPCs',
        description: 'A service definition with RPC methods',
        content: `syntax = "proto3";

package example.v1;

import "google/protobuf/empty.proto";

message CreateRequest {
  string name = 1;
}

message CreateResponse {
  string id = 1;
}

service ExampleService {
  rpc Create(CreateRequest) returns (CreateResponse);
  rpc Get(google.protobuf.Empty) returns (CreateResponse);
}
`,
      },
      {
        name: 'Enum',
        description: 'An enumeration type',
        content: `syntax = "proto3";

package example.v1;

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
  STATUS_DELETED = 3;
}
`,
      },
      {
        name: 'Message with Nested Types',
        description: 'A message with nested messages and enums',
        content: `syntax = "proto3";

package example.v1;

message OuterMessage {
  message InnerMessage {
    string value = 1;
  }

  enum InnerEnum {
    INNER_ENUM_UNSPECIFIED = 0;
    INNER_ENUM_VALUE_1 = 1;
  }

  InnerMessage inner = 1;
  InnerEnum status = 2;
}
`,
      },
      {
        name: 'Message with Map',
        description: 'A message with map fields',
        content: `syntax = "proto3";

package example.v1;

message ExampleMessage {
  map<string, string> metadata = 1;
  map<int32, string> tags = 2;
}
`,
      },
      {
        name: 'Oneof Field',
        description: 'A message with oneof fields',
        content: `syntax = "proto3";

package example.v1;

message ExampleMessage {
  oneof value {
    string string_value = 1;
    int32 int_value = 2;
    bool bool_value = 3;
  }
}
`,
      },
      {
        name: 'With Options',
        description: 'A proto file with common options',
        content: `syntax = "proto3";

package example.v1;

option go_package = "example.com/example/v1;examplev1";
option java_package = "com.example.v1";
option java_outer_classname = "ExampleProto";

message ExampleMessage {
  string id = 1;
  string name = 2;
}
`,
      },
    ];
  }

  getTemplate(name: string): ProtoTemplate | undefined {
    return this.getTemplates().find(t => t.name === name);
  }
}

export const templateProvider = new TemplateProvider();
