Issue 79: clang-format introduces unknown characters and accumulates them

Files
- `repro.proto` is the reproduction file from the issue report (includes non-ASCII comments).
- `clang-format-corruption.code-workspace` enables clang-format with the style used in the report.

How to validate
1. Open `clang-format-corruption.code-workspace` in VS Code.
2. On a Remote-SSH session (Linux), open `repro.proto`.
3. Run "Format Document" multiple times.
4. Verify that characters are not corrupted or duplicated after repeated formatting.

Expected result
- Formatting should be stable and idempotent across repeated runs.
