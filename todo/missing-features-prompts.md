# Missing Feature Prompts

Use these prompts to scope and implement the missing high-impact features. Each prompt includes intent, expectations, UX, best practices, and examples of similar tools.

## 1) Managed Toolchain Installer/Upgrader (protoc/buf/plugins)
- **Goal:** Reduce setup friction by detecting/installing/upgrading protoc, buf, and protoc-gen-* plugins per workspace with version pinning.
- **Prompt:** "Implement a toolchain manager that auto-detects protoc/buf/protoc-gen-* presence and versions; surfaces a health panel; offers install/upgrade/pin actions; writes workspace settings; and validates PATH. Include support for macOS/Linux/Windows binaries, Homebrew where available, and manual path override. Show progress and errors in VS Code UI (notifications + output channel). Avoid auto-install without user consent."
- **UX best practices:** Non-blocking health check, explicit consent for installs, clear rollback/uninstall path, minimal prompts. Cache downloads. Allow offline skip.
- **Similar projects:** Rust Analyzer (rustup integration), Go extension (tool install), Pyright (venv/Python selection), Buf CLI installer scripts.

## 2) One-Click Codegen Profiles w/ Progress & Diagnostics
- **Goal:** Make stub generation first-class (not just compile). Support multi-language targets with reusable profiles.
- **Prompt:** "Add a 'Generate Code' command that loads named profiles (e.g., go, ts, java) defining out dirs, plugins, and options. Provide quick-pick to select profiles, run codegen, stream progress to UI, and pipe stderr/stdout to a dedicated output channel. Fail fast on missing plugins and offer to install them via toolchain manager. Allow per-workspace profile config (JSON) with variable substitution."
- **UX best practices:** Show long-running task progress; partial success reporting; clickable paths for generated outputs; dry-run mode.
- **Similar projects:** Nx/Angular schematics progress UI, gRPC/grpc-tools workflows, VS Code Tasks with problem matchers.

## 3) Protofmt Presets on Save (Google/Buf/Custom)
- **Goal:** Enforce consistent formatting with named presets and drift detection.
- **Prompt:** "Extend formatter to support style presets (google, buf, custom) selectable per workspace. Provide on-save formatting and a 'check-only' mode that surfaces drift as diagnostics. Allow a local config file to override defaults. Offer quick-fix to apply preset."
- **UX best practices:** Non-destructive preview before apply; clear preset names; avoid surprise edits on large files without confirmation when first enabling.
- **Similar projects:** Prettier 'config or infer', Go fmt, Buf format.

## 4) Inline Doc Hovers with Comments + Well-Known Type (WKT) Docs/Links
- **Goal:** Enrich hovers with source comments and official docs for WKTs.
- **Prompt:** "Update hover provider to include leading/trailing doc comments for symbols and link out to WKT reference pages when applicable. Merge reference counts and mini-snippets already present. Use markdown with safe links."
- **UX best practices:** Keep hover concise; fold long comments; include 'open docs' link only when WKT.
- **Similar projects:** TypeScript/Java hovers showing JSDoc/Javadoc; Rust Analyzer doc hovers; IntelliJ WKT tooltips.

## 5) Schema Evolution Diff Between Git Refs
- **Goal:** Human-friendly proto schema diff separate from breaking-checks.
- **Prompt:** "Add a command to diff schema between two git refs or files. Render a side-by-side view highlighting added/removed/changed messages/fields/options with semantic grouping (messages, enums, services). Provide quick-pick for git refs. Reuse analyzer to build symbol tables for each ref and compare."
- **UX best practices:** Clear legend for change types; link to locations; allow copy/share of report; avoid triggering full repo checkout unnecessarily.
- **Similar projects:** GitLens diff views, Prisma schema diff, Hasura migration diffs.

## 6) Request/Response Playground + Mock Server Runner (gRPC/Connect)
- **Goal:** Let users craft and run RPC requests from schema with scaffolding and optional mock server.
- **Prompt:** "Create a webview playground that lists services/RPCs, scaffolds JSON payloads from message schemas, supports unary and streaming via grpcurl/Connect, and shows responses with metadata. Offer a 'mock server' command that spins up a minimal mock based on schema defaults. Integrate with toolchain manager to ensure grpcurl or equivalent is installed."
- **UX best practices:** Keep secrets out of logs; allow per-request endpoint/metadata; show curl/grpcurl equivalent for reproducibility; handle TLS flags.
- **Similar projects:** Thunder Client/REST Client, GraphQL Playground, Postman gRPC beta, BloomRPC.

## 7) Option/Annotation Packs + Inspector UI
- **Goal:** Make common options (json_name, deprecated, gogoproto, validation) easy to discover/apply.
- **Prompt:** "Add completions and quick-fixes for common option packs (core, gogoproto, validation). Provide an 'Option Inspector' sidebar/webview that lists file/message/field/service options with edit controls and validation. Offer templates for frequently used combinations."
- **UX best practices:** Validate before writing; preview diff; avoid noisy suggestions when options already set; respect edition/syntax constraints.
- **Similar projects:** ESLint quick-fix UI, TS refactor suggestions, IntelliJ protobuf plugin option helpers.

## 8) Proto Registry Integration (e.g., Buf Schema Registry)
- **Goal:** Browse/fetch/pin remote schemas and manage dependencies from the editor.
- **Prompt:** "Integrate with Buf Schema Registry (and allow pluggable registries) to search/browse packages, view versions, and add deps to buf.yaml or workspace config. Support auth flow securely. Provide 'update dep' and 'pin version' commands with changelog links."
- **UX best practices:** Never store secrets in plaintext; show rate-limit/errors clearly; offer offline fallback; respect existing buf/work config.
- **Similar projects:** npm/pip explorers in VS Code, Docker/Container Registry extensions, Go module proxy browsing.

## 9) Oneof Exhaustiveness Checks + Switch Scaffolding
- **Goal:** Catch unhandled oneof cases and help scaffold client-side handling.
- **Prompt:** "Add diagnostics for non-exhaustive handling of oneof cases in known consumer languages (generate hints) and provide a code action to scaffold switch/case blocks for oneof variants in snippets or documentation links. Start with proto-side analysis plus guidance snippets."
- **UX best practices:** Low-noise diagnostics; language-agnostic messaging with language-specific examples; opt-out setting.
- **Similar projects:** Kotlin/Swift sealed-class exhaustiveness checks, TypeScript union exhaustiveness diagnostics.

## 10) Upgrade Assistant (proto2⇄proto3/editions) with Backcompat Recipes
- **Goal:** Guided migrations with safe defaults and clarity on risks.
- **Prompt:** "Build a command that analyzes a file/workspace and proposes a migration plan: edition/syntax changes, json_name/backwards-compatible renames, reserved ranges, optional/required handling, default values. Present a preview with per-change rationale and applyable edits. Include links to docs."
- **UX best practices:** Preview-before-apply; clear risk callouts; allow per-file application; produce a summary report; never auto-change without confirmation.
- **Similar projects:** TypeScript migration codemods, Python 2→3 tools, IntelliJ quick-fix migrations, ESLint codemods.
