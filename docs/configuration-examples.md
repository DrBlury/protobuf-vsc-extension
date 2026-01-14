# Configuration Examples

Common configuration patterns for different use cases.

## Basic Setup

### Minimal Configuration

```jsonc
{
  "protobuf.diagnostics.enabled": true,
  "protobuf.formatter.enabled": true
}
```

## Development Workflow

### Format on Save

```jsonc
{
  "protobuf.formatOnSave": true,
  "protobuf.formatter.enabled": true,
  "editor.formatOnSave": true
}
```

### Auto-fix on Save

```jsonc
{
  "editor.codeActionsOnSave": {
    "source.organizeImports": true,
    "source.fixAll": true
  }
}
```

## Buf Integration

### With Buf.yaml

```jsonc
{
  "protobuf.diagnostics.enabled": true,
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": true
}
```

The extension automatically detects `buf.yaml` files - no additional configuration needed!

## Multi-language Compilation

### Go + Java

```jsonc
{
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}",
    "--go_out=${workspaceFolder}/gen/go",
    "--java_out=${workspaceFolder}/gen/java"
  ]
}
```

### TypeScript/JavaScript

```jsonc
{
  "protobuf.protoc.path": "protoc",
  "protobuf.protoc.options": [
    "--proto_path=${workspaceFolder}",
    "--js_out=import_style=commonjs,binary:${workspaceFolder}/gen/js",
    "--ts_out=${workspaceFolder}/gen/ts"
  ]
}
```

## Strict Validation

### Maximum Diagnostics

```jsonc
{
  "protobuf.diagnostics.enabled": true,
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.referenceChecks": true,
  "protobuf.diagnostics.importChecks": true,
  "protobuf.diagnostics.fieldTagChecks": true,
  "protobuf.diagnostics.duplicateFieldChecks": true,
  "protobuf.diagnostics.discouragedConstructs": true,
  "protobuf.diagnostics.deprecatedUsage": true,
  "protobuf.diagnostics.unusedSymbols": true,
  "protobuf.diagnostics.circularDependencies": true,
  "protobuf.diagnostics.documentationComments": true,
  "protobuf.diagnostics.editionFeatures": true,
  "protobuf.diagnostics.breakingChanges": true,
  "protobuf.diagnostics.severity.namingConventions": "error",
  "protobuf.diagnostics.severity.referenceErrors": "error",
  "protobuf.diagnostics.severity.fieldTagIssues": "error",
  "protobuf.diagnostics.severity.breakingChanges": "error"
}
```

## Relaxed Validation

### Minimal Diagnostics

```jsonc
{
  "protobuf.diagnostics.enabled": true,
  "protobuf.diagnostics.namingConventions": false,
  "protobuf.diagnostics.discouragedConstructs": false,
  "protobuf.diagnostics.unusedSymbols": false,
  "protobuf.diagnostics.severity.namingConventions": "hint"
}
```

## Team Standards

### Enforce Naming Conventions

```jsonc
{
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.severity.namingConventions": "error"
}
```

### Require Documentation

```jsonc
{
  "protobuf.diagnostics.enabled": true,
  // Documentation validation is always enabled
}
```

## CI/CD Integration

### Pre-commit Checks

```jsonc
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstStrategy": "git",
  "protobuf.breaking.againstGitRef": "origin/main",
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": false
}
```

## Custom Import Paths

### Multiple Proto Roots

```jsonc
{
  "protobuf.includes": [
    "${workspaceFolder}/protos",
    "${workspaceFolder}/third_party/protos",
    "${workspaceFolder}/vendor/protos"
  ]
}
```

## Clang Format Integration

### Use Clang Format

```jsonc
{
  "protobuf.clangFormat.enabled": true,
  "protobuf.clangFormat.path": "clang-format",
  "protobuf.clangFormat.style": "Google",
  "protobuf.formatter.enabled": false
}
```

## Complete Example

### Production-Ready Configuration

```jsonc
{
  // Diagnostics
  "protobuf.diagnostics.enabled": true,
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.referenceChecks": true,
  "protobuf.diagnostics.importChecks": true,
  "protobuf.diagnostics.fieldTagChecks": true,
  "protobuf.diagnostics.duplicateFieldChecks": true,
  "protobuf.diagnostics.discouragedConstructs": true,
  "protobuf.diagnostics.deprecatedUsage": true,
  "protobuf.diagnostics.circularDependencies": true,
  "protobuf.diagnostics.documentationComments": true,
  "protobuf.diagnostics.breakingChanges": true,
  "protobuf.diagnostics.severity.namingConventions": "warning",
  "protobuf.diagnostics.severity.referenceErrors": "error",
  "protobuf.diagnostics.severity.fieldTagIssues": "error",
  "protobuf.diagnostics.severity.breakingChanges": "warning",

  // Formatter
  "protobuf.formatter.enabled": true,
  "protobuf.formatOnSave": true,
  "protobuf.indentSize": 2,
  "protobuf.maxLineLength": 120,

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

  // External linter
  "protobuf.externalLinter.enabled": true,
  "protobuf.externalLinter.linter": "buf",
  "protobuf.externalLinter.runOnSave": true,

  // Breaking changes
  "protobuf.breaking.enabled": false,
  "protobuf.breaking.againstStrategy": "git",
  "protobuf.breaking.againstGitRef": "HEAD~1",

  // Code actions on save
  "editor.codeActionsOnSave": {
    "source.organizeImports": true,
    "source.fixAll": true
  }
}
```
