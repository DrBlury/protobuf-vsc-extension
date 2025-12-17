# Tree-sitter Parser Integration Status

## Completed Work

### Infrastructure ✅
- Tree-sitter grammar created and tested
- WASM compiled (35KB)
- Build scripts configured
- Dependencies added

### Files Created
- `tree-sitter-proto/grammar.js` - Complete protobuf grammar
- `tree-sitter-proto/test/corpus/basic.txt` - Test corpus (7/9 passing)
- `out/tree-sitter/tree-sitter-proto.wasm` - Compiled parser

### Build & Test
```bash
npm run build:tree-sitter  # Builds WASM from grammar
npm run test:tree-sitter   # Tests grammar (7/9 passing)
npm run test:grammar       # TextMate tests (34/34 passing)
```

## Next Step: Parser Adapter

The Tree-sitter parser adapter (`src/server/core/treeSitterParser.ts`) needs to be implemented to convert Tree-sitter's CST to the existing AST format used by LSP providers.

### Requirements

1. **Proper web-tree-sitter imports**
   ```typescript
   import { Parser, Point, SyntaxNode } from 'web-tree-sitter';
   ```

2. **Initialization function**
   ```typescript
   export async function initTreeSitterParser(wasmPath: string): Promise<void>
   ```

3. **Parser class with compatible interface**
   ```typescript
   export class TreeSitterProtoParser {
     parse(content: string, uri: string): ProtoFile
   }
   ```

4. **AST conversion methods**
   - Parse syntax/edition/package declarations
   - Parse messages with all nested constructs
   - Parse enums with values
   - Parse services with RPCs
   - Parse all field types (regular, map, oneof, group)
   - Parse options, reserved, extensions

### Integration Points

Once the adapter is complete:

1. **Extension activation** (`src/extension.ts` or server initialization)
   ```typescript
   const wasmPath = path.join(context.extensionPath, 'out/tree-sitter/tree-sitter-proto.wasm');
   await initTreeSitterParser(wasmPath);
   ```

2. **Replace/augment existing parser** in LSP handlers
   ```typescript
   // Option 1: Replace entirely
   const parser = new TreeSitterProtoParser();
   const ast = parser.parse(content, uri);
   
   // Option 2: Add as optional/experimental
   if (config.useTreeSitter) {
     parser = new TreeSitterProtoParser();
   } else {
     parser = new ProtoParser();
   }
   ```

3. **Testing**
   - Run existing parser tests with Tree-sitter parser
   - Verify LSP features work (go-to-definition, references, etc.)
   - Performance benchmarking

## TypeScript Challenges

The web-tree-sitter type definitions have some quirks:
- Must use named imports: `import { Parser } from 'web-tree-sitter'`
- Parser.init() is a static method
- SyntaxNode is an exported interface
- Some type definitions reference EmscriptenModule which may need ignore comments

## Benefits of Completion

Once integrated, Tree-sitter will provide:
- ✅ Better error recovery
- ✅ Incremental parsing
- ✅ More robust handling of malformed input
- ✅ Consistent parsing across all LSP features
- ✅ Foundation for advanced features (syntax trees, structural editing)

## Current Status

- **Grammar:** ✅ Complete and tested
- **WASM:** ✅ Built and available
- **Adapter:** ⏳ Needs implementation
- **Integration:** ⏳ Pending adapter completion
- **Tests:** ⏳ Pending adapter completion

## Files Structure

```
tree-sitter-proto/
├── grammar.js              # Grammar definition
├── src/                    # Generated C parser
├── test/corpus/            # Test cases
└── tree-sitter-proto.wasm  # Compiled WASM (git-ignored)

out/tree-sitter/
└── tree-sitter-proto.wasm  # Bundled for extension

src/server/core/
├── parser.ts               # Current custom parser
└── treeSitterParser.ts     # Tree-sitter adapter (TODO)
```

## References

- [Tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [web-tree-sitter API](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- Current parser implementation: `src/server/core/parser.ts`
- AST types: `src/server/core/ast.ts`
