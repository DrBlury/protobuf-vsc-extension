Issue 82: Import resolution fails for Go-style module paths

Files
- `proto/api.proto` imports Go-style module paths.
- `proto/common/types.proto` and `vendor/example.com/org/other-repo/proto/shared.proto` provide the targets.
- `go-style-imports.code-workspace` configures `protobuf.includes` with virtual-to-actual mappings.

How to validate
1. Open `go-style-imports.code-workspace` in VS Code.
2. Open `proto/api.proto`.
3. Go-to-definition or hover on `CommonType` and `SharedType` should resolve without import errors.

Expected result
- Imports resolve when `virtual=actual` mappings are present in `protobuf.includes`.
