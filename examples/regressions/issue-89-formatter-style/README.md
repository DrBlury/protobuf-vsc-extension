Issue 89: Proto formatter style not effective

Files
- `unformatted.proto` contains inconsistent spacing.
- `.clang-format` forces a visible style change (IndentWidth 8).
- `formatter-style.code-workspace` enables clang-format with `style: file`.

How to validate
1. Open `formatter-style.code-workspace` in VS Code.
2. Run "Format Document" on `unformatted.proto`.
3. If clang-format is installed, indentation should change to 8 spaces and spacing should normalize.
4. If clang-format is missing, the output will stay close to the built-in formatter and the output channel should mention a fallback.

Expected result
- Style changes are applied only when clang-format is available and enabled.
