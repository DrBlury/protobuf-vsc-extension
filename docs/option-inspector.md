# Option Inspector

The Option Inspector provides a tree view of all options defined in your Protocol Buffer files, making it easy to browse and navigate to option definitions.

## Overview

The Option Inspector displays:
- **All options** - File, message, field, enum, and service options
- **Option values** - Shows option names and their values
- **Parent context** - Indicates where each option is defined
- **Quick navigation** - Click to jump to option definitions

## Usage

### Opening the Option Inspector

1. **From Explorer**:
   - Look for "Protobuf Options" in the Explorer sidebar
   - The view appears automatically when you have `.proto` files open

2. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `View: Show Protobuf Options` (if available)

### Viewing Options

1. **Open a `.proto` file** - The inspector shows options for the active file
2. **Browse the tree** - See all options organized by their location
3. **Click to navigate** - Click any option to jump to its definition

## Option Types

The inspector shows various option types:

### File Options

```protobuf
syntax = "proto3";
package example;

option java_package = "com.example";
option go_package = "github.com/example/proto";
option optimize_for = SPEED;
```

### Message Options

```protobuf
message User {
  option deprecated = true;
  string name = 1;
}
```

### Field Options

```protobuf
message User {
  string email = 1 [(validate.rules).string.email = true];
  int32 age = 2 [deprecated = true];
  string name = 3 [json_name = "full_name"];
}
```

### Enum Options

```protobuf
enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
  ACTIVE = 1;
}
```

### Service Options

```protobuf
service UserService {
  option (google.api.default_host) = "api.example.com";
  rpc GetUser (GetUserRequest) returns (User);
}
```

## Display Format

Options are displayed as:
```
{option_name} = {value}
```

With parent context shown in the description:
- `File: example.proto`
- `Message: User`
- `Field: email`
- `Enum: Status`
- `Service: UserService`

## Navigation

### Jumping to Options

1. **Click an option** - Opens the file and highlights the option
2. **View definition** - See the exact location and context
3. **Edit options** - Make changes directly in the editor

### Auto-Refresh

The inspector automatically refreshes when:
- You switch between files
- You save a file
- Options are added or removed

## Use Cases

### Finding Options

Quickly find where options are defined:
1. Open the Option Inspector
2. Search visually for the option you need
3. Click to navigate

### Reviewing Configuration

Review all options in a file:
1. Open a proto file
2. Check the Option Inspector
3. See all options at a glance

### Debugging

Debug option-related issues:
1. See all options in one place
2. Verify option values
3. Check for conflicts or duplicates

## Integration

The Option Inspector integrates with:
- **Language Server** - Uses the language server to parse options
- **File Watchers** - Updates when files change
- **Editor Context** - Shows options for the active file

## Troubleshooting

### No Options Shown

If no options appear:
1. Ensure you have a `.proto` file open
2. Check that the file has options defined
3. Verify the language server is running
4. Check the Output panel for errors

### Options Not Updating

If options don't update:
1. Save the file to trigger refresh
2. Switch to another file and back
3. Reload the window if needed

### Navigation Not Working

If clicking doesn't navigate:
1. Verify the file is still open
2. Check that the option still exists
3. Ensure the language server is responding

## Commands

The Option Inspector is automatically available in the Explorer sidebar. There are no direct commands, but it works with:
- File navigation
- Editor commands
- Language server requests

## Best Practices

1. **Use for review** - Review all options before committing
2. **Check consistency** - Ensure options are consistent across files
3. **Document options** - Add comments explaining complex options
4. **Validate values** - Verify option values are correct

---

For more information, see:
- [Hover Information](./hover.md)
- [Code Actions](./code-actions.md)
- [Settings Reference](./settings.md)
