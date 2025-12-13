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

**No configuration needed!** It just works if you have Buf configuration files.

## Buf.yaml Detection

### Single Module (buf.yaml)

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
   - Check `build.roots` in `buf.yaml`
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
  "protobuf.includes": [
    "${workspaceFolder}/custom/path"
  ]
}
```

Manual paths are used in addition to Buf-detected paths.

## Best Practices

1. **Use Buf configuration** - Let the extension auto-detect
2. **Keep buf.yaml in root** - Easier for the extension to find
3. **Use consistent roots** - Match your Buf setup
4. **Document your structure** - Help team members understand

## Integration with Buf CLI

The extension's understanding of your Buf configuration:

- **Matches Buf CLI behavior** - Same import resolution
- **Works with buf build** - Consistent paths
- **Supports buf lint** - Can use same config
- **Compatible with buf breaking** - Same baseline understanding

## Excluding Files and Directories

When using Buf, you can exclude directories directly in your `buf.yaml` configuration file. This is the recommended approach for Buf users as it keeps your exclusion rules alongside your other Buf configuration.

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
      - "**/testdata/**"
```

### Benefits of buf.yaml excludes

Using `buf.yaml` for exclusions has several advantages:

1. **Shared configuration** - All team members use the same excludes
2. **Version controlled** - Exclusion rules are tracked with your code
3. **Consistent tooling** - Same excludes apply to `buf build`, `buf lint`, and the extension
4. **No VS Code dependency** - Works with CI/CD and other Buf integrations

### Protoc Users

If you're using protoc instead of Buf, configure exclude patterns in VS Code settings using `protobuf.protoc.excludePatterns`. See [Settings Reference](./settings.md) for details.
