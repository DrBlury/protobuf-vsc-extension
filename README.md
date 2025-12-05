# Protobuf VSC

[![CI](https://github.com/DrBlury/protobuf-vsc-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/DrBlury/protobuf-vsc-extension/actions/workflows/ci.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/DrBlury.protobuf-vsc?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/DrBlury.protobuf-vsc)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/DrBlury.protobuf-vsc)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
[![License](https://img.shields.io/github/license/DrBlury/protobuf-vsc-extension)](https://github.com/DrBlury/protobuf-vsc-extension/blob/main/LICENSE)

A **comprehensive** and **feature-rich** Protocol Buffers (protobuf) extension for Visual Studio Code. Enhance your protobuf development with advanced language support, intelligent diagnostics, seamless compilation, and powerful tooling integrations.

**Author:** Julian Bensch ([@DrBlury](https://github.com/DrBlury))

---

## ✨ Why Choose Protobuf VSC?

**Protobuf VSC** is designed to make Protocol Buffers development in VS Code effortless and productive. Unlike basic syntax highlighters, this extension provides a complete development environment with:

- 🎯 **Intelligent Code Navigation** - Jump to definitions, find references, and navigate imports instantly
- 🔍 **Smart IntelliSense** - Context-aware completions for types, fields, and imports
- 🛡️ **Advanced Diagnostics** - Catch errors before compilation with comprehensive validation
- 🎨 **Professional Formatting** - Keep your protos clean with built-in or clang-format integration
- ⚙️ **Integrated Compilation** - Compile directly from the editor with configurable protoc options
- 🔄 **Breaking Change Detection** - Prevent API breakage by comparing against git baselines
- 🔧 **External Linter Support** - Integrate buf or protolint for enterprise-grade linting
- 🚀 **Modern Proto Support** - Full support for proto2, proto3, and Edition 2023
- 🗺️ **Visual Schema Graphs** - Explore how messages and enums connect with an interactive graph view

Whether you're building microservices, defining gRPC APIs, or managing data schemas, Protobuf VSC streamlines your workflow and boosts productivity.

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Feature Highlights](#-feature-highlights)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Prerequisites](#-prerequisites-for-optional-features)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Key Features

### 🎨 Intelligent Code Editing

**Syntax Highlighting**
- Full syntax support for `.proto` files (proto2, proto3, Edition 2023)
- Text Proto format support (`.textproto`, `.pbtxt`, `.prototxt`)
- Theme-customizable highlighting for optimal readability

**Smart IntelliSense**
- Context-aware auto-completions for types, fields, and keywords
- Intelligent suggestions from current file and imports
- Import path completions with Google well-known types
- Auto-import support for unknown types

**Code Navigation**
- **Go to Definition** - Jump to message, enum, service, and RPC definitions instantly
- **Find All References** - Locate all usages across your workspace
- **Import Navigation** - Navigate directly to imported `.proto` files
- **Document Outline** - Bird's-eye view of all symbols in your file
- **Workspace Symbols** - Search and jump to any symbol across all protos

*Why it matters:* Navigate large codebases effortlessly. Find dependencies, understand data flows, and refactor with confidence.

### 🛡️ Advanced Diagnostics & Validation

Catch errors **before** compilation with comprehensive real-time diagnostics:

- ✅ **Syntax Validation** - Invalid protobuf syntax detection
- ✅ **Naming Conventions** - Enforce PascalCase for messages/enums, snake_case for fields
- ✅ **Reference Checking** - Detect undefined message or enum references
- ✅ **Import Validation** - Identify missing or invalid import paths
- ✅ **Field Tag Analysis**:
  - Duplicate field numbers
  - Reserved field number conflicts
  - Field numbers outside valid range (1-536,870,911)
- ✅ **Duplicate Detection** - Catch duplicate field names
- ✅ **Best Practices** - Warnings for discouraged patterns

*Why it matters:* Save time debugging compilation errors. Maintain consistent code quality across your team. Enforce organizational standards automatically.

### 🎨 Professional Code Formatting

- **Built-in Formatter** - Fast, configurable formatting out of the box
- **clang-format Integration** - Use industry-standard clang-format for consistent styling
- **Format on Save** - Automatically format on file save
- **Format Selection** - Format only the code you select
- **Customizable Rules** - Configure indentation, line length, tabs vs spaces

*Why it matters:* Consistent formatting across your team. No more style debates. Focus on logic, not formatting.

### ⚙️ Seamless Protoc Compilation

- **Single File Compilation** - Compile the current proto file with one command
- **Batch Compilation** - Compile all workspace protos at once
- **Flexible Configuration** - Custom protoc options and output directories
- **Compile on Save** - Automatic compilation when you save
- **Variable Expansion** - Use `${workspaceRoot}` and `${env.*}` in paths

*Why it matters:* Stay in your editor. No context switching to terminal. See compilation errors instantly alongside your code.

### 🔄 Breaking Change Detection

Prevent API breakage **before** it reaches production:

- Compare current protos against git baseline (branch, tag, commit)
- Detect field number changes and deletions
- Identify type modifications
- Catch message/enum deletions
- Monitor RPC signature changes
- Track enum value modifications
- Detailed violation reports with exact line locations

*Why it matters:* Protect your API consumers. Catch breaking changes in code review. Maintain backward compatibility automatically.

### 🔧 External Linter Integration

**Buf Integration**
- Enterprise-grade linting with [Buf](https://buf.build)
- Configurable via `buf.yaml`
- Run on save or on-demand
- View available lint rules

**Protolint Integration**
- Extensible linting with [Protolint](https://github.com/yoheimuta/protolint)
- Custom rule configuration via `.protolint.yaml`
- Automatic linting on save

*Why it matters:* Enforce organizational style guides. Integrate with existing toolchains. Leverage community-maintained rule sets.

### 💡 Smart Code Actions & Quick Fixes

- **Auto-fix Naming** - Convert names to proper conventions with one click
- **Add Import** - Automatically import unknown types
- **Fix Field Numbers** - Get suggestions for next available field number
- **Update Required Fields** - Convert deprecated proto2 `required` to `optional`

*Why it matters:* Fix issues instantly without manual editing. Speed up development. Learn best practices through suggestions.

### ✏️ Powerful Refactoring

- **Rename Symbol** - Safely rename messages, enums, fields, services across workspace
- **Field Renumbering** - Renumber fields in messages or entire documents
- **Preview Changes** - See what will change before applying

*Why it matters:* Refactor with confidence. Update hundreds of references instantly. Prevent broken references.

### 📝 Productivity Boosters

**Code Snippets**
- Quick declarations for proto2, proto3, Edition 2023
- Message, enum, service templates
- RPC method scaffolding
- Field and import snippets

**Editor Enhancements**
- Code folding for messages, enums, services
- Bracket matching and auto-closing
- Smart comment toggling

*Why it matters:* Write code faster. Reduce boilerplate. Focus on your data model, not syntax.

---

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type: `ext install DrBlury.protobuf-vsc`
4. Press Enter

Or search for **"Protobuf VSC"** in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)

[![Install from Marketplace](https://img.shields.io/badge/Install-VS%20Code%20Marketplace-blue?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)

### From Source

```bash
git clone https://github.com/DrBlury/protobuf-vsc-extension.git
cd protobuf-vsc-extension
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

---

## 🚦 Quick Start

1. **Install the extension** from the VS Code Marketplace
2. **Open a `.proto` file** - syntax highlighting activates automatically
3. **Start typing** - IntelliSense provides smart completions
4. **Hover over types** - see documentation and type information
5. **Right-click** to access commands like "Compile This Proto" or "Check for Breaking Changes"
6. **Configure settings** in VS Code settings (`protobuf.*`) to customize behavior

### Optional: Set up compilation

```jsonc
// .vscode/settings.json
{
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}/protos",
    "--java_out=${workspaceFolder}/gen/java",
    "--go_out=${workspaceFolder}/gen/go"
  ],
  "protobuf.protoc.compileOnSave": true
}
```

### Optional: Enable breaking change detection

```jsonc
// .vscode/settings.json
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstGitRef": "main"
}
```

### Optional: Integrate with Buf

```jsonc
// .vscode/settings.json
{
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": true
}
```

---

## 🎯 Feature Highlights

### Prevent Field Number Conflicts

The extension detects duplicate field numbers and reserved number usage **in real-time**:

```protobuf
message User {
  string name = 1;
  int32 age = 1;  // ❌ Error: Duplicate field number 1

  reserved 10 to 20;
  string email = 15;  // ❌ Error: Field number 15 is reserved
}
```

### Smart Import Management

Get auto-completions for import paths, including Google well-known types:

```protobuf
import "google/protobuf/  // ← Press Ctrl+Space for completions
```

The extension also provides "Add Import" quick fixes when using undefined types.

### Breaking Change Protection

Before pushing changes, check for API breakage:

```bash
# Run: "Protobuf: Check for Breaking Changes"
```

The extension compares your current file against a git baseline and reports:
- Field deletions or renumbering
- Type changes
- Message/enum deletions
- RPC signature modifications

### Intelligent Field Renumbering

Renumber fields automatically while respecting reserved ranges:

```protobuf
message Product {
  reserved 5 to 10;
  string name = 1;
  string desc = 3;
  int32 price = 12;
  // After renumbering: 1, 2, 11 (skips reserved 5-10)
}
```

### Visual Schema Graphs

Explore how your messages and enums connect at a glance:

- Open **Protobuf: Show Schema Graph** from the Command Palette.
- Toggle between **Workspace** or **Current file + imports** scopes.
- Nodes are color-coded (messages vs enums) and edges are labeled with field names and cardinality.
- Drag to rearrange, scroll to zoom, and refresh to pick up recent edits.

---

## 📖 Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or context menu:

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Protobuf: Format Document` | Format the current proto file | Editor context menu |
| `Protobuf: Compile This Proto` | Compile the current file with protoc | Right-click in editor |
| `Protobuf: Compile All Protos` | Compile all proto files in workspace | Command Palette |
| `Protobuf: Show Schema Graph` | Visualize message/enum relationships in an interactive graph | Command Palette |
| `Protobuf: Check for Breaking Changes` | Detect breaking changes against git baseline | Right-click in editor |
| `Protobuf: Run External Linter` | Run buf or protolint on current file | Command Palette |
| `Protobuf: Show Available Lint Rules` | Display available lint rules | Command Palette |
| `Protobuf: Renumber All Fields in Document` | Renumber all field tags sequentially | Command Palette |
| `Protobuf: Renumber Fields in Message` | Renumber fields in a specific message | Right-click in editor |
| `Protobuf: Renumber Fields from Cursor` | Renumber fields starting from cursor position | Right-click in editor |
| `Protobuf: Renumber Enum Values` | Renumber enum values sequentially | Command Palette |

---

## ⚙️ Configuration

All settings are configurable via VS Code settings (`File > Preferences > Settings` or `Cmd+,` / `Ctrl+,`). Search for "protobuf" to see all options.

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

---

## 🔧 Prerequisites for Optional Features

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

---

## 💻 Development

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

---

## 📚 Supported Versions & File Types

### Protobuf Versions
- ✅ **proto2** - Full support for Protocol Buffers version 2
- ✅ **proto3** - Full support for Protocol Buffers version 3
- ✅ **Edition 2023** - Support for the latest Edition 2023 syntax

### File Types
- `.proto` - Protocol Buffers definition files
- `.textproto`, `.pbtxt`, `.prototxt`, `.txtpb`, `.textpb`, `.pb.txt` - Text Proto format files

---

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests, we appreciate your help in making Protobuf VSC better.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/DrBlury/protobuf-vsc-extension/issues) on GitHub.

---

## 📄 License

MIT License - Copyright (c) 2025 Julian Bensch

See [LICENSE](LICENSE) file for details.

---

## 🌟 Show Your Support

If you find Protobuf VSC helpful, please:
- ⭐ **Star** the repository on [GitHub](https://github.com/DrBlury/protobuf-vsc-extension)
- ⭐ **Rate** it on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
- 🐦 **Share** it with your team and community

---

## 📞 Connect

- **GitHub**: [@DrBlury](https://github.com/DrBlury)
- **Issues**: [Report bugs or request features](https://github.com/DrBlury/protobuf-vsc-extension/issues)
- **Discussions**: [Join the conversation](https://github.com/DrBlury/protobuf-vsc-extension/discussions)
