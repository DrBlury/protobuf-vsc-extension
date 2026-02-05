# Protobuf Playground

The Protobuf Playground is an interactive webview that allows you to test gRPC services directly from VS Code. You can send requests to gRPC servers and see responses without leaving your editor.

> **Note:** The Playground is a beta feature. Enable `protobuf.enableBetaFeatures` in your VS Code settings (reload required) to access it.

## Overview

The Playground provides:

- **gRPC request testing** - Send requests to gRPC services
- **Service discovery** - Automatically lists available services (via proto files or server reflection)
- **JSON request bodies** - Easy-to-use JSON input
- **Response viewing** - See responses in real-time
- **File context** - Works with your current `.proto` file
- **Server Reflection** - Discover services from running servers without proto files

## Prerequisites

The Playground requires:

- **grpcurl** - Must be installed (can be installed via the toolchain manager)
- **gRPC server** - A running gRPC server to test against
- **Proto file** - A `.proto` file with service definitions (or use Server Reflection mode)

### Protobuf Editions Limitation

> ⚠️ **Important**: `grpcurl` does not currently support Protobuf Editions syntax (`edition = "2023"`). If your proto files use Editions, you must use **Server Reflection mode** instead. This requires your gRPC server to have reflection enabled.

To enable server reflection in your server:
- **Go**: Import `google.golang.org/grpc/reflection` and call `reflection.Register(server)`
- **Python**: Use `grpc_reflection.v1alpha.reflection.enable_server_reflection()`
- **Java**: Add `ProtoReflectionService` to your server

### Installing grpcurl

#### Using the Toolchain Manager (Recommended)

The easiest way to install grpcurl is through the built-in toolchain manager:

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Run: `Protobuf: Manage Toolchain`
3. Select `Install grpcurl`

The extension will automatically download and install the correct version for your platform.

#### Manual Installation

**macOS**:

```bash
brew install grpcurl
```

**Linux**:

```bash
# Download from https://github.com/fullstorydev/grpcurl/releases
# Or use package manager if available
```

**Windows**:

```bash
# Download from https://github.com/fullstorydev/grpcurl/releases
# Add to PATH
```

### Configuring grpcurl Path

If grpcurl is installed in a non-standard location, configure the path in your settings:

```json
{
  "protobuf.grpcurl.path": "/path/to/grpcurl"
}
```

## Usage

### Opening the Playground

1. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `Protobuf: Open Playground`

2. **Prerequisites**:
   - Open a `.proto` file with service definitions
   - Have `grpcurl` installed (via toolchain manager or manually)

### Playground Interface

The playground opens in a side panel with:

- **Target File** - The current `.proto` file (read-only)
- **Server Address** - gRPC server address (default: `localhost:50051`)
- **Service** - Dropdown of available services (auto-populated)
- **Method** - Method name to call
- **Request Body** - JSON request body
- **Send Request** - Button to send the request
- **Response** - Area showing the response

### Sending Requests

1. **Select Service**:
   - The playground automatically lists services from your proto file
   - Select a service from the dropdown

2. **Enter Method**:
   - Type the method name (e.g., `GetUser`, `CreateOrder`)

3. **Set Server Address**:
   - Enter the gRPC server address (e.g., `localhost:50051`)
   - Format: `host:port`

4. **Write Request Body**:
   - Enter JSON request body
   - Example: `{"user_id": "123", "name": "John"}`

5. **Send Request**:
   - Click "Send Request"
   - View the response in the response area

## Examples

### Basic Request

```json
// Request Body
{
  "user_id": "12345",
  "name": "John Doe"
}
```

### Empty Request

For methods with no parameters:

```json
{}
```

### Nested Messages

```json
{
  "user": {
    "id": "123",
    "name": "John",
    "email": "john@example.com"
  },
  "metadata": {
    "source": "web",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Configuration

### Import Paths

The playground uses your configured import paths:

```json
{
  "protobuf.includes": [
    "./proto",
    "./vendor"
  ]
}
```

These paths are passed to `grpcurl` as `-import-path` flags.

### Server Settings

Currently, the playground uses plaintext connections by default. For production servers, you may need to configure TLS settings (future enhancement).

## Integration

The playground integrates with:

- **Current file** - Uses the active `.proto` file
- **Import paths** - Respects your `protobuf.includes` settings
- **grpcurl** - Uses `grpcurl` for service discovery and requests

## Troubleshooting

### Services Not Loading

If services don't appear:

1. Verify `grpcurl` is installed: `grpcurl --version`
2. Check the Output panel for errors
3. Ensure your proto file has service definitions
4. Verify import paths are correct

### Request Fails

Common issues:

1. **Server not running** - Ensure the gRPC server is running
2. **Wrong address** - Verify the server address is correct
3. **Connection refused** - Check firewall and network settings
4. **Invalid JSON** - Ensure request body is valid JSON
5. **Method not found** - Verify method name matches proto definition

### grpcurl Not Found

If you see "grpcurl not found":

1. Install `grpcurl` (see Prerequisites)
2. Ensure it's in your PATH
3. Restart VS Code after installation

### Import Errors

If imports fail:

1. Check `protobuf.includes` settings
2. Verify import paths exist
3. Ensure proto files are accessible
4. Check the Output panel for detailed errors

## Commands

- `protobuf.openPlayground` - Open the Protobuf Playground

## Limitations

- **Plaintext only** - Currently supports plaintext connections (TLS support coming)
- **Single file** - Works with one proto file at a time
- **grpcurl required** - Requires `grpcurl` to be installed

## Best Practices

1. **Test locally first** - Use the playground for local development
2. **Validate requests** - Ensure JSON matches your proto definitions
3. **Check responses** - Review responses for errors and data
4. **Use for debugging** - Great for testing and debugging gRPC services

## Future Enhancements

Planned improvements:

- TLS/SSL support
- Authentication (API keys, tokens)
- Request history
- Multiple server profiles
- Response formatting options

---

For more information, see:

- [Settings Reference](./settings.md)
- [Configuration Examples](./configuration-examples.md)
