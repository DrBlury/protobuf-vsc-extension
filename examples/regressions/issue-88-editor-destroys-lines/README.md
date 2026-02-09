Issue 88: Text editor destroys the file on other lines

Files
- `repro.proto` reproduces the enum edit plus the two affected lines from the issue report.
- `editor-destroys-lines.code-workspace` enables `protobuf.formatOnSave`.

How to validate
1. Open `editor-destroys-lines.code-workspace` in VS Code.
2. Open `repro.proto`.
3. Edit the enum (for example, add or reorder a value) and save the file.
4. Observe whether unrelated identifiers get duplicated or corrupted.

Expected result
- Saving should not alter unrelated lines or duplicate identifiers.
