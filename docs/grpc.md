# gRPC Integration

The Protobuf VSC extension provides comprehensive gRPC support, including service analysis, code generation, and development tools.

> **Note**: For the complete gRPC Client feature specification including planned features like native gRPC client, server reflection, streaming UI, and more, see [GRPC_CLIENT_FEATURE_SPECIFICATION.md](./GRPC_CLIENT_FEATURE_SPECIFICATION.md).

## Overview

gRPC (gRPC Remote Procedure Calls) is a high-performance RPC framework. This extension helps you:

- **Analyze** gRPC services in your workspace
- **Generate** client stubs and server templates
- **Visualize** service structures and relationships
- **Navigate** between services and RPCs
- **Understand** streaming patterns and service statistics

## Features

### Service Discovery

Find and list all gRPC services in your workspace:

1. Press `Cmd/Ctrl+Shift+P`
2. Run `Protobuf: List gRPC Services`
3. Select a service to view details

### Service Analysis

View detailed information about any gRPC service:

- **RPC Methods** - All RPC methods in the service
- **Streaming Types** - Unary, server-streaming, client-streaming, bidirectional
- **Request/Response Types** - Input and output message types
- **Package Information** - Service package and location

### Code Generation

Generate client stubs and server templates in multiple languages:

#### Generate Client Stub

1. Open a `.proto` file with a service definition
2. Press `Cmd/Ctrl+Shift+P`
3. Run `Protobuf: Generate gRPC Client Stub`
4. Select the service
5. Choose target language (Go, Java, Python, TypeScript)
6. Generated code opens in a new editor

#### Generate Server Template

1. Open a `.proto` file with a service definition
2. Press `Cmd/Ctrl+Shift+P`
3. Run `Protobuf: Generate gRPC Server Template`
4. Select the service
5. Choose target language
6. Generated template opens in a new editor

### Service Statistics

View statistics about your gRPC services:

1. Press `Cmd/Ctrl+Shift+P`
2. Run `Protobuf: Show gRPC Service Statistics`
3. Select a service
4. View statistics:
   - Total RPCs
   - Unary RPCs
   - Streaming RPCs (server, client, bidirectional)

## Supported Languages

### Go

**Client Stub:**

```go
type UserServiceClient struct {
  cc grpc.ClientConnInterface
}

func (c *UserServiceClient) GetUser(ctx context.Context, req *GetUserRequest) (*GetUserResponse, error) {
  // Implementation
}
```

**Server Template:**

```go
type UserServiceServer struct {
  // Add your dependencies here
}

func (s *UserServiceServer) mustEmbedUnimplementedUserServiceServer() {}

func (s *UserServiceServer) GetUser(ctx context.Context, req *GetUserRequest) (*GetUserResponse, error) {
  // TODO: Implement GetUser
  return nil, status.Errorf(codes.Unimplemented, "method GetUser not implemented")
}
```

### Java

**Client Stub:**

```java
public class UserServiceClient {
  private final UserServiceGrpc.UserServiceStub stub;

  public GetUserResponse getUser(GetUserRequest request) {
    // Implementation
  }
}
```

**Server Template:**

```java
public class UserServiceImpl extends UserServiceGrpc.UserServiceImplBase {
  @Override
  public void getUser(
      GetUserRequest request,
      StreamObserver<GetUserResponse> responseObserver) {
    // TODO: Implement getUser
    responseObserver.onError(
      Status.UNIMPLEMENTED.withDescription("method getUser not implemented").asException()
    );
  }
}
```

### Python

**Client Stub:**

```python
class UserServiceClient:
  def __init__(self, channel):
    self.stub = user_service_pb2_grpc.UserServiceStub(channel)

  def get_user(self, request):
    # Implementation
    pass
```

**Server Template:**

```python
class UserServiceServicer(user_service_pb2_grpc.UserServiceServicer):
  def get_user(self, request, context):
    # TODO: Implement get_user
    context.set_code(grpc.StatusCode.UNIMPLEMENTED)
    context.set_details('method get_user not implemented')
    raise NotImplementedError('method get_user not implemented')
```

### TypeScript

**Client Stub:**

```typescript
export class UserServiceClient {
  constructor(private client: Client) {}

  getUser(request: GetUserRequest): Promise<GetUserResponse> {
    // Implementation
  }
}
```

**Server Template:**

```typescript
export class UserServiceService implements UserServiceServiceDefinition {
  getUser(call: ServerUnaryCall<GetUserRequest, GetUserResponse>): Promise<GetUserResponse> {
    // TODO: Implement getUser
    throw new Error('method getUser not implemented');
  }
}
```

## Streaming Patterns

The extension recognizes and supports all gRPC streaming patterns:

### Unary RPC

```proto
rpc GetUser(GetUserRequest) returns (GetUserResponse);
```

- Single request, single response
- Most common pattern

### Server Streaming

```proto
rpc StreamUsers(StreamUsersRequest) returns (stream User);
```

- Single request, multiple responses
- Useful for real-time updates

### Client Streaming

```proto
rpc CollectData(stream Data) returns (CollectDataResponse);
```

- Multiple requests, single response
- Useful for batch uploads

### Bidirectional Streaming

```proto
rpc Chat(stream Message) returns (stream Message);
```

- Multiple requests, multiple responses
- Useful for chat, gaming, etc.

## Commands

| Command | Description |
|---------|-------------|
| `Protobuf: List gRPC Services` | List all services in workspace |
| `Protobuf: Show gRPC Service Details` | Show details for service in current file |
| `Protobuf: Generate gRPC Client Stub` | Generate client stub code |
| `Protobuf: Generate gRPC Server Template` | Generate server implementation template |
| `Protobuf: Show gRPC Service Statistics` | Show statistics for a service |

## Snippets

The extension includes many gRPC-specific snippets:

### Service Snippets

- `grpccrud` - Complete CRUD service with request/response messages
- `grpcstream` - Service with all streaming patterns
- `grpchttp` - Service with HTTP/JSON mapping
- `grpcpage` - Pagination request message
- `grpcpageresponse` - Pagination response message

### RPC Snippets

- `rpc` - Basic RPC method
- `rpcbody` - RPC with body for options
- `rpcstream` - Bidirectional streaming RPC
- `rpcserverstream` - Server streaming RPC
- `rpcclientstream` - Client streaming RPC
- `rpcbidistream` - Bidirectional streaming RPC

See [Snippets](./snippets.md) for complete list.

## Best Practices

### Service Design

1. **Use standard patterns** - Follow CRUD patterns for common operations
2. **Implement pagination** - Use standard pagination for list operations
3. **Handle errors** - Use google.rpc.Status for error responses
4. **Document RPCs** - Add comments explaining each RPC's purpose
5. **Version services** - Use versioning in package names (e.g., `v1`, `v2`)

### Request/Response Messages

1. **Separate messages** - Use separate request/response messages for each RPC
2. **Naming convention** - `{RpcName}Request` and `{RpcName}Response`
3. **Include context** - Add pagination, filtering, sorting to list requests
4. **Return metadata** - Include metadata in responses (timestamps, etc.)

### Streaming

1. **Choose right pattern** - Use unary unless you need streaming
2. **Handle backpressure** - Implement proper flow control for streams
3. **Error handling** - Handle errors gracefully in streaming RPCs
4. **Resource cleanup** - Clean up resources when streams end

## Examples

### Complete CRUD Service

```proto
syntax = "proto3";

package example.v1;

import "google/protobuf/timestamp.proto";

service UserService {
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc UpdateUser(UpdateUserRequest) returns (UpdateUserResponse);
  rpc DeleteUser(DeleteUserRequest) returns (DeleteUserResponse);
}

message User {
  string id = 1;
  string name = 2;
  google.protobuf.Timestamp created_at = 3;
}

message CreateUserRequest {
  User user = 1;
}

message CreateUserResponse {
  User user = 1;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
}

message UpdateUserRequest {
  User user = 1;
}

message UpdateUserResponse {
  User user = 1;
}

message DeleteUserRequest {
  string id = 1;
}

message DeleteUserResponse {
  bool success = 1;
}
```

### Streaming Service

```proto
service ChatService {
  // Unary - send single message
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);

  // Server streaming - receive message stream
  rpc StreamMessages(StreamMessagesRequest) returns (stream Message);

  // Client streaming - send message stream
  rpc UploadMessages(stream Message) returns (UploadResponse);

  // Bidirectional - chat stream
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

## Integration with Other Features

### Schema Graph

Visualize service relationships in the schema graph:

- Services appear as nodes
- RPCs show connections to request/response types

### Code Actions

Quick fixes for common gRPC issues:

- Add missing request/response messages
- Fix RPC signatures
- Add service options

### Diagnostics

Automatic checks for:

- Undefined request/response types
- Invalid streaming syntax
- Missing service definitions

## See Also

- [gRPC Client Feature Specification](./GRPC_CLIENT_FEATURE_SPECIFICATION.md) - Complete feature spec for the full gRPC client
- [Snippets](./snippets.md) - gRPC code snippets
- [Completions](./completions.md) - Smart IntelliSense for services
- [Schema Graph](./schema-graph.md) - Visualize service relationships
- [Templates](./templates.md) - Service templates
- [Playground](./playground.md) - Interactive request testing
