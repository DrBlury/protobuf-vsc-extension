# Settings Reference

Complete reference for all Protobuf VSC extension settings.

## Configuration Location

Settings can be configured in:

- **User Settings**: `File → Preferences → Settings` (applies to all workspaces)
- **Workspace Settings**: `.vscode/settings.json` (applies to current workspace)

## Settings Categories

### Diagnostics

#### `protobuf.diagnostics.enabled`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable all diagnostics

#### `protobuf.diagnostics.useBuiltIn`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable built-in AST-based diagnostics. When disabled, only external linters (buf, protolint) will provide diagnostics. Useful when testing the Tree-sitter parser or preferring external tool validation over built-in checks.

#### `protobuf.diagnostics.namingConventions`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Check naming conventions (PascalCase for messages/enums, snake_case for fields)

#### `protobuf.diagnostics.referenceChecks`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Check for undefined references

#### `protobuf.diagnostics.importChecks`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Validate import statements

#### `protobuf.diagnostics.fieldTagChecks`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Check for field tag issues (duplicates, reserved, out of range)

#### `protobuf.diagnostics.duplicateFieldChecks`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Check for duplicate field names

#### `protobuf.diagnostics.discouragedConstructs`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Warn about discouraged patterns

#### `protobuf.diagnostics.deprecatedUsage`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Warn when deprecated fields or enum values are used

#### `protobuf.diagnostics.unusedSymbols`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Warn about unused messages, enums, and services

#### `protobuf.diagnostics.circularDependencies`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Detect circular import dependencies

#### `protobuf.diagnostics.documentationComments`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Detect undocumented APIs

#### Severity Settings

##### `protobuf.diagnostics.severity.namingConventions`

- **Type**: `"error" | "warning" | "information" | "hint"`
- **Default**: `"warning"`
- **Description**: Severity level for naming convention violations

##### `protobuf.diagnostics.severity.referenceErrors`

- **Type**: `"error" | "warning" | "information" | "hint"`
- **Default**: `"error"`
- **Description**: Severity level for undefined reference errors

##### `protobuf.diagnostics.severity.fieldTagIssues`

- **Type**: `"error" | "warning" | "information" | "hint"`
- **Default**: `"error"`
- **Description**: Severity level for field tag issues

##### `protobuf.diagnostics.severity.discouragedConstructs`

- **Type**: `"error" | "warning" | "information" | "hint"`
- **Default**: `"warning"`
- **Description**: Severity level for discouraged constructs

### Formatter

#### `protobuf.formatter.enabled`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable the formatter and automatic semicolon fixes. When disabled, document formatting will not run and the "Add missing semicolons" code action will not be suggested.

#### `protobuf.formatOnSave`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Automatically format proto files on save. When disabled, saving `.proto`/`.textproto` files skips formatting even if VS Code's `editor.formatOnSave` is turned on. When enabled, the extension formats proto files on save even if the global editor setting is turned off (unless VS Code's `editor.formatOnSaveMode` is set to `modifications`, in which case VS Code must remain responsible for formatting).

#### `protobuf.indentSize`

- **Type**: `number`
- **Default**: `2`
- **Minimum**: `1`
- **Maximum**: `8`
- **Description**: Number of spaces for indentation

#### `protobuf.useTabIndent`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Use tabs instead of spaces

#### `protobuf.maxLineLength`

- **Type**: `number`
- **Default**: `120`
- **Minimum**: `80`
- **Maximum**: `200`
- **Description**: Maximum line length for formatting

#### `protobuf.formatter.preset`

- **Type**: `"minimal" | "google" | "buf" | "custom"`
- **Default**: `"minimal"`
- **Description**: Formatter preset to use
  - `"minimal"` - Built-in minimal formatter (default)
  - `"google"` - Use clang-format with Google style (requires clang-format)
  - `"buf"` - Use buf format (requires buf to be installed)
  - `"custom"` - Use custom formatting settings

#### `protobuf.formatter.alignFields`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Align field names and field numbers for prettier formatting. When enabled:
  - Field numbers (`=` signs) are vertically aligned within message/enum blocks
  - Option block keys (e.g., in CEL expressions) have colons aligned vertically
  - Each message/enum block has independent alignment based on its longest field

**Example with alignment enabled (default):**

```proto
message User {
  string             id     = 1;
  string             name   = 2;
  int32              age    = 3;
  repeated string    tags   = 10;
  map<string, int32> scores = 20;
}

option (buf.validate.message).cel = {
  id        : "Check",
  message   : "Validation message",
  expression: "this.id != ''"
};
```

**Example with alignment disabled:**

```proto
message User {
  string id = 1;
  string name = 2;
  int32 age = 3;
  repeated string tags = 10;
  map<string, int32> scores = 20;
}
```

### Completion

#### `protobuf.completion.autoImport`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically add import statements when completing types from other files

#### `protobuf.completion.includeGoogleTypes`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Include Google well-known types in completions

### Hover

#### `protobuf.hover.showFieldNumbers`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show field numbers in hover information

#### `protobuf.hover.showDocumentation`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show documentation comments in hover information

### Import Paths

#### `protobuf.includes`

- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Additional paths to search for imports. These override/augment the automatically detected roots described below and are useful for ad-hoc directories that are not part of any Buf workspace or protoc option.

**Example:**

```jsonc
{
  "protobuf.includes": [
    "${workspaceFolder}/protos",
    "${workspaceFolder}/third_party"
  ]
}
```

#### Automatic import roots

Even without `protobuf.includes`, the language server discovers import roots from:

- `buf.yaml` files in each workspace folder (proto roots declared via `modules`, `deps`, or `build` settings)
- `buf.work.yaml` workspaces (every directory listed under `directories` is treated as an include root)
- `protobuf.protoc.options` entries such as `--proto_path=/path/to/includes` or `-I includes`

These sources now populate the analyzer automatically, so most projects no longer need to duplicate their Buf/protoc configuration inside VS Code settings.

#### `protobuf.protoSrcsDir`

- **Type**: `string`
- **Default**: `""`
- **Description**: Optional subdirectory (relative to the workspace root) to limit proto discovery. When set, the server only scans `${workspaceFolder}/${protoSrcsDir}/**/*.proto`. This is helpful when the repository contains large non-proto trees or when you only want to index a regression sample directory.

**Example:**

```jsonc
{
  "protobuf.protoSrcsDir": "examples/regressions"
}
```

### Renumbering

#### `protobuf.renumber.startNumber`

- **Type**: `number`
- **Default**: `1`
- **Minimum**: `1`
- **Description**: Starting field number when renumbering

#### `protobuf.renumber.increment`

- **Type**: `number`
- **Default**: `1`
- **Minimum**: `1`
- **Maximum**: `100`
- **Description**: Increment between field numbers when renumbering

#### `protobuf.renumber.preserveReserved`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Skip reserved field numbers when renumbering

#### `protobuf.renumber.skipInternalRange`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Skip the internal reserved range (19000-19999) when renumbering

#### `protobuf.renumber.autoSuggestNext`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically suggest the next available field number in completions

#### `protobuf.renumber.onFormat`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Automatically renumber fields sequentially when formatting

### Code Generation

#### `protobuf.codegen.profiles`

- **Type**: `Record<string, string[]>`
- **Default**: `{}`
- **Description**: Code generation profiles. Each profile is a named array of protoc arguments.
- **Example**:

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
      ]
    }
  }
  ```

- **Variables**: Supports VS Code variables (`${workspaceFolder}`, `${file}`, `${fileDirname}`, `${fileBasename}`, `${fileBasenameNoExtension}`)
- **See**: [Code Generation Guide](./codegen.md) for detailed usage

### Protoc Compilation

#### `protobuf.protoc.path`

- **Type**: `string`
- **Default**: `"protoc"`
- **Description**: Path to the protoc compiler

#### `protobuf.protoc.compileOnSave`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Automatically compile proto files on save

#### `protobuf.protoc.compileAllPath`

- **Type**: `string`
- **Default**: `""`
- **Description**: Search path for 'Compile All Protos' action

#### `protobuf.protoc.useAbsolutePath`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Use absolute paths when compiling

#### `protobuf.protoc.options`

- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Additional protoc compiler options

**Note:** `--proto_path` (`-I`) entries placed here are now mirrored into the language server's import resolver, so you no longer need to copy those directories into `protobuf.includes`.

**Example:**

```jsonc
{
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}",
    "--go_out=${workspaceFolder}/gen/go",
    "--java_out=${workspaceFolder}/gen/java"
  ]
}
```

#### `protobuf.protoc.excludePatterns`

- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Folders or patterns to exclude from "Compile All Protos". This is useful for excluding third-party libraries (like nanopb) or test directories that should not be compiled.

**Supported patterns:**

- **Folder names**: `"nanopb"` - Matches any folder with this name
- **Path segments**: `"nanopb/tests"` - Matches specific paths
- **Glob patterns**: `"**/test/**"` - Matches using wildcards

**Example:**

```jsonc
{
  "protobuf.protoc.excludePatterns": [
    "nanopb",
    "third_party",
    "**/test/**",
    "**/tests/**"
  ]
}
```

**Note:** For Buf users, exclude patterns should be configured in `buf.yaml` instead. See [Buf Configuration](./buf-config.md#excluding-files-and-directories) for details.

### Buf CLI Configuration

#### `protobuf.buf.path`

- **Type**: `string`
- **Default**: `"buf"`
- **Description**: Path to the buf CLI used for formatting (`formatter.preset = "buf"`), linting, breaking change checks, and code generation when `protobuf.codegen.tool` is `buf`.

#### `protobuf.buf.useManaged`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: When `true`, ignore `protobuf.buf.path` and use the managed buf binary bundled with the extension. This is useful for teams that want reproducible toolchains without altering PATH.

### Toolchain Auto-Detection

#### `protobuf.autoDetection.enabled`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically probe the workspace for buf, protoc, clang-format, and protolint at startup and record their locations for use in commands.

#### `protobuf.autoDetection.prompted`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Internal flag used by the extension to avoid re-prompting you about auto-detection choices. You should not need to edit this manually.

### Breaking Changes

#### `protobuf.breaking.enabled`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable breaking change detection

#### `protobuf.breaking.againstStrategy`

- **Type**: `"git" | "file" | "none"`
- **Default**: `"git"`
- **Description**: Strategy for breaking change detection baseline

#### `protobuf.breaking.againstGitRef`

- **Type**: `string`
- **Default**: `"HEAD~1"`
- **Description**: Git reference to compare against

#### `protobuf.breaking.againstFilePath`

- **Type**: `string`
- **Default**: `""`
- **Description**: File path to compare against (when strategy is 'file')

### External Linter

#### `protobuf.externalLinter.enabled`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable external linter integration

#### `protobuf.externalLinter.linter`

- **Type**: `"buf" | "protolint" | "none"`
- **Default**: `"none"`
- **Description**: External linter to use

#### `protobuf.externalLinter.bufPath`

- **Type**: `string`
- **Default**: `"buf"`
- **Description**: Path to the buf CLI

#### `protobuf.externalLinter.protolintPath`

- **Type**: `string`
- **Default**: `"protolint"`
- **Description**: Path to the protolint CLI

#### `protobuf.externalLinter.bufConfigPath`

- **Type**: `string`
- **Default**: `""`
- **Description**: Path to buf.yaml configuration file

#### `protobuf.externalLinter.protolintConfigPath`

- **Type**: `string`
- **Default**: `""`
- **Description**: Path to .protolint.yaml configuration file

#### `protobuf.externalLinter.runOnSave`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Run external linter on file save

### Clang Format

#### `protobuf.clangFormat.enabled`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Use clang-format for formatting instead of built-in formatter

#### `protobuf.clangFormat.path`

- **Type**: `string`
- **Default**: `"clang-format"`
- **Description**: Path to clang-format executable

#### `protobuf.clangFormat.style`

- **Type**: `string`
- **Default**: `"file"`
- **Description**: clang-format style (LLVM, Google, Chromium, Mozilla, WebKit, Microsoft, GNU, or file). Using `"file"` (the default) makes the formatter read the closest `.clang-format` file.

#### `protobuf.clangFormat.fallbackStyle`

- **Type**: `string`
- **Default**: `"Google"`
- **Description**: Fallback style when 'file' style is used but no .clang-format file is found

### Buf Format

When `protobuf.formatter.preset` is set to `"buf"`, the extension uses `buf format` for formatting.

#### Requirements

- **buf installed** - Must have `buf` installed and in your PATH
- **buf.yaml** - Works best with a `buf.yaml` configuration file

#### Notes

- Buf format uses the formatting rules defined by Buf
- Range formatting falls back to the built-in formatter
- Requires `buf` to be available (see [Toolchain Management](./toolchain.md))

## Variable Substitution

Settings support VS Code-style variables in path settings (`protobuf.protoc.path`, `protobuf.clangFormat.path`, `protobuf.buf.path`, external linter paths, include paths, etc.). The following tokens are expanded:

- `${workspaceFolder}` / `${workspaceRoot}` - Workspace root folder
- `${workspaceFolderBasename}` - Name of the first workspace folder
- `${env:VAR}` or `${env.VAR}` - Environment variables

## Example Configuration

```jsonc
{
  // Diagnostics
  "protobuf.diagnostics.enabled": true,
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.deprecatedUsage": true,
  "protobuf.diagnostics.circularDependencies": true,
  "protobuf.diagnostics.documentationComments": true,

  // Formatter
  "protobuf.formatter.enabled": true,
  "protobuf.formatOnSave": true,
  "protobuf.indentSize": 2,

  // Completion
  "protobuf.completion.autoImport": true,
  "protobuf.completion.includeGoogleTypes": true,

  // Import paths
  "protobuf.includes": [
    "${workspaceFolder}/protos",
    "${workspaceFolder}/third_party"
  ],

  // Protoc
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}",
    "--go_out=${workspaceFolder}/gen/go"
  ],
  "protobuf.protoc.excludePatterns": [
    "nanopb",
    "third_party",
    "**/test/**"
  ],

  // External linter
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": true
}
```
