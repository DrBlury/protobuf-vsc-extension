# Proto2 to Proto3 Migration

The Migration feature helps you convert Protocol Buffer files from proto2 syntax to proto3 syntax, automatically handling many of the common changes required.

## Overview

The migration feature:
- **Converts syntax** - Changes `syntax = "proto2"` to `syntax = "proto3"`
- **Removes required fields** - Removes `required` keyword (not supported in proto3)
- **Removes default values** - Removes `default` option values (not supported in proto3)
- **Safe conversion** - Makes only safe, automatic changes

## Usage

### Running Migration

1. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `Protobuf: Migrate to Proto3`
   - Review the changes in the diff view
   - Apply the changes

2. **Prerequisites**:
   - Open a `.proto` file with proto2 syntax
   - File should be parseable

### What Gets Changed

The migration automatically:

1. **Updates syntax declaration**:
   ```protobuf
   // Before
   syntax = "proto2";

   // After
   syntax = "proto3";
   ```

2. **Removes required fields**:
   ```protobuf
   // Before
   required string name = 1;

   // After
   string name = 1;
   ```

3. **Removes default values**:
   ```protobuf
   // Before
   string status = 1 [default = "active"];

   // After
   string status = 1;
   ```

4. **Cleans up empty options**:
   ```protobuf
   // Before
   string name = 1 [];

   // After
   string name = 1;
   ```

## Examples

### Simple Migration

**Before (proto2)**:
```protobuf
syntax = "proto2";
package example;

message User {
  required string name = 1;
  optional string email = 2 [default = ""];
  required int32 age = 3;
}
```

**After (proto3)**:
```protobuf
syntax = "proto3";
package example;

message User {
  string name = 1;
  string email = 2;
  int32 age = 3;
}
```

### Complex Migration

**Before (proto2)**:
```protobuf
syntax = "proto2";
package example;

message Order {
  required string id = 1;
  optional Status status = 2 [default = PENDING];
  repeated Item items = 3;
}

enum Status {
  PENDING = 0;
  COMPLETED = 1;
}
```

**After (proto3)**:
```protobuf
syntax = "proto3";
package example;

message Order {
  string id = 1;
  Status status = 2;
  repeated Item items = 3;
}

enum Status {
  PENDING = 0;
  COMPLETED = 1;
}
```

## Limitations

### What Migration Doesn't Do

The migration feature does **not** handle:

1. **Field presence** - Proto3 doesn't distinguish between unset and default values
2. **Extension fields** - Extensions work differently in proto3
3. **Groups** - Groups are not supported in proto3
4. **Custom options** - May need manual review
5. **Complex default values** - Some defaults may need manual removal
6. **Import changes** - Doesn't modify imports

### Manual Review Required

After migration, you should:

1. **Review field semantics** - Check if field presence matters
2. **Test thoroughly** - Ensure your code still works
3. **Update client code** - Update code that relies on proto2 features
4. **Check extensions** - Review extension usage
5. **Verify defaults** - Ensure default value removal is acceptable

## Best Practices

### Before Migration

1. **Backup your files** - Commit changes or create backups
2. **Review proto2 features** - Understand what will change
3. **Test in isolation** - Migrate one file at a time
4. **Check dependencies** - Ensure dependencies support proto3

### After Migration

1. **Review changes** - Check the diff carefully
2. **Run tests** - Ensure everything still works
3. **Update documentation** - Update any proto2-specific docs
4. **Test clients** - Verify client code compatibility
5. **Check breaking changes** - Ensure no breaking changes for consumers

### Migration Strategy

1. **Start small** - Migrate simple files first
2. **Test incrementally** - Test after each migration
3. **Document changes** - Keep track of what changed
4. **Coordinate with team** - Ensure everyone is aware
5. **Version appropriately** - Consider versioning your API

## Troubleshooting

### No Changes Applied

If no changes are made:
1. File may already be proto3
2. File may not have proto2-specific features
3. Check the file syntax declaration

### Syntax Errors After Migration

If you get syntax errors:
1. Review the changes carefully
2. Check for manual fixes needed
3. Verify all required fields were removed
4. Ensure default values were properly removed

### Incomplete Migration

If migration seems incomplete:
1. Some changes require manual intervention
2. Review the Limitations section
3. Check for complex cases not handled automatically
4. Make manual changes as needed

## Commands

- `protobuf.migrateToProto3` - Migrate current file to proto3

## Related Features

- [Code Actions](./code-actions.md) - Other refactoring options
- [Formatting](./settings.md#formatting) - Format your proto files
- [Breaking Changes](./breaking-changes.md) - Check for breaking changes

## Additional Resources

- [Proto3 Language Guide](https://protobuf.dev/programming-guides/proto3/)
- [Migrating from Proto2](https://protobuf.dev/programming-guides/proto3/#migrating-from-proto2)
- [Proto2 vs Proto3](https://protobuf.dev/programming-guides/proto3/#migrating-from-proto2)

---

For more information, see:
- [Settings Reference](./settings.md)
- [Code Actions](./code-actions.md)
