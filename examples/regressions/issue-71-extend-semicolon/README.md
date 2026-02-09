Issue 71: Extensions do not need a semicolon

Files
- `extend.proto` is the minimal example from the issue.
- `extend-semicolon.code-workspace` enables format on save.

How to validate
1. Open `extend-semicolon.code-workspace` in VS Code.
2. Open `extend.proto` and save the file.
3. Run the "Add missing semicolons" source action if needed.

Expected result
- The `extend` line should not receive a trailing semicolon.
