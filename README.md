# Protobuf VSC

A comprehensive Protocol Buffers (protobuf) extension for Visual Studio Code providing syntax highlighting, IntelliSense, diagnostics, formatting, protoc compilation, breaking change detection, and more.

**Author:** Julian Bensch ([@DrBlury](https://github.com/DrBlury))

## Features

### Syntax Highlighting
- Full syntax highlighting for `.proto` files
- Support for proto2, proto3, and 2023 edition syntax
- **Text Proto Support**: Syntax highlighting for `.textproto`, `.pbtxt`, `.prototxt` files
- Customizable via VS Code themes

### Code Navigation
- **Go to Definition**: Navigate to message, enum, service, and RPC definitions
- **Go to Definition on Imports**: Navigate to imported `.proto` files
- **Find All References**: Find all usages of messages, enums, and fields
- **Document Symbols**: Outline view with all messages, enums, services, and RPCs
- **Workspace Symbols**: Search symbols across all `.proto` files

### IntelliSense & Completions
- Auto-complete for keywords and built-in types
- Message and enum name completions from current file and imports
- Context-aware suggestions
- Import path completions including Google well-known types

### Hover Information
- Display type information on hover
- Documentation for built-in types
- Symbol information for custom types

### Diagnostics & Error Checking
- **Syntax errors**: Invalid protobuf syntax detection
- **Naming conventions**: Check PascalCase for messages/enums, snake_case for fields
- **Reference errors**: Undefined message or enum references
- **Import errors**: Missing or invalid import paths
- **Field tag issues**:
  - Duplicate field numbers
  - Reserved field number usage
  - Field numbers out of valid range
- **Duplicate field names**: Fields with same name in a message
- **Discouraged constructs**: Warnings about deprecated patterns

### Code Formatting
- Built-in formatter with configurable settings
- **clang-format Integration**: Use clang-format for formatting (optional)
- Configurable indent size
- Tab vs spaces support
- Format on save support
- Format selection support

### Protoc Compilation
- **Compile Single File**: Compile the current proto file with protoc
- **Compile All**: Batch compile all proto files in workspace
- **Configurable Options**: Pass custom protoc options and output paths
- **Compile on Save**: Optionally compile files automatically on save
- **Variable Expansion**: Support for `${workspaceRoot}` and `${env.*}` variables

### Breaking Change Detection
- Detect API-breaking changes against a git baseline
- **Configurable Rules**:
  - Field number changes/deletions
  - Type changes
  - Message/enum deletions
  - RPC signature changes
  - Enum value changes
- Compare against any git reference (branch, tag, commit)
- Detailed violation reports with line locations

### External Linter Integration
- **Buf Lint**: Integrate with buf CLI for linting
- **Protolint**: Integrate with protolint for additional lint rules
- Run on save or on demand
- View available lint rules
- Configure via buf.yaml or .protolint.yaml

### Code Actions & Quick Fixes
- **Fix Naming Conventions**: Convert message/enum/field names to proper conventions
- **Add Import**: Automatically add import for unknown types
- **Fix Duplicate Field Numbers**: Suggest next available field number
- **Convert 'required' to 'optional'**: Update deprecated proto2 required fields

### Rename Symbol
- Rename messages, enums, fields, and services across workspace
- Safely updates all references
- Preview changes before applying

### Code Snippets
- proto3 syntax declaration
- proto2 syntax declaration
- Edition 2023 declaration
- Message, enum, service declarations
- RPC methods
- Field declarations
- Import and package statements

### Editor Features
- **Folding**: Support for messages, enums, services, and multi-line comments
- **Bracket Matching**: Match braces, brackets, and angle brackets
- **Comment Toggling**: Toggle line and block comments

## Commands

| Command | Description |
|---------|-------------|
| `Protobuf: Format Document` | Format the current proto file |
| `Protobuf: Compile This Proto` | Compile the current file with protoc |
| `Protobuf: Compile All Protos` | Compile all proto files in workspace |
| `Protobuf: Check for Breaking Changes` | Detect breaking changes against git baseline |
| `Protobuf: Run External Linter` | Run buf or protolint on current file |
| `Protobuf: Show Available Lint Rules` | Display available lint rules |
| `Protobuf: Renumber All Fields in Document` | Renumber all field tags sequentially |
| `Protobuf: Renumber Fields in Message` | Renumber fields in a specific message |
| `Protobuf: Renumber Fields from Cursor` | Renumber fields starting from cursor position |
| `Protobuf: Renumber Enum Values` | Renumber enum values sequentially |

## Configuration

### General Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.formatterEnabled` | Enable/disable the formatter | `true` |
| `protobuf.formatOnSave` | Format on save | `false` |
| `protobuf.indentSize` | Number of spaces for indentation | `2` |
| `protobuf.useTabIndent` | Use tabs instead of spaces | `false` |
| `protobuf.maxLineLength` | Maximum line length | `120` |
| `protobuf.includes` | Additional paths to search for imports | `[]` |

### Diagnostics Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.diagnostics.enabled` | Enable/disable all diagnostics | `true` |
| `protobuf.diagnostics.namingConventions` | Check naming conventions | `true` |
| `protobuf.diagnostics.referenceChecks` | Check for undefined references | `true` |
| `protobuf.diagnostics.importChecks` | Validate import statements | `true` |
| `protobuf.diagnostics.fieldTagChecks` | Check for field tag issues | `true` |
| `protobuf.diagnostics.duplicateFieldChecks` | Check for duplicate field names | `true` |
| `protobuf.diagnostics.discouragedConstructs` | Warn about discouraged patterns | `true` |

### Protoc Compilation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.protoc.path` | Path to protoc compiler | `"protoc"` |
| `protobuf.protoc.compileOnSave` | Compile on save | `false` |
| `protobuf.protoc.compileAllPath` | Search path for compile all | `""` |
| `protobuf.protoc.useAbsolutePath` | Use absolute paths | `false` |
| `protobuf.protoc.options` | Additional protoc options | `[]` |

Example protoc options:
```json
{
  "protobuf.protoc.options": [
    "--proto_path=${workspaceRoot}/protos",
    "--java_out=${workspaceRoot}/gen/java",
    "--go_out=${workspaceRoot}/gen/go"
  ]
}
```

### Breaking Change Detection Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.breaking.enabled` | Enable breaking change detection | `false` |
| `protobuf.breaking.againstStrategy` | Baseline strategy (git/file/none) | `"git"` |
| `protobuf.breaking.againstGitRef` | Git reference to compare against | `"HEAD~1"` |
| `protobuf.breaking.againstFilePath` | File path for file strategy | `""` |

### External Linter Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.externalLinter.enabled` | Enable external linter | `false` |
| `protobuf.externalLinter.linter` | Linter to use (buf/protolint/none) | `"none"` |
| `protobuf.externalLinter.bufPath` | Path to buf CLI | `"buf"` |
| `protobuf.externalLinter.protolintPath` | Path to protolint CLI | `"protolint"` |
| `protobuf.externalLinter.bufConfigPath` | Path to buf.yaml | `""` |
| `protobuf.externalLinter.protolintConfigPath` | Path to .protolint.yaml | `""` |
| `protobuf.externalLinter.runOnSave` | Run linter on save | `true` |

### clang-format Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `protobuf.clangFormat.enabled` | Use clang-format for formatting | `false` |
| `protobuf.clangFormat.path` | Path to clang-format | `"clang-format"` |
| `protobuf.clangFormat.style` | Format style | `"Google"` |
| `protobuf.clangFormat.fallbackStyle` | Fallback style if file not found | `"Google"` |

## Installation

### From VS Code Marketplace
Search for "Protobuf VSC" in the VS Code Extensions view.

### From Source
1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch the Extension Development Host

## Prerequisites for Optional Features

### Protoc Compilation
Install the Protocol Buffers compiler:
- **macOS**: `brew install protobuf`
- **Ubuntu**: `apt-get install protobuf-compiler`
- **Windows**: Download from [protobuf releases](https://github.com/protocolbuffers/protobuf/releases)

### Buf Linter
Install the Buf CLI:
```bash
# macOS/Linux
brew install bufbuild/buf/buf

# npm
npm install -g @bufbuild/buf
```

### Protolint
Install protolint:
```bash
# macOS
brew install protolint

# Go
go install github.com/yoheimuta/protolint/cmd/protolint@latest
```

### clang-format
Install clang-format:
- **macOS**: `brew install clang-format`
- **Ubuntu**: `apt-get install clang-format`
- **Windows**: Included with LLVM/Clang installation

## Development

### Prerequisites
- Node.js 18+
- npm 9+
- VS Code 1.85+

### Building
```bash
npm install
npm run compile
```

### Testing
```bash
npm run test
```

### Debugging
1. Open this project in VS Code
2. Press F5 to launch the Extension Development Host
3. Open a `.proto` file to test the extension

## Supported Protobuf Versions
- proto2
- proto3
- Edition 2023

## Supported File Types
- `.proto` - Protocol Buffers definition files
- `.textproto`, `.pbtxt`, `.prototxt`, `.txtpb`, `.textpb`, `.pb.txt` - Text Proto format files

## License

MIT License - Copyright (c) 2025 Julian Bensch

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
