# Implementation Prompt for Google API Support

Use this prompt with Claude or another AI assistant to implement Google API support features.

---

## Context

You are working on a Protocol Buffers VS Code extension (`protobuf-vsc-extension`). The extension already has comprehensive support for:
- CEL/protovalidate (buf.validate) with completions, snippets, and syntax highlighting
- gRPC services with code generation
- Extensive snippet library (60+ snippets)
- Language Server Protocol implementation

The codebase structure:
- `src/server/providers/completion.ts` - Completion provider (similar pattern to CEL)
- `src/server/providers/hover.ts` - Hover information provider
- `snippets/proto.json` - Snippet definitions
- `syntaxes/proto.tmLanguage.json` - Syntax highlighting
- `docs/` - Documentation files

## Task: Add Google API Support

Implement comprehensive support for Google API patterns, following the same pattern as the existing CEL/protovalidate integration. Add the following features:

---

## Feature 1: Google API HTTP Annotations (HIGHEST PRIORITY)

### Requirements

1. **Completions for `(google.api.http)` option on RPCs**
   - When user types `option (google.api.http)` or `(google.api.http)`, provide completions
   - Support all HTTP methods: `get`, `post`, `put`, `delete`, `patch`, `custom`
   - Provide path template suggestions
   - Support `body` field for POST/PUT/PATCH
   - Support `additional_bindings` for multiple HTTP mappings

2. **Context-aware completions**
   - Detect when inside `(google.api.http) = { ... }` block
   - Provide field completions: `get`, `post`, `put`, `delete`, `patch`, `custom`, `body`, `additional_bindings`
   - For `custom`, provide `kind` and `path` sub-fields
   - For paths, suggest common patterns like `/v1/{resource_name}`

3. **Snippets**
   - `httpget` - GET request with path variable
   - `httppost` - POST request with body
   - `httpput` - PUT request with body
   - `httpdelete` - DELETE request
   - `httppatch` - PATCH request with body
   - `httpcustom` - Custom HTTP pattern

4. **Syntax highlighting**
   - Highlight `google.api.http` option
   - Highlight HTTP method keywords (`get`, `post`, etc.)
   - Highlight path templates and variables

### Implementation Pattern

Follow the pattern in `src/server/providers/completion.ts`:
- Add method `getGoogleApiHttpCompletions()` similar to `getCelCompletions()`
- Add method `getGoogleApiHttpContext()` to detect HTTP annotation context
- Add to `getOptionCompletions()` method
- Add snippets to `snippets/proto.json`
- Add syntax highlighting to `syntaxes/proto.tmLanguage.json`

### Example Code Structure

```typescript
// In completion.ts
private getGoogleApiHttpCompletions(beforeCursor: string): CompletionItem[] {
  // Check if inside (google.api.http) = { ... }
  if (this.isInsideGoogleApiHttpBlock(beforeCursor)) {
    return [
      {
        label: 'get',
        kind: CompletionItemKind.Property,
        detail: 'HTTP GET method',
        documentation: 'Maps to HTTP GET request',
        insertText: 'get: "/v1/${1:resource}/{${2:id}}"',
        insertTextFormat: InsertTextFormat.Snippet
      },
      // ... other HTTP methods
    ];
  }

  // Check if typing (google.api.http)
  if (beforeCursor.match(/\(google\.api\.http\)/)) {
    return [/* option completions */];
  }

  return [];
}
```

### Expected Usage

```proto
rpc GetUser(GetUserRequest) returns (GetUserResponse) {
  option (google.api.http) = {
    get: "/v1/users/{user_id}"  // ← Completions here
  };
}

rpc CreateUser(CreateUserRequest) returns (CreateUserResponse) {
  option (google.api.http) = {
    post: "/v1/users"
    body: "user"  // ← Completions here
  };
}
```

---

## Feature 2: Field Behavior Annotations

### Requirements

1. **Completions for `(google.api.field_behavior)` on fields**
   - When user types `[(google.api.field_behavior)` on a field, provide completions
   - Support all field behaviors: `REQUIRED`, `OUTPUT_ONLY`, `INPUT_ONLY`, `IMMUTABLE`, `OPTIONAL`
   - Provide snippets for common patterns

2. **Snippets**
   - `frequired` - Field with REQUIRED behavior
   - `foutputonly` - Field with OUTPUT_ONLY behavior
   - `fimmutable` - Field with IMMUTABLE behavior
   - `finputonly` - Field with INPUT_ONLY behavior

3. **Context detection**
   - Detect field option context: `field_name = 1 [(google.api.field_behavior)`
   - Provide enum value completions

### Implementation Pattern

Similar to buf.validate field options:
- Add method `getGoogleApiFieldBehaviorCompletions()`
- Detect context in field option blocks
- Add enum value completions for FieldBehavior enum

### Expected Usage

```proto
message User {
  string id = 1 [(google.api.field_behavior) = OUTPUT_ONLY];  // ← Completions
  string name = 2 [(google.api.field_behavior) = REQUIRED];
  string email = 3 [(google.api.field_behavior) = IMMUTABLE];
}
```

---

## Feature 3: Resource Name Patterns

### Requirements

1. **Completions for `(google.api.resource)` on messages**
   - When user types `option (google.api.resource)` on a message, provide completions
   - Support fields: `type`, `pattern`, `name_field`, `plural`, `singular`, `history`
   - Provide suggestions for common resource patterns

2. **Snippets**
   - `resource` - Complete resource descriptor
   - `resourcepattern` - Resource with pattern

3. **Resource reference completions**
   - For fields typed as resource references, suggest `(google.api.resource_reference)` option

### Expected Usage

```proto
message User {
  option (google.api.resource) = {
    type: "example.googleapis.com/User"
    pattern: "users/{user}"
    name_field: "id"
  };
  string id = 1;
}

message Order {
  string user_id = 1 [(google.api.resource_reference) = {
    type: "example.googleapis.com/User"  // ← Completions
  }];
}
```

---

## Feature 4: Field Mask Support

### Requirements

1. **Completions for `google.protobuf.FieldMask` fields**
   - When user types `google.protobuf.FieldMask`, provide field name suggestions
   - Suggest common field names: `update_mask`, `field_mask`
   - Provide snippets for update request patterns

2. **Snippets**
   - `fupdatemask` - Update request with FieldMask
   - `msgupdate` - Complete update request message pattern

3. **Field path suggestions**
   - When completing FieldMask values, suggest field paths from the related message

### Expected Usage

```proto
message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2;  // ← Field name suggestions
}

// Field mask paths: "name", "email", "address.street", etc.
```

---

## Feature 5: Enhanced Well-Known Types

### Requirements

1. **Enhanced hover documentation**
   - Add detailed documentation for well-known types
   - Include usage examples
   - Link to official documentation

2. **Field name suggestions**
   - For `google.protobuf.Timestamp`: suggest `created_at`, `updated_at`, `deleted_at`, `timestamp`
   - For `google.protobuf.Duration`: suggest `duration`, `timeout`, `ttl`
   - For `google.protobuf.FieldMask`: suggest `update_mask`, `field_mask`

3. **Usage pattern snippets**
   - Expand existing snippets with more patterns
   - Add common combinations

### Implementation

Enhance `src/server/providers/hover.ts` and `src/server/providers/completion.ts`:
- Add detailed hover docs for well-known types
- Enhance field name suggestions based on type
- Add more snippets for common patterns

---

## Implementation Checklist

### Phase 1: HTTP Annotations
- [ ] Add `getGoogleApiHttpCompletions()` method
- [ ] Add `getGoogleApiHttpContext()` method
- [ ] Add HTTP method completions (get, post, put, delete, patch, custom)
- [ ] Add path template suggestions
- [ ] Add body field completions
- [ ] Add snippets for HTTP methods
- [ ] Add syntax highlighting for HTTP annotations
- [ ] Add tests for HTTP completions
- [ ] Update documentation

### Phase 2: Field Behaviors
- [ ] Add `getGoogleApiFieldBehaviorCompletions()` method
- [ ] Add field behavior enum completions
- [ ] Add snippets for field behaviors
- [ ] Add syntax highlighting
- [ ] Add tests
- [ ] Update documentation

### Phase 3: Resource Names & Field Masks
- [ ] Add resource option completions
- [ ] Add resource reference completions
- [ ] Add FieldMask field suggestions
- [ ] Add update request snippets
- [ ] Add syntax highlighting
- [ ] Add tests
- [ ] Update documentation

### Phase 4: Well-Known Types Enhancement
- [ ] Enhance hover docs for well-known types
- [ ] Add field name suggestions based on type
- [ ] Expand snippets
- [ ] Update documentation

---

## Testing Requirements

1. **Unit Tests**
   - Test completion provider methods
   - Test context detection
   - Test snippet expansion

2. **Integration Tests**
   - Test completions in real proto files
   - Test syntax highlighting
   - Test hover information

3. **Edge Cases**
   - Nested options
   - Multiple options on same field/RPC
   - Invalid syntax handling

---

## Documentation Requirements

1. **Create `docs/google-api.md`**
   - Overview of Google API support
   - Usage examples for each feature
   - Common patterns
   - Best practices

2. **Update `docs/completions.md`**
   - Add Google API completions section
   - Document HTTP annotation completions
   - Document field behavior completions

3. **Update `docs/snippets.md`**
   - Add Google API snippets section
   - Document all new snippets

4. **Update `docs/FEATURES.md`**
   - Add Google API support to features list

---

## Code Style & Patterns

1. **Follow existing patterns**
   - Use same structure as CEL completions
   - Use same naming conventions
   - Use same documentation style

2. **Error handling**
   - Gracefully handle invalid contexts
   - Provide helpful error messages
   - Don't break on malformed input

3. **Performance**
   - Cache completion results where possible
   - Avoid expensive operations in completion provider
   - Use efficient context detection

---

## Success Criteria

The implementation is complete when:

1. ✅ Users can get completions for `(google.api.http)` options
2. ✅ Users can get completions for `(google.api.field_behavior)` options
3. ✅ Users can get completions for `(google.api.resource)` options
4. ✅ Users can get FieldMask field suggestions
5. ✅ All snippets work correctly
6. ✅ Syntax highlighting works for all new patterns
7. ✅ Documentation is complete
8. ✅ Tests pass
9. ✅ No regressions in existing functionality

---

## Reference Files

Key files to reference:
- `src/server/providers/completion.ts` - See CEL completion implementation (lines ~1200-1400)
- `src/server/providers/hover.ts` - See hover implementation
- `snippets/proto.json` - See snippet format
- `syntaxes/proto.tmLanguage.json` - See syntax highlighting patterns
- `docs/completions.md` - See documentation format

---

## Additional Notes

- The extension uses TypeScript
- Language Server Protocol (LSP) is used for communication
- VS Code API is used on the client side
- All changes should be backward compatible
- Follow the existing code style and patterns
- Add comprehensive comments explaining complex logic
- Ensure all new code is properly typed

---

## Questions to Consider

1. How should we handle multiple HTTP bindings?
2. Should we validate HTTP path syntax?
3. How to suggest field paths for FieldMask?
4. Should we provide resource type completions from workspace?
5. How to handle well-known types that aren't imported?

---

## Start Implementation

Begin with Feature 1 (HTTP Annotations) as it has the highest impact. Follow the existing CEL integration pattern closely. Test thoroughly before moving to the next feature.

Good luck! 🚀
