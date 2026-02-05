/**
 * Tests for constants module
 */

import {
  FIELD_NUMBER,
  DEBUG_PORT,
  DEFAULT_CONFIG,
  TIMING,
  DEFAULT_POSITIONS,
  PROTOC_INCLUDE_PATHS,
  GOOGLE_WELL_KNOWN_TEST_FILE,
  ERROR_CODES,
  SEVERITY,
  FILE_EXTENSIONS,
  LANGUAGE_IDS,
  VALIDATION_MESSAGES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  REQUEST_METHODS,
  DIAGNOSTIC_SOURCE,
  OUTPUT_CHANNEL_NAME,
  SERVER_IDS,
} from '../constants';

describe('constants', () => {
  describe('FIELD_NUMBER', () => {
    it('should have correct minimum field number', () => {
      expect(FIELD_NUMBER.MIN).toBe(1);
    });

    it('should have correct maximum field number', () => {
      expect(FIELD_NUMBER.MAX).toBe(536870911);
    });

    it('should have correct reserved range', () => {
      expect(FIELD_NUMBER.RESERVED_RANGE_START).toBe(19000);
      expect(FIELD_NUMBER.RESERVED_RANGE_END).toBe(19999);
    });
  });

  describe('DEBUG_PORT', () => {
    it('should have correct debug port', () => {
      expect(DEBUG_PORT).toBe(6009);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have correct indent size', () => {
      expect(DEFAULT_CONFIG.INDENT_SIZE).toBe(2);
    });

    it('should have correct max line length', () => {
      expect(DEFAULT_CONFIG.MAX_LINE_LENGTH).toBe(120);
    });

    it('should have correct renumber settings', () => {
      expect(DEFAULT_CONFIG.RENUMBER_START).toBe(1);
      expect(DEFAULT_CONFIG.RENUMBER_INCREMENT).toBe(1);
    });

    it('should have correct tool paths', () => {
      expect(DEFAULT_CONFIG.PROTOC_PATH).toBe('protoc');
      expect(DEFAULT_CONFIG.BUF_PATH).toBe('buf');
      expect(DEFAULT_CONFIG.PROTOLINT_PATH).toBe('protolint');
      expect(DEFAULT_CONFIG.API_LINTER_PATH).toBe('api-linter');
      expect(DEFAULT_CONFIG.CLANG_FORMAT_PATH).toBe('clang-format');
    });

    it('should have correct clang-format settings', () => {
      expect(DEFAULT_CONFIG.CLANG_FORMAT_STYLE).toBe('file');
      expect(DEFAULT_CONFIG.CLANG_FORMAT_FALLBACK_STYLE).toBe('Google');
    });

    it('should have correct breaking git reference', () => {
      expect(DEFAULT_CONFIG.BREAKING_GIT_REF).toBe('HEAD~1');
    });
  });

  describe('TIMING', () => {
    it('should have correct validation debounce', () => {
      expect(TIMING.VALIDATION_DEBOUNCE_MS).toBe(300);
    });

    it('should have correct cache TTL', () => {
      expect(TIMING.CACHE_TTL_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('DEFAULT_POSITIONS', () => {
    it('should have correct error positions', () => {
      expect(DEFAULT_POSITIONS.ERROR_START_LINE).toBe(0);
      expect(DEFAULT_POSITIONS.ERROR_START_CHAR).toBe(0);
      expect(DEFAULT_POSITIONS.ERROR_END_CHAR).toBe(1);
    });
  });

  describe('PROTOC_INCLUDE_PATHS', () => {
    it('should contain common include paths', () => {
      expect(PROTOC_INCLUDE_PATHS).toContain('/usr/local/include');
      expect(PROTOC_INCLUDE_PATHS).toContain('/usr/include');
    });

    it('should include macOS homebrew path', () => {
      expect(PROTOC_INCLUDE_PATHS).toContain('/opt/homebrew/include');
    });

    it('should include Windows paths', () => {
      expect(PROTOC_INCLUDE_PATHS.some(p => p.includes('Program Files'))).toBe(true);
    });
  });

  describe('GOOGLE_WELL_KNOWN_TEST_FILE', () => {
    it('should be timestamp.proto', () => {
      expect(GOOGLE_WELL_KNOWN_TEST_FILE).toBe('google/protobuf/timestamp.proto');
    });
  });

  describe('ERROR_CODES', () => {
    it('should have syntax error codes', () => {
      expect(ERROR_CODES.MISSING_SYNTAX).toBe('PROTO100');
      expect(ERROR_CODES.INVALID_SYNTAX).toBe('PROTO101');
    });

    it('should have type error codes', () => {
      expect(ERROR_CODES.UNDEFINED_TYPE).toBe('PROTO200');
      expect(ERROR_CODES.MISSING_IMPORT).toBe('PROTO201');
    });

    it('should have naming error codes', () => {
      expect(ERROR_CODES.INVALID_MESSAGE_NAME).toBe('PROTO300');
      expect(ERROR_CODES.INVALID_FIELD_NAME).toBe('PROTO302');
    });

    it('should have field validation codes', () => {
      expect(ERROR_CODES.DUPLICATE_FIELD_NUMBER).toBe('PROTO400');
      expect(ERROR_CODES.FIELD_NUMBER_OUT_OF_RANGE).toBe('PROTO402');
    });

    it('should have parse error codes', () => {
      expect(ERROR_CODES.PARSE_ERROR).toBe('PROTO800');
      expect(ERROR_CODES.INVALID_TOKEN).toBe('PROTO801');
    });
  });

  describe('SEVERITY', () => {
    it('should have all severity levels', () => {
      expect(SEVERITY.ERROR).toBe('error');
      expect(SEVERITY.WARNING).toBe('warning');
      expect(SEVERITY.INFORMATION).toBe('information');
      expect(SEVERITY.HINT).toBe('hint');
    });
  });

  describe('FILE_EXTENSIONS', () => {
    it('should have proto file extension', () => {
      expect(FILE_EXTENSIONS.PROTO).toBe('.proto');
    });

    it('should have textproto file extensions', () => {
      expect(FILE_EXTENSIONS.TEXTPROTO).toBe('.textproto');
      expect(FILE_EXTENSIONS.PBTXT).toBe('.pbtxt');
      expect(FILE_EXTENSIONS.PROTOTXT).toBe('.prototxt');
    });
  });

  describe('LANGUAGE_IDS', () => {
    it('should have proto language id', () => {
      expect(LANGUAGE_IDS.PROTO).toBe('proto');
    });

    it('should have textproto language id', () => {
      expect(LANGUAGE_IDS.TEXTPROTO).toBe('textproto');
    });
  });

  describe('VALIDATION_MESSAGES', () => {
    it('should have standard messages', () => {
      expect(VALIDATION_MESSAGES.NO_PROTO_FILE).toBe('Please open a .proto file first');
      expect(VALIDATION_MESSAGES.NO_WORKSPACE).toBe('No workspace folder open');
    });

    it('should have message generator functions', () => {
      expect(VALIDATION_MESSAGES.IMPORT_NOT_RESOLVED('test.proto')).toBe('Import "test.proto" is not resolved.');
    });
  });

  describe('SUCCESS_MESSAGES', () => {
    it('should have success messages', () => {
      expect(SUCCESS_MESSAGES.COMPILED_SUCCESSFULLY).toBe('Proto file compiled successfully');
      expect(SUCCESS_MESSAGES.NO_BREAKING_CHANGES).toBe('No breaking changes detected');
    });

    it('should have message generator functions', () => {
      expect(SUCCESS_MESSAGES.COMPILED_ALL(3)).toBe('Compiled 3 proto file(s) successfully');
      expect(SUCCESS_MESSAGES.RENUMBERED_FIELDS(5)).toBe('Renumbered 5 field(s)');
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have error messages', () => {
      expect(ERROR_MESSAGES.FAILED_TO_LIST_IMPORTS).toBe('Failed to list imports');
      expect(ERROR_MESSAGES.COMPILATION_FAILED).toBe('Compilation failed');
      expect(ERROR_MESSAGES.UNKNOWN_ERROR).toBe('Unknown error');
    });
  });

  describe('REQUEST_METHODS', () => {
    it('should have schema graph method', () => {
      expect(REQUEST_METHODS.GET_SCHEMA_GRAPH).toBe('protobuf/getSchemaGraph');
    });

    it('should have renumber methods', () => {
      expect(REQUEST_METHODS.RENUMBER_DOCUMENT).toBe('protobuf/renumberDocument');
      expect(REQUEST_METHODS.RENUMBER_MESSAGE).toBe('protobuf/renumberMessage');
    });

    it('should have compilation methods', () => {
      expect(REQUEST_METHODS.COMPILE_FILE).toBe('protobuf/compileFile');
      expect(REQUEST_METHODS.COMPILE_ALL).toBe('protobuf/compileAll');
    });

    it('should have gRPC methods', () => {
      expect(REQUEST_METHODS.GET_GRPC_SERVICES).toBe('protobuf/getGrpcServices');
      expect(REQUEST_METHODS.GENERATE_GRPC_CLIENT_STUB).toBe('protobuf/generateGrpcClientStub');
    });
  });

  describe('DIAGNOSTIC_SOURCE', () => {
    it('should be protobuf', () => {
      expect(DIAGNOSTIC_SOURCE).toBe('protobuf');
    });
  });

  describe('OUTPUT_CHANNEL_NAME', () => {
    it('should be Protobuf VSC', () => {
      expect(OUTPUT_CHANNEL_NAME).toBe('Protobuf VSC');
    });
  });

  describe('SERVER_IDS', () => {
    it('should have server identifiers', () => {
      expect(SERVER_IDS.LANGUAGE_SERVER).toBe('protobufLanguageServer');
      expect(SERVER_IDS.LANGUAGE_SERVER_NAME).toBe('Protobuf Language Server');
    });
  });
});
