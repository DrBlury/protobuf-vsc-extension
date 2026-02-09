Issue 68: textDocument/documentSymbol failed (name must not be falsy)

Files
- `invalid-symbols.proto` intentionally includes unnamed `message`, `enum`, and `service` declarations.
- `document-symbol-name.code-workspace` opens the folder without extra settings.

How to validate
1. Open `document-symbol-name.code-workspace` in VS Code.
2. Open `invalid-symbols.proto`.
3. Open the Outline view or run "Go to Symbol in File".

Expected result
- The Outline should work without throwing "name must not be falsy" errors.
