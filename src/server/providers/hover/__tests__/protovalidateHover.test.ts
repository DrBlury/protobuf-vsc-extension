/**
 * Tests for protovalidate/buf.validate hover support
 */

import {
  getProtovalidateHover,
  isValidateContext,
  VALIDATE_TYPES,
  STRING_CONSTRAINTS,
  NUMERIC_CONSTRAINTS,
  REPEATED_CONSTRAINTS,
  CEL_FIELDS,
  COMMON_CONSTRAINTS
} from '../protovalidateHover';
import type { MarkupContent } from 'vscode-languageserver';

describe('Protovalidate Hover', () => {
  describe('constants', () => {
    describe('VALIDATE_TYPES', () => {
      it('should have all expected validate types', () => {
        expect(VALIDATE_TYPES.field).toBeDefined();
        expect(VALIDATE_TYPES.message).toBeDefined();
        expect(VALIDATE_TYPES.oneof).toBeDefined();
      });
    });

    describe('STRING_CONSTRAINTS', () => {
      it('should have all expected string constraints', () => {
        expect(STRING_CONSTRAINTS.min_len).toBeDefined();
        expect(STRING_CONSTRAINTS.max_len).toBeDefined();
        expect(STRING_CONSTRAINTS.len).toBeDefined();
        expect(STRING_CONSTRAINTS.min_bytes).toBeDefined();
        expect(STRING_CONSTRAINTS.max_bytes).toBeDefined();
        expect(STRING_CONSTRAINTS.pattern).toBeDefined();
        expect(STRING_CONSTRAINTS.prefix).toBeDefined();
        expect(STRING_CONSTRAINTS.suffix).toBeDefined();
        expect(STRING_CONSTRAINTS.contains).toBeDefined();
        expect(STRING_CONSTRAINTS.not_contains).toBeDefined();
        expect(STRING_CONSTRAINTS.email).toBeDefined();
        expect(STRING_CONSTRAINTS.hostname).toBeDefined();
        expect(STRING_CONSTRAINTS.ip).toBeDefined();
        expect(STRING_CONSTRAINTS.ipv4).toBeDefined();
        expect(STRING_CONSTRAINTS.ipv6).toBeDefined();
        expect(STRING_CONSTRAINTS.uri).toBeDefined();
        expect(STRING_CONSTRAINTS.uri_ref).toBeDefined();
        expect(STRING_CONSTRAINTS.uuid).toBeDefined();
        expect(STRING_CONSTRAINTS.address).toBeDefined();
        expect(STRING_CONSTRAINTS.well_known_regex).toBeDefined();
      });
    });

    describe('NUMERIC_CONSTRAINTS', () => {
      it('should have all expected numeric constraints', () => {
        expect(NUMERIC_CONSTRAINTS.const).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.lt).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.lte).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.gt).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.gte).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.in).toBeDefined();
        expect(NUMERIC_CONSTRAINTS.not_in).toBeDefined();
      });
    });

    describe('REPEATED_CONSTRAINTS', () => {
      it('should have all expected repeated constraints', () => {
        expect(REPEATED_CONSTRAINTS.min_items).toBeDefined();
        expect(REPEATED_CONSTRAINTS.max_items).toBeDefined();
        expect(REPEATED_CONSTRAINTS.unique).toBeDefined();
        expect(REPEATED_CONSTRAINTS.items).toBeDefined();
      });
    });

    describe('CEL_FIELDS', () => {
      it('should have all expected CEL fields', () => {
        expect(CEL_FIELDS.cel).toBeDefined();
        expect(CEL_FIELDS.id).toBeDefined();
        expect(CEL_FIELDS.message).toBeDefined();
        expect(CEL_FIELDS.expression).toBeDefined();
      });
    });

    describe('COMMON_CONSTRAINTS', () => {
      it('should have all expected common constraints', () => {
        expect(COMMON_CONSTRAINTS.required).toBeDefined();
        expect(COMMON_CONSTRAINTS.ignore).toBeDefined();
        expect(COMMON_CONSTRAINTS.disabled).toBeDefined();
        expect(COMMON_CONSTRAINTS.skipped).toBeDefined();
      });
    });
  });

  describe('isValidateContext', () => {
    it('should return true for buf.validate context', () => {
      expect(isValidateContext('option (buf.validate.field).string = {}')).toBe(true);
    });

    it('should return true for validate. context', () => {
      expect(isValidateContext('option (validate.required) = true')).toBe(true);
    });

    it('should return true for .cel context', () => {
      expect(isValidateContext('option.cel = { expression: "this > 0" }')).toBe(true);
    });

    it('should return false for non-validate context', () => {
      expect(isValidateContext('string name = 1;')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidateContext('')).toBe(false);
    });
  });

  describe('getProtovalidateHover', () => {
    describe('validate types', () => {
      it('should return hover for field validate type', () => {
        const result = getProtovalidateHover('field', 'option (buf.validate.field) = {}');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('field');
        expect(content).toContain('buf.validate');
        expect(content).toContain('protovalidate');
      });

      it('should return hover for message validate type', () => {
        const result = getProtovalidateHover('message', 'option (buf.validate.message) = {}');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('message');
        expect(content).toContain('CEL');
      });

      it('should return hover for oneof validate type', () => {
        const result = getProtovalidateHover('oneof', 'option (buf.validate.oneof) = { required: true }');
        expect(result).not.toBeNull();
      });
    });

    describe('string constraints', () => {
      it('should return hover for min_len constraint', () => {
        const result = getProtovalidateHover('min_len', 'option (buf.validate.field).string.min_len = 1');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('min_len');
        expect(content).toContain('Minimum string length');
      });

      it('should return hover for max_len constraint', () => {
        const result = getProtovalidateHover('max_len', 'option (buf.validate.field).string.max_len = 100');
        expect(result).not.toBeNull();
      });

      it('should return hover for pattern constraint', () => {
        const result = getProtovalidateHover('pattern', 'option (buf.validate.field).string.pattern = "^[a-z]+$"');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('Regular expression');
      });

      it('should return hover for email constraint', () => {
        const result = getProtovalidateHover('email', 'option (buf.validate.field).string.email = true');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('email');
      });

      it('should return hover for uuid constraint', () => {
        const result = getProtovalidateHover('uuid', 'option (buf.validate.field).string.uuid = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for uri constraint', () => {
        const result = getProtovalidateHover('uri', 'option (buf.validate.field).string.uri = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for ip constraint', () => {
        const result = getProtovalidateHover('ip', 'option (buf.validate.field).string.ip = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for hostname constraint', () => {
        const result = getProtovalidateHover('hostname', 'option (buf.validate.field).string.hostname = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for prefix constraint', () => {
        const result = getProtovalidateHover('prefix', 'option (buf.validate.field).string.prefix = "test_"');
        expect(result).not.toBeNull();
      });

      it('should return hover for suffix constraint', () => {
        const result = getProtovalidateHover('suffix', 'option (buf.validate.field).string.suffix = "_end"');
        expect(result).not.toBeNull();
      });

      it('should return hover for contains constraint', () => {
        const result = getProtovalidateHover('contains', 'option (buf.validate.field).string.contains = "test"');
        expect(result).not.toBeNull();
      });

      it('should return hover for not_contains constraint', () => {
        const result = getProtovalidateHover('not_contains', 'option (buf.validate.field).string.not_contains = "bad"');
        expect(result).not.toBeNull();
      });

      it('should return hover for len constraint', () => {
        const result = getProtovalidateHover('len', 'option (buf.validate.field).string.len = 10');
        expect(result).not.toBeNull();
      });

      it('should return hover for min_bytes constraint', () => {
        const result = getProtovalidateHover('min_bytes', 'option (buf.validate.field).string.min_bytes = 1');
        expect(result).not.toBeNull();
      });

      it('should return hover for max_bytes constraint', () => {
        const result = getProtovalidateHover('max_bytes', 'option (buf.validate.field).string.max_bytes = 100');
        expect(result).not.toBeNull();
      });

      it('should return hover for ipv4 constraint', () => {
        const result = getProtovalidateHover('ipv4', 'option (buf.validate.field).string.ipv4 = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for ipv6 constraint', () => {
        const result = getProtovalidateHover('ipv6', 'option (buf.validate.field).string.ipv6 = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for uri_ref constraint', () => {
        const result = getProtovalidateHover('uri_ref', 'option (buf.validate.field).string.uri_ref = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for address constraint', () => {
        const result = getProtovalidateHover('address', 'option (buf.validate.field).string.address = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for well_known_regex constraint', () => {
        const result = getProtovalidateHover('well_known_regex', 'option (buf.validate.field).string.well_known_regex = HTTP_HEADER_NAME');
        expect(result).not.toBeNull();
      });
    });

    describe('numeric constraints', () => {
      it('should return hover for const constraint', () => {
        const result = getProtovalidateHover('const', 'option (buf.validate.field).int32.const = 42');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('exact value');
      });

      it('should return hover for lt constraint', () => {
        const result = getProtovalidateHover('lt', 'option (buf.validate.field).int32.lt = 100');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('less than');
      });

      it('should return hover for lte constraint', () => {
        const result = getProtovalidateHover('lte', 'option (buf.validate.field).int32.lte = 100');
        expect(result).not.toBeNull();
      });

      it('should return hover for gt constraint', () => {
        const result = getProtovalidateHover('gt', 'option (buf.validate.field).int32.gt = 0');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('greater than');
      });

      it('should return hover for gte constraint', () => {
        const result = getProtovalidateHover('gte', 'option (buf.validate.field).int32.gte = 0');
        expect(result).not.toBeNull();
      });

      it('should return hover for in constraint', () => {
        const result = getProtovalidateHover('in', 'option (buf.validate.field).int32.in = [1, 2, 3]');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('one of');
      });

      it('should return hover for not_in constraint', () => {
        const result = getProtovalidateHover('not_in', 'option (buf.validate.field).int32.not_in = [0]');
        expect(result).not.toBeNull();
      });
    });

    describe('repeated constraints', () => {
      it('should return hover for min_items constraint', () => {
        const result = getProtovalidateHover('min_items', 'option (buf.validate.field).repeated.min_items = 1');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('Minimum');
      });

      it('should return hover for max_items constraint', () => {
        const result = getProtovalidateHover('max_items', 'option (buf.validate.field).repeated.max_items = 100');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('Maximum');
      });

      it('should return hover for unique constraint', () => {
        const result = getProtovalidateHover('unique', 'option (buf.validate.field).repeated.unique = true');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('unique');
      });

      it('should return hover for items constraint', () => {
        const result = getProtovalidateHover('items', 'option (buf.validate.field).repeated.items = {}');
        expect(result).not.toBeNull();
      });
    });

    describe('CEL fields', () => {
      it('should return hover for cel field', () => {
        const result = getProtovalidateHover('cel', 'option (buf.validate.field).cel = {}');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('cel');
        expect(content).toContain('CEL Specification');
      });

      it('should return hover for id field', () => {
        const result = getProtovalidateHover('id', 'option (buf.validate.field).cel.id = "my_rule"');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('identifier');
      });

      it('should return hover for message field in CEL context', () => {
        const result = getProtovalidateHover('message', 'option (buf.validate.field).cel.message = "Invalid value"');
        expect(result).not.toBeNull();
      });

      it('should return hover for expression field', () => {
        const result = getProtovalidateHover('expression', 'option (buf.validate.field).cel.expression = "this > 0"');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('expression');
      });
    });

    describe('common constraints', () => {
      it('should return hover for required constraint', () => {
        const result = getProtovalidateHover('required', 'option (buf.validate.field).required = true');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('required');
      });

      it('should return hover for ignore constraint', () => {
        const result = getProtovalidateHover('ignore', 'option (buf.validate.field).ignore = IGNORE_IF_UNPOPULATED');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('IGNORE');
      });

      it('should return hover for disabled constraint', () => {
        const result = getProtovalidateHover('disabled', 'option (buf.validate.field).disabled = true');
        expect(result).not.toBeNull();
      });

      it('should return hover for skipped constraint', () => {
        const result = getProtovalidateHover('skipped', 'option (buf.validate.field).skipped = true');
        expect(result).not.toBeNull();
      });
    });

    describe('dot-separated words', () => {
      it('should handle dot-separated words and extract last part', () => {
        const result = getProtovalidateHover('string.min_len', 'option (buf.validate.field).string.min_len = 1');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('min_len');
      });
    });

    describe('edge cases', () => {
      it('should return null for unknown constraint', () => {
        const result = getProtovalidateHover('unknown_constraint', 'option (buf.validate.field).unknown_constraint = true');
        expect(result).toBeNull();
      });

      it('should return null when not in validate context', () => {
        const result = getProtovalidateHover('min_len', 'string name = 1;');
        expect(result).toBeNull();
      });

      it('should return null for empty line', () => {
        const result = getProtovalidateHover('min_len', '');
        expect(result).toBeNull();
      });
    });
  });
});
