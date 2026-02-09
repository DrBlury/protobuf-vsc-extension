Issue 55: False positive `Unused import` lint

Files
- `quiz.proto` imports `gorums.proto` and uses an option extension.
- `gorums.proto` defines the `gorums.quorumcall` option.

How to validate
1. Open `unused-import-option.code-workspace` in VS Code.
2. Open `quiz.proto`.
3. Check diagnostics for "Unused import 'gorums.proto'".

Expected result
- `gorums.proto` should not be flagged as unused because its extension is referenced by options.
