# Toolchain Management

The Protobuf VSC extension includes a built-in toolchain manager that helps you install, manage, and monitor the protobuf tools (`protoc` and `buf`) required for working with Protocol Buffers.

## Overview

The toolchain manager provides:
- **Automatic tool detection** - Checks if `protoc` and `buf` are installed
- **Status bar indicator** - Visual feedback on toolchain health
- **One-click installation** - Install missing tools directly from VS Code
- **Version management** - View installed versions and update tools

## Status Bar Indicator

The extension displays a status indicator in the VS Code status bar:

- ✅ **Green checkmark** - All tools are installed and working
- ⚠️ **Warning icon** - One or more tools are missing

Click the status bar indicator to open the toolchain management interface.

## Managing Tools

### Opening the Toolchain Manager

1. Click the status bar indicator (bottom right)
2. Or run the command: `Protobuf: Manage Toolchain`

### Installing Tools

1. Open the toolchain manager
2. Select a tool to install (e.g., `protoc` or `buf`)
3. Click "Yes" when prompted to install
4. The extension will:
   - Download the appropriate binary for your platform
   - Install it to the extension's storage directory
   - Update your settings to use the managed tool

### Supported Platforms

The toolchain manager automatically detects your platform and downloads the correct binary:

- **Windows** - `.exe` binaries
- **macOS** - Intel (`x86_64`) and Apple Silicon (`arm64`) binaries
- **Linux** - `x86_64` binaries

### Managed vs System Tools

The extension can use either:
- **Managed tools** - Installed and managed by the extension (stored in extension storage)
- **System tools** - Tools installed on your system PATH

You can configure which to use in settings:
```json
{
  "protobuf.protoc.path": "protoc",  // Use system protoc
  "protobuf.buf.path": "/path/to/buf"  // Use specific path
}
```

If you don't specify a path, the extension will check for managed tools first, then fall back to system tools.

## Tool Versions

The extension installs specific versions:
- **protoc**: v25.1
- **buf**: v1.28.1

These versions are tested and known to work well with the extension. You can update tools by reinstalling them through the toolchain manager.

## Configuration

### Tool Paths

Configure custom tool paths in your settings:

```json
{
  "protobuf.protoc.path": "/usr/local/bin/protoc",
  "protobuf.buf.path": "/usr/local/bin/buf"
}
```

### Quick Toolchain Switching

The extension provides two commands to quickly switch between managed and system toolchains:

#### Use Managed Toolchain

Run the command: `Protobuf: Use Managed Toolchain (buf & protoc)`

This command:
- Configures settings to use the extension's installed `buf` and `protoc`
- Lets you choose between Workspace or Global scope
- Automatically installs tools if they're not already managed

#### Use System Toolchain

Run the command: `Protobuf: Use System Toolchain (buf & protoc from PATH)`

This command:
- Resets settings to use `buf` and `protoc` from your system PATH
- Lets you choose between Workspace or Global scope
- Useful when you want to use locally installed tools (e.g., via Homebrew)

### Automatic Detection

The extension automatically checks for tools:
- On extension activation
- When you open a `.proto` file
- When you run commands that require tools

## Troubleshooting

### Tool Not Found

If the extension can't find a tool:

1. Check that the tool is installed on your system
2. Verify the tool is in your PATH (for system tools)
3. Use the toolchain manager to install a managed version
4. Configure a custom path in settings

### Installation Fails

If installation fails:

1. Check your internet connection
2. Verify you have write permissions to the extension storage directory
3. Check the Output panel for detailed error messages
4. Try installing manually and configuring the path

### Permission Issues (macOS/Linux)

If you get permission errors:

1. The extension automatically sets executable permissions
2. If issues persist, manually set permissions:
   ```bash
   chmod +x ~/.vscode/extensions/.../bin/protoc
   chmod +x ~/.vscode/extensions/.../bin/buf
   ```

## Commands

- `protobuf.toolchain.manage` - Open toolchain management interface
- `protobuf.toolchain.useManaged` - Configure settings to use managed (extension-installed) tools
- `protobuf.toolchain.useSystem` - Configure settings to use system PATH tools

## Output Channel

The toolchain manager logs all operations to the "Protobuf" output channel. Open it via:
- View → Output → Select "Protobuf"
- Or use the command palette: `View: Toggle Output`

## Best Practices

1. **Use managed tools** for consistent versions across team members
2. **Check status regularly** - The status bar indicator shows toolchain health at a glance
3. **Keep tools updated** - Reinstall tools periodically to get the latest versions
4. **Configure paths explicitly** - If using system tools, configure paths explicitly in settings
5. **Use quick switch commands** - Use `Use Managed Toolchain` or `Use System Toolchain` commands for easy switching

---

For more information, see:
- [Settings Reference](./settings.md)
- [Configuration Examples](./configuration-examples.md)
