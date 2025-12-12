# Regression Test: Workspace Variable Paths

## Issue Summary

User reported multiple issues when using `${workspaceFolder}` variables in path settings:

1. **clang-format path ignored**: `"protobuf.clangFormat.path": "${workspaceFolder}/bin/clang-format"` is silently ignored
2. **Missing Tools warning**: Extension always shows "Protobuf: Missing Tools" warning for protoc and buf
3. **protoc path ignored**: Custom protoc path using `${workspaceFolder}` seems to be ignored
4. **Import squiggles**: Red Intellisense squiggles on message names despite F12 navigation working
5. **buf warning when not used**: Complains about buf even when not configured (default should be "none")

## Environment

- Ubuntu 24.04 (Dev Container and local)
- Custom .clang-format file with Proto language settings

## Test Setup

This regression test simulates the user's setup:

1. `bin/` directory where tools would be located
2. Custom `.clang-format` with Proto language configuration
3. Settings using `${workspaceFolder}` variables
4. Multiple proto files with cross-references to test import diagnostics

## How to Test

1. Open this folder as a workspace in VS Code
2. Check the "Protobuf Tools" output channel for path resolution logs
3. Verify:
   - [ ] Status bar does NOT show "Missing Tools" if protoc is found
   - [ ] clang-format path resolves correctly (check output channel)
   - [ ] No false import errors when types are defined in workspace
   - [ ] Formatting uses the local .clang-format settings

## Expected Behavior

- `${workspaceFolder}` variables should expand correctly in all path settings
- If tools are found at configured paths, no warning should appear
- If buf is not enabled (formatter preset != buf, linter != buf), it should not be required
- Import diagnostics should not show false positives when referenced types exist

## Related Settings

```json
{
  "protobuf.clangFormat.path": "${workspaceFolder}/bin/clang-format",
  "protobuf.protoc.path": "${workspaceFolder}/bin/protoc",
  "protobuf.formatter.preset": "google",
  "protobuf.externalLinter.enabled": false
}
```
