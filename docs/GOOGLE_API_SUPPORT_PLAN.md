# Google API Support - 80/20 Coverage Plan

This document outlines high-impact Google API patterns that would provide 80% of the value with 20% of the effort, similar to the protovalidate/CEL addition.

## Priority Features (High Impact)

### 1. Google API HTTP Annotations ⭐⭐⭐⭐⭐
**Impact:** CRITICAL - Used by almost everyone doing REST/gRPC-Web

**What to add:**
- Completions for `(google.api.http)` option on RPCs
- Snippets for common HTTP patterns (GET, POST, PUT, DELETE, PATCH)
- Validation of HTTP path patterns
- Field path variable completion

**Usage:**
```proto
rpc GetUser(GetUserRequest) returns (GetUserResponse) {
  option (google.api.http) = {
    get: "/v1/users/{user_id}"
  };
}
```

**Benefits:**
- Most common pattern for REST APIs
- Saves significant typing time
- Prevents common errors

---

### 2. Field Behavior Annotations ⭐⭐⭐⭐⭐
**Impact:** CRITICAL - Very commonly used for API documentation

**What to add:**
- Completions for `(google.api.field_behavior)` on fields
- Common behaviors: REQUIRED, OUTPUT_ONLY, INPUT_ONLY, IMMUTABLE
- Snippets for common patterns

**Usage:**
```proto
string id = 1 [(google.api.field_behavior) = OUTPUT_ONLY];
string name = 2 [(google.api.field_behavior) = REQUIRED];
```

**Benefits:**
- Standard way to document field semantics
- Used by API generators
- Improves API clarity

---

### 3. Resource Name Patterns ⭐⭐⭐⭐
**Impact:** HIGH - Common in Google-style APIs

**What to add:**
- Completions for `(google.api.resource)` on messages
- Resource type and pattern suggestions
- Resource reference completions

**Usage:**
```proto
message User {
  option (google.api.resource) = {
    type: "example.googleapis.com/User"
    pattern: "users/{user}"
    name_field: "id"
  };
  string id = 1;
}
```

**Benefits:**
- Standard resource naming
- Better API organization
- Tooling integration

---

### 4. Field Mask Support ⭐⭐⭐⭐
**Impact:** HIGH - Very common for update operations

**What to add:**
- Completions for `google.protobuf.FieldMask` fields
- Snippets for update request patterns
- Field path suggestions

**Usage:**
```proto
message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2;
}
```

**Benefits:**
- Standard update pattern
- Prevents errors in field paths
- Better API design

---

### 5. Method Signatures ⭐⭐⭐
**Impact:** MEDIUM-HIGH - Common for REST API simplification

**What to add:**
- Completions for `(google.api.method_signature)` on RPCs
- Signature pattern suggestions

**Usage:**
```proto
rpc GetUser(GetUserRequest) returns (GetUserResponse) {
  option (google.api.http) = {
    get: "/v1/users/{user_id}"
  };
  option (google.api.method_signature) = "user_id";
}
```

**Benefits:**
- Simplifies REST API generation
- Better client code generation

---

### 6. Well-Known Types Enhancements ⭐⭐⭐
**Impact:** MEDIUM - Expand existing support

**What to add:**
- Enhanced hover documentation for well-known types
- Field suggestions for common patterns
- Better completion context

**Types to enhance:**
- `google.protobuf.Timestamp` - Common field names
- `google.protobuf.Duration` - Usage patterns
- `google.protobuf.FieldMask` - Path patterns
- `google.rpc.Status` - Error handling

---

## Implementation Strategy

### Phase 1: HTTP Annotations (Highest Impact)
1. Add `google.api.http` option completions
2. Create snippets for common HTTP methods
3. Add path variable validation
4. Document usage patterns

### Phase 2: Field Behaviors
1. Add `google.api.field_behavior` completions
2. Create snippets for common behaviors
3. Add validation hints

### Phase 3: Resource Names & Field Masks
1. Add resource option completions
2. Add FieldMask field suggestions
3. Create update request snippets

### Phase 4: Polish & Documentation
1. Enhance well-known types
2. Add comprehensive documentation
3. Create examples

---

## Expected Coverage

With these additions, the extension would cover:

- ✅ **80%+ of REST/gRPC-Web APIs** (HTTP annotations)
- ✅ **90%+ of Google-style APIs** (Field behaviors, resources)
- ✅ **70%+ of update operations** (Field masks)
- ✅ **Common validation patterns** (Already have CEL)
- ✅ **Standard error handling** (google.rpc.Status)

---

## Comparison to CEL Addition

| Feature | Usage Frequency | Implementation Effort | Impact Score |
|---------|----------------|---------------------|--------------|
| HTTP Annotations | 90% REST APIs | Medium | ⭐⭐⭐⭐⭐ |
| Field Behaviors | 80% APIs | Low | ⭐⭐⭐⭐⭐ |
| Resource Names | 60% Google APIs | Medium | ⭐⭐⭐⭐ |
| Field Masks | 70% Update APIs | Low | ⭐⭐⭐⭐ |
| Method Signatures | 50% REST APIs | Low | ⭐⭐⭐ |

---

## Next Steps

1. **Start with HTTP Annotations** - Highest impact, medium effort
2. **Add Field Behaviors** - High impact, low effort
3. **Complete with Resources & Masks** - Good coverage, medium effort

This would give comprehensive coverage of the most commonly used Google API patterns while maintaining the 80/20 principle.
