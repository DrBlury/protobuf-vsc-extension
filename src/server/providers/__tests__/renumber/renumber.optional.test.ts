/**
 * Tests for renumbering with optional/required/repeated field modifiers
 * Issue: 'optional' fields were being skipped because startsWith('option')
 * matched both 'option' statements and 'optional' field modifier
 */

import { renumberFields } from '../../formatter/renumber';
import { FormatterSettings } from '../../formatter/types';

describe('renumberFields with field modifiers', () => {
  const defaultSettings: FormatterSettings = {
    indentSize: 2,
    useTabIndent: false,
    insertEmptyLineBetweenDefinitions: true,
    maxEmptyLines: 1,
    renumberOnFormat: true,
    renumberStartNumber: 1,
    renumberIncrement: 1,
    preset: 'minimal',
    alignFields: false,
    preserveMultiLineFields: false,
  };

  describe('optional field modifier', () => {
    it('should renumber optional fields correctly', () => {
      const text = `syntax = "proto3";
message TestOptional {
  optional MyMessage optional_field = 1;
  MyMessage regular_field = 6;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional MyMessage optional_field = 1');
      expect(result).toContain('MyMessage regular_field = 2');
    });

    it('should handle multiple optional fields', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 5;
  optional int32 age = 10;
  optional bool active = 15;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 2');
      expect(result).toContain('optional bool active = 3');
    });

    it('should handle mixed optional and regular fields', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  int32 id = 5;
  optional bool active = 10;
  string email = 15;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('int32 id = 2');
      expect(result).toContain('optional bool active = 3');
      expect(result).toContain('string email = 4');
    });

    it('should handle optional with custom types', () => {
      const text = `syntax = "proto3";
message Test {
  optional foo.bar.CustomType field1 = 1;
  optional .absolute.Type field2 = 5;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional foo.bar.CustomType field1 = 1');
      expect(result).toContain('optional .absolute.Type field2 = 2');
    });
  });

  describe('required field modifier (proto2)', () => {
    it('should renumber required fields correctly', () => {
      const text = `syntax = "proto2";
message Test {
  required string name = 1;
  required int32 id = 5;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('required string name = 1');
      expect(result).toContain('required int32 id = 2');
    });

    it('should handle mixed required and optional fields', () => {
      const text = `syntax = "proto2";
message Test {
  required string name = 1;
  optional int32 age = 5;
  required bool active = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('required string name = 1');
      expect(result).toContain('optional int32 age = 2');
      expect(result).toContain('required bool active = 3');
    });
  });

  describe('repeated field modifier', () => {
    it('should renumber repeated fields correctly', () => {
      const text = `syntax = "proto3";
message Test {
  repeated string names = 1;
  repeated int32 ids = 5;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('repeated string names = 1');
      expect(result).toContain('repeated int32 ids = 2');
    });

    it('should handle mixed repeated and optional fields', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  repeated string tags = 5;
  optional int32 count = 10;
  repeated Item items = 15;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('repeated string tags = 2');
      expect(result).toContain('optional int32 count = 3');
      expect(result).toContain('repeated Item items = 4');
    });
  });

  describe('option statements should still be skipped', () => {
    it('should skip message-level option statements', () => {
      const text = `syntax = "proto3";
message Test {
  option deprecated = true;
  string name = 5;
  int32 id = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Option statement should be preserved unchanged
      expect(result).toContain('option deprecated = true');
      // Fields should be renumbered
      expect(result).toContain('string name = 1');
      expect(result).toContain('int32 id = 2');
    });

    it('should skip custom option statements with parentheses', () => {
      const text = `syntax = "proto3";
message Test {
  option (custom.option) = "value";
  string name = 5;
  option (another.option) = 123;
  int32 id = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Option statements should be preserved unchanged
      expect(result).toContain('option (custom.option) = "value"');
      expect(result).toContain('option (another.option) = 123');
      // Fields should be renumbered
      expect(result).toContain('string name = 1');
      expect(result).toContain('int32 id = 2');
    });

    it('should handle optional fields alongside option statements', () => {
      const text = `syntax = "proto3";
message Test {
  option deprecated = true;
  optional string name = 5;
  option (my.option) = false;
  optional int32 age = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Option statements should be preserved unchanged
      expect(result).toContain('option deprecated = true');
      expect(result).toContain('option (my.option) = false');
      // Optional fields should be renumbered
      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 2');
    });
  });

  describe('enum with option statements', () => {
    it('should skip option statements in enums', () => {
      const text = `syntax = "proto3";
enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
  ACTIVE = 5;
  INACTIVE = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Option statement should be preserved unchanged
      expect(result).toContain('option allow_alias = true');
      // Enum values should preserve existing numbers (enum renumbering behavior)
      expect(result).toContain('UNKNOWN = 0');
    });

    it('should skip custom option statements in enums', () => {
      const text = `syntax = "proto3";
enum Status {
  option (my_enum_option) = "value";
  UNKNOWN = 0;
  OK = 5;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('option (my_enum_option) = "value"');
      expect(result).toContain('UNKNOWN = 0');
    });
  });

  describe('complex scenarios', () => {
    it('should handle nested messages with optional fields', () => {
      const text = `syntax = "proto3";
message Outer {
  optional string outer_name = 5;
  message Inner {
    optional string inner_name = 10;
    int32 inner_id = 15;
  }
  optional Inner nested = 20;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Outer message fields
      expect(result).toContain('optional string outer_name = 1');
      expect(result).toContain('optional Inner nested = 2');
      // Inner message fields (renumbered independently)
      expect(result).toContain('optional string inner_name = 1');
      expect(result).toContain('int32 inner_id = 2');
    });

    it('should handle oneof with optional-like syntax', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  oneof choice {
    string option_a = 5;
    int32 option_b = 10;
  }
  optional bool active = 15;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('string option_a = 2');
      expect(result).toContain('int32 option_b = 3');
      expect(result).toContain('optional bool active = 4');
    });

    it('should handle optional fields with simple field options', () => {
      // Note: Field options containing '= <number>' may have the number modified
      // as a known limitation of the regex-based renumbering
      const text = `syntax = "proto3";
message Test {
  optional string name = 5 [deprecated = true];
  optional int32 age = 10 [json_name = "user_age"];
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 2');
      // Simple field options should be preserved
      expect(result).toContain('[deprecated = true]');
      expect(result).toContain('[json_name = "user_age"]');
    });

    it('should handle map fields with optional fields', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  map<string, int32> scores = 5;
  optional bool active = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('map<string, int32> scores = 2');
      expect(result).toContain('optional bool active = 3');
    });
  });

  describe('edge cases', () => {
    it('should handle fields named "optional" or "option"', () => {
      const text = `syntax = "proto3";
message Test {
  string option = 1;
  string optional = 5;
  optional string optionally = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      // Fields named "option" or "optional" should be renumbered
      expect(result).toContain('string option = 1');
      expect(result).toContain('string optional = 2');
      expect(result).toContain('optional string optionally = 3');
    });

    it('should handle type names starting with "option"', () => {
      const text = `syntax = "proto3";
message Test {
  OptionConfig config = 1;
  OptionalSettings settings = 5;
  optional OptionValue value = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('OptionConfig config = 1');
      expect(result).toContain('OptionalSettings settings = 2');
      expect(result).toContain('optional OptionValue value = 3');
    });

    it('should handle duplicate field numbers with optional fields', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  optional int32 age = 1;
  string email = 1;
}
`;
      const result = renumberFields(text, defaultSettings);

      // All fields should be renumbered sequentially
      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 2');
      expect(result).toContain('string email = 3');
    });

    it('should preserve comments with optional fields', () => {
      const text = `syntax = "proto3";
message Test {
  // This is a name field
  optional string name = 5;
  /* This is an age field */
  optional int32 age = 10;
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('// This is a name field');
      expect(result).toContain('optional string name = 1');
      expect(result).toContain('/* This is an age field */');
      expect(result).toContain('optional int32 age = 2');
    });

    it('should handle optional with inline comments', () => {
      const text = `syntax = "proto3";
message Test {
  optional string name = 5; // User's name
  optional int32 age = 10; // User's age
}
`;
      const result = renumberFields(text, defaultSettings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 2');
      expect(result).toContain("// User's name");
      expect(result).toContain("// User's age");
    });
  });

  describe('custom renumbering settings', () => {
    it('should respect custom start number with optional fields', () => {
      const settings = { ...defaultSettings, renumberStartNumber: 10 };
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  optional int32 age = 5;
}
`;
      const result = renumberFields(text, settings);

      expect(result).toContain('optional string name = 10');
      expect(result).toContain('optional int32 age = 11');
    });

    it('should respect custom increment with optional fields', () => {
      const settings = { ...defaultSettings, renumberIncrement: 10 };
      const text = `syntax = "proto3";
message Test {
  optional string name = 1;
  optional int32 age = 5;
  optional bool active = 10;
}
`;
      const result = renumberFields(text, settings);

      expect(result).toContain('optional string name = 1');
      expect(result).toContain('optional int32 age = 11');
      expect(result).toContain('optional bool active = 21');
    });
  });
});
