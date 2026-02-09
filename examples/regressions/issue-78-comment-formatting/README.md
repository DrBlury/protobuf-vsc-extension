Issue 78: Formatter issues with comments

Files
- `input.proto` contains the comment block from the issue report.
- `expected.proto` shows the intended formatting (no extra indentation of comment lines).
- `comment-formatting.code-workspace` uses the built-in formatter.

How to validate
1. Open `comment-formatting.code-workspace` in VS Code.
2. Format `input.proto`.
3. Compare the result to `expected.proto`.

Expected result
- Comment indentation should remain stable and top-level messages should not become indented.
