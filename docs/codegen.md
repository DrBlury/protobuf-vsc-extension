# Code Generation

The Protobuf VSC extension provides a flexible code generation system that allows you to configure and run `protoc` code generation profiles directly from VS Code.

## Overview

The code generation feature enables you to:

- **Define codegen profiles** - Configure multiple code generation setups
- **Run codegen on demand** - Generate code with a single command
- **Variable substitution** - Use VS Code variables in your profiles
- **Context-aware generation** - Generate code for current file or entire workspace

## Configuration

### Setting Up Codegen Profiles

Configure codegen profiles in your VS Code settings:

```json
{
  "protobuf.codegen.profiles": {
    "go": [
      "--go_out=${workspaceFolder}/gen/go",
      "--go_opt=paths=source_relative",
      "${file}"
    ],
    "typescript": [
      "--plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts",
      "--ts_out=${workspaceFolder}/gen/ts",
      "${file}"
    ],
    "python": [
      "--python_out=${workspaceFolder}/gen/python",
      "${file}"
    ],
    "all": [
      "--go_out=${workspaceFolder}/gen/go",
      "--go_opt=paths=source_relative",
      "--python_out=${workspaceFolder}/gen/python",
      "--ts_out=${workspaceFolder}/gen/ts",
      "${file}"
    ]
  }
}
```

### Profile Structure

Each profile is an array of strings representing `protoc` arguments:

1. **Plugin flags** - `--plugin=name=path` (optional)
2. **Output flags** - `--{lang}_out=path` (required)
3. **Option flags** - `--{lang}_opt=options` (optional)
4. **Input files** - `${file}` or file paths (required)

### Available Variables

The extension supports VS Code variable substitution:

- `${workspaceFolder}` - Path to the workspace folder
- `${file}` - Full path of the current file
- `${fileDirname}` - Directory of the current file
- `${fileBasename}` - Name of the current file
- `${fileBasenameNoExtension}` - Name without extension

## Usage

### Running Code Generation

1. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `Protobuf: Generate Code`
   - Select a profile from the list

2. **From Context Menu**:
   - Right-click on a `.proto` file
   - Select "Protobuf: Generate Code"
   - Choose a profile

3. **For Current File**:
   - Open a `.proto` file
   - Run the command
   - Code will be generated for the current file

### Profile Selection

When you run code generation, you'll see a quick pick menu with all configured profiles. Select the profile you want to use.

## Examples

### Go Code Generation

```json
{
  "protobuf.codegen.profiles": {
    "go": [
      "--go_out=${workspaceFolder}/gen/go",
      "--go_opt=paths=source_relative",
      "--go_opt=module=github.com/example/project",
      "${file}"
    ]
  }
}
```

### TypeScript Code Generation

```json
{
  "protobuf.codegen.profiles": {
    "typescript": [
      "--plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts",
      "--ts_out=${workspaceFolder}/gen/ts",
      "${file}"
    ]
  }
}
```

### Python Code Generation

```json
{
  "protobuf.codegen.profiles": {
    "python": [
      "--python_out=${workspaceFolder}/gen/python",
      "${file}"
    ]
  }
}
```

### Multiple Languages

```json
{
  "protobuf.codegen.profiles": {
    "all": [
      "--go_out=${workspaceFolder}/gen/go",
      "--go_opt=paths=source_relative",
      "--python_out=${workspaceFolder}/gen/python",
      "--ts_out=${workspaceFolder}/gen/ts",
      "--plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts",
      "${file}"
    ]
  }
}
```

### Using Import Paths

```json
{
  "protobuf.codegen.profiles": {
    "go-with-imports": [
      "--go_out=${workspaceFolder}/gen/go",
      "--go_opt=paths=source_relative",
      "--proto_path=${workspaceFolder}/proto",
      "--proto_path=${workspaceFolder}/vendor",
      "${file}"
    ]
  }
}
```

## Output

### Output Channel

All code generation output is logged to the "Protobuf" output channel:

- **Success** - Shows completion message
- **Errors** - Shows detailed error messages
- **Command** - Shows the exact `protoc` command executed

### Notifications

- **Success** - Information notification when codegen completes successfully
- **Failure** - Error notification with exit code if codegen fails

## Integration with protoc Settings

The codegen feature uses your configured `protoc` path:

```json
{
  "protobuf.protoc.path": "protoc"  // Uses system protoc or managed tool
}
```

## Best Practices

1. **Organize profiles by language** - Create separate profiles for each target language
2. **Use variables** - Leverage VS Code variables for portability
3. **Include import paths** - Add `--proto_path` flags if needed
4. **Test profiles** - Verify profiles work before committing
5. **Document profiles** - Add comments in settings or documentation

## Troubleshooting

### Profile Not Found

If you see "No codegen profiles defined":

1. Open Settings (`Cmd/Ctrl+,`)
2. Search for `protobuf.codegen.profiles`
3. Add at least one profile configuration

### Codegen Fails

Common issues:

1. **Missing plugins** - Ensure codegen plugins are installed
2. **Wrong paths** - Verify output paths exist or are writable
3. **Import issues** - Check that `--proto_path` includes all necessary directories
4. **protoc version** - Ensure `protoc` version supports your target language

### Plugin Not Found

If plugins aren't found:

1. Install the plugin (e.g., `npm install -g protoc-gen-ts`)
2. Use full paths in `--plugin` flags
3. Ensure plugins are executable

## Commands

- `protobuf.generateCode` - Run code generation with profile selection

## Advanced Usage

### Workspace-Specific Profiles

You can define different profiles per workspace:

```json
// .vscode/settings.json
{
  "protobuf.codegen.profiles": {
    "local": [
      "--go_out=./local-gen",
      "${file}"
    ]
  }
}
```

### Conditional Generation

Use different profiles for different file types or locations by creating multiple profiles and selecting the appropriate one.

---

For more information, see:

- [Settings Reference](./settings.md)
- [Configuration Examples](./configuration-examples.md)
- [Toolchain Management](./toolchain.md)
