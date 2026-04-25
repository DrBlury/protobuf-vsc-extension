# Feature Reference

This page lists the main features supported by Protobuf VSC. For setup details, use the linked topic pages.

## Editing

- Syntax highlighting for `.proto` and `.textproto` files.
- Snippets for messages, enums, services, fields, maps, oneofs, options, Google API annotations, and gRPC patterns.
- File templates for common proto structures.
- Built-in formatter for proto files.
- Optional `clang-format` and `buf format` integration.
- Format on save, format selection, field alignment, option alignment, and blank-line normalization.

## Navigation

- Go to Definition and Peek Definition for symbols and import paths.
- Find References for messages, enums, services, RPCs, and fields.
- Document symbols for the current file.
- Workspace symbol search with exact, prefix, substring, and fuzzy matching.
- Document Links for clickable imports.

## IntelliSense

- Built-in type, keyword, option, field, and import completions.
- Type completions from the current file, imports, workspace roots, and configured include paths.
- Field name suggestions based on selected type names.
- Field number suggestions based on used and reserved numbers.
- Auto-import code actions and completions for symbols from other files.
- CEL and Protovalidate completions for `buf.validate` expressions.
- Google API annotation completions for HTTP, resource, field behavior, method signature, and service options.

## Diagnostics

- Syntax and parser diagnostics.
- Import resolution diagnostics.
- Undefined type and missing import diagnostics.
- Naming convention diagnostics for messages, enums, fields, services, RPCs, and enum values.
- Duplicate field number, duplicate field name, and duplicate symbol diagnostics.
- Reserved field number and reserved field name checks.
- Field number range and internal reserved range checks.
- Deprecated field and enum value usage checks.
- Optional unused symbol checks.
- Optional documentation comment checks.
- External linter diagnostics from Buf, Protolint, or Google API Linter.
- Configurable diagnostic severities, including `"none"` for disabled categories.

## Code Actions

- Add missing imports.
- Remove unused imports.
- Organize imports.
- Add missing semicolons.
- Fix common naming convention violations.
- Assign the next available field number.
- Renumber fields or enum values.
- Convert supported proto2 syntax to proto3 syntax.
- Add missing RPC request or response message declarations.
- Add Buf Schema Registry dependencies for recognized external imports.

## Compilation And Code Generation

- Compile the active proto file with `protoc`.
- Compile all workspace proto files with `protoc`.
- Configure custom `protoc` arguments and output directories.
- Use VS Code variable substitution in compiler options.
- Exclude files from `Compile All Protos` with `protobuf.protoc.excludePatterns`.
- Define code generation profiles for `protoc` or `buf generate`.
- Run code generation for the active file or workspace.

## Buf Support

- Detect `buf.yaml`, `buf.yml`, `buf.work.yaml`, and `buf.work.yml`.
- Use `build.roots` from Buf v1 configs for import resolution.
- Use `modules[].path` from Buf v2 configs for import resolution.
- Use `directories` from Buf workspace configs for import resolution.
- Parse Buf dependencies and module excludes without treating them as imports.
- Run Buf lint, format, breaking-change checks, and code generation when configured.
- Add Buf registry dependencies from code actions or commands.

## Schema Tools

- Schema Graph for message, enum, service, and dependency relationships.
- Search, filtering, package grouping, path highlighting, and graph export.
- Schema Diff against Git revisions.
- Breaking-change detection against a Git ref or baseline file.
- Option Inspector tree view for file, message, field, enum, and service options.

## gRPC

- List services in the workspace.
- Show service details for the current file.
- Generate client stub previews.
- Generate server template previews.
- Show service statistics by RPC streaming type.
- Snippets for common service and RPC patterns.
- Beta Playground for plaintext `grpcurl` requests, active-file services, and server reflection.

## Toolchain

- Detect `protoc`, `buf`, `grpcurl`, `protolint`, `api-linter`, and `clang-format`.
- Install managed `protoc`, `buf`, and `grpcurl` binaries from the toolchain manager.
- Use managed or system tool paths.
- Configure tool paths in VS Code settings.

## See Also

- [Settings Reference](./settings.md)
- [Diagnostics](./diagnostics.md)
- [Completions](./completions.md)
- [Code Actions](./code-actions.md)
- [Buf Configuration](./buf-config.md)
- [Schema Graph](./schema-graph.md)
- [gRPC Integration](./grpc.md)
