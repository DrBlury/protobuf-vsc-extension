/**
 * Tests for document utilities
 */

import {
  findEnclosingMessageName,
  findEnclosingEnumName,
  findEnclosingServiceName,
  getWordAtRange,
  findEnclosingBlockType
} from '../documentUtils';

describe('documentUtils', () => {
  describe('findEnclosingMessageName', () => {
    it('should find message name when inside message', () => {
      const documentText = `syntax = "proto3";

message MyMessage {
  string name = 1;
}
`;
      const range = { start: { line: 4, character: 2 }, end: { line: 4, character: 8 } };
      const result = findEnclosingMessageName(range, documentText);
      expect(result).toBe('MyMessage');
    });

    it('should return null when outside message', () => {
      const documentText = `syntax = "proto3";

message OtherMessage {
}

message MyMessage {
}
`;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const result = findEnclosingMessageName(range, documentText);
      expect(result).toBeNull();
    });

    it('should handle nested messages', () => {
      const documentText = `message Outer {
  message Inner {
    string name = 1;
  }
}
`;
      const range = { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } };
      const result = findEnclosingMessageName(range, documentText);
      expect(result).toBe('Inner');
    });

    it('should handle empty lines', () => {
      const documentText = `message MyMessage {

  string name = 1;
}
`;
      const range = { start: { line: 3, character: 2 }, end: { line: 3, character: 8 } };
      const result = findEnclosingMessageName(range, documentText);
      expect(result).toBe('MyMessage');
    });

    it('should handle brace tracking', () => {
      const documentText = `message Outer {
  string field = 1;
}
message MyMessage {
  string name = 1;
}
`;
      const range = { start: { line: 5, character: 2 }, end: { line: 5, character: 8 } };
      const result = findEnclosingMessageName(range, documentText);
      expect(result).toBe('MyMessage');
    });

    it('should return null for empty document', () => {
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      const result = findEnclosingMessageName(range, '');
      expect(result).toBeNull();
    });
  });

  describe('findEnclosingEnumName', () => {
    it('should find enum name when inside enum', () => {
      const documentText = `message MyMessage {
  enum MyEnum {
    OPTION_UNSPECIFIED = 0;
  }
}
`;
      const range = { start: { line: 3, character: 2 }, end: { line: 3, character: 10 } };
      const result = findEnclosingEnumName(range, documentText);
      expect(result).toBe('MyEnum');
    });

    it('should return null when outside enum', () => {
      const documentText = `syntax = "proto3";

enum MyEnum {
  B = 1;
}
`;
      // Line 0 is the syntax line, clearly outside any enum
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const result = findEnclosingEnumName(range, documentText);
      expect(result).toBeNull();
    });

    it('should handle nested enums in messages', () => {
      const documentText = `message MyMessage {
  enum Status {
    PENDING = 0;
    DONE = 1;
  }
  Status status = 1;
}
`;
      const range = { start: { line: 5, character: 2 }, end: { line: 5, character: 10 } };
      const result = findEnclosingEnumName(range, documentText);
      expect(result).toBe('Status');
    });
  });

  describe('findEnclosingServiceName', () => {
    it('should find service name when inside service', () => {
      const documentText = `service MyService {
  rpc Method(Request) returns (Response);
}
`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } };
      const result = findEnclosingServiceName(range, documentText);
      expect(result).toBe('MyService');
    });

    it('should return null when outside service', () => {
      const documentText = `message MyMessage {
  string name = 1;
}

service MyService {
  rpc Method(Request) returns (Response);
}
`;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const result = findEnclosingServiceName(range, documentText);
      expect(result).toBeNull();
    });

    it('should handle multiple services', () => {
      const documentText = `service FirstService {
  rpc Method1(Request) returns (Response);
}

service SecondService {
  rpc Method2(Request) returns (Response);
}
`;
      const range = { start: { line: 5, character: 2 }, end: { line: 5, character: 10 } };
      const result = findEnclosingServiceName(range, documentText);
      expect(result).toBe('SecondService');
    });

    it('should handle services with streaming', () => {
      const documentText = `service StreamService {
  rpc Method(stream Request) returns (stream Response);
}
`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } };
      const result = findEnclosingServiceName(range, documentText);
      expect(result).toBe('StreamService');
    });

    it('should return null for empty document', () => {
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      const result = findEnclosingServiceName(range, '');
      expect(result).toBeNull();
    });
  });

  describe('getWordAtRange', () => {
    it('should extract word at range', () => {
      const documentText = `message MyMessage {
  string name = 1;
}`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } };
      const result = getWordAtRange(documentText, range);
      expect(result).toBe('string');
    });

    it('should return null for out of bounds line', () => {
      const documentText = `message MyMessage {}`;
      const range = { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } };
      const result = getWordAtRange(documentText, range);
      expect(result).toBeNull();
    });

    it('should handle single character', () => {
      const documentText = `message MyMessage {}`;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
      const result = getWordAtRange(documentText, range);
      expect(result).toBe('m');
    });

    it('should handle empty range', () => {
      const documentText = `message MyMessage {}`;
      const range = { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } };
      const result = getWordAtRange(documentText, range);
      // Empty substring returns null (not empty string)
      expect(result).toBeNull();
    });
  });

  describe('findEnclosingBlockType', () => {
    it('should return message when inside message', () => {
      const documentText = `message MyMessage {
  string name = 1;
}`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('message');
    });

    it('should return enum when inside enum', () => {
      const documentText = `enum MyEnum {
  OPTION = 0;
}`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('enum');
    });

    it('should return service when inside service', () => {
      const documentText = `service MyService {
  rpc Method(Request) returns (Response);
}`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('service');
    });

    it('should return oneof when inside oneof', () => {
      const documentText = `message MyMessage {
  oneof MyOneof {
    string option_a = 1;
    int32 option_b = 2;
  }
}`;
      const range = { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('oneof');
    });

    it('should return extend when inside extend block', () => {
      const documentText = `extend MyMessage {
  MyExtension extension = 100;
}`;
      const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('extend');
    });

    it('should return null when not in any block', () => {
      const documentText = `syntax = "proto3";

message MyMessage {}
`;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBeNull();
    });

    it('should prefer inner block when nested', () => {
      const documentText = `message Outer {
  message Inner {
    string field = 1;
  }
}`;
      const range = { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } };
      const result = findEnclosingBlockType(range, documentText);
      // The function finds the first matching block type walking backwards
      // At line 2, it finds Inner message first
      expect(result).toBe('message');
    });

    it('should return null for empty document', () => {
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      const result = findEnclosingBlockType(range, '');
      expect(result).toBeNull();
    });

    it('should handle empty lines', () => {
      const documentText = `message MyMessage {

  string name = 1;
}`;
      const range = { start: { line: 3, character: 2 }, end: { line: 3, character: 8 } };
      const result = findEnclosingBlockType(range, documentText);
      expect(result).toBe('message');
    });
  });
});
