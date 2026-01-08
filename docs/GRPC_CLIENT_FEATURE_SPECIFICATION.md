# gRPC Client Feature Specification

> **Status**: Feature Specification
> **Version**: 1.0
> **Last Updated**: 2025-01-06

This document provides a comprehensive specification for implementing a full-featured gRPC client within the Protobuf VSC extension. The goal is to enable developers to call gRPC endpoints, import protobuf files, generate stubs, send requests, and view responses—all from within VS Code.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Feature Vision](#feature-vision)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Feature Breakdown](#detailed-feature-breakdown)
   - [5.1 Connection Management](#51-connection-management)
   - [5.2 Service Discovery](#52-service-discovery)
   - [5.3 Request Building](#53-request-building)
   - [5.4 Request Execution](#54-request-execution)
   - [5.5 Response Handling](#55-response-handling)
   - [5.6 Streaming Support](#56-streaming-support)
   - [5.7 Stub Generation](#57-stub-generation)
   - [5.8 History & Collections](#58-history--collections)
   - [5.9 Environment Management](#59-environment-management)
   - [5.10 Authentication](#510-authentication)
6. [Subtasks & Implementation Plan](#subtasks--implementation-plan)
7. [UI/UX Design](#uiux-design)
8. [Configuration Schema](#configuration-schema)
9. [API Design](#api-design)
10. [Error Handling](#error-handling)
11. [Testing Strategy](#testing-strategy)
12. [Security Considerations](#security-considerations)
13. [Performance Considerations](#performance-considerations)
14. [Future Enhancements](#future-enhancements)
15. [Glossary](#glossary)

---

## 1. Executive Summary

The gRPC Client feature transforms the Protobuf VSC extension from a schema editing tool into a complete gRPC development environment. Users will be able to:

- **Connect** to gRPC servers (local, remote, with TLS/mTLS)
- **Discover** services via server reflection or proto files
- **Build** requests with intelligent auto-completion
- **Execute** unary, streaming, and bidirectional RPCs
- **Inspect** responses with formatting and visualization
- **Generate** client/server stubs in multiple languages
- **Save** requests into collections for reuse
- **Manage** multiple environments and authentication methods

This feature positions the extension as a **Postman/Insomnia alternative for gRPC**.

---

## 2. Current State Analysis

### What Exists Today

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Service Discovery (AST) | ✅ Implemented | `src/server/providers/grpc.ts` | Parses services from proto files |
| Service Listing Command | ✅ Implemented | `src/client/commands/grpc.ts` | Lists services via quick pick |
| Client Stub Preview | ✅ Implemented | `src/server/providers/grpc.ts` | Generates pseudo-code stubs |
| Server Template Preview | ✅ Implemented | `src/server/providers/grpc.ts` | Generates server templates |
| Service Statistics | ✅ Implemented | `src/server/providers/grpc.ts` | RPC count by streaming type |
| Basic Playground | ⚠️ Partial | `src/client/playground/playgroundManager.ts` | Requires grpcurl, basic UI |

### Gaps Identified

| Gap | Priority | Description |
|-----|----------|-------------|
| Native gRPC Client | 🔴 Critical | Currently depends on external `grpcurl` |
| Server Reflection | 🔴 Critical | Cannot discover services from running servers |
| TLS/mTLS Support | 🔴 Critical | Only plaintext connections supported |
| Streaming UI | 🔴 Critical | No UI for streaming RPCs |
| Request Auto-completion | 🟠 High | No schema-aware JSON completion |
| Request History | 🟠 High | No persistence of past requests |
| Request Collections | 🟠 High | Cannot save/organize requests |
| Environment Variables | 🟠 High | No variable substitution |
| Authentication | 🟠 High | No auth header/token support |
| Response Visualization | 🟡 Medium | Basic text output only |
| Import Management | 🟡 Medium | Manual proto file selection |
| Metadata Support | 🟡 Medium | No custom metadata headers |
| Deadlines/Timeouts | 🟡 Medium | No configurable timeouts |
| Response Comparison | 🟢 Low | Cannot diff responses |
| Mock Server | 🟢 Low | No mock server generation |

---

## 3. Feature Vision

### User Stories

#### As a Backend Developer
- I want to test my gRPC services without leaving VS Code
- I want auto-completion when writing request payloads based on my proto schema
- I want to see streaming responses in real-time

#### As a QA Engineer
- I want to save collections of requests for regression testing
- I want to switch between dev/staging/prod environments easily
- I want to see response times and metadata

#### As a Microservices Developer
- I want to discover services from a running server via reflection
- I want to generate client code in my preferred language
- I want to test services that require authentication

#### As a DevOps Engineer
- I want to verify gRPC endpoints are responding correctly
- I want to configure TLS certificates for secure connections
- I want to test with different timeout configurations

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VS Code Extension                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        Client Layer (Extension Host)                     │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                           │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │ │
│  │  │  Playground     │  │  Request        │  │  Response       │          │ │
│  │  │  Webview Panel  │  │  Builder Panel  │  │  Viewer Panel   │          │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │ │
│  │           │                    │                    │                     │ │
│  │           └────────────────────┼────────────────────┘                     │ │
│  │                                ▼                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    gRPC Client Manager                               │ │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │ │ │
│  │  │  │ Connection  │ │   Request   │ │  Response   │ │   History   │   │ │ │
│  │  │  │   Manager   │ │   Executor  │ │   Handler   │ │   Manager   │   │ │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                │                                          │ │
│  └────────────────────────────────┼──────────────────────────────────────────┘ │
│                                   │                                            │
│  ┌────────────────────────────────┼──────────────────────────────────────────┐ │
│  │                    Language Server (LSP)                                   │ │
│  │                                │                                           │ │
│  │  ┌─────────────────────────────▼──────────────────────────────────────┐   │ │
│  │  │                      gRPC Provider                                  │   │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │   │ │
│  │  │  │   Service   │ │   Schema    │ │   Stub      │ │   Reflect   │  │   │ │
│  │  │  │   Analyzer  │ │   Resolver  │ │   Generator │ │   Client    │  │   │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │   │ │
│  │  └───────────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           gRPC/HTTP2 Layer                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   @grpc/grpc-js │  │   protobuf.js   │  │  reflection     │              │
│  │   (Native Node) │  │  (Dynamic Msgs) │  │  service client │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Target gRPC Server                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| gRPC Client | `@grpc/grpc-js` | Native Node.js gRPC implementation |
| Proto Parsing | `protobufjs` | Dynamic message creation from .proto |
| Reflection | `@grpc/reflection` | Server reflection support |
| UI Framework | VS Code Webview | Native VS Code integration |
| State Management | VS Code Memento API | Persistent storage for history/collections |
| TLS | Node.js `tls` module | Certificate handling |

---

## 5. Detailed Feature Breakdown

### 5.1 Connection Management

#### 5.1.1 Connection Configuration

**Requirements:**
- Support plaintext, TLS, and mTLS connections
- Store connection profiles persistently
- Allow quick switching between servers
- Validate connections before saving

**Connection Profile Schema:**

```typescript
interface ConnectionProfile {
  id: string;
  name: string;                      // Display name
  address: string;                   // host:port
  useTls: boolean;                   // Enable TLS
  tlsConfig?: {
    rootCertPath?: string;           // CA certificate
    clientCertPath?: string;         // Client certificate (mTLS)
    clientKeyPath?: string;          // Client key (mTLS)
    serverNameOverride?: string;     // For testing with self-signed certs
    skipVerification?: boolean;      // Insecure mode (dev only)
  };
  defaultMetadata?: Record<string, string>;  // Headers sent with every request
  defaultDeadlineMs?: number;        // Request timeout
  keepaliveEnabled?: boolean;        // HTTP2 keepalive
  keepaliveIntervalMs?: number;
  maxReceiveMessageSize?: number;    // Max response size
  maxSendMessageSize?: number;       // Max request size
  tags?: string[];                   // For organization
  createdAt: string;
  updatedAt: string;
}
```

**UI Components:**
- Connection profile editor (form-based)
- Connection list in sidebar
- Quick connect dialog
- Connection status indicator (connected/disconnected/error)

#### 5.1.2 Connection Pool

**Requirements:**
- Maintain connection pools per profile
- Automatic reconnection on failure
- Connection health checks
- Graceful shutdown

**Implementation:**

```typescript
class ConnectionManager {
  private pools: Map<string, GrpcChannel>;

  async getChannel(profileId: string): Promise<GrpcChannel>;
  async testConnection(profile: ConnectionProfile): Promise<ConnectionTestResult>;
  async closeChannel(profileId: string): Promise<void>;
  async closeAll(): Promise<void>;

  // Event emitters
  onConnectionStateChange: Event<{ profileId: string; state: ConnectionState }>;
  onConnectionError: Event<{ profileId: string; error: Error }>;
}
```

---

### 5.2 Service Discovery

#### 5.2.1 Proto File-Based Discovery

**Current Implementation:** ✅ Exists in `GrpcProvider`

**Enhancements Needed:**
- Link discovered services to connection profiles
- Support proto files with imports from different paths
- Cache parsed service definitions
- Handle proto file changes (reparse on save)

#### 5.2.2 Server Reflection

**Requirements:**
- Query running gRPC servers for available services
- Parse and display service/method definitions
- Generate synthetic proto from reflection data
- Cache reflection results

**Implementation:**

```typescript
interface ReflectionClient {
  listServices(channel: GrpcChannel): Promise<string[]>;
  getServiceDescriptor(
    channel: GrpcChannel,
    serviceName: string
  ): Promise<ServiceDescriptor>;
  getFileDescriptor(
    channel: GrpcChannel,
    fileName: string
  ): Promise<FileDescriptor>;
}

interface ServiceDescriptor {
  name: string;
  fullName: string;
  methods: MethodDescriptor[];
  options: Record<string, unknown>;
}

interface MethodDescriptor {
  name: string;
  inputType: MessageDescriptor;
  outputType: MessageDescriptor;
  clientStreaming: boolean;
  serverStreaming: boolean;
  options: Record<string, unknown>;
}
```

#### 5.2.3 Hybrid Discovery

**Requirements:**
- Combine proto file and reflection data
- Prefer reflection for accurate runtime info
- Fall back to proto files when reflection unavailable
- Show discovery source in UI

---

### 5.3 Request Building

#### 5.3.1 Message Schema Resolution

**Requirements:**
- Resolve full message schema including nested types
- Handle imports and cross-file references
- Support well-known types (Timestamp, Duration, Any, etc.)
- Resolve enums with value names

**Implementation:**

```typescript
interface MessageSchema {
  name: string;
  fullName: string;
  fields: FieldSchema[];
  oneofs: OneofSchema[];
  nested: MessageSchema[];
  enums: EnumSchema[];
}

interface FieldSchema {
  name: string;
  number: number;
  type: FieldType;
  typeName?: string;           // For message/enum types
  repeated: boolean;
  map: boolean;
  mapKeyType?: FieldType;
  optional: boolean;
  deprecated: boolean;
  defaultValue?: unknown;
  documentation?: string;
}

class SchemaResolver {
  resolveMessage(typeName: string, context: ProtoContext): MessageSchema;
  resolveEnum(typeName: string, context: ProtoContext): EnumSchema;
  getDefaultValue(field: FieldSchema): unknown;
  generateSampleJson(schema: MessageSchema): object;
}
```

#### 5.3.2 Request Editor

**Requirements:**
- JSON editor with schema-aware auto-completion
- Syntax highlighting for JSON
- Validation against proto schema
- Inline error indicators
- Format/prettify support
- Sample request generation

**UI Components:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Request Body                                           [Format] │
├─────────────────────────────────────────────────────────────────┤
│ {                                                              │
│   "user_id": "│",        ← cursor position                     │
│   "name": "",            ← shows auto-complete for fields      │
│   "email": "",                                                 │
│   "role": ""             ← shows enum values                   │
│ }                                                              │
├─────────────────────────────────────────────────────────────────┤
│ ⚠ Field 'role' should be one of: ADMIN, USER, GUEST           │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.3.3 Request Templates

**Requirements:**
- Generate empty request template from schema
- Generate sample request with realistic values
- Save custom templates per method
- Variable placeholders (${variable})

**Template Types:**

| Template | Description | Example |
|----------|-------------|---------|
| Empty | All fields empty/default | `{"name": "", "age": 0}` |
| Sample | Realistic fake data | `{"name": "John Doe", "age": 30}` |
| Minimal | Only required fields | `{"id": ""}` |
| Full | All fields including optional | Full schema |

---

### 5.4 Request Execution

#### 5.4.1 Unary Requests

**Requirements:**
- Execute single request/response RPCs
- Show execution time
- Support cancellation
- Handle errors gracefully
- Display metadata (sent and received)

**Implementation:**

```typescript
interface UnaryRequest {
  connectionId: string;
  serviceName: string;
  methodName: string;
  requestBody: object;
  metadata?: Record<string, string>;
  deadlineMs?: number;
}

interface UnaryResponse {
  success: boolean;
  responseBody?: object;
  error?: GrpcError;
  status: {
    code: number;
    message: string;
    details?: unknown[];
  };
  metadata: {
    initial: Record<string, string>;
    trailing: Record<string, string>;
  };
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
}
```

#### 5.4.2 Streaming Requests

**Requirements:**
- Support all four RPC types:
  - Unary (request → response)
  - Server streaming (request → stream of responses)
  - Client streaming (stream of requests → response)
  - Bidirectional streaming (stream ↔ stream)
- Real-time display of streaming messages
- Message timestamps
- Stream control (pause/resume/cancel)
- Message count and statistics

**Stream UI Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Server Streaming: UserService.StreamUpdates                     │
│ Status: ● Receiving                     [Pause] [Cancel]        │
├─────────────────────────────────────────────────────────────────┤
│ Messages: 42 | Duration: 00:01:23 | Rate: ~0.5 msg/s            │
├─────────────────────────────────────────────────────────────────┤
│ ▼ Message #42 (12:34:56.789)                                    │
│   {"user_id": "123", "status": "online"}                        │
│ ▼ Message #41 (12:34:55.123)                                    │
│   {"user_id": "456", "status": "offline"}                       │
│ ▶ Message #40 (12:34:54.567)  [collapsed]                       │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.4.3 Request Cancellation

**Requirements:**
- Allow cancellation of in-flight requests
- Properly clean up resources on cancel
- Show cancellation status
- Support deadline-based auto-cancellation

---

### 5.5 Response Handling

#### 5.5.1 Response Display

**Requirements:**
- Pretty-print JSON responses
- Syntax highlighting
- Collapsible nested objects
- Copy to clipboard
- Search within response
- Line numbers

#### 5.5.2 Response Metadata

**Requirements:**
- Display initial metadata (headers)
- Display trailing metadata
- Show gRPC status code and message
- Display timing information
- Show response size

**Metadata Display:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Response Metadata                                               │
├─────────────────────────────────────────────────────────────────┤
│ Status: OK (0)                                                  │
│ Duration: 45ms                                                  │
│ Size: 1.2 KB                                                    │
├─────────────────────────────────────────────────────────────────┤
│ Initial Metadata:                                               │
│   content-type: application/grpc                                │
│   x-request-id: abc-123                                         │
├─────────────────────────────────────────────────────────────────┤
│ Trailing Metadata:                                              │
│   grpc-status: 0                                                │
│   x-response-time: 45                                           │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.5.3 Error Handling Display

**Requirements:**
- Display gRPC error codes with descriptions
- Show error details (google.rpc.Status)
- Parse and display error metadata
- Link errors to documentation

**Error Codes Reference:**

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Success |
| 1 | CANCELLED | Operation cancelled |
| 2 | UNKNOWN | Unknown error |
| 3 | INVALID_ARGUMENT | Invalid request |
| 4 | DEADLINE_EXCEEDED | Timeout |
| 5 | NOT_FOUND | Resource not found |
| 6 | ALREADY_EXISTS | Resource already exists |
| 7 | PERMISSION_DENIED | No permission |
| 8 | RESOURCE_EXHAUSTED | Rate limited |
| 9 | FAILED_PRECONDITION | Precondition failed |
| 10 | ABORTED | Operation aborted |
| 11 | OUT_OF_RANGE | Out of range |
| 12 | UNIMPLEMENTED | Not implemented |
| 13 | INTERNAL | Internal error |
| 14 | UNAVAILABLE | Service unavailable |
| 15 | DATA_LOSS | Data loss |
| 16 | UNAUTHENTICATED | Not authenticated |

---

### 5.6 Streaming Support

#### 5.6.1 Server Streaming

**Workflow:**
1. User sends single request
2. Server sends stream of responses
3. UI shows messages in real-time
4. User can cancel stream

**Implementation:**

```typescript
interface StreamingSession {
  id: string;
  type: 'server' | 'client' | 'bidirectional';
  status: 'connecting' | 'active' | 'paused' | 'completed' | 'error' | 'cancelled';
  messages: StreamMessage[];
  startTime: number;
  endTime?: number;
  error?: GrpcError;
}

interface StreamMessage {
  id: string;
  direction: 'sent' | 'received';
  timestamp: number;
  body: object;
  size: number;
}
```

#### 5.6.2 Client Streaming

**Workflow:**
1. User opens stream
2. User sends multiple messages
3. User ends stream
4. Server sends final response

**UI for Client Streaming:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Client Streaming: DataService.Upload                            │
│ Status: ● Sending                    [Send Message] [End Stream]│
├─────────────────────────────────────────────────────────────────┤
│ Compose Message:                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ {"chunk": "base64data...", "index": 1}                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Sent Messages: 5 | Total Size: 10.2 KB                          │
│ ► Message #5 (12:34:56.789) - sent                              │
│ ► Message #4 (12:34:55.123) - sent                              │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.6.3 Bidirectional Streaming

**Workflow:**
1. Stream opened in both directions
2. Messages can be sent/received simultaneously
3. Either side can end the stream
4. Real-time interleaved display

**UI for Bidirectional Streaming:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Bidirectional: ChatService.Chat                                  │
│ Status: ● Active                     [Send Message] [End Stream]│
├─────────────────────────────────────────────────────────────────┤
│ Timeline (newest first):                                         │
│ ← #6 (12:34:57) {"message": "Hello back!"}                      │
│ → #5 (12:34:56) {"message": "Hello server"}                     │
│ ← #4 (12:34:55) {"message": "Connected"}                        │
│ → #3 (12:34:54) {"message": "Starting chat"}                    │
├─────────────────────────────────────────────────────────────────┤
│ Compose:                                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ {"message": "How are you?"}                            [Send]│ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.7 Stub Generation

#### 5.7.1 Client Stub Generation

**Current Implementation:** ✅ Exists (pseudo-code preview)

**Enhancements Needed:**
- Generate actual compilable code
- Include proper imports
- Support more languages (Rust, C#, Swift, Kotlin)
- Generate complete project structure
- Include build configuration (go.mod, package.json, etc.)

**Supported Languages:**

| Language | Framework | Output Files |
|----------|-----------|--------------|
| Go | grpc-go | `client.go`, `go.mod` |
| Java | grpc-java | `Client.java`, `pom.xml` |
| Python | grpcio | `client.py`, `requirements.txt` |
| TypeScript | @grpc/grpc-js | `client.ts`, `package.json` |
| Rust | tonic | `client.rs`, `Cargo.toml` |
| C# | Grpc.Net.Client | `Client.cs`, `.csproj` |
| Kotlin | grpc-kotlin | `Client.kt`, `build.gradle.kts` |

#### 5.7.2 Server Stub Generation

**Current Implementation:** ✅ Exists (template preview)

**Enhancements Needed:**
- Generate complete server implementations
- Include error handling boilerplate
- Generate service registration code
- Include health check endpoints
- Generate Dockerfile and deployment configs

#### 5.7.3 Proto Compilation

**Integration with protoc/buf:**
- Compile proto files to language-specific code
- Support custom plugins
- Configure output directories
- Handle compilation errors

---

### 5.8 History & Collections

#### 5.8.1 Request History

**Requirements:**
- Auto-save all executed requests
- Search history by service/method/content
- Quick re-execute from history
- Clear history (all or selective)
- History size limit (configurable)

**History Entry Schema:**

```typescript
interface HistoryEntry {
  id: string;
  timestamp: number;
  connectionId: string;
  serviceName: string;
  methodName: string;
  request: {
    body: object;
    metadata: Record<string, string>;
  };
  response?: {
    success: boolean;
    body?: object;
    error?: GrpcError;
    durationMs: number;
  };
  tags?: string[];
}
```

#### 5.8.2 Request Collections

**Requirements:**
- Create named collections
- Organize requests in folders
- Export/import collections (JSON format)
- Share collections (URL or file)
- Collection-level variables

**Collection Schema:**

```typescript
interface Collection {
  id: string;
  name: string;
  description?: string;
  folders: CollectionFolder[];
  requests: SavedRequest[];
  variables: Record<string, string>;
  auth?: AuthConfig;
  createdAt: string;
  updatedAt: string;
}

interface CollectionFolder {
  id: string;
  name: string;
  requests: SavedRequest[];
  folders: CollectionFolder[];  // Nested folders
}

interface SavedRequest {
  id: string;
  name: string;
  connectionId: string;
  serviceName: string;
  methodName: string;
  request: {
    body: object;
    metadata: Record<string, string>;
  };
  description?: string;
  tags?: string[];
}
```

---

### 5.9 Environment Management

#### 5.9.1 Environment Variables

**Requirements:**
- Define variables per environment
- Variable substitution in requests (${VAR_NAME})
- Quick environment switching
- Import/export environments

**Environment Schema:**

```typescript
interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  active: boolean;
}

interface EnvironmentVariable {
  key: string;
  value: string;
  type: 'text' | 'secret';  // Secrets are masked in UI
  enabled: boolean;
}
```

**Variable Substitution Example:**

```json
// Environment: "development"
// Variables: { "BASE_URL": "localhost:50051", "USER_ID": "test-user-1" }

// Request body with variables:
{
  "user_id": "${USER_ID}",
  "metadata": {
    "client": "vscode-grpc"
  }
}

// Resolved request:
{
  "user_id": "test-user-1",
  "metadata": {
    "client": "vscode-grpc"
  }
}
```

#### 5.9.2 Environment UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Environments                                      [+] [⚙]        │
├─────────────────────────────────────────────────────────────────┤
│ ● Development (active)                                           │
│   ○ Staging                                                      │
│   ○ Production                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Variables (Development):                                         │
│ ┌──────────────┬────────────────────────────────────┬─────────┐ │
│ │ Key          │ Value                              │ Enabled │ │
│ ├──────────────┼────────────────────────────────────┼─────────┤ │
│ │ BASE_URL     │ localhost:50051                    │ ✓       │ │
│ │ API_KEY      │ ••••••••••                         │ ✓       │ │
│ │ USER_ID      │ test-user-1                        │ ✓       │ │
│ └──────────────┴────────────────────────────────────┴─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.10 Authentication

#### 5.10.1 Supported Auth Methods

| Method | Description | Configuration |
|--------|-------------|---------------|
| No Auth | No authentication | - |
| API Key | Header-based key | Header name, key value |
| Bearer Token | JWT or OAuth token | Token value |
| Basic Auth | Username/password | Credentials |
| mTLS | Client certificates | Cert paths |
| OAuth 2.0 | OAuth flow | Client ID, secret, endpoints |
| Custom | Custom headers | Header key-value pairs |

#### 5.10.2 Auth Configuration Schema

```typescript
type AuthConfig =
  | { type: 'none' }
  | { type: 'api-key'; headerName: string; value: string }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'mtls'; certPath: string; keyPath: string; caPath?: string }
  | { type: 'oauth2'; config: OAuth2Config }
  | { type: 'custom'; headers: Record<string, string> };

interface OAuth2Config {
  grantType: 'client_credentials' | 'authorization_code' | 'password';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes?: string[];
  // For authorization_code flow
  authUrl?: string;
  redirectUri?: string;
}
```

#### 5.10.3 Auth UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Authentication                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Type: [Bearer Token ▼]                                           │
│                                                                  │
│ Token:                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ☐ Add to collection (all requests)                              │
│ ☑ Save token securely                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Subtasks & Implementation Plan

### Phase 1: Core gRPC Client (Foundation)

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 1.1 | Integrate `@grpc/grpc-js` package | 🔴 Critical | Medium | None | - |
| 1.2 | Implement `ConnectionManager` class | 🔴 Critical | Medium | 1.1 | - |
| 1.3 | Create `ConnectionProfile` storage (VS Code Memento) | 🔴 Critical | Low | None | - |
| 1.4 | Implement TLS/mTLS connection support | 🔴 Critical | Medium | 1.2 | - |
| 1.5 | Add connection testing/validation | 🟠 High | Low | 1.2, 1.4 | - |
| 1.6 | Create connection status events | 🟠 High | Low | 1.2 | - |

### Phase 2: Service Discovery Enhancement

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 2.1 | Integrate `@grpc/reflection` package | 🔴 Critical | Medium | 1.1 | - |
| 2.2 | Implement `ReflectionClient` class | 🔴 Critical | High | 2.1 | - |
| 2.3 | Create service descriptor model | 🟠 High | Medium | 2.2 | - |
| 2.4 | Merge reflection + proto file discovery | 🟠 High | Medium | 2.3 | - |
| 2.5 | Cache reflection results | 🟡 Medium | Low | 2.2 | - |
| 2.6 | Add reflection fallback to proto files | 🟡 Medium | Low | 2.4 | - |

### Phase 3: Request Building

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 3.1 | Implement `SchemaResolver` for message types | 🔴 Critical | High | None | - |
| 3.2 | Create JSON schema from proto messages | 🟠 High | Medium | 3.1 | - |
| 3.3 | Integrate JSON editor with auto-completion | 🟠 High | High | 3.2 | - |
| 3.4 | Add request validation against schema | 🟠 High | Medium | 3.1 | - |
| 3.5 | Implement sample request generation | 🟡 Medium | Medium | 3.1 | - |
| 3.6 | Add variable substitution engine | 🟡 Medium | Low | None | - |

### Phase 4: Request Execution

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 4.1 | Implement unary request executor | 🔴 Critical | Medium | 1.2, 3.1 | - |
| 4.2 | Add metadata support (headers) | 🟠 High | Low | 4.1 | - |
| 4.3 | Implement deadline/timeout support | 🟠 High | Low | 4.1 | - |
| 4.4 | Add request cancellation | 🟠 High | Medium | 4.1 | - |
| 4.5 | Create response timing measurement | 🟡 Medium | Low | 4.1 | - |
| 4.6 | Implement error handling with status codes | 🟠 High | Medium | 4.1 | - |

### Phase 5: Streaming Support

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 5.1 | Implement server streaming handler | 🔴 Critical | High | 4.1 | - |
| 5.2 | Implement client streaming handler | 🔴 Critical | High | 4.1 | - |
| 5.3 | Implement bidirectional streaming handler | 🔴 Critical | High | 5.1, 5.2 | - |
| 5.4 | Create streaming session management | 🟠 High | Medium | 5.1, 5.2, 5.3 | - |
| 5.5 | Add stream pause/resume functionality | 🟡 Medium | Medium | 5.4 | - |
| 5.6 | Implement stream message buffering | 🟡 Medium | Medium | 5.4 | - |

### Phase 6: UI - Playground Redesign

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 6.1 | Design new playground webview architecture | 🔴 Critical | Medium | None | - |
| 6.2 | Implement connection panel | 🔴 Critical | Medium | 1.2 | - |
| 6.3 | Create service browser panel | 🔴 Critical | Medium | 2.4 | - |
| 6.4 | Build request editor panel | 🔴 Critical | High | 3.3 | - |
| 6.5 | Implement response viewer panel | 🔴 Critical | Medium | 4.1 | - |
| 6.6 | Create streaming message timeline | 🟠 High | High | 5.4 | - |
| 6.7 | Add metadata viewer | 🟡 Medium | Low | 4.2 | - |
| 6.8 | Implement timing/stats display | 🟡 Medium | Low | 4.5 | - |

### Phase 7: History & Collections

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 7.1 | Implement request history storage | 🟠 High | Medium | None | - |
| 7.2 | Create history browser UI | 🟠 High | Medium | 7.1 | - |
| 7.3 | Add history search/filter | 🟡 Medium | Low | 7.2 | - |
| 7.4 | Implement collections storage | 🟠 High | Medium | None | - |
| 7.5 | Create collections browser UI | 🟠 High | Medium | 7.4 | - |
| 7.6 | Add collection import/export | 🟡 Medium | Low | 7.4 | - |
| 7.7 | Implement collection sharing (file-based) | 🟢 Low | Low | 7.6 | - |

### Phase 8: Environment Management

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 8.1 | Implement environment storage | 🟠 High | Low | None | - |
| 8.2 | Create environment editor UI | 🟠 High | Medium | 8.1 | - |
| 8.3 | Add variable substitution to requests | 🟠 High | Medium | 3.6, 8.1 | - |
| 8.4 | Implement environment switching | 🟠 High | Low | 8.1 | - |
| 8.5 | Add secure variable storage (secrets) | 🟡 Medium | Medium | 8.1 | - |
| 8.6 | Implement environment import/export | 🟢 Low | Low | 8.1 | - |

### Phase 9: Authentication

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 9.1 | Implement API key authentication | 🟠 High | Low | 4.2 | - |
| 9.2 | Implement Bearer token authentication | 🟠 High | Low | 4.2 | - |
| 9.3 | Implement Basic authentication | 🟠 High | Low | 4.2 | - |
| 9.4 | Create authentication UI | 🟠 High | Medium | 9.1, 9.2, 9.3 | - |
| 9.5 | Implement OAuth 2.0 client credentials flow | 🟡 Medium | High | 4.2 | - |
| 9.6 | Add custom header authentication | 🟡 Medium | Low | 4.2 | - |
| 9.7 | Implement token refresh for OAuth | 🟢 Low | Medium | 9.5 | - |

### Phase 10: Code Generation Enhancement

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 10.1 | Enhance Go client stub generation | 🟡 Medium | Medium | None | - |
| 10.2 | Enhance Python client stub generation | 🟡 Medium | Medium | None | - |
| 10.3 | Enhance TypeScript client stub generation | 🟡 Medium | Medium | None | - |
| 10.4 | Enhance Java client stub generation | 🟡 Medium | Medium | None | - |
| 10.5 | Add Rust client stub generation | 🟢 Low | High | None | - |
| 10.6 | Add C# client stub generation | 🟢 Low | High | None | - |
| 10.7 | Generate project boilerplate (build files) | 🟢 Low | Medium | 10.1-10.4 | - |

### Phase 11: Polish & Documentation

| ID | Task | Priority | Complexity | Dependencies | Estimated Effort |
|----|------|----------|------------|--------------|------------------|
| 11.1 | Write user documentation | 🟠 High | Medium | All | - |
| 11.2 | Create feature walkthrough/tutorial | 🟠 High | Medium | All | - |
| 11.3 | Add keyboard shortcuts | 🟡 Medium | Low | 6.x | - |
| 11.4 | Implement settings UI | 🟡 Medium | Medium | All | - |
| 11.5 | Add telemetry/analytics (opt-in) | 🟢 Low | Low | All | - |
| 11.6 | Performance optimization | 🟡 Medium | High | All | - |

---

## 7. UI/UX Design

### 7.1 Main Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ VS Code Window                                                                 │
├─────────────────────┬─────────────────────────────────────────────────────────┤
│ GRPC EXPLORER       │  Request Builder                                        │
│ ▼ Connections       │  ┌─────────────────────────────────────────────────────┐│
│   ● localhost:50051 │  │ Connection: [localhost:50051 ▼]  Environment: [Dev ▼]│
│   ○ staging.api.com │  ├─────────────────────────────────────────────────────┤│
│   ○ prod.api.com    │  │ Service: [UserService ▼]  Method: [GetUser ▼]       ││
│                     │  ├─────────────────────────────────────────────────────┤│
│ ▼ Services          │  │ Request Body:                                        ││
│   ▼ UserService     │  │ ┌─────────────────────────────────────────────────┐ ││
│     → GetUser       │  │ │ {                                               │ ││
│     → ListUsers     │  │ │   "user_id": "123"                              │ ││
│     →→ StreamUsers  │  │ │ }                                               │ ││
│   ▼ OrderService    │  │ └─────────────────────────────────────────────────┘ ││
│     → CreateOrder   │  ├─────────────────────────────────────────────────────┤│
│     → GetOrder      │  │ Metadata:  [+ Add Header]                           ││
│                     │  │ ┌─────────────┬───────────────────────────────────┐ ││
│ ▼ Collections       │  │ │ Key         │ Value                             │ ││
│   ▶ User Flows      │  │ ├─────────────┼───────────────────────────────────┤ ││
│   ▶ Order Tests     │  │ │ x-request-id│ ${REQUEST_ID}                     │ ││
│                     │  │ └─────────────┴───────────────────────────────────┘ ││
│ ▼ History           │  ├─────────────────────────────────────────────────────┤│
│   12:34 GetUser     │  │          [▶ Send Request]  [💾 Save to Collection]  ││
│   12:30 ListUsers   │  └─────────────────────────────────────────────────────┘│
│   12:25 CreateOrder │  ──────────────────────────────────────────────────────││
│                     │  Response                               Status: OK (0) ││
├─────────────────────┤  ┌─────────────────────────────────────────────────────┐│
│                     │  │ {                                   Duration: 45ms  ││
│                     │  │   "user": {                         Size: 1.2 KB    ││
│                     │  │     "id": "123",                                    ││
│                     │  │     "name": "John Doe",                             ││
│                     │  │     "email": "john@example.com",                    ││
│                     │  │     "created_at": "2024-01-01T00:00:00Z"            ││
│                     │  │   }                                                 ││
│                     │  │ }                                                   ││
│                     │  └─────────────────────────────────────────────────────┘│
└─────────────────────┴─────────────────────────────────────────────────────────┘
```

### 7.2 Streaming UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Server Streaming: UserService.StreamUpdates                                      │
│ Status: ● Receiving                                           [⏸ Pause] [⏹ Stop]│
├─────────────────────────────────────────────────────────────────────────────────┤
│ Stats: Messages: 127 | Duration: 00:05:23 | Rate: 0.4 msg/s | Size: 45.2 KB     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Message Stream:                                                    [🔍 Search]  │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ #127  12:34:56.789  ◄  {"user_id": "789", "status": "online", "action"...}  │ │
│ │ #126  12:34:55.123  ◄  {"user_id": "456", "status": "offline"}              │ │
│ │ #125  12:34:54.567  ◄  {"user_id": "123", "status": "online"}               │ │
│ │ #124  12:34:53.012  ◄  {"user_id": "789", "status": "typing"}               │ │
│ │ ...                                                                          │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Selected Message #127:                                                          │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ {                                                                            │ │
│ │   "user_id": "789",                                                          │ │
│ │   "status": "online",                                                        │ │
│ │   "action": "login",                                                         │ │
│ │   "timestamp": "2024-01-01T12:34:56.789Z"                                    │ │
│ │ }                                                                            │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Color Scheme & Icons

| Element | Icon | Color (Dark Theme) |
|---------|------|-------------------|
| Unary RPC | → | Default |
| Server Streaming | →→ | Blue |
| Client Streaming | →→ | Green |
| Bidirectional | ⇄ | Purple |
| Success Status | ✓ | Green (#4EC9B0) |
| Error Status | ✗ | Red (#F14C4C) |
| Pending/Loading | ◌ | Yellow (#CCA700) |
| Connected | ● | Green |
| Disconnected | ○ | Gray |

---

## 8. Configuration Schema

### 8.1 VS Code Settings

```json
{
  "protobuf.grpc.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable gRPC client features"
  },
  "protobuf.grpc.defaultDeadlineMs": {
    "type": "number",
    "default": 10000,
    "description": "Default timeout for gRPC requests in milliseconds"
  },
  "protobuf.grpc.maxHistorySize": {
    "type": "number",
    "default": 1000,
    "description": "Maximum number of requests to keep in history"
  },
  "protobuf.grpc.autoConnect": {
    "type": "boolean",
    "default": false,
    "description": "Automatically connect to the last used server on startup"
  },
  "protobuf.grpc.reflection.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Use server reflection when available"
  },
  "protobuf.grpc.reflection.timeout": {
    "type": "number",
    "default": 5000,
    "description": "Timeout for reflection queries in milliseconds"
  },
  "protobuf.grpc.tls.rejectUnauthorized": {
    "type": "boolean",
    "default": true,
    "description": "Reject self-signed certificates (set to false for development)"
  },
  "protobuf.grpc.streaming.maxBufferSize": {
    "type": "number",
    "default": 1000,
    "description": "Maximum number of messages to buffer for streaming RPCs"
  },
  "protobuf.grpc.requestEditor.theme": {
    "type": "string",
    "enum": ["vs-dark", "vs-light", "hc-black"],
    "default": "vs-dark",
    "description": "Theme for the JSON request editor"
  }
}
```

### 8.2 Connection Profile Storage

Stored in VS Code's global state (`context.globalState`):

```typescript
interface GrpcStorageSchema {
  'grpc.connections': ConnectionProfile[];
  'grpc.collections': Collection[];
  'grpc.environments': Environment[];
  'grpc.history': HistoryEntry[];
  'grpc.activeEnvironment': string | null;
  'grpc.lastConnection': string | null;
}
```

---

## 9. API Design

### 9.1 LSP Request Methods

```typescript
// Existing methods
'protobuf/getGrpcServices'
'protobuf/getGrpcService'
'protobuf/getGrpcRpc'
'protobuf/getGrpcRpcsUsingType'
'protobuf/generateGrpcClientStub'
'protobuf/generateGrpcServerTemplate'
'protobuf/getGrpcServiceStats'

// New methods
'protobuf/grpc/getMessageSchema'      // Get full schema for a message type
'protobuf/grpc/validateRequest'       // Validate request against schema
'protobuf/grpc/generateSampleRequest' // Generate sample request JSON
'protobuf/grpc/resolveType'           // Resolve fully qualified type name
```

### 9.2 Client-Side API

```typescript
// Main entry point
class GrpcClientManager {
  // Connection management
  getConnections(): ConnectionProfile[];
  createConnection(profile: ConnectionProfile): Promise<void>;
  updateConnection(id: string, profile: Partial<ConnectionProfile>): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  testConnection(id: string): Promise<ConnectionTestResult>;

  // Service discovery
  discoverServices(connectionId: string): Promise<ServiceDescriptor[]>;
  getServiceMethods(connectionId: string, serviceName: string): Promise<MethodDescriptor[]>;

  // Request execution
  executeUnary(request: UnaryRequest): Promise<UnaryResponse>;
  executeServerStream(request: StreamRequest): StreamSession;
  executeClientStream(request: StreamRequest): StreamSession;
  executeBidirectional(request: StreamRequest): StreamSession;

  // History & collections
  getHistory(): HistoryEntry[];
  clearHistory(): Promise<void>;
  getCollections(): Collection[];
  saveToCollection(collectionId: string, request: SavedRequest): Promise<void>;

  // Environments
  getEnvironments(): Environment[];
  setActiveEnvironment(id: string): Promise<void>;
  resolveVariables(text: string): string;
}
```

---

## 10. Error Handling

### 10.1 Error Categories

| Category | Examples | User Action |
|----------|----------|-------------|
| Connection Error | DNS resolution, network timeout | Check server address, network |
| TLS Error | Certificate validation, handshake | Check certificates, TLS config |
| Authentication Error | Invalid credentials, expired token | Update auth config |
| Request Error | Invalid proto, malformed JSON | Fix request format |
| Server Error | Internal server error, unimplemented | Check server logs |
| Timeout Error | Deadline exceeded | Increase timeout or check server |
| Streaming Error | Stream broken, unexpected EOF | Retry or check server |

### 10.2 Error Messages

```typescript
const ERROR_MESSAGES = {
  // Connection errors
  CONNECTION_FAILED: 'Failed to connect to {address}. Check if the server is running.',
  DNS_RESOLUTION_FAILED: 'Could not resolve host "{host}". Check the server address.',
  CONNECTION_TIMEOUT: 'Connection to {address} timed out after {timeout}ms.',
  CONNECTION_REFUSED: 'Connection refused by {address}. The server may not be accepting connections.',

  // TLS errors
  TLS_HANDSHAKE_FAILED: 'TLS handshake failed. Check your certificate configuration.',
  CERTIFICATE_EXPIRED: 'Server certificate has expired.',
  CERTIFICATE_INVALID: 'Server certificate is invalid: {reason}',
  CLIENT_CERT_REQUIRED: 'Server requires client certificate (mTLS).',

  // Request errors
  INVALID_JSON: 'Invalid JSON in request body: {error}',
  SCHEMA_VALIDATION_FAILED: 'Request does not match schema: {details}',
  MISSING_REQUIRED_FIELD: 'Required field "{field}" is missing.',

  // gRPC errors (code-specific)
  GRPC_CANCELLED: 'Request was cancelled.',
  GRPC_UNKNOWN: 'Unknown error occurred on the server.',
  GRPC_INVALID_ARGUMENT: 'Invalid argument: {message}',
  GRPC_DEADLINE_EXCEEDED: 'Request timed out after {timeout}ms.',
  GRPC_NOT_FOUND: 'Resource not found: {message}',
  GRPC_PERMISSION_DENIED: 'Permission denied. Check your credentials.',
  GRPC_UNAUTHENTICATED: 'Authentication required. Configure authentication settings.',
  GRPC_RESOURCE_EXHAUSTED: 'Rate limit exceeded. Try again later.',
  GRPC_UNIMPLEMENTED: 'Method "{method}" is not implemented on the server.',
  GRPC_UNAVAILABLE: 'Service is currently unavailable. Try again later.',
};
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Component | Test Coverage |
|-----------|---------------|
| ConnectionManager | Connection lifecycle, TLS config, reconnection |
| SchemaResolver | Type resolution, nested types, well-known types |
| RequestExecutor | Unary, streaming, error handling, timeouts |
| HistoryManager | Storage, retrieval, size limits |
| EnvironmentManager | Variable substitution, environment switching |
| AuthHandler | All auth types, header injection |

### 11.2 Integration Tests

| Scenario | Description |
|----------|-------------|
| E2E Unary | Connect → Discover → Execute → Verify response |
| E2E Streaming | Open stream → Send/receive messages → Close |
| Reflection | Connect to server → List services → Execute |
| TLS | Connect with various TLS configurations |
| Auth | All authentication methods against test server |

### 11.3 Test Server

A mock gRPC server for testing:

```typescript
// Test service definition
service TestService {
  rpc Unary(TestRequest) returns (TestResponse);
  rpc ServerStream(TestRequest) returns (stream TestResponse);
  rpc ClientStream(stream TestRequest) returns (TestResponse);
  rpc BidiStream(stream TestRequest) returns (stream TestResponse);

  // Error cases
  rpc AlwaysFails(TestRequest) returns (TestResponse);
  rpc SlowMethod(TestRequest) returns (TestResponse);
  rpc RequiresAuth(TestRequest) returns (TestResponse);
}
```

---

## 12. Security Considerations

### 12.1 Credential Storage

| Data | Storage Method | Protection |
|------|----------------|------------|
| Connection profiles | VS Code globalState | Unencrypted (user preference) |
| API keys | VS Code SecretStorage | Encrypted |
| OAuth tokens | VS Code SecretStorage | Encrypted, auto-refresh |
| TLS certificates | File system paths | User-managed |
| Request history | VS Code globalState | May contain sensitive data (warn user) |

### 12.2 Security Best Practices

1. **Never log credentials** - Mask secrets in output
2. **Warn about insecure connections** - Show warning for plaintext
3. **Validate certificates** - Default to strict TLS verification
4. **Sanitize error messages** - Don't expose internal server details
5. **Timeout all operations** - Prevent resource exhaustion
6. **Limit history size** - Prevent unbounded storage growth

---

## 13. Performance Considerations

### 13.1 Optimization Strategies

| Area | Strategy |
|------|----------|
| Connection pooling | Reuse HTTP/2 connections |
| Schema caching | Cache parsed proto definitions |
| Reflection caching | Cache service descriptors (with TTL) |
| History pagination | Load history in chunks |
| Streaming buffering | Limit in-memory message buffer |
| UI virtualization | Virtual scroll for large message lists |

### 13.2 Resource Limits

| Resource | Default Limit | Configurable |
|----------|---------------|--------------|
| Max connections | 10 | Yes |
| Max message size | 4MB | Yes |
| Max history entries | 1000 | Yes |
| Max stream buffer | 1000 messages | Yes |
| Reflection cache TTL | 5 minutes | Yes |

---

## 14. Future Enhancements

### 14.1 Short Term (Next Release)

- [ ] Response comparison (diff two responses)
- [ ] Request chaining (use response in next request)
- [ ] Keyboard shortcuts for common actions
- [ ] Export responses to file

### 14.2 Medium Term

- [ ] Mock server generation from proto files
- [ ] Load testing (concurrent requests)
- [ ] GraphQL-style query builder
- [ ] gRPC-Web support

### 14.3 Long Term

- [ ] Team collaboration features
- [ ] Cloud sync for collections
- [ ] AI-powered request suggestions
- [ ] Protocol buffer binary inspector
- [ ] Performance profiling

---

## 15. Glossary

| Term | Definition |
|------|------------|
| **gRPC** | Google Remote Procedure Call - high-performance RPC framework |
| **Protocol Buffers (Protobuf)** | Language-neutral data serialization format |
| **Unary RPC** | Single request, single response pattern |
| **Server Streaming** | Single request, stream of responses |
| **Client Streaming** | Stream of requests, single response |
| **Bidirectional Streaming** | Stream of requests and responses |
| **Reflection** | Server capability to describe its services at runtime |
| **mTLS** | Mutual TLS - both client and server authenticate with certificates |
| **Metadata** | Key-value pairs sent with gRPC requests (like HTTP headers) |
| **Deadline** | Maximum time for a request to complete |
| **Channel** | HTTP/2 connection to a gRPC server |
| **Stub** | Client-side generated code for calling gRPC services |

---

## Appendix A: Dependencies

### New NPM Packages Required

```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.10.0",
    "@grpc/reflection": "^1.0.0",
    "protobufjs": "^7.2.0",
    "google-protobuf": "^3.21.0"
  },
  "devDependencies": {
    "@types/google-protobuf": "^3.15.0"
  }
}
```

---

## Appendix B: File Structure

```
src/
├── client/
│   ├── grpc/
│   │   ├── grpcClientManager.ts      # Main manager class
│   │   ├── connectionManager.ts      # Connection handling
│   │   ├── requestExecutor.ts        # Request execution
│   │   ├── streamingHandler.ts       # Streaming RPCs
│   │   ├── historyManager.ts         # Request history
│   │   ├── collectionManager.ts      # Collections
│   │   ├── environmentManager.ts     # Environments
│   │   ├── authHandler.ts            # Authentication
│   │   └── types.ts                  # TypeScript interfaces
│   ├── webviews/
│   │   ├── playground/
│   │   │   ├── PlaygroundPanel.ts    # Main webview panel
│   │   │   ├── components/           # React/Svelte components
│   │   │   └── styles/               # CSS
│   │   └── shared/                   # Shared UI components
│   └── commands/
│       └── grpc.ts                   # Command handlers (enhanced)
├── server/
│   ├── providers/
│   │   └── grpc.ts                   # Enhanced gRPC provider
│   └── services/
│       └── reflection.ts             # Reflection client
└── shared/
    └── grpc/
        ├── schemas.ts                # Shared type definitions
        └── constants.ts              # gRPC constants
```

---

## Appendix C: Command Reference

| Command ID | Title | Description |
|------------|-------|-------------|
| `protobuf.grpc.openPlayground` | Open gRPC Playground | Opens the main gRPC client UI |
| `protobuf.grpc.connect` | Connect to Server | Quick connect dialog |
| `protobuf.grpc.disconnect` | Disconnect from Server | Close current connection |
| `protobuf.grpc.newRequest` | New Request | Create a new request |
| `protobuf.grpc.sendRequest` | Send Request | Execute current request |
| `protobuf.grpc.cancelRequest` | Cancel Request | Cancel in-flight request |
| `protobuf.grpc.saveToCollection` | Save to Collection | Save current request |
| `protobuf.grpc.viewHistory` | View History | Open history browser |
| `protobuf.grpc.clearHistory` | Clear History | Clear request history |
| `protobuf.grpc.manageConnections` | Manage Connections | Open connection manager |
| `protobuf.grpc.manageEnvironments` | Manage Environments | Open environment editor |
| `protobuf.grpc.generateClientStub` | Generate Client Stub | Generate client code |
| `protobuf.grpc.generateServerTemplate` | Generate Server Template | Generate server code |
| `protobuf.grpc.discoverServices` | Discover Services | Refresh service list via reflection |

---

*End of Specification*
