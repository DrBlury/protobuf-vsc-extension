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
`,

  // google.rpc
  'google/rpc/code.proto': `syntax = "proto3";
package google.rpc;
enum Code {
  OK = 0;
  CANCELLED = 1;
  UNKNOWN = 2;
  INVALID_ARGUMENT = 3;
  DEADLINE_EXCEEDED = 4;
  NOT_FOUND = 5;
  ALREADY_EXISTS = 6;
  PERMISSION_DENIED = 7;
  RESOURCE_EXHAUSTED = 8;
  FAILED_PRECONDITION = 9;
  ABORTED = 10;
  OUT_OF_RANGE = 11;
  UNIMPLEMENTED = 12;
  INTERNAL = 13;
  UNAVAILABLE = 14;
  DATA_LOSS = 15;
  UNAUTHENTICATED = 16;
}
`,
  'google/rpc/status.proto': `syntax = "proto3";
package google.rpc;
import "google/protobuf/any.proto";
message Status {
  int32 code = 1;
  string message = 2;
  repeated google.protobuf.Any details = 3;
}
`,
  'google/rpc/error_details.proto': `syntax = "proto3";
package google.rpc;
import "google/protobuf/duration.proto";
message RetryInfo {
  google.protobuf.Duration retry_delay = 1;
}
message DebugInfo {
  repeated string stack_entries = 1;
  string detail = 2;
}
message QuotaFailure {
  message Violation {
    string subject = 1;
    string description = 2;
  }
  repeated Violation violations = 1;
}
message ErrorInfo {
  string reason = 1;
  string domain = 2;
  map<string, string> metadata = 3;
}
message PreconditionFailure {
  message Violation {
    string type = 1;
    string subject = 2;
    string description = 3;
  }
  repeated Violation violations = 1;
}
message BadRequest {
  message FieldViolation {
    string field = 1;
    string description = 2;
  }
  repeated FieldViolation field_violations = 1;
}
message RequestInfo {
  string request_id = 1;
  string serving_data = 2;
}
message ResourceInfo {
  string resource_type = 1;
  string resource_name = 2;
  string owner = 3;
  string description = 4;
}
message Help {
  message Link {
    string description = 1;
    string url = 2;
  }
  repeated Link links = 1;
}
message LocalizedMessage {
  string locale = 1;
  string message = 2;
}
`,

  // google.type
  'google/type/date.proto': `syntax = "proto3";
package google.type;
message Date {
  int32 year = 1;
  int32 month = 2;
  int32 day = 3;
}
`,
  'google/type/timeofday.proto': `syntax = "proto3";
package google.type;
message TimeOfDay {
  int32 hours = 1;
  int32 minutes = 2;
  int32 seconds = 3;
  int32 nanos = 4;
}
`,
  'google/type/datetime.proto': `syntax = "proto3";
package google.type;
message TimeZone {
  string id = 1;
  int32 version = 2;
}
message DateTime {
  int32 year = 1;
  int32 month = 2;
  int32 day = 3;
  int32 hours = 4;
  int32 minutes = 5;
  int32 seconds = 6;
  int32 nanos = 7;
  oneof time_offset {
    int32 utc_offset = 8;
    TimeZone time_zone = 9;
  }
}
`,
  'google/type/latlng.proto': `syntax = "proto3";
package google.type;
message LatLng {
  double latitude = 1;
  double longitude = 2;
}
`,
  'google/type/money.proto': `syntax = "proto3";
package google.type;
message Money {
  string currency_code = 1;
  int64 units = 2;
  int32 nanos = 3;
}
`,
  'google/type/color.proto': `syntax = "proto3";
package google.type;
message Color {
  float red = 1;
  float green = 2;
  float blue = 3;
  float alpha = 4;
}
`,
  'google/type/postal_address.proto': `syntax = "proto3";
package google.type;
message PostalAddress {
  string region_code = 1;
  string language_code = 2;
  string postal_code = 3;
  string administrative_area = 4;
  string locality = 5;
  string sublocality = 6;
  repeated string address_lines = 7;
  repeated string recipients = 8;
  string organization = 9;
}
`,
  'google/type/phone_number.proto': `syntax = "proto3";
package google.type;
message PhoneNumber {
  string e164_number = 1;
  string extension = 2;
}
`,
  'google/type/localized_text.proto': `syntax = "proto3";
package google.type;
message LocalizedText {
  string text = 1;
  string language_code = 2;
}
`,
  'google/type/expr.proto': `syntax = "proto3";
package google.type;
message Expr {
  string expression = 1;
  string title = 2;
  string description = 3;
  string location = 4;
}
`,

  // google.api
  'google/api/http.proto': `syntax = "proto3";
package google.api;
message Http {
  repeated HttpRule rules = 1;
  bool fully_decode_reserved_expansion = 2;
}
message HttpRule {
  string selector = 1;
  string get = 2;
  string put = 3;
  string post = 4;
  string delete = 5;
  string patch = 6;
  CustomHttpPattern custom = 8;
  repeated HttpRule additional_bindings = 11;
}
message CustomHttpPattern {
  string kind = 1;
  string path = 2;
}
`,
  'google/api/annotations.proto': `syntax = "proto3";
package google.api;
// Placeholder for option definitions; kept minimal for tooling.
`,
  'google/api/field_behavior.proto': `syntax = "proto3";
package google.api;
enum FieldBehavior {
  FIELD_BEHAVIOR_UNSPECIFIED = 0;
  OPTIONAL = 1;
  REQUIRED = 2;
  OUTPUT_ONLY = 3;
  INPUT_ONLY = 4;
  IMMUTABLE = 5;
}
`,
  'google/api/resource.proto': `syntax = "proto3";
package google.api;
message ResourceDescriptor {
  string type = 1;
  repeated string pattern = 2;
  string name_field = 3;
  string history = 4;
  repeated string plural = 5;
  string singular = 6;
}
message ResourceReference {
  string type = 1;
  string child_type = 2;
}
`,
  'google/api/client.proto': `syntax = "proto3";
package google.api;
enum ClientLibraryOrganization {
  CLIENT_LIBRARY_ORGANIZATION_UNSPECIFIED = 0;
  GOOGLE = 1;
  CLOUD = 2;
}
enum ClientLibraryDestination {
  CLIENT_LIBRARY_DESTINATION_UNSPECIFIED = 0;
  GITHUB = 10;
  PACKAGE_MANAGER = 20;
}
message CommonLanguageSettings {
  string reference_docs_uri = 1;
  repeated string destinations = 2;
}
`,
  'google/api/launch_stage.proto': `syntax = "proto3";
package google.api;
enum LaunchStage {
  LAUNCH_STAGE_UNSPECIFIED = 0;
  UNIMPLEMENTED = 6;
  PRELAUNCH = 7;
  EARLY_ACCESS = 1;
  ALPHA = 2;
  BETA = 3;
  GA = 4;
  DEPRECATED = 5;
}
`,
  'google/api/visibility.proto': `syntax = "proto3";
package google.api;
message VisibilityRule {
  string selector = 1;
  string restriction = 2;
}
message Visibility {
  repeated VisibilityRule rules = 1;
}
`,

  // google.longrunning
  'google/longrunning/operations.proto': `syntax = "proto3";
package google.longrunning;
import "google/protobuf/any.proto";
import "google/rpc/status.proto";
message Operation {
  string name = 1;
  google.protobuf.Any metadata = 2;
  bool done = 3;
  google.rpc.Status error = 4;
  google.protobuf.Any response = 5;
}
`,

  // google.logging
  'google/logging/type/http_request.proto': `syntax = "proto3";
package google.logging.type;
message HttpRequest {
  string request_method = 1;
  string request_url = 2;
  int64 status = 3;
  int64 response_size = 4;
  string user_agent = 5;
  string remote_ip = 6;
  string referer = 7;
  bool cache_hit = 8;
  bool cache_validated_with_origin_server = 9;
}
`,
  'google/logging/type/log_severity.proto': `syntax = "proto3";
package google.logging.type;
enum LogSeverity {
  DEFAULT = 0;
  DEBUG = 100;
  INFO = 200;
  NOTICE = 300;
  WARNING = 400;
  ERROR = 500;
  CRITICAL = 600;
  ALERT = 700;
  EMERGENCY = 800;
}
`,

  // google.cloud.audit
  'google/cloud/audit/audit_log.proto': `syntax = "proto3";
package google.cloud.audit;
import "google/rpc/status.proto";
message AuditLog {
  string service_name = 7;
  string method_name = 8;
  string resource_name = 11;
  string principal_subject = 13;
  google.rpc.Status status = 2;
}
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
