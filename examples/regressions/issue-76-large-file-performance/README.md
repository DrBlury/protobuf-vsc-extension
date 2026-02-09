Issue 76: Very slow to edit and save large proto files

Files
- `large.proto` contains 8000 fields in one message.
- `generate-large-proto.js` regenerates the file if needed.
- `large-file-performance.code-workspace` enables `protobuf.formatOnSave`.

How to validate
1. Open `large-file-performance.code-workspace` in VS Code.
2. Open `large.proto` and edit a few lines.
3. Save and measure how long the save takes and whether comments or lines are altered unexpectedly.

Expected result
- Save and formatting should complete quickly without modifying unrelated lines.
