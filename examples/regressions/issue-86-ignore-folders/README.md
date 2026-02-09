Issue 86: Unable to specify ignore folders

Files
- `.gitignore` ignores `build/`.
- `proto/message.proto` is the intended source.
- `build/proto/message.proto` simulates a generated copy.
- `ignore-folders.code-workspace` opens the folder without extra settings.

How to validate
1. Open `ignore-folders.code-workspace` in VS Code.
2. Observe whether symbols, diagnostics, or go-to-definition see both `proto/` and `build/proto/`.
3. If the extension still indexes `build/`, the issue is still present.

Workaround check
- Set `protobuf.protoSrcsDir` to `proto` and reload the window.
- With the setting enabled, only `proto/` should be indexed.
