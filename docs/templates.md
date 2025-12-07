# Templates

Pre-built templates help you quickly create common proto file structures.

## Overview

Templates provide ready-to-use proto file structures for common patterns, saving time and ensuring best practices.

## Available Templates

### 1. Basic Message

A simple message with a few fields.

**Use when:** Creating a new message type

**Template:**

```proto
syntax = "proto3";

package example.v1;

message ExampleMessage {
  string id = 1;
  string name = 2;
  int32 count = 3;
}
```

### 2. Service with RPCs

A service definition with RPC methods.

**Use when:** Creating a new gRPC service

**Template:**

```proto
syntax = "proto3";

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
```

### 3. Enum

An enumeration type.

**Use when:** Creating a new enum

**Template:**

```proto
syntax = "proto3";

package example.v1;

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
  STATUS_DELETED = 3;
}
```

### 4. Message with Nested Types

A message with nested messages and enums.

**Use when:** Creating a message with related nested types

**Template:**

```proto
syntax = "proto3";

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
```

### 5. Message with Map

A message with map fields.

**Use when:** Creating a message with key-value mappings

**Template:**

```proto
syntax = "proto3";

package example.v1;

message ExampleMessage {
  map<string, string> metadata = 1;
  map<int32, string> tags = 2;
}
```

### 6. Oneof Field

A message with oneof fields.

**Use when:** Creating a message with mutually exclusive fields

**Template:**

```proto
syntax = "proto3";

package example.v1;

message ExampleMessage {
  oneof value {
    string string_value = 1;
    int32 int_value = 2;
    bool bool_value = 3;
  }
}
```

### 7. With Options

A proto file with common options.

**Use when:** Creating a file with language-specific options

**Template:**

```proto
syntax = "proto3";

package example.v1;

option go_package = "example.com/example/v1;examplev1";
option java_package = "com.example.v1";
option java_outer_classname = "ExampleProto";

message ExampleMessage {
  string id = 1;
  string name = 2;
}
```

## How to Use Templates

### Method 1: Command Palette

1. Press `Cmd/Ctrl+Shift+P`
2. Type "Protobuf: New File from Template"
3. Select a template
4. Customize as needed

### Method 2: Snippets

Templates are also available as snippets:

1. Type the template prefix
2. Select from suggestions
3. Tab through placeholders

### Method 3: Manual Copy

1. Open the template documentation
2. Copy the template
3. Paste into your file
4. Customize

## Customizing Templates

After inserting a template:

1. **Update package name**

   ```proto
   package example.v1;  // Change to your package
   ```

2. **Rename messages**

   ```proto
   message ExampleMessage {  // Change to your message name
   }
   ```

3. **Add/remove fields**

   ```proto
   string id = 1;
   string name = 2;
   // Add more fields as needed
   ```

4. **Update options**

   ```proto
   option go_package = "your/package/path";
   ```

## Best Practices

1. **Start with templates** - Faster than writing from scratch
2. **Customize immediately** - Update names and fields right away
3. **Follow patterns** - Templates follow best practices
4. **Use appropriate template** - Choose the right template for your use case
5. **Document changes** - Add comments explaining customizations

## Template Patterns

Templates follow these patterns:

### Naming

- Messages: PascalCase
- Fields: snake_case
- Enums: PascalCase
- Enum values: SCREAMING_SNAKE_CASE

### Field Numbers

- Start at 1
- Sequential numbering
- Skip reserved ranges

### Proto3 Conventions

- No `required` fields
- First enum value is 0
- No default values

## Creating Custom Templates

While the extension provides built-in templates, you can:

1. Create your own template files
2. Use snippets for common patterns
3. Share templates with your team

## Tips

1. **Learn the templates** - Know which template to use when
2. **Customize quickly** - Update names immediately
3. **Use as starting point** - Templates are starting points, not final code
4. **Follow conventions** - Templates follow best practices
5. **Save your own** - Create snippets for your common patterns
