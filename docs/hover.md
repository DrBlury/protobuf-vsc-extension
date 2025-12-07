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
