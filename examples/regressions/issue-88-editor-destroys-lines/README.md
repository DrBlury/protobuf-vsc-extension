Issue 88: Text editor destroys the file on other lines

Files

- `repro.proto` reproduces the enum edit plus the two affected lines from the issue report.
- `editor-destroys-lines.code-workspace` enables `protobuf.formatOnSave` and disables renumbering so the fixture is independent of user-level settings.

How to validate

1. Open `editor-destroys-lines.code-workspace` in VS Code.
2. Open `repro.proto`.
3. Edit the enum (for example, add or reorder a value) and save the file.
4. Observe whether unrelated identifiers get duplicated or corrupted.

Expected result

- Saving should not alter unrelated lines, duplicate identifiers, or change the intentional field numbers `24` and `26`.
