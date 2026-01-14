# Diagnostics

The extension provides comprehensive real-time validation and error checking for Protocol Buffers files.

## Overview

Diagnostics automatically check your proto files for:

- Syntax errors
- Type reference errors
- Import resolution issues
- Naming convention violations
- Field tag problems
- Duplicate definitions
- And much more...

## Diagnostic Categories

### 1. Syntax and Edition Validation

**What it checks:**

- Missing `syntax` or `edition` declaration
- Invalid syntax version
- Package path consistency with directory structure

**Example:**

```proto
// Missing syntax declaration
package example.v1;

message User {
  string name = 1;
}
```

**Fix:** Add `syntax = "proto3";` at the top of the file.

### 2. Naming Conventions

**What it checks:**

- Messages and enums: PascalCase (e.g., `UserMessage`)
- Fields: snake_case (e.g., `user_name`)
- Enum values: SCREAMING_SNAKE_CASE (e.g., `STATUS_ACTIVE`)
- Services and RPCs: PascalCase

**Configuration:**

```jsonc
{
  "protobuf.diagnostics.namingConventions": true,
  "protobuf.diagnostics.severity.namingConventions": "warning"
}
```

### 3. Reference Checks

**What it checks:**

- Undefined type references
- Missing imports for types
- Incorrect import paths

**Example:**

```proto
message User {
  Timestamp created_at = 1;  // Error: Timestamp not imported
}
```

**Fix:** Use code action to add missing import or manually add:

```proto
import "google/protobuf/timestamp.proto";
```

### 4. Field Tag Validation

**What it checks:**

- Duplicate field numbers
- Field numbers out of range (1-536870911)
- Reserved field number usage
- Reserved range violations (19000-19999)
- Field number continuity (gaps)

**Example:**

```proto
message User {
  string name = 1;
  string email = 1;  // Error: Duplicate field number
  int32 age = 2000000000;  // Error: Out of range
}
```

### 5. Import Validation

**What it checks:**

- Unresolved imports
- Unused imports
- Circular import dependencies
- Empty import paths

**Configuration:**

```jsonc
{
  "protobuf.diagnostics.importChecks": true,
  "protobuf.diagnostics.circularDependencies": true
}
```

### 6. Deprecated Usage Detection

**What it checks:**

- Usage of deprecated fields
- Usage of deprecated enum values

**Example:**

```proto
message User {
  string old_field = 1 [deprecated = true];
}

message Profile {
  User user = 1;
  // Warning when accessing user.old_field
}
```

**Configuration:**

```jsonc
{
  "protobuf.diagnostics.deprecatedUsage": true
}
```

### 7. Unused Symbols Detection

**What it checks:**

- Unused messages
- Unused enums
- Unused services

**Note:** This is off by default as it can be noisy. Enable when needed.

**Configuration:**

```jsonc
{
  "protobuf.diagnostics.unusedSymbols": true
}
```

### 8. Extension Range Validation

**What it checks:**

- Extension range validity
- Overlap with reserved ranges
- Overlap with field numbers

**Example:**

```proto
message User {
  extensions 100 to 199;
  reserved 150 to 160;  // Warning: Overlaps with extensions
}
```

### 9. Proto3 Field Presence Validation

**What it checks:**

- Use of `required` in proto3 (not allowed)
- Implicit presence semantics

**Example:**

```proto
syntax = "proto3";

message User {
  required string name = 1;  // Error: required not allowed in proto3
}
```

### 10. Documentation Comment Validation

**What it checks:**

- Missing documentation on public APIs
- Services and RPCs should have documentation

**Example:**

```proto
// Missing documentation
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}
```

**Fix:** Add documentation comments:

```proto
// UserService provides user management operations
service UserService {
  // GetUser retrieves a user by ID
  rpc GetUser(GetUserRequest) returns (User);
}
```

**Configuration:**

```jsonc
{
  "protobuf.diagnostics.documentationComments": true
}
```

## Severity Levels

You can configure the severity of different diagnostic categories:

```jsonc
{
  "protobuf.diagnostics.severity.namingConventions": "warning",
  "protobuf.diagnostics.severity.referenceErrors": "error",
  "protobuf.diagnostics.severity.fieldTagIssues": "error",
  "protobuf.diagnostics.severity.discouragedConstructs": "warning",
  "protobuf.diagnostics.severity.nonCanonicalImportPath": "error"
}
```

Available severity levels:

- `error` - Red squiggles
- `warning` - Yellow squiggles
- `information` - Blue squiggles
- `hint` - Gray squiggles

## Quick Fixes

Many diagnostics provide quick fixes via code actions:

1. **Add missing imports** - Automatically adds required import statements
2. **Fix naming conventions** - Converts names to proper case
3. **Add semicolons** - Adds missing semicolons
4. **Fix field numbers** - Suggests next available field number
5. **Remove unused imports** - Removes unused import statements

To use quick fixes:

1. Hover over the diagnostic
2. Click the lightbulb icon
3. Select the desired fix

## Disabling Diagnostics

To disable all diagnostics:

```jsonc
{
  "protobuf.diagnostics.enabled": false
}
```

To disable only built-in AST diagnostics (while keeping external linter diagnostics):

```jsonc
{
  "protobuf.diagnostics.useBuiltIn": false
}
```

This is useful when:
- Testing parser changes
- Preferring external tools like `buf lint` or `protolint` for validation
- Avoiding duplicate diagnostics from both built-in and external linters

To disable specific checks:

```jsonc
{
  "protobuf.diagnostics.namingConventions": false,
  "protobuf.diagnostics.unusedSymbols": false
}
```

## Best Practices

1. **Keep diagnostics enabled** - They help catch errors early
2. **Fix warnings** - They often indicate potential issues
3. **Use quick fixes** - They save time and reduce errors
4. **Configure severity** - Adjust to match your team's standards
5. **Enable unused symbols** - Periodically check for cleanup opportunities
