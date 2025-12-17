# Tree-sitter Parser

The Protobuf VS Code extension uses [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for parsing Protocol Buffer files. Tree-sitter provides robust, incremental parsing with excellent error recovery.

## Overview

Tree-sitter is used for **LSP features** (go-to-definition, completions, diagnostics, etc.) while **TextMate grammars** remain unchanged for syntax highlighting.

```
┌─────────────────────────────────────┐
│         VS Code Extension           │
├─────────────────────────────────────┤
│  Syntax Highlighting                │
│  ├─ proto.tmLanguage.json           │ ← TextMate (unchanged)
│  └─ textproto.tmLanguage.json       │ ← TextMate (unchanged)
├─────────────────────────────────────┤
│  LSP Features                       │
│  └─ Tree-sitter Parser (WASM)       │ ← Default parser
└─────────────────────────────────────┘
```

## Configuration

Tree-sitter is enabled by default. To use the legacy built-in parser instead:

```json
{
  "protobuf.parser": "legacy"
}

```

The parser can be changed dynamically without restarting VS Code.
```

## Benefits

- **Error Recovery**: Continues parsing even with syntax errors
- **Incremental Parsing**: Re-parses only changed sections for better performance
- **Modern Architecture**: Battle-tested parser generator
- **Robust**: Handles edge cases and malformed input gracefully

## Supported Syntax

The Tree-sitter grammar supports:

- proto2, proto3, and editions syntax
- Messages, enums, services, and extensions
- All field types (scalar, message, map, oneof, group)
- Options (file, message, field, enum, service, method)
- Reserved statements and extensions ranges
- Comments (single-line and block)

## Development

### Grammar Location

The Tree-sitter grammar is located at `tree-sitter-proto/grammar.js`.

### Building the WASM

```bash
cd tree-sitter-proto
npm run build
```

This compiles the grammar to WebAssembly (`tree-sitter-proto.wasm`) for use in the VS Code extension.

### Testing

Run the parser comparison to verify Tree-sitter matches the built-in parser:

```bash
npx ts-node scripts/compare-parsers.ts
```

For CI mode (requires 100% match rate):

```bash
npx ts-node scripts/compare-parsers.ts --ci
```

### Files

| File | Description |
|------|-------------|
| `tree-sitter-proto/grammar.js` | Grammar definition |
| `tree-sitter-proto/src/parser.c` | Generated C parser |
| `tree-sitter-proto/tree-sitter-proto.wasm` | Compiled WASM |
| `src/server/core/treeSitterParser.ts` | AST adapter |
| `src/server/core/parserFactory.ts` | Parser switcher |
| `scripts/compare-parsers.ts` | Parser comparison tool |
