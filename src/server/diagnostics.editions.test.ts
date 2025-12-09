/**
 * Tests for Protobuf Editions diagnostics
 * Validates that 'optional' and 'required' modifiers are flagged in editions files
 */

import { DiagnosticsProvider } from './providers/diagnostics';
import { SemanticAnalyzer } from './core/analyzer';
import { ProtoParser } from './core/parser';
import { ERROR_CODES } from './utils/constants';

describe('DiagnosticsProvider editions validation', () => {
  let parser: ProtoParser;
  let analyzer: SemanticAnalyzer;
  let diagnosticsProvider: DiagnosticsProvider;

  beforeEach(() => {
    parser = new ProtoParser();
    analyzer = new SemanticAnalyzer();
    diagnosticsProvider = new DiagnosticsProvider(analyzer);
  });

  describe('optional modifier in editions', () => {
    it('should report error for optional field in edition 2023', () => {
      const content = `
edition = "2023";

message Person {
  optional string name = 1;
  int32 age = 2;
}
`;
      const file = parser.parse(content, 'test://editions.proto');
      analyzer.updateFile('test://editions.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions.proto', file, content);
      
      const optionalDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );
      
      expect(optionalDiag).toBeDefined();
      expect(optionalDiag?.message).toContain("'optional' label is not allowed in editions");
      expect(optionalDiag?.message).toContain('features.field_presence = EXPLICIT');
    });

    it('should report error for optional field in edition 2024', () => {
      const content = `
edition = "2024";

message Person {
  optional string name = 1;
}
`;
      const file = parser.parse(content, 'test://editions2024.proto');
      analyzer.updateFile('test://editions2024.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions2024.proto', file, content);
      
      const optionalDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );
      
      expect(optionalDiag).toBeDefined();
    });

    it('should not report error for optional field in proto3', () => {
      const content = `
syntax = "proto3";

message Person {
  optional string name = 1;
  int32 age = 2;
}
`;
      const file = parser.parse(content, 'test://proto3.proto');
      analyzer.updateFile('test://proto3.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://proto3.proto', file, content);
      
      const optionalDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );
      
      expect(optionalDiag).toBeUndefined();
    });

    it('should not report error for repeated field in editions', () => {
      const content = `
edition = "2023";

message Person {
  repeated string tags = 1;
}
`;
      const file = parser.parse(content, 'test://editions-repeated.proto');
      analyzer.updateFile('test://editions-repeated.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions-repeated.proto', file, content);
      
      const optionalDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );
      
      expect(optionalDiag).toBeUndefined();
    });
  });

  describe('required modifier in editions', () => {
    it('should report error for required field in editions', () => {
      const content = `
edition = "2023";

message Person {
  required string name = 1;
}
`;
      const file = parser.parse(content, 'test://editions-required.proto');
      analyzer.updateFile('test://editions-required.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions-required.proto', file, content);
      
      const requiredDiag = diagnostics.find(d => 
        d.message.includes("'required' label is not allowed in editions")
      );
      
      expect(requiredDiag).toBeDefined();
      expect(requiredDiag?.message).toContain('features.field_presence = LEGACY_REQUIRED');
    });
  });

  describe('nested messages in editions', () => {
    it('should report error for optional field in nested message', () => {
      const content = `
edition = "2023";

message Outer {
  message Inner {
    optional string value = 1;
  }
  Inner inner = 1;
}
`;
      const file = parser.parse(content, 'test://editions-nested.proto');
      analyzer.updateFile('test://editions-nested.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions-nested.proto', file, content);
      
      const optionalDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );
      
      expect(optionalDiag).toBeDefined();
    });
  });

  describe('fields without modifier in editions', () => {
    it('should not report error for fields without modifier', () => {
      const content = `
edition = "2023";

message Person {
  string name = 1;
  int32 age = 2;
}
`;
      const file = parser.parse(content, 'test://editions-no-modifier.proto');
      analyzer.updateFile('test://editions-no-modifier.proto', file);
      
      const diagnostics = diagnosticsProvider.validate('test://editions-no-modifier.proto', file, content);
      
      const modifierDiag = diagnostics.find(d => 
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED ||
        d.message.includes("'required' label is not allowed")
      );
      
      expect(modifierDiag).toBeUndefined();
    });
  });
});
