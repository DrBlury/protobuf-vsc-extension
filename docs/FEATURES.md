# Complete Features List

This document provides a comprehensive list of all features in the Protobuf VSC extension.

## Core Language Features

### Navigation

- ✅ **Go to Definition** - Navigate to symbol definitions (`F12`)
- ✅ **Find All References** - Find all usages of a symbol (`Shift+F12`)
- ✅ **Workspace Symbol Search** - Fuzzy search across workspace (`Cmd/Ctrl+T`)
- ✅ **Document Symbols** - Outline view of current file (`Cmd/Ctrl+Shift+O`)
- ✅ **Peek Definition** - View definition in popup (`Alt+F12`)

### IntelliSense

- ✅ **Type Completions** - Smart suggestions for types
- ✅ **Field Name Suggestions** - Type-based field name suggestions
- ✅ **Field Number Suggestions** - Context-aware field number suggestions
- ✅ **Import Path Completions** - Smart import path suggestions
- ✅ **Keyword Completions** - Proto keyword suggestions
- ✅ **Option Completions** - Field and file option suggestions
- ✅ **Auto-import** - Automatically add imports when completing types
- ✅ **CEL Expression Completions** - Smart completions for protovalidate CEL expressions

### CEL / Protovalidate Support

- ✅ **Full CEL Spec Compliance** - Complete support for the [CEL Language Specification](https://github.com/google/cel-spec/blob/master/doc/langdef.md)
- ✅ **CEL Option Completions** - Suggests id, message, expression fields
- ✅ **Field References** - Suggests message fields after `this.`
- ✅ **CEL Functions** - Completions for all CEL functions (has, size, matches, timestamp getters, etc.)
- ✅ **CEL Literals** - Support for all literal types (raw strings, triple-quoted strings, bytes, hex/unsigned integers, etc.)
- ✅ **CEL Operators** - Syntax highlighting for all operators (arithmetic, comparison, logical, ternary, membership)
- ✅ **CEL Reserved Words** - Proper highlighting of reserved keywords
- ✅ **Context-Aware** - Knows which message you're in for field suggestions
- ✅ **Proper Formatting** - Handles multi-line CEL expressions correctly

### Google API Support

- ✅ **HTTP Annotations** - Completions and snippets for `(google.api.http)` options
- ✅ **HTTP Methods** - Completions for get, post, put, delete, patch, custom
- ✅ **Path Templates** - Smart suggestions for HTTP path templates with variables
- ✅ **Body Mapping** - Completions for body and response_body fields
- ✅ **Additional Bindings** - Support for multiple HTTP endpoint mappings
- ✅ **Field Behaviors** - Completions for `(google.api.field_behavior)` annotations
- ✅ **Field Behavior Values** - REQUIRED, OUTPUT_ONLY, INPUT_ONLY, IMMUTABLE, OPTIONAL, etc.
- ✅ **Resource Descriptors** - Completions for `(google.api.resource)` options
- ✅ **Resource Properties** - type, pattern, name_field, plural, singular, history, style
- ✅ **Resource References** - Completions for `(google.api.resource_reference)` annotations
- ✅ **Method Signatures** - Support for `(google.api.method_signature)` option
- ✅ **Service Options** - Completions for default_host and oauth_scopes
- ✅ **FieldMask Support** - Enhanced field name suggestions for FieldMask types
- ✅ **Syntax Highlighting** - Custom highlighting for Google API annotations

### Hover Information

- ✅ **Symbol Details** - Rich information about symbols
- ✅ **Reference Counts** - See how many times symbols are referenced
- ✅ **Type Definitions** - View message and enum structures
- ✅ **Built-in Type Info** - Detailed information about built-in types
- ✅ **Keyword Help** - Explanations of proto keywords

### Code Lens

- ✅ **Reference Counts** - Show reference counts above symbols
- ✅ **External/Internal Breakdown** - Distinguish external vs internal references
- ✅ **Field/RPC Counts** - Show counts for messages and services
- ✅ **Clickable Actions** - Click to find references

### Document Links

- ✅ **Clickable Imports** - Click import paths to open files
- ✅ **Smart Resolution** - Resolves imports using multiple strategies
- ✅ **Unresolved Handling** - Handles unresolved imports gracefully

## Diagnostics & Validation

### Syntax Validation

- ✅ **Syntax/Edition Checks** - Validates syntax and edition declarations
- ✅ **Package Validation** - Checks package declarations
- ✅ **Parse Errors** - Reports parsing errors

### Type Checking

- ✅ **Undefined Type Detection** - Finds undefined type references
- ✅ **Missing Import Detection** - Detects missing imports
- ✅ **Incorrect Import Paths** - Warns about wrong import paths
- ✅ **Type Reference Validation** - Validates all type references

### Naming Conventions

- ✅ **Message/Enum Naming** - Checks PascalCase for messages/enums
- ✅ **Field Naming** - Checks snake_case for fields
- ✅ **Enum Value Naming** - Checks SCREAMING_SNAKE_CASE for enum values
- ✅ **Service/RPC Naming** - Checks PascalCase for services/RPCs
- ✅ **Configurable Severity** - Adjustable severity levels

### Field Validation

- ✅ **Duplicate Field Numbers** - Detects duplicate field numbers
- ✅ **Duplicate Field Names** - Detects duplicate field names
- ✅ **Field Number Range** - Validates field number ranges (1-536870911)
- ✅ **Reserved Range Checks** - Validates against reserved ranges (19000-19999)
- ✅ **Reserved Field Usage** - Detects use of reserved fields
- ✅ **Field Number Continuity** - Warns about gaps in field numbers
- ✅ **Out-of-order Detection** - Detects non-sequential field numbers

### Import Validation

- ✅ **Unresolved Imports** - Detects imports that can't be resolved
- ✅ **Unused Imports** - Identifies unused imports
- ✅ **Circular Dependencies** - Detects circular import chains
- ✅ **Empty Import Paths** - Validates import paths

### Advanced Validation

- ✅ **Deprecated Usage** - Warns when deprecated fields/enums are used
- ✅ **Unused Symbols** - Detects unused messages/enums/services (optional)
- ✅ **Extension Range Validation** - Validates extension ranges
- ✅ **Proto3 Field Presence** - Validates proto3 field presence semantics
- ✅ **Documentation Comments** - Suggests documentation for public APIs
- ✅ **Discouraged Constructs** - Warns about discouraged patterns

## Code Actions & Refactoring

### Quick Fixes

- ✅ **Add Missing Imports** - Automatically adds required imports
- ✅ **Fix Naming Conventions** - Converts names to proper case
- ✅ **Add Missing Semicolons** - Adds missing semicolons
- ✅ **Fix Field Numbers** - Suggests next available field number
- ✅ **Remove Unused Imports** - Removes unused import statements
- ✅ **Fix Option Values** - Corrects option value types
- ✅ **Fix RPC Types** - Adds missing RPC request/response types

### Refactoring

- ✅ **Organize Imports** - Sorts and deduplicates imports
- ✅ **Proto3 Conversion** - Converts proto2 to proto3 style
- ✅ **Add Field Options** - Adds deprecated, json_name options
- ✅ **Renumber Fields** - Renumbers fields sequentially
- ✅ **Renumber Enums** - Renumbers enum values

### Source Actions

- ✅ **Organize All Imports** - Organizes all imports at once
- ✅ **Fix All** - Applies all applicable quick fixes
- ✅ **Add Missing Semicolons** - Adds all missing semicolons
- ✅ **Assign Field Numbers** - Assigns numbers to unnumbered fields

## Formatting

### Built-in Formatter

- ✅ **Document Formatting** - Formats entire document
- ✅ **Range Formatting** - Formats selected range
- ✅ **Format on Save** - Automatic formatting on save
- ✅ **Configurable Indentation** - Spaces or tabs, configurable size
- ✅ **Line Length** - Configurable maximum line length
- ✅ **Auto-renumbering** - Optional field renumbering on format

### Clang Format Integration

- ✅ **Clang Format Support** - Use clang-format for formatting
- ✅ **Style Configuration** - Multiple style options
- ✅ **Fallback Styles** - Fallback when .clang-format not found

### Buf Format Integration

- ✅ **Buf Format Support** - Use buf format for formatting
- ✅ **Automatic Formatting** - Integrates with document formatting
- ✅ **Path-aware Formatting** - Uses file context for better formatting

## Compilation

### Protoc Integration

- ✅ **Compile Single File** - Compile current proto file
- ✅ **Compile All Files** - Compile all protos in workspace
- ✅ **Custom Options** - Support for all protoc options
- ✅ **Variable Substitution** - VS Code variable support
- ✅ **Compile on Save** - Optional automatic compilation
- ✅ **Absolute/Relative Paths** - Configurable path handling

## Linting

### External Linters

- ✅ **Buf Integration** - Run buf lint
- ✅ **Protolint Integration** - Run protolint
- ✅ **Config File Support** - Uses buf.yaml and .protolint.yaml
- ✅ **Run on Save** - Optional automatic linting
- ✅ **Workspace Linting** - Lint entire workspace

## Breaking Changes

### Detection

- ✅ **Git Baseline** - Compare against git references
- ✅ **File Baseline** - Compare against specific files
- ✅ **Comprehensive Rules** - Detects all breaking change types
- ✅ **Detailed Reports** - Shows locations and descriptions

### Schema Diff

- ✅ **Git Integration** - Compare files against Git references
- ✅ **Visual Diff View** - Side-by-side comparison in VS Code
- ✅ **Historical Comparison** - Compare against commits, branches, tags
- ✅ **Easy Navigation** - Jump to specific changes

## Schema Visualization

### Schema Graph

- ✅ **Interactive Graph** - Visual representation of schema
- ✅ **Multiple Scopes** - File with import and workspace scope
- ✅ **Navigation** - Click to navigate to definitions
- ✅ **Relationship Visualization** - Shows message/enum relationships

## Templates

### Pre-built Templates

- ✅ **Basic Message** - Simple message template
- ✅ **Service with RPCs** - Service template
- ✅ **Enum** - Enumeration template
- ✅ **Nested Types** - Message with nested types
- ✅ **Map Fields** - Message with maps
- ✅ **Oneof Fields** - Message with oneof
- ✅ **With Options** - File with common options

## Buf Integration

### Automatic Detection

- ✅ **buf.yaml Parsing** - Automatically parses buf.yaml
- ✅ **buf.work.yaml Support** - Supports buf workspaces
- ✅ **Proto Root Detection** - Uses buf roots for imports
- ✅ **Workspace Directory Detection** - Detects workspace directories
- ✅ **Caching** - Efficient configuration caching

### Registry Management

- ✅ **Add Dependencies** - Add Buf modules from registry
- ✅ **Automatic buf.yaml Updates** - Updates configuration automatically
- ✅ **Module Support** - Works with buf.build modules
- ✅ **Automatic Updates** - Runs buf mod update after adding

## Toolchain Management

### Tool Installation

- ✅ **Automatic Detection** - Checks for protoc and buf installation
- ✅ **Status Bar Indicator** - Visual feedback on toolchain health
- ✅ **One-click Installation** - Install tools directly from VS Code
- ✅ **Version Management** - View and update tool versions
- ✅ **Platform Support** - Windows, macOS (Intel/ARM), Linux
- ✅ **Managed Tools** - Extension-managed tool installation

## Code Generation

### Codegen Profiles

- ✅ **Profile Configuration** - Define multiple codegen setups
- ✅ **Variable Substitution** - Use VS Code variables in profiles
- ✅ **Context-aware Generation** - Generate for current file or workspace
- ✅ **Multiple Languages** - Support for Go, TypeScript, Python, etc.
- ✅ **Quick Selection** - Easy profile selection interface

## Migration

### Proto2 to Proto3

- ✅ **Syntax Conversion** - Converts proto2 to proto3 syntax
- ✅ **Required Field Removal** - Removes required keyword
- ✅ **Default Value Removal** - Removes default options
- ✅ **Safe Conversion** - Automatic safe changes only

## Developer Tools

### Playground

- ✅ **gRPC Request Testing** - Test gRPC services from VS Code
- ✅ **Service Discovery** - Automatically lists available services
- ✅ **JSON Request Bodies** - Easy JSON input
- ✅ **Response Viewing** - Real-time response display
- ✅ **grpcurl Integration** - Uses grpcurl for requests

### Option Inspector

- ✅ **Tree View** - Visual tree of all options
- ✅ **Option Browsing** - Browse file, message, field, enum options
- ✅ **Quick Navigation** - Click to jump to option definitions
- ✅ **Auto-refresh** - Updates when files change

## Advanced Features

### Symbol Search

- ✅ **Fuzzy Matching** - Intelligent symbol matching
- ✅ **Multiple Strategies** - Exact, starts-with, contains, fuzzy
- ✅ **Relevance Ranking** - Results sorted by relevance
- ✅ **Performance Optimized** - Fast search for large workspaces

### Import Resolution

- ✅ **Multiple Strategies** - 6 different resolution strategies
- ✅ **Buf Integration** - Uses buf.yaml configuration
- ✅ **Workspace Roots** - Detects workspace proto roots
- ✅ **Relative Paths** - Handles relative imports
- ✅ **Google Well-known Types** - Built-in support

### Renaming

- ✅ **Symbol Renaming** - Rename messages, enums, fields
- ✅ **Cross-file Renaming** - Renames across entire workspace
- ✅ **Safe Renaming** - Validates before renaming

### Renumbering

- ✅ **Document Renumbering** - Renumber all fields in document
- ✅ **Message Renumbering** - Renumber fields in specific message
- ✅ **Enum Renumbering** - Renumber enum values
- ✅ **From Cursor** - Renumber from cursor position
- ✅ **Configurable Options** - Start number, increment, reserved handling

## Configuration

### Settings

- ✅ **Comprehensive Settings** - 50+ configuration options
- ✅ **Per-workspace Settings** - Workspace-specific configuration
- ✅ **Variable Substitution** - VS Code variable support
- ✅ **Severity Configuration** - Per-diagnostic severity levels

## Performance

### Optimizations

- ✅ **Incremental Updates** - Only updates changed files
- ✅ **Caching** - Efficient symbol and config caching
- ✅ **Lazy Loading** - Loads symbols on demand
- ✅ **Background Processing** - Non-blocking operations

## Testing

### Test Coverage

- ✅ **Unit Tests** - Comprehensive unit test suite
- ✅ **Integration Tests** - End-to-end integration tests
- ✅ **Test Coverage** - High test coverage
- ✅ **Continuous Testing** - Tests run in CI/CD

## Documentation

### User Documentation

- ✅ **Feature Documentation** - Detailed feature docs
- ✅ **Configuration Guide** - Complete settings reference
- ✅ **Examples** - Configuration examples
- ✅ **Troubleshooting** - Common issues and solutions

---

## Feature Count

- **Total Features**: 120+
- **Core Features**: 20+
- **Diagnostics**: 30+
- **Code Actions**: 15+
- **Advanced Features**: 30+
- **Developer Tools**: 10+
- **Configuration Options**: 50+

---
