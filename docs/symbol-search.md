# Symbol Search

Fuzzy workspace symbol search helps you quickly find messages, enums, and services across your entire workspace.

## Overview

The symbol search feature provides intelligent, fuzzy matching to find symbols even when you don't remember the exact name.

## How to Use

1. Press `Cmd/Ctrl+T` (or `Cmd/Ctrl+P` then type `@`)
2. Type part of the symbol name
3. Results appear with relevance ranking
4. Press `Enter` to navigate to the symbol

## Search Features

### Fuzzy Matching

The search uses multiple matching strategies:

1. **Exact Match** (Highest Priority)
   - `User` finds `User` exactly
   - Score: 1000

2. **Starts With**
   - `User` finds `UserMessage`, `UserService`
   - Score: 800

3. **Contains**
   - `ser` finds `User`, `UserService`
   - Score: 500

4. **Fuzzy Match**
   - `UsrMsg` finds `UserMessage` (characters in order)
   - Score: 300

5. **Part-Based Match**
   - `UserMsg` finds `UserMessage` (matches parts)
   - Score: 100

### Relevance Ranking

Results are sorted by:

1. **Match score** (higher is better)
2. **Alphabetical order** (for same score)

### Search Scope

Searches across:

- All messages in the workspace
- All enums in the workspace
- All services in the workspace
- Nested types (messages within messages)

## Examples

### Finding by Partial Name

```text
Search: "user"
Results:
  User (exact match)
  UserMessage (starts with)
  CreateUserRequest (contains)
  DeleteUserResponse (contains)
```

### Finding by Abbreviation

```text
Search: "usrmsg"
Results:
  UserMessage (fuzzy match)
  UserServiceMessage (fuzzy match)
```

### Finding Nested Types

```text
Search: "inner"
Results:
  OuterMessage.InnerMessage (nested message)
  OuterMessage.InnerEnum (nested enum)
```

## Keyboard Shortcuts

- **Open Symbol Search**: `Cmd/Ctrl+T`
- **Search in Current File**: `Cmd/Ctrl+Shift+O`
- **Search Workspace Symbols**: `Cmd/Ctrl+T`

## Tips

1. **Use abbreviations** - Fuzzy matching finds symbols even with typos
2. **Type partial names** - You don't need the full name
3. **Use camelCase parts** - Search for "UserMsg" to find "UserMessage"
4. **Check relevance** - Higher-ranked results are more relevant
5. **Navigate quickly** - Press Enter to jump to the symbol

## Best Practices

1. **Use for navigation** - Faster than browsing files
2. **Learn abbreviations** - Use short forms for common symbols
3. **Check all results** - Sometimes the best match isn't first
4. **Use for discovery** - Find symbols you didn't know existed
5. **Combine with Go to Definition** - Use both features together

## Performance

- **Limited results** - Shows top 100 results for performance
- **Fast search** - Optimized for large workspaces
- **Cached symbols** - Symbols are cached for quick access

## Comparison with Go to Symbol

| Feature | Go to Symbol (`Cmd/Ctrl+T`) | Go to Definition (`F12`) |
| --- | --- | --- |
| Scope | Workspace-wide | Current file context |
| Matching | Fuzzy, intelligent | Exact match required |
| Use case | Finding symbols | Navigating to definitions |
| Speed | Fast | Instant |

## Use Cases

### Finding Unknown Symbols

When you know a symbol exists but don't remember where:

1. Open symbol search
2. Type part of the name
3. Browse results
4. Navigate to the symbol

### Exploring Codebase

When exploring a new codebase:

1. Search for common patterns
2. See all related symbols
3. Understand the structure

### Quick Navigation

When you know the symbol name:

1. Open symbol search
2. Type the name
3. Press Enter
4. Instantly navigate
