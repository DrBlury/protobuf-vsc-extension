# Code Actions

Code Actions provide quick fixes and refactoring capabilities for common issues.

## Overview

Code Actions appear as lightbulb icons (💡) when:

- There are diagnostics (errors/warnings)
- You select code that can be refactored
- You right-click on code

## Types of Code Actions

### Quick Fixes

Automatically fix common issues:

#### 1. Add Missing Imports

**When it appears:** When a type is used but not imported

**What it does:** Adds the required import statement

**Example:**

```proto
message User {
  Timestamp created_at = 1;  // Error: Timestamp not imported
}
```

**Fix:** Click lightbulb → "Add import 'google/protobuf/timestamp.proto'"

#### 2. Fix Naming Conventions

**When it appears:** When naming doesn't follow conventions

**What it does:** Converts names to proper case

**Example:**

```proto
message userMessage {  // Should be UserMessage
  string UserName = 1;  // Should be user_name
}
```

**Fix:** Click lightbulb → "Convert to PascalCase" or "Convert to snake_case"

#### 3. Fix Editions Modifiers (Auto-fix on Save)

**When it appears:** In edition 2023 files when `optional` or `required` modifiers are used

**What it does:** Converts deprecated modifiers to `features.field_presence` options

**Example:**

```proto
edition = "2023";

message User {
  optional string name = 1;  // 'optional' not allowed in editions
  required string email = 2; // 'required' not allowed in editions
}
```

**Fix:** Click lightbulb → "Convert 'optional' to 'features.field_presence = EXPLICIT'"

**Auto-fix on save:** Add this to your VS Code settings to automatically fix editions modifiers when saving:

```jsonc
{
  "editor.codeActionsOnSave": {
    "source.fixAll": "explicit"
  }
}
```

This will convert:

- `optional` fields → `[features.field_presence = EXPLICIT]`
- `required` fields → `[features.field_presence = LEGACY_REQUIRED]`

#### 4. Add Missing Semicolons

**When it appears:** When a field is missing a semicolon

**What it does:** Adds the semicolon

**Example:**

```proto
message User {
  string name = 1  // Missing semicolon
}
```

**Fix:** Click lightbulb → "Add semicolon"

#### 4. Fix Field Numbers

**When it appears:** When there are duplicate or invalid field numbers

**What it does:** Suggests the next available field number

**Example:**

```proto
message User {
  string name = 1;
  string email = 1;  // Duplicate field number
}
```

**Fix:** Click lightbulb → "Change field number to 2"

#### 5. Remove Unused Imports

**When it appears:** When an import is not used

**What it does:** Removes the unused import

**Example:**

```proto
import "unused.proto";  // Not used anywhere
```

**Fix:** Click lightbulb → "Remove unused import"

#### 6. Organize Imports

**When it appears:** Always available via Command Palette or as a code action

**What it does:**

- Sorts imports alphabetically
- Removes duplicates
- Groups imports by category (when `protobuf.organizeImports.groupByCategory` is enabled):
  - **Google well-known protos** (`google/protobuf/*`) - first
  - **Third-party libraries** (`buf/`, `google/api/`, `validate/`, `grpc/`, etc.) - second
  - **Local project imports** - last
- Groups are separated by blank lines
- Groups by modifier (public, weak, regular) within each category

**How to use:**

1. Press `Cmd/Ctrl+Shift+P`
2. Type "Protobuf: Organize Imports"
3. Or use the code action via `Cmd/Ctrl+.`
4. Or configure to run on save (see [Configuration](#configuration))

**Example - Before (Messy):**

```proto
syntax = "proto3";

import "google/protobuf/timestamp.proto";
import "myproject/v1/user.proto";
import "google/protobuf/any.proto";
import "third_party/validate/validate.proto";
import "myproject/v1/auth.proto";
```

**After organizing (with grouping enabled):**

```proto
syntax = "proto3";

import "google/protobuf/any.proto";
import "google/protobuf/timestamp.proto";

import "third_party/validate/validate.proto";

import "myproject/v1/auth.proto";
import "myproject/v1/user.proto";
```

### Refactoring Actions

#### 1. Convert to Proto3

**When it appears:** When working with proto2 messages

**What it does:**

- Removes `required` modifiers
- Removes default values
- Converts to proto3 style

**Example:**

```proto
syntax = "proto2";

message User {
  required string name = 1 [default = "Unknown"];
  optional string email = 2;
}
```

**After conversion:**

```proto
syntax = "proto3";

message User {
  string name = 1;
  string email = 2;
}
```

#### 2. Add Field Options

**When it appears:** When right-clicking on a field

**What it does:** Adds common field options

**Options available:**

- `[deprecated = true]` - Mark field as deprecated
- `[json_name = "camelCase"]` - Set JSON field name

**Example:**

```proto
message User {
  string old_name = 1;
}
```

**After adding deprecated:**

```proto
message User {
  string old_name = 1 [deprecated = true];
}
```

#### 3. Renumber Fields

**When it appears:** When there are gaps in field numbers

**What it does:** Renumbers fields sequentially

**Example:**

```proto
message User {
  string name = 1;
  string email = 3;  // Gap at 2
  int32 age = 5;     // Gap at 4
}
```

**After renumbering:**

```proto
message User {
  string name = 1;
  string email = 2;
  int32 age = 3;
}
```

### Source Actions

#### 1. Add Missing Imports (All)

**When it appears:** When multiple imports are missing

**What it does:** Adds all missing imports at once

**How to use:**

1. Press `Cmd/Ctrl+Shift+P`
2. Type "Source: Organize Imports"
3. Or use `Cmd/Ctrl+.` → "Source: Organize Imports"

#### 2. Fix All

**When it appears:** When multiple issues can be fixed

**What it does:** Applies all applicable quick fixes

**How to use:**

1. Press `Cmd/Ctrl+Shift+P`
2. Type "Source: Fix All"
3. Or use `Cmd/Ctrl+.` → "Source: Fix All"

## Keyboard Shortcuts

- **Show Code Actions**: `Cmd/Ctrl+.` (Mac/Windows/Linux)
- **Quick Fix**: `Cmd/Ctrl+.` then select fix
- **Organize Imports**: `Shift+Alt+O` (Windows/Linux) or `Shift+Option+O` (Mac)

## Configuration

Code Actions are enabled by default. You can configure:

```jsonc
{
  // Organize imports on save
  "editor.codeActionsOnSave": {
    "source.organizeImports": "explicit"  // Organize imports on save
  },

  // Protobuf-specific settings
  "protobuf.organizeImports.groupByCategory": true  // Group imports by category (default: true)
}
```

### Organize Imports Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `protobuf.organizeImports.groupByCategory` | `true` | Group imports by category: Google well-known protos first, third-party libraries second, local imports last. Groups are separated by blank lines. |
