/**
 * Constants for Protocol Buffers Language Server
 * Centralized location for all magic numbers, ranges, and configuration values
 */

/**
 * Field number constraints
 */
export const FIELD_NUMBER = {
  /** Minimum valid field number */
  MIN: 1,
  /** Maximum valid field number (2^29 - 1) */
  MAX: 536870911,
  /** Internal reserved range start */
  RESERVED_RANGE_START: 19000,
  /** Internal reserved range end */
  RESERVED_RANGE_END: 19999
} as const;

/**
 * Debug port for language server
 */
export const DEBUG_PORT = 6009;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  /** Default indentation size in spaces */
  INDENT_SIZE: 2,
  /** Default maximum line length */
  MAX_LINE_LENGTH: 120,
  /** Default starting field number for renumbering */
  RENUMBER_START: 1,
  /** Default increment for field renumbering */
  RENUMBER_INCREMENT: 1,
  /** Default protoc path */
  PROTOC_PATH: 'protoc',
  /** Default buf path */
  BUF_PATH: 'buf',
  /** Default protolint path */
  PROTOLINT_PATH: 'protolint',
  /** Default api-linter path */
  API_LINTER_PATH: 'api-linter',
  /** Default clang-format path */
  CLANG_FORMAT_PATH: 'clang-format',
  /** Default clang-format style */
  CLANG_FORMAT_STYLE: 'file',
  /** Default clang-format fallback style */
  CLANG_FORMAT_FALLBACK_STYLE: 'Google',
  /** Default breaking change detection git reference */
  BREAKING_GIT_REF: 'HEAD~1'
} as const;

/**
 * Performance and timing constants
 */
export const TIMING = {
  /** Default debounce delay for document validation (ms) */
  VALIDATION_DEBOUNCE_MS: 300,
  /** Default cache TTL (ms) - not currently used but available */
  CACHE_TTL_MS: 5 * 60 * 1000 // 5 minutes
} as const;

/**
 * Default positions and ranges
 */
export const DEFAULT_POSITIONS = {
  /** Default start line for error diagnostics */
  ERROR_START_LINE: 0,
  /** Default start character for error diagnostics */
  ERROR_START_CHAR: 0,
  /** Default end character for error diagnostics */
  ERROR_END_CHAR: 1
} as const;

/**
 * Common protoc include paths (platform-specific)
 */
export const PROTOC_INCLUDE_PATHS = [
  '/usr/local/include',
  '/opt/homebrew/include',
  '/usr/include',
  'C:/Program Files/protobuf/include',
  'C:/Program Files (x86)/protobuf/include',
  'C:/ProgramData/chocolatey/lib/protobuf/tools/include'
] as const;

/**
 * Google well-known proto test file
 */
export const GOOGLE_WELL_KNOWN_TEST_FILE = 'google/protobuf/timestamp.proto';

/**
 * Diagnostic error codes
 */
export const ERROR_CODES = {
  // Syntax and Edition (100-199)
  MISSING_SYNTAX: 'PROTO100',
  INVALID_SYNTAX: 'PROTO101',
  MISSING_EDITION: 'PROTO102',
  INVALID_EDITION: 'PROTO103',
  PACKAGE_PATH_MISMATCH: 'PROTO104',
  FEATURES_WITHOUT_EDITION: 'PROTO105',
  CONFLICTING_SYNTAX_EDITION: 'PROTO106',

  // Type and Reference Errors (200-299)
  UNDEFINED_TYPE: 'PROTO200',
  MISSING_IMPORT: 'PROTO201',
  INVALID_IMPORT_PATH: 'PROTO202',
  CIRCULAR_DEPENDENCY: 'PROTO203',
  UNUSED_IMPORT: 'PROTO204',
  MISSING_BUF_DEPENDENCY: 'PROTO205',
  UNQUALIFIED_TYPE: 'PROTO206',

  // Naming Conventions (300-399)
  INVALID_MESSAGE_NAME: 'PROTO300',
  INVALID_ENUM_NAME: 'PROTO301',
  INVALID_FIELD_NAME: 'PROTO302',
  INVALID_ENUM_VALUE_NAME: 'PROTO303',
  INVALID_SERVICE_NAME: 'PROTO304',
  INVALID_RPC_NAME: 'PROTO305',

  // Field Validation (400-499)
  DUPLICATE_FIELD_NUMBER: 'PROTO400',
  DUPLICATE_FIELD_NAME: 'PROTO401',
  FIELD_NUMBER_OUT_OF_RANGE: 'PROTO402',
  FIELD_NUMBER_IN_RESERVED_RANGE: 'PROTO403',
  FIELD_NUMBER_RESERVED: 'PROTO404',
  FIELD_NUMBER_GAP: 'PROTO405',
  FIELD_NUMBER_OUT_OF_ORDER: 'PROTO406',
  INVALID_MAP_KEY_TYPE: 'PROTO407',
  INVALID_FIELD_MODIFIER: 'PROTO408',
  EDITIONS_OPTIONAL_NOT_ALLOWED: 'PROTO409',

  // Enum Validation (500-599)
  DUPLICATE_ENUM_VALUE: 'PROTO500',
  DUPLICATE_ENUM_VALUE_NUMBER: 'PROTO501',
  ENUM_VALUE_OUT_OF_RANGE: 'PROTO502',

  // Service Validation (600-699)
  DUPLICATE_RPC_NAME: 'PROTO600',
  INVALID_RPC_TYPE: 'PROTO601',

  // Advanced Validation (700-799)
  DEPRECATED_USAGE: 'PROTO700',
  UNUSED_SYMBOL: 'PROTO701',
  MISSING_DOCUMENTATION: 'PROTO702',
  DISCOURAGED_CONSTRUCT: 'PROTO703',
  PROTO3_FIELD_PRESENCE: 'PROTO704',

  // Parse Errors (800-899)
  PARSE_ERROR: 'PROTO800',
  INVALID_TOKEN: 'PROTO801',
  UNEXPECTED_TOKEN: 'PROTO802',
  MISSING_TOKEN: 'PROTO803',

  // Option Validation (900-999)
  INVALID_OPTION: 'PROTO900',
  INVALID_OPTION_TYPE: 'PROTO901',
  UNKNOWN_OPTION: 'PROTO902'
} as const;

/**
 * Diagnostic severity levels
 */
export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFORMATION: 'information',
  HINT: 'hint'
} as const;

/**
 * File extensions
 */
export const FILE_EXTENSIONS = {
  PROTO: '.proto',
  TEXTPROTO: '.textproto',
  PBTXT: '.pbtxt',
  PROTOTXT: '.prototxt',
  TXTPB: '.txtpb',
  TEXTPB: '.textpb',
  PB_TXT: '.pb.txt'
} as const;

/**
 * Language identifiers
 */
export const LANGUAGE_IDS = {
  PROTO: 'proto',
  TEXTPROTO: 'textproto'
} as const;

/**
 * Common validation messages
 */
export const VALIDATION_MESSAGES = {
  NO_PROTO_FILE: 'Please open a .proto file first',
  NO_WORKSPACE: 'No workspace folder open',
  LINTER_NOT_CONFIGURED: 'No lint rules available. Make sure buf or protolint is configured.',
  NO_IMPORTS_FOUND: 'No imports found in this file',
  NO_MESSAGES_FOUND: 'No messages found in this file',
  NO_ENUMS_FOUND: 'No enums found in this file',
  NO_FIELDS_TO_RENUMBER: 'No fields to renumber',
  NO_VALUES_TO_RENUMBER: 'No values to renumber',
  NO_FIELDS_FROM_POSITION: 'No fields to renumber from this position',
  NO_REFERENCES: 'No proto file available to find references.',
  IMPORT_NOT_RESOLVED: (importPath: string) => `Import "${importPath}" is not resolved.`,
  CLIENT_NOT_READY: 'Language client is not ready yet.'
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  COMPILED_SUCCESSFULLY: 'Proto file compiled successfully',
  COMPILED_ALL: (count: number) => `Compiled ${count} proto file(s) successfully`,
  NO_BREAKING_CHANGES: 'No breaking changes detected',
  LINTER_PASSED: 'Linter passed with no issues',
  LINTER_FOUND_ISSUES: (count: number) => `Linter found ${count} issue(s)`,
  RENUMBERED_FIELDS: (count: number) => `Renumbered ${count} field(s)`,
  RENUMBERED_MESSAGE_FIELDS: (count: number, messageName: string) =>
    `Renumbered ${count} field(s) in '${messageName}'`,
  RENUMBERED_ENUM_VALUES: (count: number, enumName: string) =>
    `Renumbered ${count} value(s) in '${enumName}'`
} as const;

/**
 * Error message templates
 */
export const ERROR_MESSAGES = {
  FAILED_TO_LIST_IMPORTS: 'Failed to list imports',
  COMPILATION_FAILED: 'Compilation failed',
  COMPILATION_ERROR: 'Compilation error',
  LINTER_ERROR: 'Linter error',
  ERROR_CHECKING_BREAKING_CHANGES: 'Error checking breaking changes',
  ERROR_GETTING_LINT_RULES: 'Error getting lint rules',
  UNKNOWN_ERROR: 'Unknown error'
} as const;

/**
 * Request method names for custom LSP requests
 */
export const REQUEST_METHODS = {
  GET_SCHEMA_GRAPH: 'protobuf/getSchemaGraph',
  LIST_IMPORTS: 'protobuf/listImports',
  RENUMBER_DOCUMENT: 'protobuf/renumberDocument',
  RENUMBER_MESSAGE: 'protobuf/renumberMessage',
  RENUMBER_FROM_POSITION: 'protobuf/renumberFromPosition',
  RENUMBER_ENUM: 'protobuf/renumberEnum',
  GET_MESSAGES: 'protobuf/getMessages',
  GET_ENUMS: 'protobuf/getEnums',
  GET_MESSAGE_AT_POSITION: 'protobuf/getMessageAtPosition',
  GET_NEXT_FIELD_NUMBER: 'protobuf/getNextFieldNumber',
  COMPILE_FILE: 'protobuf/compileFile',
  COMPILE_ALL: 'protobuf/compileAll',
  VALIDATE_FILE: 'protobuf/validateFile',
  IS_PROTOC_AVAILABLE: 'protobuf/isProtocAvailable',
  GET_PROTOC_VERSION: 'protobuf/getProtocVersion',
  RUN_EXTERNAL_LINTER: 'protobuf/runExternalLinter',
  RUN_EXTERNAL_LINTER_WORKSPACE: 'protobuf/runExternalLinterWorkspace',
  IS_EXTERNAL_LINTER_AVAILABLE: 'protobuf/isExternalLinterAvailable',
  GET_AVAILABLE_LINT_RULES: 'protobuf/getAvailableLintRules',
  CHECK_BREAKING_CHANGES: 'protobuf/checkBreakingChanges',
  GET_ALL_OPTIONS: 'protobuf/getAllOptions',
  MIGRATE_TO_PROTO3: 'protobuf/migrateToProto3',
  GET_GRPC_SERVICES: 'protobuf/getGrpcServices',
  GET_GRPC_SERVICE: 'protobuf/getGrpcService',
  GET_GRPC_RPC: 'protobuf/getGrpcRpc',
  GET_GRPC_RPCS_USING_TYPE: 'protobuf/getGrpcRpcsUsingType',
  GENERATE_GRPC_CLIENT_STUB: 'protobuf/generateGrpcClientStub',
  GENERATE_GRPC_SERVER_TEMPLATE: 'protobuf/generateGrpcServerTemplate',
  GET_GRPC_SERVICE_STATS: 'protobuf/getGrpcServiceStats',
  GET_DOCUMENTATION: 'protobuf/getDocumentation'
} as const;

/**
 * Diagnostic source identifier
 */
export const DIAGNOSTIC_SOURCE = 'protobuf' as const;

/**
 * Output channel name
 */
export const OUTPUT_CHANNEL_NAME = 'Protobuf VSC' as const;

/**
 * Language server identifiers
 */
export const SERVER_IDS = {
  LANGUAGE_SERVER: 'protobufLanguageServer',
  LANGUAGE_SERVER_NAME: 'Protobuf Language Server'
} as const;
