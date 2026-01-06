# Product Roadmap

This roadmap outlines the future direction of the **Protobuf VSC** extension, prioritized based on user impact and development cost.

> **Note:** This roadmap is a living document and subject to change based on user feedback and community contributions.

---

## 2026 Q1: The "Core Utility" Update
**Focus:** High-impact tools that leverage the IDE environment to solve difficult workflows.

- [x] **Binary Data Inspector (`.pb` / `.bin` Viewer)**  *(High Priority)*
  - **Goal:** Allow users to open binary protobuf files and automatically decode them into readable JSON/Text using the workspace's schema.
  - **Status:** Basic `protoc --decode_raw` support implemented. Next: Schema-aware decoding.
  - **Why:** Debugging wire-format data is currently painful; this makes it seamless.

- [ ] **Advanced gRPC Client**
  - **Goal:** Upgrade the playground to a full-featured gRPC client.
  - **Features:**
    - Support for **Streaming RPCs** (Server, Client, Bidirectional).
    - **Request Collections:** Save and organize requests (compatible with Postman/Insomnia).
    - **Environment Variables:** Manage endpoints and metadata per environment (dev, staging, prod).
  - **Why:** Users currently switch to external tools for complex gRPC tasks.

---

## 2026 Q2: The "Intelligence" Update
**Focus:** Advanced validation and AI integration.

- [ ] **Protovalidate (CEL) Playground**
  - **Goal:** Interactive split-view editor for testing [Protovalidate](https://github.com/bufbuild/protovalidate) rules.
  - **Features:** Write CEL rules on the left, input JSON on the right, see real-time validation pass/fail.
  - **Why:** CEL expressions are brittle to write; instant feedback drastically improves productivity.

- [ ] **AI-Powered Assistance**
  - **JSON to Proto:** Paste a JSON object to generate the matching Proto message structure.
  - **Natural Language Generators:** "Create a User service with CRUD methods" -> Generates code.
  - **Schema Explanation:** Context-aware explanation of complex message structures.

---

## 2026 Q3: The "Enterprise" Update
**Focus:** Cloud registries and massive scale.

- [ ] **Remote Registry Browsing (Buf)**
  - **Goal:** Native "FileSystemProvider" to browse `buf.build` repositories.
  - **Features:** Read-only access to remote proto files without manual downloading/exporting.
  - **Why:** Solves "dependency hell" for large teams using the BSR.

- [ ] **Monorepo Performance Optimization**
  - **Goal:** Support "Google-scale" repositories (10,000+ files).
  - **Features:** Smarter partial loading, background indexing, and potential native worker offloading.
  - **Why:** Essential for adoption in large corporate environments.

---

## 2026 Q4: Architecture & Web
**Focus:** Platform independence and stability.

- [ ] **Virtual File System (VFS) Support**
  - Support for **VS Code Web** (github.dev) and fully remote environments.
  - Remove dependencies on local `fs` module in favor of VS Code's abstract filesystem.

- [ ] **LSP Extraction**
  - Decouple the Language Server logic to a standalone binary.
  - Enable support for Neovim, Emacs, and Zed.

---

## Backlog / Future Ideas

- **Visual Schema Builder:** Drag-and-drop GUI for editing `.proto` files.
- **Proto-to-SQL Mapping:** Visual tools to map Proto messages to Database schemas.
- **Traffic Sniffing:** Local proxy to intercept and inspect gRPC traffic.
- **Live Documentation:** Real-time HTML documentation preview (markdown-style) for proto files.

---

## How to contribute
Check the [Issues](https://github.com/DrBlury/protobuf-vsc-extension/issues) tab to see active development. If you want to tackle one of these roadmap items, please open a Discussion first!
