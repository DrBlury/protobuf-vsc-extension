# Document Links

Document Links make import paths clickable, enabling quick navigation to imported proto files.

## Overview

When you import a proto file, the import path becomes a clickable link that opens the imported file.

## How It Works

```proto
import "google/protobuf/timestamp.proto";  // ← Clickable link
import "common/user.proto";                 // ← Clickable link
```

Simply **Ctrl/Cmd + Click** (or right-click → Go to Definition) on any import path to open the imported file.

## Features

### Smart Path Resolution

The extension attempts to resolve import paths using:

1. Relative paths from the current file
2. Buf.yaml configuration (if present)
3. Workspace root paths
4. Configured import paths

### Unresolved Imports

Even if an import can't be fully resolved, the extension will:

- Still create a link if a file exists at a guessed location
- Show a tooltip indicating the import is unresolved
- Help you navigate to potential locations

## Use Cases

### Quick Navigation

Navigate between related proto files:

```proto
// user.proto
import "common/address.proto";  // Click to see address definition
import "common/phone.proto";     // Click to see phone definition
```

### Exploring Dependencies

Understand your proto file dependencies:

1. Open a proto file
2. Click on import paths
3. Explore the imported files
4. Understand the dependency graph

### Debugging Import Issues

When imports fail to resolve:

1. Click on the import path
2. See where the extension tried to resolve it
3. Fix the path or add it to import paths

## Configuration

Import paths are resolved using:

```jsonc
{
  "protobuf.includes": [
    "${workspaceFolder}/protos",
    "${workspaceFolder}/third_party"
  ]
}
```

The extension also automatically detects:

- Buf.yaml configuration
- Workspace roots
- Common proto root patterns

## Tooltips

Hovering over an import link shows:

- **Resolved**: "Open path/to/file.proto"
- **Unresolved**: "Try to open path/to/file.proto (unresolved)"

## Tips

1. **Use for exploration** - Click through imports to understand dependencies
2. **Fix broken imports** - Use document links to find where imports should point
3. **Navigate quickly** - Faster than using "Go to Definition" on types
4. **Understand structure** - See how your proto files are organized

## Troubleshooting

### Import Not Clickable

If an import isn't clickable:

1. Check if the file exists
2. Verify import paths are configured
3. Check buf.yaml if using Buf
4. Ensure the path is correct

### Wrong File Opens

If clicking opens the wrong file:

1. Check for duplicate files with the same name
2. Verify import path configuration
3. Check buf.yaml roots configuration
4. Use "Go to Definition" on a type instead
