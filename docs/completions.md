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

The extension provides completions for all CEL functions as defined in the [CEL Language Specification](https://github.com/google/cel-spec/blob/master/doc/langdef.md):

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

**Type Conversions and Denotations:**
- `int(value)` - Convert to integer
- `uint(value)` - Convert to unsigned integer
- `double(value)` - Convert to double
- `string(value)` - Convert to string
- `bytes(value)` - Convert to bytes
- `bool(value)` - Convert to boolean
- `type(value)` - Get type of value
- `dyn(value)` - Type denotation (disables strong type checks)
- `list(value)` - Type denotation for list
- `map(key, value)` - Type denotation for map
- `null_type(value)` - Type denotation for null

**Duration/Timestamp Conversions:**
- `duration(value)` - Create duration from string (supports "1h30m", "3600s", etc.)
- `timestamp(value)` - Create timestamp from string (RFC3339 format)

**Timestamp Getter Methods:**
- `timestamp.getDate(timezone?)` - Get date component
- `timestamp.getDayOfMonth(timezone?)` - Get day of month (1-31)
- `timestamp.getDayOfWeek(timezone?)` - Get day of week (0=Sunday, 6=Saturday)
- `timestamp.getDayOfYear(timezone?)` - Get day of year (1-366)
- `timestamp.getFullYear(timezone?)` - Get full year
- `timestamp.getHours(timezone?)` - Get hours (0-23), or convert duration to hours
- `timestamp.getMilliseconds(timezone?)` - Get milliseconds, or get from duration
- `timestamp.getMinutes(timezone?)` - Get minutes, or convert duration to minutes
- `timestamp.getMonth(timezone?)` - Get month (0-11, 0=January)
- `timestamp.getSeconds(timezone?)` - Get seconds, or convert duration to seconds

#### CEL Literal Support

The extension supports all CEL literal types:

**String Literals:**
- Regular strings: `"..."` or `'...'`
- Raw strings: `r"..."` or `R"..."` (escape sequences not interpreted)
- Triple-quoted strings: `"""..."""` or `'''...'''`

**Numeric Literals:**
- Integers: `123`, `-456`
- Hex integers: `0x1A`, `0XFF`
- Unsigned integers: `123u`, `456U`
- Floats: `3.14`, `1.5e10`, `-2.3E-5`

**Other Literals:**
- Bytes: `b"..."` or `B"..."`
- Booleans: `true`, `false`
- Null: `null`

**Collection Literals:**
- Lists: `[1, 2, 3]`
- Maps: `{"key": "value"}`
- Message literals: `Type{field: value}`

#### CEL Operators

All CEL operators are supported with proper syntax highlighting:

**Arithmetic Operators:**
- `+` (addition), `-` (subtraction/unary negation), `*` (multiplication), `/` (division), `%` (remainder)

**Comparison Operators:**
- `==` (equality), `!=` (inequality), `<` (less than), `<=` (less than or equal), `>` (greater than), `>=` (greater than or equal), `in` (membership)

**Logical Operators:**
- `&&` (logical AND), `||` (logical OR), `!` (logical NOT/unary)

**Ternary Operator:**
- `? :` (conditional: `condition ? true_expr : false_expr`)

#### CEL Reserved Words

The following words are reserved in CEL and cannot be used as identifiers (they are highlighted appropriately):
- Keywords: `false`, `in`, `null`, `true`
- Reserved: `as`, `break`, `const`, `continue`, `else`, `for`, `function`, `if`, `import`, `let`, `loop`, `package`, `namespace`, `return`, `var`, `void`, `while`

Note: Reserved words can still be used in receiver-call-style functions (e.g., `a.package()` is permitted).

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

### 9. Google API Completions

The extension provides comprehensive completions for Google API annotations commonly used in gRPC and Cloud API development.

#### HTTP Annotations (`google.api.http`)

**When it appears:** Inside an RPC method body when typing `option (google.api.http)`

**What it suggests:**
- HTTP methods: `get`, `post`, `put`, `delete`, `patch`, `custom`
- Body mapping: `body`, `response_body`
- Additional bindings: `additional_bindings`
- Path template patterns

**Example:**

```proto
service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {
      |  // Suggests: get, post, put, delete, patch, custom, body, additional_bindings
    };
  }
}
```

**Path template suggestions** appear when typing inside a path string:
- `/v1/{resource}` - Simple resource path
- `/v1/{parent}/children` - Nested resource path
- `/v1/{resource}:action` - Custom action path

#### Field Behavior Annotations (`google.api.field_behavior`)

**When it appears:** When typing `[(google.api.field_behavior) = `

**What it suggests:**
- `REQUIRED` - Field must be set by the client
- `OUTPUT_ONLY` - Field is set by the server only
- `INPUT_ONLY` - Field is set by the client but not returned
- `IMMUTABLE` - Field can only be set once
- `OPTIONAL` - Field is explicitly optional
- `NON_EMPTY_DEFAULT` - Field has a non-empty default
- `IDENTIFIER` - Field uniquely identifies a resource
- `UNORDERED_LIST` - Repeated field values are unordered

**Example:**

```proto
message User {
  string id = 1 [(google.api.field_behavior) = |  // Suggests all behavior values
}
```

#### Resource Descriptors (`google.api.resource`)

**When it appears:** Inside a message when typing `option (google.api.resource)`

**What it suggests:**
- `type` - Resource type name (e.g., "example.googleapis.com/User")
- `pattern` - Resource name pattern (e.g., "users/{user}")
- `name_field` - Field containing the resource name
- `plural` - Plural form of the resource name
- `singular` - Singular form of the resource name
- `history` - Historical versioning behavior
- `style` - Resource style (e.g., DECLARATIVE_FRIENDLY)

**Example:**

```proto
message User {
  option (google.api.resource) = {
    |  // Suggests: type, pattern, name_field, plural, singular, history, style
  };
}
```

#### Resource References (`google.api.resource_reference`)

**When it appears:** When typing `[(google.api.resource_reference) = {`

**What it suggests:**
- `type` - Reference to a specific resource type
- `child_type` - Reference to a child resource type

**Example:**

```proto
message Order {
  string user = 1 [
    (google.api.resource_reference) = {
      |  // Suggests: type, child_type
    }
  ];
}
```

#### Service Options

**When it appears:** When typing option in a service definition

**What it suggests:**
- `(google.api.default_host)` - Default API endpoint host
- `(google.api.oauth_scopes)` - OAuth scopes for the service
- `(google.api.method_signature)` - Simplified method signatures

#### FieldMask Field Names

**When it appears:** When typing a field name after `google.protobuf.FieldMask`

**What it suggests:**
- `update_mask` - Common field name for partial updates
- `field_mask` - Alternative field name
- `read_mask` - Field name for read projections
- `output_mask` - Field name for output field masking

**Example:**

```proto
message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask |  // Suggests: update_mask, field_mask, read_mask, output_mask
}
```

#### Complete Google API Example

```proto
syntax = "proto3";

package example.v1;

import "google/api/annotations.proto";
import "google/api/field_behavior.proto";
import "google/api/resource.proto";
import "google/protobuf/field_mask.proto";

message User {
  option (google.api.resource) = {
    type: "example.googleapis.com/User"
    pattern: "projects/{project}/users/{user}"
    singular: "user"
    plural: "users"
  };

  string name = 1 [(google.api.field_behavior) = OUTPUT_ONLY];
  string email = 2 [(google.api.field_behavior) = REQUIRED];
  string display_name = 3;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {
      get: "/v1/{name=projects/*/users/*}"
    };
    option (google.api.method_signature) = "name";
  }

  rpc UpdateUser(UpdateUserRequest) returns (User) {
    option (google.api.http) = {
      patch: "/v1/{user.name=projects/*/users/*}"
      body: "user"
    };
    option (google.api.method_signature) = "user,update_mask";
  }
}

message GetUserRequest {
  string name = 1 [
    (google.api.field_behavior) = REQUIRED,
    (google.api.resource_reference) = {
      type: "example.googleapis.com/User"
    }
  ];
}

message UpdateUserRequest {
  User user = 1 [(google.api.field_behavior) = REQUIRED];
  google.protobuf.FieldMask update_mask = 2;
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
