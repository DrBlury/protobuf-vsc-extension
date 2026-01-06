/**
 * Tests for builtin hover support
 */

import {
  getBuiltinTypeHover,
  getKeywordHover,
  BUILTIN_TYPE_DESCRIPTIONS,
  KEYWORD_DESCRIPTIONS
} from '../builtinHover';
import type { MarkupContent } from 'vscode-languageserver';

describe('Builtin Hover', () => {
  describe('BUILTIN_TYPE_DESCRIPTIONS constant', () => {
    it('should have all scalar types', () => {
      expect(BUILTIN_TYPE_DESCRIPTIONS.double).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.float).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.int32).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.int64).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.uint32).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.uint64).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.sint32).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.sint64).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.fixed32).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.fixed64).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.sfixed32).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.sfixed64).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.bool).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.string).toBeDefined();
      expect(BUILTIN_TYPE_DESCRIPTIONS.bytes).toBeDefined();
    });
  });

  describe('KEYWORD_DESCRIPTIONS constant', () => {
    it('should have all important keywords', () => {
      expect(KEYWORD_DESCRIPTIONS.syntax).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.edition).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.package).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.import).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.option).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.message).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.enum).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.service).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.rpc).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.returns).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.stream).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.oneof).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.extend).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.extensions).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.reserved).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.optional).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.required).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.repeated).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.map).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.group).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.weak).toBeDefined();
      expect(KEYWORD_DESCRIPTIONS.public).toBeDefined();
    });
  });

  describe('getBuiltinTypeHover', () => {
    it('should return hover for double type', () => {
      const hover = getBuiltinTypeHover('double');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('double');
      expect(content).toContain('64-bit floating point');
    });

    it('should return hover for float type', () => {
      const hover = getBuiltinTypeHover('float');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('float');
      expect(content).toContain('32-bit floating point');
    });

    it('should return hover for int32 type', () => {
      const hover = getBuiltinTypeHover('int32');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('int32');
      expect(content).toContain('32-bit signed integer');
    });

    it('should return hover for int64 type', () => {
      const hover = getBuiltinTypeHover('int64');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('int64');
      expect(content).toContain('64-bit signed integer');
    });

    it('should return hover for uint32 type', () => {
      const hover = getBuiltinTypeHover('uint32');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('uint32');
      expect(content).toContain('unsigned');
    });

    it('should return hover for uint64 type', () => {
      const hover = getBuiltinTypeHover('uint64');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('uint64');
    });

    it('should return hover for sint32 type', () => {
      const hover = getBuiltinTypeHover('sint32');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('sint32');
      expect(content).toContain('Efficient for negative');
    });

    it('should return hover for sint64 type', () => {
      const hover = getBuiltinTypeHover('sint64');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('sint64');
    });

    it('should return hover for fixed32 type', () => {
      const hover = getBuiltinTypeHover('fixed32');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('fixed32');
      expect(content).toContain('4 bytes');
    });

    it('should return hover for fixed64 type', () => {
      const hover = getBuiltinTypeHover('fixed64');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('fixed64');
      expect(content).toContain('8 bytes');
    });

    it('should return hover for sfixed32 type', () => {
      const hover = getBuiltinTypeHover('sfixed32');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('sfixed32');
    });

    it('should return hover for sfixed64 type', () => {
      const hover = getBuiltinTypeHover('sfixed64');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('sfixed64');
    });

    it('should return hover for bool type', () => {
      const hover = getBuiltinTypeHover('bool');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('bool');
      expect(content).toContain('Boolean');
    });

    it('should return hover for string type', () => {
      const hover = getBuiltinTypeHover('string');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('string');
      expect(content).toContain('UTF-8');
    });

    it('should return hover for bytes type', () => {
      const hover = getBuiltinTypeHover('bytes');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('bytes');
      expect(content).toContain('byte sequence');
    });

    it('should return generic hover for unknown type', () => {
      const hover = getBuiltinTypeHover('unknown_type');
      expect(hover).not.toBeNull();
      const content = (hover.contents as MarkupContent).value;
      expect(content).toContain('unknown_type');
      expect(content).toContain('Built-in protobuf scalar type');
    });
  });

  describe('getKeywordHover', () => {
    it('should return hover for syntax keyword', () => {
      const hover = getKeywordHover('syntax');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('syntax');
      expect(content).toContain('proto2 or proto3');
    });

    it('should return hover for edition keyword', () => {
      const hover = getKeywordHover('edition');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('edition');
    });

    it('should return hover for package keyword', () => {
      const hover = getKeywordHover('package');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('package');
      expect(content).toContain('namespace');
    });

    it('should return hover for import keyword', () => {
      const hover = getKeywordHover('import');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('import');
    });

    it('should return hover for message keyword', () => {
      const hover = getKeywordHover('message');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('message');
      expect(content).toContain('structured data');
    });

    it('should return hover for enum keyword', () => {
      const hover = getKeywordHover('enum');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('enum');
      expect(content).toContain('enumeration');
    });

    it('should return hover for service keyword', () => {
      const hover = getKeywordHover('service');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('service');
      expect(content).toContain('RPC');
    });

    it('should return hover for rpc keyword', () => {
      const hover = getKeywordHover('rpc');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('rpc');
    });

    it('should return hover for returns keyword', () => {
      const hover = getKeywordHover('returns');
      expect(hover).not.toBeNull();
    });

    it('should return hover for stream keyword', () => {
      const hover = getKeywordHover('stream');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('stream');
    });

    it('should return hover for oneof keyword', () => {
      const hover = getKeywordHover('oneof');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('oneof');
    });

    it('should return hover for extend keyword', () => {
      const hover = getKeywordHover('extend');
      expect(hover).not.toBeNull();
    });

    it('should return hover for extensions keyword', () => {
      const hover = getKeywordHover('extensions');
      expect(hover).not.toBeNull();
    });

    it('should return hover for reserved keyword', () => {
      const hover = getKeywordHover('reserved');
      expect(hover).not.toBeNull();
    });

    it('should return hover for optional keyword', () => {
      const hover = getKeywordHover('optional');
      expect(hover).not.toBeNull();
    });

    it('should return hover for required keyword', () => {
      const hover = getKeywordHover('required');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('deprecated');
    });

    it('should return hover for repeated keyword', () => {
      const hover = getKeywordHover('repeated');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('multiple values');
    });

    it('should return hover for map keyword', () => {
      const hover = getKeywordHover('map');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('key-value');
    });

    it('should return hover for group keyword', () => {
      const hover = getKeywordHover('group');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('deprecated');
    });

    it('should return hover for option keyword', () => {
      const hover = getKeywordHover('option');
      expect(hover).not.toBeNull();
    });

    it('should return hover for weak keyword', () => {
      const hover = getKeywordHover('weak');
      expect(hover).not.toBeNull();
    });

    it('should return hover for public keyword', () => {
      const hover = getKeywordHover('public');
      expect(hover).not.toBeNull();
      const content = (hover!.contents as MarkupContent).value;
      expect(content).toContain('re-export');
    });

    it('should return null for unknown keyword', () => {
      const hover = getKeywordHover('unknownkeyword');
      expect(hover).toBeNull();
    });
  });
});
