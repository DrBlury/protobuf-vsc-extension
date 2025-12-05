/**
 * Minimal Google well-known proto definitions.
 * Used to satisfy imports like google/protobuf/timestamp.proto without
 * requiring external files on disk.
 */

export const GOOGLE_WELL_KNOWN_PROTOS: Record<string, string> = {
  'google/protobuf/any.proto': `syntax = "proto3";
package google.protobuf;
message Any {
  string type_url = 1;
  bytes value = 2;
}
`,
  'google/protobuf/timestamp.proto': `syntax = "proto3";
package google.protobuf;
message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}
`,
  'google/protobuf/duration.proto': `syntax = "proto3";
package google.protobuf;
message Duration {
  int64 seconds = 1;
  int32 nanos = 2;
}
`,
  'google/protobuf/empty.proto': `syntax = "proto3";
package google.protobuf;
message Empty {}
`,
  'google/protobuf/field_mask.proto': `syntax = "proto3";
package google.protobuf;
message FieldMask {
  repeated string paths = 1;
}
`,
  'google/protobuf/struct.proto': `syntax = "proto3";
package google.protobuf;
enum NullValue {
  NULL_VALUE = 0;
}
message Struct {
  map<string, Value> fields = 1;
}
message Value {
  oneof kind {
    NullValue null_value = 1;
    double number_value = 2;
    string string_value = 3;
    bool bool_value = 4;
    Struct struct_value = 5;
    ListValue list_value = 6;
  }
}
message ListValue {
  repeated Value values = 1;
}
`,
  'google/protobuf/wrappers.proto': `syntax = "proto3";
package google.protobuf;
message DoubleValue { double value = 1; }
message FloatValue { float value = 1; }
message Int64Value { int64 value = 1; }
message UInt64Value { uint64 value = 1; }
message Int32Value { int32 value = 1; }
message UInt32Value { uint32 value = 1; }
message BoolValue { bool value = 1; }
message StringValue { string value = 1; }
message BytesValue { bytes value = 1; }
`
};

// File locations within the packaged extension (resources/google-protos)
export const GOOGLE_WELL_KNOWN_FILES: Record<string, string> = {
  'google/protobuf/any.proto': 'google-protos/google/protobuf/any.proto',
  'google/protobuf/timestamp.proto': 'google-protos/google/protobuf/timestamp.proto',
  'google/protobuf/duration.proto': 'google-protos/google/protobuf/duration.proto',
  'google/protobuf/empty.proto': 'google-protos/google/protobuf/empty.proto',
  'google/protobuf/field_mask.proto': 'google-protos/google/protobuf/field_mask.proto',
  'google/protobuf/struct.proto': 'google-protos/google/protobuf/struct.proto',
  'google/protobuf/wrappers.proto': 'google-protos/google/protobuf/wrappers.proto'
};
