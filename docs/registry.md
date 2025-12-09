# Buf Registry Management

The Registry Management feature helps you add dependencies from the Buf Schema Registry directly to your `buf.yaml` configuration file.

## Overview

Registry Management provides:
- **Easy dependency addition** - Add Buf modules with a simple command
- **Automatic buf.yaml updates** - Updates your configuration automatically
- **Buf module support** - Works with modules from buf.build
- **Automatic updates** - Runs `buf dep update` after adding dependencies

## Prerequisites

- **Buf installed** - Must have `buf` installed and in your PATH
- **buf.yaml** - Your project should have a `buf.yaml` file (or be willing to create one)
- **Git repository** - Works best in a Git repository

## Usage

### Adding a Dependency

1. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `Protobuf: Add Buf Dependency`
   - Enter the module name (e.g., `buf.build/acme/weather`)

2. **Module Format**:
   - Format: `buf.build/owner/repository`
   - Example: `buf.build/googleapis/googleapis`
   - Example: `buf.build/grpc-ecosystem/grpc-gateway`

### Creating buf.yaml

If `buf.yaml` doesn't exist:
1. Run the "Add Buf Dependency" command
2. When prompted, click "Yes" to create `buf.yaml`
3. The extension will run `buf mod init` to create the file
4. Then add your dependency

## Examples

### Adding Google APIs

```bash
# Command: Protobuf: Add Buf Dependency
# Module: buf.build/googleapis/googleapis
```

This adds to `buf.yaml`:
```yaml
version: v1
name: buf.build/your-org/your-repo
deps:
  - buf.build/googleapis/googleapis
```

### Adding Multiple Dependencies

Add dependencies one at a time:
1. Run the command for each dependency
2. Each dependency is added to the `deps` list
3. `buf dep update` runs after each addition

### Example buf.yaml

After adding dependencies, your `buf.yaml` might look like:

```yaml
version: v1
name: buf.build/acme/weather
deps:
  - buf.build/googleapis/googleapis
  - buf.build/grpc-ecosystem/grpc-gateway
  - buf.build/envoyproxy/envoy
```

## How It Works

1. **Reads buf.yaml** - Reads your existing configuration
2. **Adds dependency** - Appends the new module to the `deps` list
3. **Updates file** - Writes the updated configuration
4. **Runs buf dep update** - Fetches the dependency

## Configuration

### Buf Path

Configure the `buf` command path:

```json
{
  "protobuf.externalLinter.bufPath": "buf"
}
```

Or use a full path:
```json
{
  "protobuf.externalLinter.bufPath": "/usr/local/bin/buf"
}
```

### Workspace Settings

The feature uses your workspace root to find `buf.yaml`:
- Looks in the first workspace folder
- Creates `buf.yaml` in the workspace root if needed

## Integration

Registry Management integrates with:
- **Buf CLI** - Uses `buf` commands
- **buf.yaml** - Reads and writes configuration
- **Output Channel** - Logs all operations

## Troubleshooting

### buf.yaml Not Found

If `buf.yaml` doesn't exist:
1. Click "Yes" when prompted to create it
2. Or manually create it: `buf mod init`
3. Then run the add dependency command again

### Dependency Already Exists

If you try to add a duplicate:
- The extension checks for existing dependencies
- Won't add duplicates
- Shows a message if already present

### buf dep update Fails

If update fails:
1. Check your internet connection
2. Verify the module name is correct
3. Check the Output panel for detailed errors
4. Try running `buf dep update` manually

### Buf Not Found

If `buf` command is not found:
1. Install Buf: https://buf.build/docs/installation
2. Ensure it's in your PATH
3. Configure the path in settings if needed
4. Restart VS Code after installation

## Commands

- `protobuf.addBufDependency` - Add a Buf module dependency

## Best Practices

1. **Use buf.build modules** - Prefer official modules from buf.build
2. **Version pinning** - Consider pinning versions in `buf.lock`
3. **Review changes** - Review `buf.yaml` changes before committing
4. **Update regularly** - Keep dependencies up to date

## Related Features

- [Buf Configuration](./buf-config.md) - Learn about buf.yaml support
- [Toolchain Management](./toolchain.md) - Install and manage buf
- [Settings Reference](./settings.md) - Configuration options

---

For more information, see:
- [Buf Documentation](https://buf.build/docs)
- [Buf Schema Registry](https://buf.build/explore)
