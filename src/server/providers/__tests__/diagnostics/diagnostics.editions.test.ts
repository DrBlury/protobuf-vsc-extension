/**
 * Tests for Protobuf Editions diagnostics
 * Validates that 'optional' and 'required' modifiers are flagged in editions files
 */

import { ERROR_CODES } from '../../../utils/constants';
import { ProviderRegistry } from '../../../utils';

describe('DiagnosticsProvider editions validation', () => {
  let providers: ProviderRegistry;

  beforeEach(() => {
    providers = new ProviderRegistry();
  });

  describe('optional modifier in editions', () => {
    it('should report error for optional field in edition 2023', async () => {
      const content = `
edition = "2023";

message Person {
  optional string name = 1;
  int32 age = 2;
}
`;
      const file = providers.parser.parse(content, 'test://editions.proto');
      providers.analyzer.updateFile('test://editions.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions.proto', file, providers, content);

      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();
      expect(optionalDiag?.message).toContain("'optional' label is not allowed in editions");
      expect(optionalDiag?.message).toContain('features.field_presence = EXPLICIT');
    });

    it('should report error for optional field in edition 2024', async () => {
      const content = `
edition = "2024";

message Person {
  optional string name = 1;
}
`;
      const file = providers.parser.parse(content, 'test://editions2024.proto');
      providers.analyzer.updateFile('test://editions2024.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions2024.proto', file, providers, content);

      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();
    });

    it('should not report error for optional field in proto3', async () => {
      const content = `
syntax = "proto3";

message Person {
  optional string name = 1;
  int32 age = 2;
}
`;
      const file = providers.parser.parse(content, 'test://proto3.proto');
      providers.analyzer.updateFile('test://proto3.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://proto3.proto', file, providers, content);

      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeUndefined();
    });

    it('should not report error for repeated field in editions', async () => {
      const content = `
edition = "2023";

message Person {
  repeated string tags = 1;
}
`;
      const file = providers.parser.parse(content, 'test://editions-repeated.proto');
      providers.analyzer.updateFile('test://editions-repeated.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions-repeated.proto', file, providers, content);

      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeUndefined();
    });
  });

  describe('required modifier in editions', () => {
    it('should report error for required field in editions', async () => {
      const content = `
edition = "2023";

message Person {
  required string name = 1;
}
`;
      const file = providers.parser.parse(content, 'test://editions-required.proto');
      providers.analyzer.updateFile('test://editions-required.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions-required.proto', file, providers, content);

      const requiredDiag = diagnostics.find(d =>
        d.message.includes("'required' label is not allowed in editions")
      );

      expect(requiredDiag).toBeDefined();
      expect(requiredDiag?.message).toContain('features.field_presence = LEGACY_REQUIRED');
    });
  });

  describe('nested messages in editions', () => {
    it('should report error for optional field in nested message', async () => {
      const content = `
edition = "2023";

message Outer {
  message Inner {
    optional string value = 1;
  }
  Inner inner = 1;
}
`;
      const file = providers.parser.parse(content, 'test://editions-nested.proto');
      providers.analyzer.updateFile('test://editions-nested.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions-nested.proto', file, providers, content);

      const optionalDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED
      );

      expect(optionalDiag).toBeDefined();
    });
  });

  describe('fields without modifier in editions', () => {
    it('should not report error for fields without modifier', async () => {
      const content = `
edition = "2023";

message Person {
  string name = 1;
  int32 age = 2;
}
`;
      const file = providers.parser.parse(content, 'test://editions-no-modifier.proto');
      providers.analyzer.updateFile('test://editions-no-modifier.proto', file);

      const diagnostics = await providers.diagnostics.validate('test://editions-no-modifier.proto', file, providers, content);

      const modifierDiag = diagnostics.find(d =>
        d.code === ERROR_CODES.EDITIONS_OPTIONAL_NOT_ALLOWED ||
        d.message.includes("'required' label is not allowed")
      );

      expect(modifierDiag).toBeUndefined();
    });
  });
});
