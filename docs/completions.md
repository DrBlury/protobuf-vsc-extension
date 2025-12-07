# Completions

Smart IntelliSense completions help you write proto files faster and with fewer errors.

## Overview

The extension provides intelligent completions for:

- Types (built-in and custom)
- Field names
- Field numbers
- Keywords
- Import paths
- Options

## How to Use

Completions appear automatically as you type. Press `Tab` or `Enter` to accept a suggestion.

## Completion Types

### 1. Type Completions

**When it appears:** When typing a field type

**What it suggests:**

- Built-in types (string, int32, bool, etc.)
- Custom message types
- Custom enum types
- Google well-known types

**Example:**

```proto
message User {
  str|  // Type "str" → suggests "string"
  Tim|  // Type "Tim" → suggests "Timestamp"
}
```

### 2. Field Name Suggestions

**When it appears:** After typing a type name

**What it suggests:** Common field names based on the type

**Example:**

```proto
message User {
  string |  // Suggests: name, id, title, description, value, text
  int32 |  // Suggests: count, size, number, index, id, value
  bool |   // Suggests: enabled, active, visible, is_valid, has_value
}
```

**Type-based suggestions:**

- `string` → name, id, title, description, value, text, content, message, label
- `int32` → count, size, number, index, id, value, amount, quantity
- `int64` → id, timestamp, count, size, number, value
- `bool` → enabled, active, visible, is_valid, has_value, is_set
- `bytes` → data, content, payload, body, value
- `Timestamp` → created_at, updated_at, timestamp, time, date
- Message types → snake_case conversion (e.g., `UserMessage` → `user_message`)

### 3. Field Number Suggestions

**When it appears:** After typing `=`

**What it suggests:**

- Next available field number (smart suggestion)
- Common field numbers (1, 2, 3, 4, 5, 10, 100)

**Example:**

```proto
message User {
  string name = |  // Suggests next available number (e.g., 1)
  string email = | // Suggests next available number (e.g., 2)
}
```

**Smart numbering:**

- Considers existing field numbers
- Skips reserved ranges
- Suggests sequential numbers

### 4. Auto-complete Field Assignment

**When it appears:** After typing a field name

**What it suggests:** Complete field assignment with number and semicolon

**Example:**

```proto
message User {
  string name |  // Suggests: "= 1;"
}
```

**After accepting:**

```proto
message User {
  string name = 1;
}
```

### 5. Import Path Completions

**When it appears:** When typing an import path

**What it suggests:**

- Google well-known types
- Workspace proto files
- Smart import paths (based on buf.yaml)

**Example:**

```proto
import "|  // Suggests: google/protobuf/timestamp.proto, etc.
```

**Smart suggestions:**

- Recommends optimal import paths
- Suggests both full paths and simple filenames
- Prioritizes recommended paths

### 6. Keyword Completions

**When it appears:** At the start of a line or after keywords

**What it suggests:**

- Proto keywords (message, enum, service, etc.)
- Field modifiers (optional, required, repeated)
- Service keywords (rpc, stream, returns)

**Example:**

```proto
|  // Suggests: syntax, package, import, message, enum, service
mess|  // Suggests: message
opt|  // Suggests: optional
```

### 7. Option Completions

**When it appears:** When typing options

**What it suggests:**

- Common options (deprecated, json_name, etc.)
- Language-specific options (go_package, java_package, etc.)

**Example:**

```proto
message User {
  string name = 1 [|  // Suggests: deprecated, json_name, etc.
}
```

### 8. CEL Expression Completions (buf.validate / protovalidate)

**When it appears:** Inside CEL validation expressions using `buf.validate`

The extension provides intelligent completions for [CEL (Common Expression Language)](https://cel.dev/) expressions used with [protovalidate](https://github.com/bufbuild/protovalidate) validation rules.

#### CEL Option Field Completions

**When it appears:** Inside a `buf.validate` option block

**What it suggests:**
- `id` - Unique identifier for the validation rule
- `message` - Human-readable error message
- `expression` - CEL expression for validation

**Example:**

```proto
message User {
  option (buf.validate.message).cel = {
    |  // Suggests: id, message, expression
  };
}
```

#### CEL Expression Completions

**When it appears:** Inside the `expression` string of a CEL rule

**What it suggests:**
- `this` - Reference to the current message
- Message fields (after typing `this.`)
- CEL functions (size, has, startsWith, etc.)

**Example:**

```proto
message User {
  string email = 1;
  string name = 2;

  option (buf.validate.message).cel = {
    id: "User.EmailRequired",
    message: "Email is required",
    expression:
      "|  // Type "this." → suggests: email, name
  };
}
```

#### Supported CEL Functions

The extension provides completions for common CEL functions:

**Field Presence:**
- `has(this.field)` - Check if a field is set

**String Functions:**
- `size(value)` - Get string/list/map length
- `string.startsWith(prefix)` - Check string prefix
- `string.endsWith(suffix)` - Check string suffix
- `string.contains(substring)` - Check for substring
- `string.matches(regex)` - Regex pattern matching

**List Functions:**
- `list.all(x, predicate)` - Check all elements match
- `list.exists(x, predicate)` - Check any element matches
- `list.exists_one(x, predicate)` - Check exactly one matches
- `list.filter(x, predicate)` - Filter elements
- `list.map(x, transform)` - Transform elements

**Type Conversions:**
- `int(value)`, `uint(value)`, `double(value)`
- `string(value)`, `bytes(value)`, `bool(value)`
- `type(value)` - Get type of value

**Duration/Timestamp:**
- `duration(value)` - Create duration from string
- `timestamp(value)` - Create timestamp from string

#### Complete CEL Example

```proto
syntax = "proto3";

package example.v1;

import "buf/validate/validate.proto";

message Address {
  // Message-level validation
  option (buf.validate.message).cel = {
    id: "Address.StreetOrPOBox",
    message: "Either street or PO box must be set",
    expression:
      "has(this.street) != has(this.po_box)"
      "? 'Either street or po_box must be set, but not both'"
      ": ''"
  };

  // Field-level validation with CEL
  string city = 1 [(buf.validate.field).cel = {
    id: "city_pattern",
    message: "City must contain only letters",
    expression:
      "!this.matches('^[a-zA-Z\\\\s]+$')"
      "? 'City must contain only letters and spaces'"
      ": ''"
  }];

  string country = 2 [(buf.validate.field).string = {
    len: 2,  // ISO country code
  }];

  optional string street = 3;
  optional string po_box = 4;
  string zip = 5;
}
```

## Configuration

### Auto-import

Automatically add imports when completing types:

```jsonc
{
  "protobuf.completion.autoImport": true
}
```

### Google Types

Include Google well-known types in completions:

```jsonc
{
  "protobuf.completion.includeGoogleTypes": true
}
```

## Trigger Characters

Completions are triggered by:

- `.` - For qualified names
- `"` - For import paths
- `<` - For generic types
- ` ` - For keywords and types
- `=` - For field numbers

## Tips

1. **Use Tab to accept** - Faster than Enter
2. **Type partial names** - Completions filter as you type
3. **Use field name suggestions** - They follow common patterns
4. **Trust smart numbering** - Field number suggestions are context-aware
5. **Explore completions** - Hover to see details about suggestions

## Best Practices

1. **Use completions** - They reduce typos and errors
2. **Follow suggestions** - Field name suggestions follow conventions
3. **Use smart numbering** - Let the extension suggest field numbers
4. **Enable auto-import** - Automatically add required imports
5. **Review completions** - Always review before accepting

## Keyboard Shortcuts

- **Trigger completions**: `Ctrl+Space` (Windows/Linux) or `Cmd+Space` (Mac)
- **Accept suggestion**: `Tab` or `Enter`
- **Next suggestion**: `Ctrl+n` (Windows/Linux) or `Cmd+n` (Mac)
- **Previous suggestion**: `Ctrl+p` (Windows/Linux) or `Cmd+p` (Mac)
