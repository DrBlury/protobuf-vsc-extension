# Buf.yaml Support

The extension automatically detects and uses Buf configuration files to improve import resolution and workspace understanding.

## Overview

When you use [Buf](https://buf.build/) for Protocol Buffers, the extension automatically:

- Detects `buf.yaml` and `buf.work.yaml` files
- Uses proto roots from Buf configuration
- Improves import path resolution
- Understands workspace structure

## How It Works

The extension automatically:

1. Scans for `buf.yaml` files in your workspace
2. Parses the configuration
3. Extracts proto roots
4. Uses them for import resolution

No VS Code setting is required when a supported Buf configuration file is present.

## Buf.yaml Detection

### Single Module (buf.yaml v1)

The extension detects `buf.yaml` files and extracts:

```yaml
version: v1
name: buf.build/acme/proto
build:
  roots:
    - proto
    - third_party
```

**What the extension uses:**

- `build.roots` - Proto root directories for import resolution

### Modules (buf.yaml v2)

The extension also supports `buf.yaml` v2 module paths:

```yaml
version: v2
modules:
  - path: proto
  - path: third_party
```

**What the extension uses:**

- `modules[].path` - Proto root directories for import resolution
- `modules[].excludes` - Parsed from configuration and kept separate from dependencies

### Workspace (buf.work.yaml)

The extension detects `buf.work.yaml` files and extracts:

```yaml
version: v1
directories:
  - proto/acme
  - proto/common
  - third_party
```

**What the extension uses:**

- `directories` - Workspace directories for import resolution

## Import Resolution

With Buf configuration, import resolution is improved:

### Without Buf Config

```proto
// user.proto
import "common/address.proto";  // Might not resolve
```

### With Buf Config

```yaml
# buf.yaml
version: v1
build:
  roots:
    - proto
```

```proto
// proto/user.proto
import "common/address.proto";  // Resolves to proto/common/address.proto
```

## Configuration Detection

The extension searches for Buf config files:

1. In the current file's directory
2. In parent directories (up to workspace root)
3. Uses the first `buf.yaml` or `buf.work.yaml` found

## Benefits

### 1. Better Import Resolution

Imports resolve correctly based on Buf configuration:

- No need to manually configure import paths
- Works with Buf's proto root system
- Supports both single modules and workspaces

### 2. Consistent with Buf

The extension understands your Buf setup:

- Same import paths as Buf uses
- Same proto root detection
- Consistent behavior

### 3. Workspace Understanding

The extension understands your workspace structure:

- Knows which directories are proto roots
- Understands workspace modules
- Better symbol resolution

## Examples

### Single Module Setup

```yaml
# buf.yaml
version: v1
name: buf.build/acme/proto
build:
  roots:
    - proto
```

```proto
// proto/user/user.proto
import "common/address.proto";  // Resolves to proto/common/address.proto
```

### Workspace Setup

```yaml
# buf.work.yaml
version: v1
directories:
  - proto/acme
  - proto/common
```

```proto
// proto/acme/user/user.proto
import "common/address.proto";  // Resolves to proto/common/address.proto
```

## Troubleshooting

### Imports Not Resolving

If imports don't resolve with Buf config:

1. **Check buf.yaml location**
   - Should be in the proto root directory
   - Or in a parent directory

2. **Verify roots configuration**
   - Check `build.roots` in `buf.yaml` v1
   - Check `modules[].path` in `buf.yaml` v2
   - Check `directories` in `buf.work.yaml`

3. **Restart VS Code**
   - Configuration is cached
   - Restart to reload

### Multiple buf.yaml Files

If you have multiple `buf.yaml` files:

- The extension uses the closest one to your file
- Each file's directory is used as a proto root

## Manual Override

You can still manually configure import paths:

```jsonc
{
  "protobuf.includes": ["${workspaceFolder}/custom/path"],
}
```

Manual paths are used in addition to Buf-detected paths.

## Best Practices

1. **Use Buf configuration** - Keep import roots in `buf.yaml` or `buf.work.yaml`.
2. **Keep configuration near proto sources** - The extension searches parent directories from the active file.
3. **Use consistent roots** - Match Buf CLI behavior for import paths.

## Integration with Buf CLI

The extension uses Buf configuration for import resolution:

- `build.roots` from `buf.yaml` v1
- `modules[].path` from `buf.yaml` v2
- `directories` from `buf.work.yaml`
- `.yml` variants of the same files

## Excluding Files and Directories

Buf supports excluding directories directly in your `buf.yaml` configuration file. The extension parses these values for configuration awareness, but it currently uses `build.roots` and `modules[].path` for import resolution and does not apply Buf excludes as editor ignore patterns.

### Using buf.yaml excludes

Add the `excludes` field under the `build` section in your `buf.yaml`:

```yaml
# buf.yaml
version: v1
build:
  excludes:
    - nanopb
    - third_party/generated
    - tests
```

### V2 Configuration Format

For `buf.yaml` v2 format, use the `excludes` field under `modules`:

```yaml
# buf.yaml
version: v2
modules:
  - path: .
    excludes:
      - nanopb
      - vendor
      - '**/testdata/**'
```

### Extension Behavior

Buf excludes are parsed but are not applied as editor ignore patterns. Use `protobuf.workspace.ignorePatterns` to exclude directories from workspace indexing and `protobuf.protoc.excludePatterns` to exclude files from `Compile All Protos`.

### Protoc Users

If you're using protoc instead of Buf, configure exclude patterns in VS Code settings using `protobuf.protoc.excludePatterns`. See [Settings Reference](./settings.md) for details.
