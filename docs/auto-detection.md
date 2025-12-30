# Auto-Detection & Dependency Suggestions

## Overview

The extension automatically detects installed protobuf tools and suggests configurations, as well as helping manage external dependencies in your buf.yaml.

## Tool Auto-Detection

### Supported Tools

The extension automatically detects the following tools:

- **buf** - Buf CLI for linting, formatting, and code generation
- **protolint** - Protocol Buffer linter for style and convention checking
- **api-linter** - Google API Linter for AIP compliance checking
- **protoc** - Protocol Buffer compiler
- **clang-format** - C/C++ formatter (also works with proto files)

### How It Works

On first activation, the extension scans for installed tools in:

1. **Extension-managed location** - Tools installed by the extension itself
2. **Common installation paths**:
   - macOS: `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`
   - Linux: `/usr/local/bin`, `/usr/bin`, `/snap/bin`, `~/.local/bin`
   - Windows: Program Files, Scoop, WinGet, Go bin directories
3. **System PATH** - Standard PATH environment variable

### Configuration Prompt

When tools are detected, the extension offers to configure settings:

```text
Protobuf tools detected: buf (1.28.1), protolint (0.45.0), api-linter (1.67.0). Configure settings?
[Configure Now] [Later] [Don't Ask Again]
```

Selecting "Configure Now" opens a quick pick with options:

- ✓ **Enable Buf Linting** - Set up buf lint integration
- ✓ **Enable Protolint** - Set up protolint integration
- ✓ **Enable Google API Linter** - Set up api-linter for AIP compliance
- $(symbol-color) **Enable clang-format** - Use clang-format for formatting
- $(gear) **Set buf path** - Configure explicit path to buf
- $(gear) **Set protoc path** - Configure explicit path to protoc

### Manual Detection

You can manually trigger tool detection at any time:

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: **Protobuf: Detect and Configure Tools**

## Dependency Suggestions

### Automatic Detection

When you import an external proto file that cannot be resolved, the extension recognizes common Buf Schema Registry (BSR) modules and suggests adding them as dependencies.

### Supported External Dependencies

| Import Pattern | BSR Module | Description |
|---------------|------------|-------------|
| `google/api/*` | buf.build/googleapis/googleapis | Google API definitions |
| `google/type/*` | buf.build/googleapis/googleapis | Google common types |
| `google/rpc/*` | buf.build/googleapis/googleapis | Google RPC definitions |
| `buf/validate/*` | buf.build/bufbuild/protovalidate | Buf validation rules |
| `validate/validate.proto` | buf.build/envoyproxy/protoc-gen-validate | Legacy PGV |
| `grpc/*` | buf.build/grpc/grpc | gRPC definitions |
| `envoy/*` | buf.build/envoyproxy/envoy | Envoy Proxy APIs |
| `xds/*` | buf.build/cncf/xds | xDS APIs |
| `opentelemetry/*` | buf.build/opentelemetry/opentelemetry | OpenTelemetry protocol |
| `cosmos/*` | buf.build/cosmos/cosmos-sdk | Cosmos SDK |
| `connectrpc/*` | buf.build/connectrpc/connect | Connect RPC |

### Quick Fix Actions

When an unresolved import is detected, a code action (lightbulb) appears:

```proto
import "google/api/annotations.proto"; // ⚠️ Import cannot be resolved
```

Available actions:

- **Add 'buf.build/googleapis/googleapis' to buf.yaml dependencies** (preferred)
- **Run 'buf export' to download dependencies**
- **Remove unresolved import**

### Adding Dependencies

Selecting "Add to buf.yaml" will:

1. Add the module to your `buf.yaml` deps section
2. Run `buf dep update` to download the dependency
3. Update `buf.lock` with the resolved version

Example buf.yaml after adding dependency:

```yaml
version: v2
deps:
  - buf.build/googleapis/googleapis
lint:
  use:
    - STANDARD
```

### Creating buf.yaml

If no `buf.yaml` exists when you try to add a dependency, the extension offers to create one:

```text
buf.yaml not found. Create one with dependency 'buf.build/googleapis/googleapis'?
[Create] [Cancel]
```

## Settings

### Auto-Detection Settings

```json
{
  // Enable/disable automatic tool detection on startup
  "protobuf.autoDetection.enabled": true,

  // Internal flag - set to true after first prompt
  "protobuf.autoDetection.prompted": false
}
```

### Dependency Suggestion Settings

```json
{
  // Enable/disable dependency suggestions for unresolved imports
  "protobuf.dependencySuggestion.enabled": true,

  // Auto-add dependencies without prompting (not recommended)
  "protobuf.dependencySuggestion.autoAdd": false
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Protobuf: Detect and Configure Tools` | Manually trigger tool detection |
| `Protobuf: Add Buf Dependency` | Interactively add a BSR module |
| `Protobuf: Export Buf Dependencies` | Export dependencies for import resolution |

## Best Practices

1. **Use buf.yaml for dependencies** - The extension works best with a properly configured buf.yaml
2. **Run buf dep update regularly** - Keep dependencies up to date
3. **Add .buf-deps to .gitignore** - If using buf export, exclude generated files
4. **Configure protobuf.includes** - Point to your .buf-deps or vendor directory

## Troubleshooting

### Tools Not Detected

If tools aren't being detected:

1. Check the Output panel (View > Output > Protobuf Support)
2. Verify tools are installed: `which buf`, `which protolint`
3. Ensure tools are in a standard location or PATH
4. Manually configure paths in settings

### Dependencies Not Resolving

If dependencies aren't resolving after adding to buf.yaml:

1. Run `buf dep update` manually in terminal
2. Check buf.lock for resolved versions
3. Verify buf.build module names are correct
4. Check Output panel for error messages

### Permission Issues

On macOS/Linux, ensure tools have execute permission:

```bash
chmod +x /path/to/buf
chmod +x /path/to/protolint
```
