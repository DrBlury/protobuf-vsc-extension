# Code Lens

Code Lens displays reference counts and metadata above symbols in your proto files.

## Overview

Code Lens provides quick insights into:

- How many times a symbol is referenced
- External vs internal references
- Field counts for messages
- RPC counts for services

## How It Works

Code Lens automatically appears above:

- Message definitions
- Enum definitions
- Service definitions

## Example

```proto
message User {
  string name = 1;
  string email = 2;
}

// Code Lens above shows:
// "2 references (1 external, 1 internal) | 2 fields"
```

## Features

### Reference Counts

Shows the total number of references to a symbol:

- **Total references** - All references across the workspace
- **External references** - References from other files
- **Internal references** - References within the same file

### Field/RPC Counts

- **Messages**: Shows the number of fields
- **Services**: Shows the number of RPC methods
- **Enums**: Shows the number of enum values

## Interacting with Code Lens

1. **Click to find references** - Clicking on a Code Lens opens the references view
2. **Hover for details** - Hovering shows additional information
3. **Navigate quickly** - Use Code Lens to understand symbol usage at a glance

## Use Cases

### Understanding Dependencies

Quickly see which messages are used most:

```proto
// 15 references (10 external, 5 internal) | 5 fields
message User {
  // ...
}
```

### Refactoring Decisions

Use reference counts to decide if it's safe to refactor:

- Low reference count = easier to refactor
- High reference count = more careful refactoring needed

### Code Review

Reviewers can quickly see:

- Which symbols are heavily used
- Which symbols might be unused (0 references)
- External dependencies

## Configuration

Code Lens is enabled by default. To disable:

```jsonc
{
  "editor.codeLens": false  // Disables all Code Lens (VS Code setting)
}
```

Note: Code Lens is a VS Code feature, so you can't disable it per-language. However, the extension respects VS Code's Code Lens settings.

## Performance

Code Lens is computed efficiently:

- Cached results
- Incremental updates
- Only shown for top-level symbols

## Tips

1. **Use for navigation** - Click Code Lens to jump to references
2. **Monitor usage** - Keep an eye on reference counts during development
3. **Identify dead code** - Symbols with 0 references might be candidates for removal
4. **Understand impact** - High reference counts indicate important symbols
