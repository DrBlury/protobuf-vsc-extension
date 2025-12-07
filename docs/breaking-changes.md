# Breaking Changes Detection

Detect breaking changes in your Protocol Buffers schemas to maintain backward compatibility.

## Overview

Breaking change detection compares your current proto files against a baseline (git commit or file) to identify changes that would break existing clients.

## How It Works

1. **Select a baseline** - Choose a git reference or file to compare against
2. **Run detection** - The extension analyzes differences
3. **Review results** - See all breaking changes with locations

## Configuration

### Enable Breaking Change Detection

```jsonc
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstStrategy": "git",
  "protobuf.breaking.againstGitRef": "HEAD~1"
}
```

### Strategies

#### Git Strategy (Default)

Compare against a git reference:

```jsonc
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstStrategy": "git",
  "protobuf.breaking.againstGitRef": "HEAD~1"  // or "main", "origin/main", etc.
}
```

#### File Strategy

Compare against a specific file:

```jsonc
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstStrategy": "file",
  "protobuf.breaking.againstFilePath": "${workspaceFolder}/baseline.proto"
}
```

## Detected Breaking Changes

### Field Changes

- **Field deleted** - Field removed without reserving the number
- **Field type changed** - Field type changed (e.g., string → int32)
- **Field number changed** - Field number changed
- **Field made required** - Field changed from optional to required (proto2)

### Message Changes

- **Message deleted** - Message removed
- **Message renamed** - Message name changed
- **Field removed** - Field removed from message

### Enum Changes

- **Enum deleted** - Enum removed
- **Enum value deleted** - Enum value removed
- **Enum value renamed** - Enum value name changed

### Service Changes

- **RPC deleted** - RPC method removed
- **RPC input type changed** - Request type changed
- **RPC output type changed** - Response type changed

## Using Breaking Change Detection

### Command Palette

1. Press `Cmd/Ctrl+Shift+P`
2. Type "Protobuf: Check for Breaking Changes"
3. Review the results in the output panel

### Context Menu

1. Right-click on a proto file
2. Select "Check for Breaking Changes"

## Example Output

```text
Breaking Changes Detected:

[FIELD_NO_DELETE] Field 'old_field' (number 5) was deleted without reserving the field number
  Line 10, Character 5

[FIELD_TYPE_CHANGED] Field 'count' type changed from int32 to string
  Line 15, Character 10
```

## Best Practices

1. **Check before merging** - Run breaking change detection before merging PRs
2. **Use git baselines** - Compare against main branch or release tags
3. **Reserve deleted fields** - Always reserve field numbers when removing fields
4. **Document changes** - Document why breaking changes are necessary
5. **Version your APIs** - Use versioning to manage breaking changes

## Integration with CI/CD

You can integrate breaking change detection into your CI/CD pipeline:

```bash
# In your CI script
vscode --command "protobuf.checkBreakingChanges"
```

## Tips

1. **Regular checks** - Run checks regularly during development
2. **Before releases** - Always check before releasing new versions
3. **Document exceptions** - Document any intentional breaking changes
4. **Use versioning** - Version your proto files to manage changes
5. **Team communication** - Communicate breaking changes to your team
