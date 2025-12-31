# Protobuf VSC

[![CI](https://github.com/DrBlury/protobuf-vsc-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/DrBlury/protobuf-vsc-extension/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-79%25-yellow)](https://github.com/DrBlury/protobuf-vsc-extension)
![Coverage Target](https://img.shields.io/badge/coverage_target-80%25-green)
[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/DrBlury.protobuf-vsc?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
[![Open VSX Version](https://img.shields.io/open-vsx/v/DrBlury/protobuf-vsc?label=Open%20VSX)](https://open-vsx.org/extension/DrBlury/protobuf-vsc)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/DrBlury.protobuf-vsc)](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)
[![License](https://img.shields.io/github/license/DrBlury/protobuf-vsc-extension)](LICENSE)

Full Protocol Buffers language support for VS Code: navigation, IntelliSense, diagnostics, formatting, compilation, linting, breaking-change checks, and schema graphs.

> **Note:** This is the successor to the [vscode-proto3](https://marketplace.visualstudio.com/items?itemName=zxh404.vscode-proto3) extension. This new extension has a different codebase, feature set, and author. The original extension is no longer maintained and the repo will be archived. If you encounter any issues migrating, please open an issue so I can resolve them quickly. Thanks a lot to the contributors to the [vscode-proto3](https://marketplace.visualstudio.com/items?itemName=zxh404.vscode-proto3) extension and all the work that went into this extension which inspired me to make this extension. I've learned a lot and looking forward to improving this extension a lot!

**Author:** Julian Bensch ([@DrBlury](https://github.com/DrBlury))

---

**Contents:** [Quick Start](#quick-start) • [Install](#install) • [What You Get](#what-you-get) • [Common Tasks](#common-tasks) • [Settings Cheat Sheet](#settings-cheat-sheet) • [Documentation](#documentation) • [Optional Tools](#optional-tools) • [Development](#development) • [Support](#support) • [License](#license)

---

## Quick Start

1) Install **Protobuf VSC** from the Marketplace.
2) Open a `.proto` or `.textproto` file; IntelliSense, diagnostics, and formatting are on (proto2 + proto3 supported).
3) Use the Command Palette (`Cmd/Ctrl+Shift+P`) and run `Protobuf: Compile This Proto` or `Protobuf: Show Schema Graph`.
4) Install `protoc` (and optional tools below) if you need compilation/linting.
5) Add a minimal config if you want import resolution and compilation output:

```jsonc
// .vscode/settings.json
{
  // Import paths for IntelliSense and diagnostics (recommended)
  "protobuf.includes": [
    "${workspaceFolder}/path/to/protos"
  ],
  // Protoc compilation settings
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": ["--proto_path=${workspaceFolder}", "--go_out=${workspaceFolder}/gen/go"]
}
```

> **Note:** Use `protobuf.includes` for configuring import paths. The extension also extracts `--proto_path` from `protobuf.protoc.options` as a fallback, but `protobuf.includes` is preferred for better IntelliSense and diagnostics support.

---

## Install

- Marketplace: `ext install DrBlury.protobuf-vsc` or search "Protobuf VSC" in Extensions.
- From source: `git clone`, `npm install`, `npm run compile`, then press `F5` to launch the Extension Development Host.

---

## What You Get

- **Navigation and IntelliSense**: definitions, references, workspace symbols, import completion, auto-imports, fuzzy search
- **Comprehensive Diagnostics**: 30+ validation checks including syntax, imports, naming, duplicates, reserved ranges, undefined types, deprecated usage, circular dependencies, and more
- **Code Lens**: Reference counts and metadata above symbols
- **Document Links**: Clickable import paths for quick navigation
- **Rich Hover Information**: Detailed symbol information with reference counts
- **Smart Code Actions**: Quick fixes, organize imports, proto3 conversion, and more
- **Intelligent Completions**: Type-based field name suggestions, smart import paths, context-aware completions
- **CEL / Protovalidate Support**: Smart completions for buf.validate CEL expressions, field references, and CEL functions
- **Formatting**: Built-in with field alignment, `clang-format`, or `buf format`. Format on save/selection with smart alignment of field numbers and option keys
- **Compilation**: Run protoc per file or all files, with custom options and variables
- **Linting**: Buf or Protolint integration on demand or on save
- **Breaking-change Detection**: Compare against a git ref or file baseline
- **Schema Graph**: Interactive view of message/enum relationships
- **Buf.yaml Support**: Automatic detection and integration with Buf configuration
- **Templates**: Pre-built templates for common proto patterns
- **Refactoring**: Rename, renumber fields/enums, quick fixes for imports and naming
- **Toolchain Management**: Install and manage protoc/buf directly from VS Code
- **Auto-Detection**: Automatically detect installed tools (buf, protolint, protoc) and suggest configuration
- **Dependency Suggestions**: Suggest adding BSR modules to buf.yaml when external imports are detected

See the [Complete Features List](./docs/FEATURES.md) for a comprehensive overview of all 100+ features.

---

## Common Tasks

- Format current file: `Protobuf: Format Document`.
- Compile current file: `Protobuf: Compile This Proto`; compile all: `Protobuf: Compile All Protos`.
- Check for breaking changes: `Protobuf: Check for Breaking Changes` (configure baseline in settings).
- Run lint: `Protobuf: Run External Linter` (Buf/Protolint).
- View schema: `Protobuf: Show Schema Graph`.
- Renumber: `Protobuf: Renumber Fields/Enums` commands from palette or editor menu.

---

## Commands (Palette)

| Command | What it does |
| --- | --- |
| `Protobuf: Compile This Proto` | Runs `protoc` on the active file using configured options/variables. |
| `Protobuf: Compile All Protos` | Compiles every proto in the workspace. |
| `Protobuf: Check for Breaking Changes` | Compares current schema to a configured git ref or file. |
| `Protobuf: Show Schema Graph` | Opens an interactive graph of messages/enums and their relations. |
| `Protobuf: Renumber Fields/Enums` | Rewrites tag numbers to close gaps or reorder. |
| `Protobuf: Format Document` | Formats current proto via built-in or `clang-format`. |
| `Protobuf: Run External Linter` | Runs Buf or Protolint with configured options. |
| `Protobuf: Go to Definition / Find References` | Standard navigation for symbols and imports. |

---

## Settings Cheat Sheet

Search for "protobuf" in VS Code settings. Common options:

| Setting | Purpose | Default |
| --- | --- | --- |
| `protobuf.formatter.enabled` | Enable built-in formatter and automatic semicolon fixes | `true` |
| `protobuf.formatter.insertEmptyLineBetweenDefinitions` | Ensure a single blank line between top-level messages/enums/services | `true` |
| `protobuf.formatter.maxEmptyLines` | Collapse consecutive blank lines down to this limit | `1` |
| `protobuf.formatOnSave` | Format on save (overrides VS Code's `editor.formatOnSave` just for `.proto`/`.textproto`). When `editor.formatOnSaveMode` is set to `modifications`, the extension defers to VS Code and will not run its own formatter while `editor.formatOnSave` is disabled. | `false` |
| `protobuf.protoc.path` | Path to `protoc` | `"protoc"` |
| `protobuf.protoc.options` | Extra `protoc` args | `[]` |
| `protobuf.protoc.compileOnSave` | Compile on save | `false` |
| `protobuf.breaking.enabled` | Turn on breaking-change checks | `false` |
| `protobuf.breaking.againstGitRef` | Git ref baseline | `"HEAD~1"` |
| `protobuf.externalLinter.linter` | `buf`, `protolint`, `api-linter` | `"none"` |
| `protobuf.clangFormat.enabled` | Use `clang-format` | `false` |
| `protobuf.clangFormat.style` | `clang-format` style (`"file"` reads `.clang-format`) | `"file"` |

Example workspace settings (popular defaults):

```jsonc
// .vscode/settings.json
{
  // Formatting
  "protobuf.formatOnSave": true,
  "protobuf.formatter.alignFields": true,

  // Import search paths
  "protobuf.includes": [
    "${workspaceFolder}/protos"
  ],

  // Protoc tool and outputs
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}",
    "--go_out=${workspaceFolder}/gen/go",
    "--go_opt=paths=source_relative"
  ],

  // Linting (Buf) on save
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": true,

  // IntelliSense/hover polish
  "protobuf.completion.autoImport": true,
  "protobuf.hover.showDocumentation": true
}
```

---

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) folder:

### Core Features

- [Diagnostics](./docs/diagnostics.md) - Comprehensive validation and error checking
- [Code Lens](./docs/code-lens.md) - Reference counts and metadata display
- [Document Links](./docs/document-links.md) - Clickable import paths
- [Hover Information](./docs/hover.md) - Rich symbol information on hover
- [Code Actions](./docs/code-actions.md) - Quick fixes and refactoring
- [Completions](./docs/completions.md) - Smart IntelliSense suggestions
- [Symbol Search](./docs/symbol-search.md) - Fuzzy workspace symbol search

### Advanced Features

- [Buf.yaml Support](./docs/buf-config.md) - Integration with Buf configuration
- [Templates](./docs/templates.md) - Proto file templates
- [Settings Reference](./docs/settings.md) - Complete settings documentation

See the [Documentation Index](./docs/README.md) for the complete list.

---

## Optional Tools

- `protoc` for compilation: `brew install protobuf` (macOS) or download from releases.
- Buf: `brew install bufbuild/buf/buf` or `npm install -g @bufbuild/buf`.
- Protolint: `brew install protolint` or `go install github.com/yoheimuta/protolint/cmd/protolint@latest`.
- Google API Linter: `go install github.com/googleapis/api-linter/cmd/api-linter@latest` (for AIP compliance).
- `clang-format`: `brew install clang-format` (or via LLVM on Windows/Linux).

---

## Development

Requirements: Node.js 20+, npm 9+, VS Code 1.85+.

- Install deps: `npm install`
- Lint: `npm run lint`
- Type-check: `npm run type-check`
- Build: `npm run compile`
- Test: `npm run test`
- Pre-commit hooks: `pre-commit run --all-files` (requires `pip install pre-commit`)
- Debug: open in VS Code and press `F5` to launch the Extension Development Host.

If you want to explore, see `examples/` for sample protos and `resources/google-protos/` for well-known types used in tests.

---

## Support

- Report bugs or request features: [GitHub Issues](https://github.com/DrBlury/protobuf-vsc-extension/issues)
- Discussions: [GitHub Discussions](https://github.com/DrBlury/protobuf-vsc-extension/discussions)
- Marketplace page: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DrBlury.protobuf-vsc)

If you like the extension, please star the repo or rate it on the Marketplace.

---

## Troubleshooting

- `protoc: command not found`: install `protoc` and ensure it is on PATH, or set `protobuf.protoc.path` to the absolute binary path.
- Buf/Protolint not found: install the tool and restart VS Code so the PATH is picked up.
- Imports unresolved: confirm `--proto_path` covers your source roots; you can set multiple entries in `protobuf.protoc.options`.
- Formatting issues: set `protobuf.clangFormat.enabled` when you want to delegate formatting to your local `clang-format` config.

---

## Contributing

Pull requests and issue reports are welcome. Please run `npm run lint`, `npm run type-check`, and `npm run test` before submitting. Pre-commit hooks are configured to run lint and tests on commit.

---

## License

MIT License © 2025 Julian Bensch. See `LICENSE` for details.
