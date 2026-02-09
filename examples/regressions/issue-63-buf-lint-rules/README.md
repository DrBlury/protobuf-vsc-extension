Issue 63: Buf lint rules in buf.yaml are not respected

Files
- `buf.yaml` disables the `ENUM_ZERO_VALUE_SUFFIX` rule.
- `proto/status.proto` violates the rule by using `STATUS_UNKNOWN = 0`.
- `buf-lint-rules.code-workspace` enables the external buf linter.

How to validate
1. Open `buf-lint-rules.code-workspace` in VS Code.
2. Open `proto/status.proto`.
3. Run "Protobuf: Run External Linter" or save the file if run-on-save is enabled.

Expected result
- The linter should not report an ENUM_ZERO_VALUE_SUFFIX violation because it is excluded in `buf.yaml`.
