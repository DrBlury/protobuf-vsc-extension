# Hover Information

Rich hover information provides detailed context about symbols when you hover over them.

## Overview

Hovering over any symbol in a proto file shows:

- Symbol type and name
- Full qualified name
- Container information
- Reference counts
- Detailed definitions for messages and enums

## How to Use

Simply **hover your mouse** over any:

- Type name
- Field name
- Message name
- Enum name
- Service name
- RPC name
- Built-in type
- Keyword

## Features

### Built-in Types

Hovering over built-in types shows detailed information:

```proto
string name = 1;  // Hover over "string"
```

Shows:

```text
**string**
UTF-8 encoded or 7-bit ASCII text string
```

### Custom Types

Hovering over custom types shows:

```proto
message User {
  Timestamp created_at = 1;  // Hover over "Timestamp"
}
```

Shows:

```text
**message** `Timestamp`
Full name: `google.protobuf.Timestamp`
References: 5 (3 external)
```

### Message Definitions

Hovering over a message shows its structure:

```proto
User user = 1;  // Hover over "User"
```

Shows:

```text
**message** `User`
Full name: `example.v1.User`
References: 12 (8 external)
```

```proto
message User {
  string name = 1;
  string email = 2;
  int32 age = 3;
}
```

### Enum Definitions

Hovering over an enum shows its values:

```proto
Status status = 1;  // Hover over "Status"
```

Shows:

```text
**enum** `Status`
Full name: `example.v1.Status`
References: 3 (1 external)
```

```proto
enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_ACTIVE = 1;
  STATUS_INACTIVE = 2;
}
```

### Reference Information

Hover information includes:

- **Total references** - How many times the symbol is used
- **External references** - References from other files
- **Internal references** - References within the same file

### Keywords

Hovering over keywords shows explanations:

```proto
message User {  // Hover over "message"
  optional string name = 1;  // Hover over "optional"
}
```

Shows definitions and usage information.

### CEL Functions and Keywords

Hovering over CEL (Common Expression Language) elements in validation expressions shows detailed documentation:

```proto
option (buf.validate.message).cel = {
  expression: "has(this.email)"  // Hover over "has"
}
```

Shows:

```text
**has** *(CEL function)*

`has(field) → bool`

Returns true if the specified field is set (not the default value).

**Example:**
has(this.email)
```

#### Supported CEL Functions

| Category | Functions |
|----------|-----------|
| Field Presence | `has` |
| Size/Length | `size` |
| String Methods | `startsWith`, `endsWith`, `contains`, `matches`, `toLowerCase`, `toUpperCase`, `trim` |
| List Macros | `all`, `exists`, `exists_one`, `filter`, `map` |
| Type Conversions | `int`, `uint`, `double`, `string`, `bytes`, `bool`, `type`, `dyn` |
| Duration/Timestamp | `duration`, `timestamp`, `getDate`, `getDayOfMonth`, `getDayOfWeek`, `getDayOfYear`, `getFullYear`, `getHours`, `getMinutes`, `getMonth`, `getSeconds`, `getMilliseconds` |
| protovalidate Extensions | `isEmail`, `isUri`, `isUriRef`, `isHostname`, `isIp`, `isIpPrefix`, `isNan`, `isInf`, `unique` |

#### CEL Keywords

Hovering over CEL keywords in expression context:

```proto
expression: "this.field > 0"  // Hover over "this"
```

Shows:

```text
**this** *(CEL keyword)*

Reference to the current message being validated. Use `this.field_name` to access fields.
```

### Google API Annotations

Hovering over Google API annotation values shows documentation:

#### Field Behavior

```proto
string name = 1 [(google.api.field_behavior) = REQUIRED];  // Hover over "REQUIRED"
```

Shows:

```text
**REQUIRED** *(google.api.field_behavior)*

The field is required. Clients must specify this field when creating or updating the resource.

[Documentation](https://google.aip.dev/203)
```

Supported field behaviors: `REQUIRED`, `OUTPUT_ONLY`, `INPUT_ONLY`, `IMMUTABLE`, `OPTIONAL`, `UNORDERED_LIST`, `NON_EMPTY_DEFAULT`, `IDENTIFIER`

#### HTTP Methods

```proto
option (google.api.http) = {
  get: "/v1/users/{user_id}"  // Hover over "get"
}
```

Shows:

```text
**get** *(google.api.http)*

Maps the RPC to an HTTP GET request. Used for reading/retrieving resources.

[AIP Documentation](https://google.aip.dev/131)
```

Supported HTTP methods: `get`, `post`, `put`, `delete`, `patch`, `custom`

#### HTTP Option Fields

Hovering over HTTP option fields like `body`, `response_body`, `additional_bindings`:

```proto
option (google.api.http) = {
  post: "/v1/users"
  body: "*"  // Hover over "body"
}
```

Shows:

```text
**body** *(google.api.http field)*

Specifies which request field should be mapped to the HTTP request body. Use `*` to map all fields except path parameters.
```

#### Resource Options

```proto
option (google.api.resource) = {
  type: "library.googleapis.com/Book"
  pattern: "projects/{project}/books/{book}"  // Hover over "pattern"
}
```

Shows:

```text
**pattern** *(google.api.resource field)*

The resource name pattern, e.g., `projects/{project}/books/{book}`.

[AIP-123: Resource Types](https://google.aip.dev/123)
```

### Protovalidate Constraints

Hovering over buf.validate constraint fields shows documentation:

#### String Constraints

```proto
string name = 1 [(buf.validate.field).string.min_len = 1];  // Hover over "min_len"
```

Shows:

```text
**min_len** *(buf.validate.field.string)*

Minimum string length in characters (UTF-8 code points).
```

Supported string constraints: `min_len`, `max_len`, `len`, `min_bytes`, `max_bytes`, `pattern`, `prefix`, `suffix`, `contains`, `not_contains`, `email`, `hostname`, `ip`, `ipv4`, `ipv6`, `uri`, `uri_ref`, `uuid`, `address`, `well_known_regex`

#### Numeric Constraints

```proto
int32 age = 2 [(buf.validate.field).int32.gte = 0];  // Hover over "gte"
```

Shows:

```text
**gte** *(buf.validate numeric constraint)*

Field must be greater than or equal to this value.
```

Supported numeric constraints: `const`, `lt`, `lte`, `gt`, `gte`, `in`, `not_in`

#### Repeated Field Constraints

```proto
repeated string tags = 3 [(buf.validate.field).repeated.unique = true];  // Hover over "unique"
```

Shows:

```text
**unique** *(buf.validate.field.repeated)*

All items in the list must be unique.
```

Supported repeated constraints: `min_items`, `max_items`, `unique`, `items`

#### Common Constraints

Hovering over common constraints like `required`, `ignore`, `disabled`:

```proto
string email = 4 [(buf.validate.field).required = true];  // Hover over "required"
```

Shows:

```text
**required** *(buf.validate)*

Field is required and must be set to a non-default value.
```

## Configuration

Hover information can be customized:

```jsonc
{
  "protobuf.hover.showFieldNumbers": true,
  "protobuf.hover.showDocumentation": true
}
```

## Use Cases

### Understanding Types

Quickly understand what a type is:

1. Hover over an unknown type
2. See its definition
3. Understand its structure

### Exploring Dependencies

Understand how symbols are used:

1. Hover over a symbol
2. See reference counts
3. Understand its importance

### Learning Protocol Buffers

Use hover to learn about:

- Built-in types
- Keywords
- Best practices

## Tips

1. **Use for exploration** - Hover to understand unfamiliar code
2. **Check references** - Use reference counts to understand usage
3. **Learn types** - Hover to see type definitions
4. **Quick documentation** - Hover provides quick access to information

## Keyboard Shortcuts

- **Hover**: Just move your mouse (no keyboard needed)
- **Peek Definition**: `Alt+F12` (shows definition in a popup)
- **Go to Definition**: `F12` (navigates to definition)
