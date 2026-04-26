# Diagnostics

Diagnostics validate `.proto` files while editing. The default profile focuses on invalid schemas and import problems. Style, cleanup, deprecation, documentation, and migration checks are available as opt-in settings.

## Default Checks

These checks are enabled by default:

- Syntax errors reported by the parser
- Missing semicolons on field-like declarations
- Undefined type references
- Missing imports for referenced types
- Unresolved imports and empty import paths
- Duplicate field numbers and duplicate field names
- Field numbers outside the valid range `1` to `536870911`
- Use of the reserved field-number range `19000` to `19999`
- Use of reserved field names or field numbers
- Duplicate enum values without `option allow_alias = true`
- Invalid map key types
- Invalid `required` fields in proto3
- Invalid `optional` or `required` labels in editions files
- Invalid groups in proto3 or editions files
- Proto3 enums whose first value is not `0`
- Invalid edition feature usage
- Circular import dependencies

Default diagnostic messages do not include style advice or suggested rewrites. Code actions can still provide fixes where enough information is available.

## Optional Checks

### Naming Conventions

Disabled by default.

```jsonc
{
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.severity.namingConventions": "warning",
}
```

Checks Protobuf style-guide naming:

- Messages, enums, services, and RPCs use PascalCase
- Fields, maps, oneofs, and packages use snake_case
- Enum values use SCREAMING_SNAKE_CASE
- Package names match the file path

### Discouraged Constructs

Disabled by default.

```jsonc
{
  "protobuf.diagnostics.discouragedConstructs": true,
  "protobuf.diagnostics.severity.discouragedConstructs": "warning",
}
```

Reports valid constructs that are usually avoided, including proto2 `required` fields, proto2 groups, missing `syntax` or `edition` declarations, field-number gaps, non-increasing field numbers, and Buf dependency hygiene checks.

### Deprecated Usage

Disabled by default.

```jsonc
{
  "protobuf.diagnostics.deprecatedUsage": true,
}
```

Reports usage of fields or enum values marked with `[deprecated = true]`.

### Unused Symbols And Imports

Disabled by default.

```jsonc
{
  "protobuf.diagnostics.unusedSymbols": true,
}
```

Reports unused imports, messages, enums, and services.

### Documentation Comments

Disabled by default.

```jsonc
{
  "protobuf.diagnostics.documentationComments": true,
}
```

Reports top-level messages, enums, services, and RPCs without documentation comments.

### Non-Canonical Import Paths

Disabled by default through severity `none`.

```jsonc
{
  "protobuf.diagnostics.severity.nonCanonicalImportPath": "warning",
}
```

Reports imports that resolve to the correct file but use a different path than the analyzer's canonical path.

### Breaking Changes

Disabled by default. Enable this only after configuring a baseline.

```jsonc
{
  "protobuf.breaking.enabled": true,
  "protobuf.breaking.againstStrategy": "git",
  "protobuf.breaking.againstGitRef": "main",
  "protobuf.diagnostics.breakingChanges": true,
  "protobuf.diagnostics.severity.breakingChanges": "error",
}
```

Checks for source-incompatible changes such as deleted declarations, deleted fields without reserved numbers, field type or number changes, proto2 presence changes, enum value deletions or renames, and RPC request or response type changes.

## Severity Settings

```jsonc
{
  "protobuf.diagnostics.severity.namingConventions": "warning",
  "protobuf.diagnostics.severity.referenceErrors": "error",
  "protobuf.diagnostics.severity.fieldTagIssues": "error",
  "protobuf.diagnostics.severity.discouragedConstructs": "warning",
  "protobuf.diagnostics.severity.nonCanonicalImportPath": "none",
  "protobuf.diagnostics.severity.breakingChanges": "error",
}
```

Supported values:

- `error`
- `warning`
- `information`
- `hint`
- `none`

Setting a category severity to `none` disables that category.

## Disabling Diagnostics

Disable all diagnostics:

```jsonc
{
  "protobuf.diagnostics.enabled": false,
}
```

Disable only built-in diagnostics while keeping external linter diagnostics:

```jsonc
{
  "protobuf.diagnostics.useBuiltIn": false,
}
```

Disable individual built-in checks:

```jsonc
{
  "protobuf.diagnostics.referenceChecks": false,
  "protobuf.diagnostics.importChecks": false,
  "protobuf.diagnostics.fieldTagChecks": false,
  "protobuf.diagnostics.duplicateFieldChecks": false,
  "protobuf.diagnostics.circularDependencies": false,
  "protobuf.diagnostics.editionFeatures": false,
}
```

## Strict Profile

Use this profile when a workspace wants style, cleanup, and migration diagnostics in addition to validity checks.

```jsonc
{
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.discouragedConstructs": true,
  "protobuf.diagnostics.deprecatedUsage": true,
  "protobuf.diagnostics.unusedSymbols": true,
  "protobuf.diagnostics.documentationComments": true,
  "protobuf.diagnostics.breakingChanges": true,
  "protobuf.diagnostics.severity.nonCanonicalImportPath": "warning",
}
```
