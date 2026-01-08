/**
 * Minimal Google well-known proto definitions.
 * Used to satisfy imports like google/protobuf/timestamp.proto without
 * requiring external files on disk.
 */

export const GOOGLE_WELL_KNOWN_PROTOS: Record<string, string> = {
  'google/protobuf/descriptor.proto': `syntax = "proto2";
package google.protobuf;

message FileDescriptorSet {
  repeated FileDescriptorProto file = 1;
}

message FileDescriptorProto {
  optional string name = 1;
  optional string package = 2;
  repeated string dependency = 3;
  repeated int32 public_dependency = 10;
  repeated int32 weak_dependency = 11;
  repeated DescriptorProto message_type = 4;
  repeated EnumDescriptorProto enum_type = 5;
  repeated ServiceDescriptorProto service = 6;
  repeated FieldDescriptorProto extension = 7;
  optional FileOptions options = 8;
  optional SourceCodeInfo source_code_info = 9;
  optional string syntax = 12;
  optional Edition edition = 14;
}

message DescriptorProto {
  optional string name = 1;
  repeated FieldDescriptorProto field = 2;
  repeated FieldDescriptorProto extension = 6;
  repeated DescriptorProto nested_type = 3;
  repeated EnumDescriptorProto enum_type = 4;
  repeated ExtensionRange extension_range = 5;
  repeated OneofDescriptorProto oneof_decl = 8;
  optional MessageOptions options = 7;
  repeated ReservedRange reserved_range = 9;
  repeated string reserved_name = 10;

  message ExtensionRange {
    optional int32 start = 1;
    optional int32 end = 2;
    optional ExtensionRangeOptions options = 3;
  }

  message ReservedRange {
    optional int32 start = 1;
    optional int32 end = 2;
  }
}

message ExtensionRangeOptions {
  repeated UninterpretedOption uninterpreted_option = 999;
  repeated Declaration declaration = 2;
  optional FeatureSet features = 50;
  enum VerificationState {
    DECLARATION = 0;
    UNVERIFIED = 1;
  }
  optional VerificationState verification = 3 [default = UNVERIFIED];

  message Declaration {
    optional int32 number = 1;
    optional string full_name = 2;
    optional string type = 3;
    optional bool reserved = 5;
    optional bool repeated = 6;
  }
}

message FieldDescriptorProto {
  enum Type {
    TYPE_DOUBLE = 1;
    TYPE_FLOAT = 2;
    TYPE_INT64 = 3;
    TYPE_UINT64 = 4;
    TYPE_INT32 = 5;
    TYPE_FIXED64 = 6;
    TYPE_FIXED32 = 7;
    TYPE_BOOL = 8;
    TYPE_STRING = 9;
    TYPE_GROUP = 10;
    TYPE_MESSAGE = 11;
    TYPE_BYTES = 12;
    TYPE_UINT32 = 13;
    TYPE_ENUM = 14;
    TYPE_SFIXED32 = 15;
    TYPE_SFIXED64 = 16;
    TYPE_SINT32 = 17;
    TYPE_SINT64 = 18;
  }

  enum Label {
    LABEL_OPTIONAL = 1;
    LABEL_REQUIRED = 2;
    LABEL_REPEATED = 3;
  }

  optional string name = 1;
  optional int32 number = 3;
  optional Label label = 4;
  optional Type type = 5;
  optional string type_name = 6;
  optional string extendee = 2;
  optional string default_value = 7;
  optional int32 oneof_index = 9;
  optional string json_name = 10;
  optional FieldOptions options = 8;
  optional bool proto3_optional = 17;
}

message OneofDescriptorProto {
  optional string name = 1;
  optional OneofOptions options = 2;
}

message EnumDescriptorProto {
  optional string name = 1;
  repeated EnumValueDescriptorProto value = 2;
  optional EnumOptions options = 3;
  repeated EnumReservedRange reserved_range = 4;
  repeated string reserved_name = 5;

  message EnumReservedRange {
    optional int32 start = 1;
    optional int32 end = 2;
  }
}

message EnumValueDescriptorProto {
  optional string name = 1;
  optional int32 number = 2;
  optional EnumValueOptions options = 3;
}

message ServiceDescriptorProto {
  optional string name = 1;
  repeated MethodDescriptorProto method = 2;
  optional ServiceOptions options = 3;
}

message MethodDescriptorProto {
  optional string name = 1;
  optional string input_type = 2;
  optional string output_type = 3;
  optional MethodOptions options = 4;
  optional bool client_streaming = 5 [default = false];
  optional bool server_streaming = 6 [default = false];
}

enum Edition {
  EDITION_UNKNOWN = 0;
  EDITION_PROTO2 = 998;
  EDITION_PROTO3 = 999;
  EDITION_2023 = 1000;
  EDITION_2024 = 1001;
  EDITION_1_TEST_ONLY = 1;
  EDITION_2_TEST_ONLY = 2;
  EDITION_99997_TEST_ONLY = 99997;
  EDITION_99998_TEST_ONLY = 99998;
  EDITION_99999_TEST_ONLY = 99999;
  EDITION_MAX = 2147483647;
}

message FileOptions {
  optional string java_package = 1;
  optional string java_outer_classname = 8;
  optional bool java_multiple_files = 10 [default = false];
  optional bool java_generate_equals_and_hash = 20 [deprecated = true];
  optional bool java_string_check_utf8 = 27 [default = false];
  enum OptimizeMode {
    SPEED = 1;
    CODE_SIZE = 2;
    LITE_RUNTIME = 3;
  }
  optional OptimizeMode optimize_for = 9 [default = SPEED];
  optional string go_package = 11;
  optional bool cc_generic_services = 16 [default = false];
  optional bool java_generic_services = 17 [default = false];
  optional bool py_generic_services = 18 [default = false];
  optional bool deprecated = 23 [default = false];
  optional bool cc_enable_arenas = 31 [default = true];
  optional string objc_class_prefix = 36;
  optional string csharp_namespace = 37;
  optional string swift_prefix = 39;
  optional string php_class_prefix = 40;
  optional string php_namespace = 41;
  optional string php_metadata_namespace = 44;
  optional string ruby_package = 45;
  optional FeatureSet features = 50;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message MessageOptions {
  optional bool message_set_wire_format = 1 [default = false];
  optional bool no_standard_descriptor_accessor = 2 [default = false];
  optional bool deprecated = 3 [default = false];
  optional bool map_entry = 7;
  optional bool deprecated_legacy_json_field_conflicts = 11 [deprecated = true];
  optional FeatureSet features = 12;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message FieldOptions {
  enum CType {
    STRING = 0;
    CORD = 1;
    STRING_PIECE = 2;
  }
  optional CType ctype = 1 [default = STRING];
  optional bool packed = 2;
  enum JSType {
    JS_NORMAL = 0;
    JS_STRING = 1;
    JS_NUMBER = 2;
  }
  optional JSType jstype = 6 [default = JS_NORMAL];
  optional bool lazy = 5 [default = false];
  optional bool unverified_lazy = 15 [default = false];
  optional bool deprecated = 3 [default = false];
  optional bool weak = 10 [default = false];
  optional bool debug_redact = 16 [default = false];
  enum OptionRetention {
    RETENTION_UNKNOWN = 0;
    RETENTION_RUNTIME = 1;
    RETENTION_SOURCE = 2;
  }
  optional OptionRetention retention = 17;
  enum OptionTargetType {
    TARGET_TYPE_UNKNOWN = 0;
    TARGET_TYPE_FILE = 1;
    TARGET_TYPE_EXTENSION_RANGE = 2;
    TARGET_TYPE_MESSAGE = 3;
    TARGET_TYPE_FIELD = 4;
    TARGET_TYPE_ONEOF = 5;
    TARGET_TYPE_ENUM = 6;
    TARGET_TYPE_ENUM_ENTRY = 7;
    TARGET_TYPE_SERVICE = 8;
    TARGET_TYPE_METHOD = 9;
  }
  repeated OptionTargetType targets = 19;
  repeated EditionDefault edition_defaults = 20;
  optional FeatureSet features = 21;
  optional FeatureSupport feature_support = 22;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;

  message EditionDefault {
    optional Edition edition = 3;
    optional string value = 2;
  }

  message FeatureSupport {
    optional Edition edition_introduced = 1;
    optional Edition edition_deprecated = 2;
    optional string deprecation_warning = 3;
    optional Edition edition_removed = 4;
  }
}

message OneofOptions {
  optional FeatureSet features = 1;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message EnumOptions {
  optional bool allow_alias = 2;
  optional bool deprecated = 3 [default = false];
  optional bool deprecated_legacy_json_field_conflicts = 6 [deprecated = true];
  optional FeatureSet features = 7;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message EnumValueOptions {
  optional bool deprecated = 1 [default = false];
  optional FeatureSet features = 2;
  optional bool debug_redact = 3 [default = false];
  optional FieldOptions.FeatureSupport feature_support = 4;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message ServiceOptions {
  optional FeatureSet features = 34;
  optional bool deprecated = 33 [default = false];
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message MethodOptions {
  optional bool deprecated = 33 [default = false];
  enum IdempotencyLevel {
    IDEMPOTENCY_UNKNOWN = 0;
    NO_SIDE_EFFECTS = 1;
    IDEMPOTENT = 2;
  }
  optional IdempotencyLevel idempotency_level = 34 [default = IDEMPOTENCY_UNKNOWN];
  optional FeatureSet features = 35;
  repeated UninterpretedOption uninterpreted_option = 999;
  extensions 1000 to max;
}

message UninterpretedOption {
  message NamePart {
    required string name_part = 1;
    required bool is_extension = 2;
  }
  repeated NamePart name = 2;
  optional string identifier_value = 3;
  optional uint64 positive_int_value = 4;
  optional int64 negative_int_value = 5;
  optional double double_value = 6;
  optional bytes string_value = 7;
  optional string aggregate_value = 8;
}

message FeatureSet {
  enum FieldPresence {
    FIELD_PRESENCE_UNKNOWN = 0;
    EXPLICIT = 1;
    IMPLICIT = 2;
    LEGACY_REQUIRED = 3;
  }
  optional FieldPresence field_presence = 1;
  enum EnumType {
    ENUM_TYPE_UNKNOWN = 0;
    OPEN = 1;
    CLOSED = 2;
  }
  optional EnumType enum_type = 2;
  enum RepeatedFieldEncoding {
    REPEATED_FIELD_ENCODING_UNKNOWN = 0;
    PACKED = 1;
    EXPANDED = 2;
  }
  optional RepeatedFieldEncoding repeated_field_encoding = 3;
  enum Utf8Validation {
    UTF8_VALIDATION_UNKNOWN = 0;
    VERIFY = 2;
    NONE = 3;
  }
  optional Utf8Validation utf8_validation = 4;
  enum MessageEncoding {
    MESSAGE_ENCODING_UNKNOWN = 0;
    LENGTH_PREFIXED = 1;
    DELIMITED = 2;
  }
  optional MessageEncoding message_encoding = 5;
  enum JsonFormat {
    JSON_FORMAT_UNKNOWN = 0;
    ALLOW = 1;
    LEGACY_BEST_EFFORT = 2;
  }
  optional JsonFormat json_format = 6;
  extensions 1000 to 9994;
  extensions 9995 to 9999;
  extensions 10000;
}

message FeatureSetDefaults {
  message FeatureSetEditionDefault {
    optional Edition edition = 3;
    optional FeatureSet overridable_features = 4;
    optional FeatureSet fixed_features = 5;
  }
  repeated FeatureSetEditionDefault defaults = 1;
  optional Edition minimum_edition = 4;
  optional Edition maximum_edition = 5;
}

message SourceCodeInfo {
  repeated Location location = 1;
  message Location {
    repeated int32 path = 1 [packed = true];
    repeated int32 span = 2 [packed = true];
    optional string leading_comments = 3;
    optional string trailing_comments = 4;
    repeated string leading_detached_comments = 6;
  }
}

message GeneratedCodeInfo {
  repeated Annotation annotation = 1;
  message Annotation {
    repeated int32 path = 1 [packed = true];
    optional string source_file = 2;
    optional int32 begin = 3;
    optional int32 end = 4;
    enum Semantic {
      NONE = 0;
      SET = 1;
      ALIAS = 2;
    }
    optional Semantic semantic = 5;
  }
}
`,
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
`,
};

// File locations within the packaged extension (resources/google-protos)
export const GOOGLE_WELL_KNOWN_FILES: Record<string, string> = {
  'google/protobuf/any.proto': 'google-protos/google/protobuf/any.proto',
  'google/protobuf/timestamp.proto': 'google-protos/google/protobuf/timestamp.proto',
  'google/protobuf/duration.proto': 'google-protos/google/protobuf/duration.proto',
  'google/protobuf/empty.proto': 'google-protos/google/protobuf/empty.proto',
  'google/protobuf/field_mask.proto': 'google-protos/google/protobuf/field_mask.proto',
  'google/protobuf/struct.proto': 'google-protos/google/protobuf/struct.proto',
  'google/protobuf/wrappers.proto': 'google-protos/google/protobuf/wrappers.proto',
};
