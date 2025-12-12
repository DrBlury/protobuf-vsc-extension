# Snippets Library

The Protobuf VSC extension includes an extensive library of code snippets to help you write Protocol Buffers files faster and follow best practices.

## Overview

Snippets are code templates that you can insert into your proto files. Type the snippet prefix and press `Tab` to expand it, then use `Tab` to navigate between placeholders.

## Using Snippets

1. **Type the prefix** - Start typing the snippet prefix (e.g., `message`, `grpccrud`)
2. **Select from suggestions** - Choose the snippet from IntelliSense
3. **Press Tab** - Expand the snippet
4. **Navigate placeholders** - Press `Tab` to move between placeholders, `Shift+Tab` to go back
5. **Customize** - Fill in the placeholders with your values

## Snippet Categories

### Basic Syntax

#### `syntax3` - Proto3 Syntax

Complete proto3 file header with package declaration.

```proto
syntax = "proto3";

package example.v1;

```

#### `syntax2` - Proto2 Syntax

Complete proto2 file header with package declaration.

#### `edition2023` - Edition 2023

Edition 2023 declaration with package.

#### `fileproto3` - Complete File Template

Complete proto3 file with common imports and options.

```proto
syntax = "proto3";

package example.v1;

import "google/protobuf/timestamp.proto";

option go_package = "example.com/api/v1";
option java_package = "com.example.v1";

// Description of the file
```

### Messages

#### `message` - Basic Message

```proto
message MessageName {
  // fields
}
```

#### `msgtime` - Message with Timestamps

Message with standard timestamp fields (created_at, updated_at, deleted_at).

#### `msgmeta` - Message with Metadata

Message with metadata map, labels, and tags.

#### `msgstatus` - Message with Status Enum

Message with associated status enum.

#### `msgpaginated` - Paginated List

Request and response messages for pagination.

#### `msgoneof` - Message with Oneof

Message with oneof field group.

#### `msgnested` - Message with Nested Types

Message with nested message and enum.

#### `msgextend` - Message with Extensions

Message with extension range and extend block.

### Fields

#### Basic Field Types

- `fstring` - String field
- `fint32` - Int32 field
- `fint64` - Int64 field
- `fbool` - Bool field
- `fbytes` - Bytes field
- `fdouble` - Double field
- `ffloat` - Float field
- `frepeated` - Repeated field
- `fmap` - Map field
- `foptional` - Optional field
- `frequired` - Required field (proto2)
- `fpacked` - Packed repeated field

#### Well-Known Types

- `ftimestamp` - Timestamp field
- `fduration` - Duration field
- `fempty` - Empty field
- `fany` - Any field
- `fstruct` - Struct field
- `fvalue` - Value field
- `fwrapper` - Wrapper type field (StringValue, Int32Value, etc.)

#### `fvalidate` - Field with Validation

Field with buf.validate constraints.

```proto
string field_name = 1 [
  (buf.validate.field).string.min_len = 1;
  (buf.validate.field).string.max_len = 100;
];
```

### Enums

#### `enum` - Basic Enum

```proto
enum EnumName {
  UNKNOWN = 0;
}
```

#### `enumopt` - Enum with Options

Enum with allow_alias option for value aliases.

### Services & gRPC

#### `service` - Basic Service

```proto
service ServiceName {
  // RPCs
}
```

#### `grpccrud` - Complete CRUD Service

Full CRUD service with all request/response messages:

- Create, Get, List, Update, Delete RPCs
- Pagination support
- Standard request/response patterns

#### `grpcstream` - Streaming Service

Service with all streaming patterns:

- Unary RPC
- Server streaming
- Client streaming
- Bidirectional streaming

#### `grpcpage` - Pagination Request

Standard pagination request message.

#### `grpcpageresponse` - Pagination Response

Standard pagination response message.

#### `grpcerror` - Error Details

gRPC error details with google.rpc.Status.

#### `grpchttp` - Service with HTTP Mapping

gRPC service with HTTP/JSON mapping using google.api.http.

#### `rpc` - Basic RPC

```proto
rpc MethodName(Request) returns (Response);
```

#### `rpcbody` - RPC with Body

RPC with body for options.

#### `rpcstream` - Bidirectional Streaming RPC

```proto
rpc MethodName(stream Request) returns (stream Response);
```

#### `rpcserverstream` - Server Streaming RPC

```proto
rpc StreamData(StreamDataRequest) returns (stream Data);
```

#### `rpcclientstream` - Client Streaming RPC

```proto
rpc CollectData(stream Data) returns (CollectDataResponse);
```

#### `rpcbidistream` - Bidirectional Streaming RPC

```proto
rpc Chat(stream Message) returns (stream Message);
```

#### `grpctimeout` - RPC with HTTP Mapping

RPC with HTTP mapping and OpenAPI options.

### Google API Annotations

#### HTTP Annotations

- `httpget` - HTTP GET mapping for RPC method
- `httppost` - HTTP POST mapping with request body
- `httpput` - HTTP PUT mapping for full resource update
- `httpdelete` - HTTP DELETE mapping
- `httppatch` - HTTP PATCH mapping for partial updates
- `httpcustom` - Custom HTTP method mapping
- `httpbindings` - HTTP mapping with additional bindings

#### RPC with HTTP Mapping

- `rpcget` - Complete RPC with HTTP GET mapping and method signature
- `rpcpost` - Complete RPC with HTTP POST mapping
- `rpcdelete` - Complete RPC with HTTP DELETE mapping
- `rpcpatch` - Complete RPC with HTTP PATCH mapping for updates
- `rpclist` - Complete RPC with HTTP List mapping

#### Field Behaviors

- `frequiredbehavior` - Field marked as REQUIRED
- `foutputonly` - Field marked as OUTPUT_ONLY (server-generated)
- `finputonly` - Field marked as INPUT_ONLY (not returned by server)
- `fimmutable` - Field marked as IMMUTABLE (cannot be updated)

#### Resource Definitions

- `resource` - Google API resource descriptor with type and pattern
- `resourcenested` - Resource with nested parent pattern
- `fresourceref` - Field with resource reference annotation
- `msgresource` - Complete message with resource annotation and common fields

#### Service with Google API

- `servicegoogleapi` - Complete Google API style service with annotations

#### FieldMask

- `fupdatemask` - FieldMask field for partial updates
- `msgupdate` - Standard update request message with FieldMask

### Options

#### Language-Specific Options

- `optgopackage` - Go package option
- `optjavapackage` - Java package option
- `optjavaclass` - Java outer classname option
- `optcsharp` - C# namespace option
- `optphp` - PHP namespace option
- `optruby` - Ruby package option
- `optobjc` - Objective-C class prefix option
- `optswift` - Swift prefix option

#### `optdeprecated` - Deprecated Field Option

```proto
[deprecated = true]
```

### Validation (buf.validate)

#### Message-Level CEL Validation

- `celvalidate` - Basic CEL validation
- `celeither` - Either/or validation (one of two fields required)
- `celmutex` - Mutually exclusive validation
- `celsize` - Size validation
- `celif` - Conditional validation

#### Field-Level CEL Validation

- `celfieldvalidate` - Field-level CEL validation
- `celpattern` - String pattern validation
- `celrange` - Numeric range validation

### Other

#### `import` - Import Statement

```proto
import "path/to/file.proto";
```

#### `importpublic` - Public Import

```proto
import public "path/to/file.proto";
```

#### `package` - Package Declaration

```proto
package name;
```

#### `option` - Option Declaration

```proto
option name = value;
```

#### `oneof` - Oneof Declaration

```proto
oneof name {
  // fields
}
```

#### `extend` - Extend Declaration

```proto
extend MessageName {
  // fields
}
```

#### `reservedn` - Reserved Numbers

```proto
reserved 2, 15, 9 to 11;
```

#### `reserveds` - Reserved Names

```proto
reserved "field_name";
```

## Common Patterns

### CRUD Service Pattern

Use `grpccrud` to quickly create a complete CRUD service:

1. Type `grpccrud`
2. Enter entity name (e.g., `User`)
3. Tab through to customize field names and types

### Pagination Pattern

Use `grpcpage` and `grpcpageresponse` for standard pagination:

```proto
message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
  string filter = 3;
  string order_by = 4;
}

message ListUsersResponse {
  repeated User items = 1;
  string next_page_token = 2;
  int32 total_size = 3;
}
```

### Timestamp Pattern

Use `msgtime` for messages that need creation/update timestamps:

```proto
message User {
  string id = 1;
  google.protobuf.Timestamp created_at = 2;
  google.protobuf.Timestamp updated_at = 3;
  google.protobuf.Timestamp deleted_at = 4;
}
```

## Tips

1. **Learn prefixes** - Memorize common prefixes for faster coding
2. **Use Tab navigation** - Quickly move between placeholders
3. **Customize immediately** - Update names right after insertion
4. **Combine snippets** - Use multiple snippets to build complex structures
5. **Follow patterns** - Snippets follow best practices and conventions

## Best Practices

- **Start with snippets** - Faster than typing from scratch
- **Update names immediately** - Don't leave placeholder names
- **Follow naming conventions** - Messages: PascalCase, Fields: snake_case
- **Use appropriate snippets** - Choose the right snippet for your use case
- **Document customizations** - Add comments explaining changes

## See Also

- [Completions](./completions.md) - Smart IntelliSense suggestions
- [Templates](./templates.md) - File-level templates
- [gRPC Integration](./grpc.md) - gRPC-specific features
