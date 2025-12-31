/**
 * Additional branch coverage tests for renumberFields function
 * Targets uncovered lines: 92, 111-130, 137-139, 161-163, 168-172, 221, 247-248, 262
 */

import { renumberFields } from '../../formatter/renumber';
import { FormatterSettings } from '../../formatter/types';

describe('renumberFields branch coverage', () => {
  const defaultSettings: FormatterSettings = {
    indentSize: 2,
    useTabIndent: false,
    renumberIncrement: 1,
    renumberStartNumber: 1,
  };

  describe('multi-line inline options with braces (lines 80-104)', () => {
    it('should handle field with inline option containing multi-line braces', () => {
      const text = `message Test {
  string name = 5 [(validate.field) = {
    some_option: true
  }];
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('= 1');
    });

    it('should skip reserved range in inline options (line 92)', () => {
      // Start at 19000 to hit the reserved range
      const settings: FormatterSettings = {
        indentSize: 2,
        useTabIndent: false,
        renumberIncrement: 1,
        renumberStartNumber: 19000,
      };
      const text = `message Test {
  string name = 5 [(validate.field) = {
    some_option: true
  }];
}`;
      const result = renumberFields(text, settings);
      // Should skip 19000-19999 and go to 20000
      expect(result).toContain('= 20000');
    });

    it('should handle inline options in oneof context', () => {
      const text = `message Test {
  oneof choice {
    string name = 5 [(validate.field) = {
      some_option: true
    }];
  }
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('= 1');
    });
  });

  describe('multi-line field declarations (lines 110-140)', () => {
    it('should handle field declaration split across lines', () => {
      const text = `message Test {
  string name =
    5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('1;');
    });

    it('should handle multi-line field with comment on equals line', () => {
      const text = `message Test {
  string very_long_field_name = // comment
    5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('1;');
    });

    it('should skip reserved range in multi-line field (line 118-119)', () => {
      const settings: FormatterSettings = {
        indentSize: 2,
        useTabIndent: false,
        renumberIncrement: 1,
        renumberStartNumber: 19000,
      };
      const text = `message Test {
  string name =
    5;
}`;
      const result = renumberFields(text, settings);
      // Should skip reserved range and use 20000
      expect(result).toContain('20000');
    });

    it('should handle multi-line field in oneof context', () => {
      const text = `message Test {
  oneof choice {
    string name =
      5;
  }
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('1;');
    });
  });

  describe('service context (lines 160-163)', () => {
    it('should handle service declarations without renumbering', () => {
      const text = `service MyService {
  rpc GetData (Request) returns (Response);
}`;
      const result = renumberFields(text, defaultSettings);
      // Service RPCs don't have field numbers
      expect(result).toContain('rpc GetData');
    });

    it('should handle service mixed with messages', () => {
      const text = `message Request {
  string query = 5;
}
service MyService {
  rpc GetData (Request) returns (Response);
}
message Response {
  string data = 10;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('query = 1');
      expect(result).toContain('data = 1');
    });
  });

  describe('nested message/enum in context (lines 167-173)', () => {
    it('should handle nested message inside another message', () => {
      const text = `message Outer {
  string outer_field = 5;
  message Inner {
    string inner_field = 10;
  }
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('outer_field = 1');
      expect(result).toContain('inner_field = 1');
    });

    it('should handle nested enum inside a message', () => {
      const text = `message Outer {
  string outer_field = 5;
  enum Status {
    UNKNOWN = 5;
    ACTIVE = 10;
  }
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('outer_field = 1');
      // Enums keep their values in renumberFields
      expect(result).toContain('UNKNOWN = 5');
    });
  });

  describe('enum comment handling (line 216-222)', () => {
    it('should handle enum value with single-line comment', () => {
      const text = `enum Status {
  UNKNOWN = 0; // default value
  ACTIVE = 1; // active state
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('UNKNOWN = 0;');
      expect(result).toContain('// default value');
    });

    it('should handle enum value with block comment', () => {
      const text = `enum Status {
  UNKNOWN = 0; /* default */
  ACTIVE = 1;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('UNKNOWN = 0;');
      expect(result).toContain('/* default */');
    });

    it('should handle enum value with both comment types', () => {
      const text = `enum Status {
  UNKNOWN = 0; /* block */ // line
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('UNKNOWN = 0;');
    });
  });

  describe('enum value fallback (lines 247-248)', () => {
    it('should pass through enum lines without = number pattern', () => {
      const text = `enum Status {
  option allow_alias = true;
  UNKNOWN = 0;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('option allow_alias = true');
    });

    it('should handle empty enum', () => {
      const text = `enum Status {
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('enum Status');
    });
  });

  describe('reserved range skip in regular fields (line 261-263)', () => {
    it('should skip reserved range 19000-19999 for regular fields', () => {
      const settings: FormatterSettings = {
        indentSize: 2,
        useTabIndent: false,
        renumberIncrement: 1,
        renumberStartNumber: 19000,
      };
      const text = `message Test {
  string name = 1;
  int32 id = 2;
}`;
      const result = renumberFields(text, settings);
      // Both fields should be renumbered to 20000 and 20001
      expect(result).toContain('name = 20000');
      expect(result).toContain('id = 20001');
    });
  });

  describe('multi-line option blocks', () => {
    it('should handle multi-line option block', () => {
      const text = `message Test {
  option (my_option) = {
    key: "value"
    nested: {
      inner: true
    }
  };
  string name = 5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('name = 1');
    });

    it('should track brace depth across multiple lines', () => {
      const text = `message Test {
  option (cel) = {
    level1: {
      level2: {
        deep: true
      }
    }
  };
  string name = 10;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('name = 1');
    });
  });

  describe('inline option brace tracking', () => {
    it('should track inline option continuation lines', () => {
      const text = `message Test {
  string name = 5 [(validate) = {
    rule: "test"
  }];
  int32 id = 10;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('name = 1');
      expect(result).toContain('id = 2');
    });
  });

  describe('oneof counter sharing', () => {
    it('should share field counter between oneof and parent message', () => {
      const text = `message Test {
  string before = 5;
  oneof choice {
    string option_a = 10;
    int32 option_b = 15;
  }
  string after = 20;
}`;
      const result = renumberFields(text, defaultSettings);
      // Fields should be numbered sequentially: 1, 2, 3, 4
      expect(result).toContain('before = 1');
      expect(result).toContain('option_a = 2');
      expect(result).toContain('option_b = 3');
      expect(result).toContain('after = 4');
    });
  });

  describe('closing brace handling', () => {
    it('should handle closing brace with additional content', () => {
      const text = `message Test {
  string name = 5;
}; // end of message`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('name = 1');
    });
  });

  describe('skip patterns', () => {
    it('should skip reserved lines', () => {
      const text = `message Test {
  reserved 1, 2, 3;
  string name = 5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('reserved 1, 2, 3');
      expect(result).toContain('name = 1');
    });

    it('should skip rpc lines', () => {
      const text = `service MyService {
  rpc GetData (Request) returns (Response) {}
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('rpc GetData');
    });

    it('should skip single-line comments', () => {
      const text = `message Test {
  // This is a comment
  string name = 5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('// This is a comment');
      expect(result).toContain('name = 1');
    });

    it('should skip block comments', () => {
      const text = `message Test {
  /* Block comment */
  string name = 5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('/* Block comment */');
      expect(result).toContain('name = 1');
    });

    it('should skip option with parenthesis', () => {
      const text = `message Test {
  option(my_option) = true;
  string name = 5;
}`;
      const result = renumberFields(text, defaultSettings);
      expect(result).toContain('option(my_option)');
      expect(result).toContain('name = 1');
    });
  });

  describe('increment settings', () => {
    it('should use custom increment value', () => {
      const settings: FormatterSettings = {
        indentSize: 2,
        useTabIndent: false,
        renumberIncrement: 10,
        renumberStartNumber: 1,
      };
      const text = `message Test {
  string name = 1;
  int32 id = 2;
  bool active = 3;
}`;
      const result = renumberFields(text, settings);
      expect(result).toContain('name = 1');
      expect(result).toContain('id = 11');
      expect(result).toContain('active = 21');
    });
  });
});
