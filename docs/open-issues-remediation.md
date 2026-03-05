# Open Issues Remediation Tracker

Date: 2026-03-05  
Repository: `DrBlury/protobuf-vsc-extension`  
Source of truth: `gh issue list --state open --limit 200`

## Goal

Reproduce all currently open issues, implement fixes where needed, add proof via tests/examples, and provide a final issue-by-issue reason/fix summary.

## Execution Plan

1. Pull all open GitHub issues and map each to code areas, existing regressions, and available tests.
2. Reproduce each issue via tests/fixtures or code-path analysis when environment-specific reproduction is unavailable.
3. Implement missing fixes in small, isolated changes grouped by subsystem (UI activation, diagnostics, formatter, workspace scan).
4. Add or extend automated tests for every newly-fixed gap.
5. Run targeted regression suites for all issue categories and record evidence.
6. Produce a final issue ledger: issue, reason, fix, and proof.

## Current Open Issues

| Issue | Title | Type | Reproduction Status | Fix Status | Test Status |
| --- | --- | --- | --- | --- | --- |
| #108 | Extension auto-opens empty "PROTO OPTIONS" explorer on VS Code startup | Bug | Reproduced from manifest behavior | Fixed in this pass | Added/Passing |
| #104 | [Brief Description] (diagnostic severity disable/none request) | Enhancement | Reproduced | Fixed in this pass | Added/Passing |
| #103 | Fields Renumeration within attributes... | Bug | Reproduced | Fixed in this pass | Added/Passing |
| #102 | Formatter Issues with Comment "//[" | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #100 | protobuf.clangFormat.style does not expand `${workspaceFolder}` | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #99 | Extension doesn't resolve imports for well-known types bundled with protoc | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #98 | [BUG] "Go to Definition" Redirects to Incorrect File | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #86 | Unable to specify ignore folders | Enhancement | Reproduced | Fixed in this pass | Added/Passing |
| #82 | Import resolution fails for Go-style module paths | Bug/Enhancement | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #79 | clang-format introduces unknown characters and accumulates them | Bug | Reproduced by root-cause analysis (UTF-8 byte-offset bug) | Fixed in this pass | Added/Passing |
| #76 | Very slow to edit and save large proto files | Bug | Not reproducible in current codebase | Added regression guard and related perf mitigation | Added/Passing |
| #71 | Extensions do not need a semicolon | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #68 | textDocument/documentSymbol failed: name must not be falsy | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |
| #55 | False positive `Unused import` lint | Bug | Not reproducible (already fixed) | Already fixed before this pass | Existing tests passing |

## Detailed Tracking

### #108 Extension auto-opens empty "PROTO OPTIONS" explorer on VS Code startup

- Reproduction:
  - The contributed explorer view `protobufOptionInspector` had no visibility guard (`when` condition), so VS Code could render/show it independently of active `.proto` context.
- Observed:
  - Behavior matches the issue report: startup can surface an empty Proto Options view before user intent.
- Root cause:
  - View contribution in `package.json` was unconditional.
- Fix:
  - Added `"when": "protobuf.optionInspector.visible"` to the explorer view contribution.
  - Added activation-side context updates (`setContext`) tied to active editor language (`proto` only).
- Validation:
  - `src/extension.test.ts`: `should initialize option inspector visibility context from active editor`
  - `src/extension.test.ts`: `should update option inspector visibility context when active editor changes`

### #104 Diagnostic severity should support disabled/none

- Reproduction:
  - Severity enums in `package.json` accepted only `error|warning|information|hint`.
- Observed:
  - No way to disable a diagnostic category through the severity setting itself.
- Root cause:
  - Missing `none` enum option and no provider-level normalization for disabling categories by severity.
- Fix:
  - Added `"none"` to all diagnostics severity enums in `package.json`.
  - Extended `SeveritySetting` type with `"none"`.
  - Added normalization in `DiagnosticsProvider.updateSettings` to disable affected categories when severity is `none`.
  - Added explicit suppression for `nonCanonicalImportPath` and `breakingChanges` when severity is `none`.
  - Updated `docs/settings.md`.
- Validation:
  - `src/server/providers/__tests__/diagnostics/diagnostics.severity.test.ts`:
    - `does not report non-canonical import path when severity is none`
    - `disables naming convention diagnostics when naming severity is none`

### #103 Fields renumbered inside attribute option values

- Reproduction:
  - Multi-line field option blocks using bracket-only syntax (`[...]` without `{...}`) caused numeric option values to be renumbered.
- Observed:
  - Option values like `.uint32.gt = 1` / `.lte = 50` were treated as field-number lines.
- Root cause:
  - Renumbering logic tracked only brace-depth for inline options, not bracket-depth.
- Fix:
  - Updated formatter renumber logic to track multi-line inline option bracket depth and skip all internal option lines.
- Validation:
  - `src/server/providers/__tests__/formatter.test.ts`:
    - `should not renumber numeric option values inside multi-line bracket options (issue #103)`

### #102 Formatter indentation breaks with comment token `//[`

- Reproduction:
  - Tried against existing formatter regression tests.
- Observed:
  - Could not reproduce in current code.
- Root cause:
  - Already addressed by existing formatter handling of bracket-like comment tokens.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/providers/__tests__/formatter.test.ts`:
    - `should not indent top-level declarations when comments contain brackets`

### #100 `${workspaceFolder}` not expanded in `protobuf.clangFormat.style`

- Reproduction:
  - Checked config path/style expansion behavior in config manager tests.
- Observed:
  - `${workspaceFolder}` expansion is already implemented for clang-format style.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/utils/__tests__/configManager.test.ts`:
    - `expands workspace variables in tool paths and clang-format file style`

### #99 Well-known protoc imports unresolved by default

- Reproduction:
  - Checked well-known include discovery and preload behavior.
- Observed:
  - Current server discovers include paths from protoc binary location and can preload well-known protos.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/initialization/__tests__/wellKnown.test.ts`:
    - `should derive include path from protoc binary found on PATH`
  - `src/server/utils/__tests__/configManager.test.ts`:
    - `should add well-known include path to analyzer`

### #98 Go to Definition resolves option aggregate fields to wrong symbol

- Reproduction:
  - Ran option-field definition resolution tests.
- Observed:
  - Current code resolves to expected `google.api.HttpRule` fields.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/providers/__tests__/definition/definition.optionFields.test.ts`

### #86 No ignore-folder support for proto discovery

- Reproduction:
  - Workspace scanner ignored only hidden dirs/node_modules and lacked user-configurable discovery excludes.
- Observed:
  - No dedicated workspace discovery ignore setting existed.
- Root cause:
  - Discovery pipeline had no ignore-pattern input or matching logic.
- Fix:
  - Added new setting `protobuf.workspace.ignorePatterns`.
  - Added variable expansion and propagation via config manager/server.
  - Extended workspace scan/file discovery to respect folder/path/glob ignore patterns.
  - Updated `docs/settings.md`.
- Validation:
  - `src/server/utils/__tests__/workspace.test.ts`:
    - `should skip files under ignored directories`
    - `should skip ignored workspace directories when patterns are configured`
  - `src/server/utils/__tests__/configManager.test.ts`:
    - `should return empty workspace ignore patterns when not set`
    - `should expand variables in workspace ignore patterns`

### #82 Go-style module import resolution

- Reproduction:
  - Ran path-mapping analyzer tests.
- Observed:
  - Virtual import mappings (`virtual=actual`) resolve correctly.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/core/__tests__/analyzer.pathMappings.test.ts`

### #79 clang-format character corruption over repeated format

- Reproduction:
  - Root-cause reproduced in code path: clang-format range mode expects UTF-8 byte offsets, while code used UTF-16 character offsets.
  - This mismatch affects files with multibyte chars (e.g., CJK comments), matching the issue context.
- Observed:
  - Offset/length computation in `ClangFormatProvider.formatRange` was byte-incorrect for multibyte text.
- Root cause:
  - UTF-16-to-UTF-8 offset conversion bug in range formatting.
- Fix:
  - Implemented UTF-8 byte-offset conversion for range start/end and length.
- Validation:
  - `src/server/services/__tests__/clangFormat.test.ts`:
    - `should calculate UTF-8 byte offsets for multibyte characters`

### #76 Performance degradation on large proto files

- Reproduction:
  - Ran large regression fixture through formatter in tests.
- Observed:
  - No pathological slowdown reproduced; large fixture formatting completed quickly.
- Root cause:
  - Historical/per-environment behavior not reproducible in current headless test environment.
- Fix:
  - Added explicit large-file regression guard test.
  - Added workspace ignore-pattern support (#86), which reduces indexing overhead in generated/build-heavy workspaces.
- Validation:
  - `src/server/providers/__tests__/formatter.test.ts`:
    - `should format large regression file without pathological slowdown (issue #76)`

### #71 `extend` declaration incorrectly gets semicolon fix

- Reproduction:
  - Ran extend diagnostics regression tests.
- Observed:
  - Current code catches incorrect semicolon usage and no longer misapplies fix behavior.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/providers/__tests__/diagnostics/diagnostics.extend.test.ts`

### #68 `documentSymbol` failure when symbol name is empty/falsy

- Reproduction:
  - Ran enhanced symbol-provider tests around empty/falsy names.
- Observed:
  - Provider skips empty symbol names and avoids invalid DocumentSymbol payloads.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/providers/__tests__/symbols.enhanced.test.ts`:
    - `should skip messages with empty names`
    - `should skip enums with empty names`
    - `should skip services with empty names`
    - `should skip fields with empty names`

### #55 False positive unused imports when imports only referenced in options/tags/extend

- Reproduction:
  - Ran diagnostics enhanced regression tests for custom options/extend usage.
- Observed:
  - Imports used via option extensions and extend extendee types are correctly treated as used.
- Root cause:
  - Historical issue; not reproducible now.
- Fix:
  - No code changes needed in this pass.
- Validation:
  - `src/server/providers/__tests__/diagnostics/diagnostics.enhanced.test.ts`:
    - `should treat custom option references as import usage`
    - `should treat extend extendee types as import usage`
