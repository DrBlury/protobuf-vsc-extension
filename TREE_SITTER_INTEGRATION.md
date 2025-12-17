# Tree-sitter Integration for LSP Features

## Overview

This document explains the Tree-sitter integration for the Protobuf VSC extension. Tree-sitter is used for **LSP features** (go-to-definition, references, etc.) while **TextMate grammars remain for syntax highlighting**.

## Architecture

```
┌─────────────────────────────────────┐
│         VS Code Extension           │
├─────────────────────────────────────┤
│  Syntax Highlighting                │
│  ├─ TextMate (proto.tmLanguage)     │ ← Unchanged
│  └─ TextMate (textproto.tmLanguage) │ ← Unchanged
├─────────────────────────────────────┤
│  LSP Features                       │
│  ├─ Tree-sitter Parser (WASM)       │ ← New/In Progress
│  ├─ Custom TypeScript Parser        │ ← Current (can be replaced)
│  └─ Existing Providers              │ ← Unchanged
└─────────────────────────────────────┘
```

## Current Status

### Completed
- ✅ Added `web-tree-sitter` dependency for runtime
- ✅ Added `tree-sitter-cli` dev dependency for grammar compilation
- ✅ Created comprehensive Tree-sitter grammar for Protocol Buffers
  - Supports proto2, proto3, and editions syntax
  - Handles all language constructs (messages, enums, services, etc.)
- ✅ Set up WASM build pipeline
- ✅ Created basic test corpus for grammar validation
- ✅ Updated build scripts in package.json
- ✅ Updated .gitignore and .vscodeignore

### In Progress
- 🔄 Tree-sitter Parser Adapter (needs to convert CST to existing AST format)
- 🔄 Integration with LSP handlers
- 🔄 Testing and validation

### Remaining Work
- ⏳ Complete the Tree-sitter parser adapter implementation
- ⏳ Update extension initialization to load Tree-sitter WASM
- ⏳ Add configuration option to choose between parsers
- ⏳ Performance testing and comparison
- ⏳ Full integration testing with LSP features

## Files Added

### Grammar
- `tree-sitter-proto/grammar.js` - Complete Protocol Buffers grammar
- `tree-sitter-proto/test/corpus/basic.txt` - Test cases for grammar
- `tree-sitter-proto/package.json` - Grammar package configuration

### Compiled Output
- `out/tree-sitter/tree-sitter-proto.wasm` - Compiled WASM parser (34KB)

### Source Code (Planned)
- `src/server/core/treeSitterParser.ts` - Adapter to convert Tree-sitter CST to AST

## Usage (When Complete)

```typescript
// Initialize at extension activation
import { initTreeSitterParser, TreeSitterProtoParser } from './server/core/treeSitterParser';

// During activation
await initTreeSitterParser(wasmPath);

// Use in LSP providers
const parser = new TreeSitterProtoParser();
const ast = parser.parse(documentContent);
```

## Benefits

1. **Better Error Recovery**: Tree-sitter continues parsing even with syntax errors
2. **Incremental Parsing**: Only re-parses changed sections for better performance
3. **Modern Architecture**: Uses battle-tested parser generator
4. **Maintainability**: Grammar is easier to read and maintain than custom parser
5. **Robustness**: Handles edge cases and malformed input better

## TextMate Grammars

TextMate grammars remain unchanged and continue to provide:
- ✅ Fast, lightweight syntax highlighting
- ✅ Production-ready with 34 passing tests
- ✅ VS Code native integration
- ✅ No performance overhead

## Next Steps

1. Complete the parser adapter implementation
2. Add TypeScript types for web-tree-sitter
3. Integration with extension activation
4. Comprehensive testing
5. Performance benchmarking

## Development Commands

```bash
# Generate Tree-sitter parser
cd tree-sitter-proto && npx tree-sitter generate

# Build WASM
cd tree-sitter-proto && npx tree-sitter build --wasm

# Test grammar
cd tree-sitter-proto && npx tree-sitter test

# Build everything
npm run build:tree-sitter
```

## Notes

- Tree-sitter is used for LSP parsing, NOT syntax highlighting
- TextMate grammars continue to provide syntax highlighting
- This approach gives us the best of both worlds
- Integration is opt-in and can be toggled
