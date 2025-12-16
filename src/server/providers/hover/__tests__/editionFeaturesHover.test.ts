/**
 * Tests for Edition Features Hover
 */

import { getEditionFeaturesHover, getEditionHover } from '../editionFeaturesHover';

describe('Edition Features Hover', () => {
  describe('getEditionFeaturesHover', () => {
    it('should return hover for field_presence feature', () => {
      const hover = getEditionFeaturesHover('field_presence', 'string name = 1 [features.field_presence = EXPLICIT];');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('field_presence');
      expect((hover?.contents as any).value).toContain('presence semantics');
    });

    it('should return hover for EXPLICIT value', () => {
      const hover = getEditionFeaturesHover('EXPLICIT', 'string name = 1 [features.field_presence = EXPLICIT];');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('EXPLICIT');
    });

    it('should return hover for enum_type feature', () => {
      const hover = getEditionFeaturesHover('enum_type', 'option features.enum_type = OPEN;');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('enum_type');
    });

    it('should return hover for repeated_field_encoding feature', () => {
      const hover = getEditionFeaturesHover('repeated_field_encoding', 'repeated int32 ids = 1 [features.repeated_field_encoding = PACKED];');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('repeated_field_encoding');
    });

    it('should return null for non-feature words', () => {
      const hover = getEditionFeaturesHover('string', 'string name = 1;');
      expect(hover).toBeNull();
    });

    it('should return null when not in features context', () => {
      const hover = getEditionFeaturesHover('field_presence', 'string name = 1;');
      expect(hover).toBeNull();
    });
  });

  describe('getEditionHover', () => {
    it('should return hover for edition keyword', () => {
      const hover = getEditionHover('edition', 'edition = "2023";');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('edition');
      expect((hover?.contents as any).value).toContain('Editions');
    });

    it('should return hover for edition version 2023', () => {
      const hover = getEditionHover('2023', 'edition = "2023";');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('2023');
    });

    it('should return hover for edition version 2024', () => {
      const hover = getEditionHover('2024', 'edition = "2024";');
      expect(hover).not.toBeNull();
      expect(hover?.contents).toHaveProperty('value');
      expect((hover?.contents as any).value).toContain('2024');
    });

    it('should return null for non-edition words', () => {
      const hover = getEditionHover('syntax', 'syntax = "proto3";');
      expect(hover).toBeNull();
    });
  });
});
