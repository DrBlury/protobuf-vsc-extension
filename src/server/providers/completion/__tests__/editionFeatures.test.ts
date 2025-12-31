/**
 * Tests for Completion Edition Features
 */

import {
  EDITION_FEATURES,
  EDITION_VERSIONS,
  getEditionFeatureNameCompletions,
  getEditionFeatureValueCompletions,
  getEditionVersionCompletions,
  getFieldFeaturesOptionCompletion
} from '../editionFeatures';

describe('Completion Edition Features', () => {
  describe('EDITION_FEATURES', () => {
    it('should have all expected features defined', () => {
      expect(EDITION_FEATURES).toHaveProperty('field_presence');
      expect(EDITION_FEATURES).toHaveProperty('enum_type');
      expect(EDITION_FEATURES).toHaveProperty('repeated_field_encoding');
      expect(EDITION_FEATURES).toHaveProperty('utf8_validation');
      expect(EDITION_FEATURES).toHaveProperty('message_encoding');
      expect(EDITION_FEATURES).toHaveProperty('json_format');
    });

    it('should have values for each feature', () => {
      expect(EDITION_FEATURES.field_presence.values).toContain('EXPLICIT');
      expect(EDITION_FEATURES.field_presence.values).toContain('IMPLICIT');
      expect(EDITION_FEATURES.field_presence.values).toContain('LEGACY_REQUIRED');
      
      expect(EDITION_FEATURES.enum_type.values).toContain('OPEN');
      expect(EDITION_FEATURES.enum_type.values).toContain('CLOSED');
      
      expect(EDITION_FEATURES.repeated_field_encoding.values).toContain('PACKED');
      expect(EDITION_FEATURES.repeated_field_encoding.values).toContain('EXPANDED');
      
      expect(EDITION_FEATURES.utf8_validation.values).toContain('VERIFY');
      expect(EDITION_FEATURES.utf8_validation.values).toContain('NONE');
      
      expect(EDITION_FEATURES.message_encoding.values).toContain('LENGTH_PREFIXED');
      expect(EDITION_FEATURES.message_encoding.values).toContain('DELIMITED');
      
      expect(EDITION_FEATURES.json_format.values).toContain('ALLOW');
      expect(EDITION_FEATURES.json_format.values).toContain('LEGACY_BEST_EFFORT');
    });
  });

  describe('EDITION_VERSIONS', () => {
    it('should include 2023 and 2024 editions', () => {
      expect(EDITION_VERSIONS).toContain('2023');
      expect(EDITION_VERSIONS).toContain('2024');
    });

    it('should include test editions', () => {
      expect(EDITION_VERSIONS).toContain('1_test_only');
      expect(EDITION_VERSIONS).toContain('2_test_only');
      expect(EDITION_VERSIONS).toContain('99997_test_only');
      expect(EDITION_VERSIONS).toContain('99998_test_only');
      expect(EDITION_VERSIONS).toContain('99999_test_only');
    });
  });

  describe('getEditionFeatureNameCompletions', () => {
    it('should return completions for all features', () => {
      const completions = getEditionFeatureNameCompletions();
      expect(completions).toHaveLength(6);
    });

    it('should have correct label format', () => {
      const completions = getEditionFeatureNameCompletions();
      const fieldPresence = completions.find(c => c.label === 'field_presence');
      expect(fieldPresence).toBeDefined();
      expect(fieldPresence?.detail).toBe('features.field_presence');
    });

    it('should have correct kind', () => {
      const completions = getEditionFeatureNameCompletions();
      completions.forEach(c => {
        expect(c.kind).toBe(10); // CompletionItemKind.Property
      });
    });

    it('should have snippet insert text', () => {
      const completions = getEditionFeatureNameCompletions();
      completions.forEach(c => {
        expect(c.insertTextFormat).toBe(2); // InsertTextFormat.Snippet
        expect(c.insertText).toContain('${1|');
      });
    });

    it('should have proper sort text', () => {
      const completions = getEditionFeatureNameCompletions();
      completions.forEach(c => {
        expect(c.sortText?.startsWith('0')).toBe(true);
      });
    });
  });

  describe('getEditionFeatureValueCompletions', () => {
    it('should return values for valid feature', () => {
      const completions = getEditionFeatureValueCompletions('field_presence');
      expect(completions).toHaveLength(3);
      expect(completions[0].label).toBe('EXPLICIT');
      expect(completions[0].preselect).toBe(true);
    });

    it('should return empty array for invalid feature', () => {
      const completions = getEditionFeatureValueCompletions('invalid_feature');
      expect(completions).toEqual([]);
    });

    it('should return values for enum_type', () => {
      const completions = getEditionFeatureValueCompletions('enum_type');
      expect(completions).toHaveLength(2);
      expect(completions[0].label).toBe('OPEN');
      expect(completions[0].preselect).toBe(true);
    });

    it('should return values for repeated_field_encoding', () => {
      const completions = getEditionFeatureValueCompletions('repeated_field_encoding');
      expect(completions).toHaveLength(2);
      expect(completions[0].label).toBe('PACKED');
    });

    it('should return values for utf8_validation', () => {
      const completions = getEditionFeatureValueCompletions('utf8_validation');
      expect(completions).toHaveLength(2);
      expect(completions[0].label).toBe('VERIFY');
    });

    it('should return values for message_encoding', () => {
      const completions = getEditionFeatureValueCompletions('message_encoding');
      expect(completions).toHaveLength(2);
      expect(completions[0].label).toBe('LENGTH_PREFIXED');
    });

    it('should return values for json_format', () => {
      const completions = getEditionFeatureValueCompletions('json_format');
      expect(completions).toHaveLength(2);
      expect(completions[0].label).toBe('ALLOW');
    });

    it('should have correct detail format', () => {
      const completions = getEditionFeatureValueCompletions('field_presence');
      expect(completions[0].detail).toBe('field_presence value');
    });

    it('should have correct kind', () => {
      const completions = getEditionFeatureValueCompletions('field_presence');
      completions.forEach(c => {
        expect(c.kind).toBeDefined();
      });
    });
  });

  describe('getEditionVersionCompletions', () => {
    it('should return completions for all editions', () => {
      const completions = getEditionVersionCompletions();
      expect(completions).toHaveLength(EDITION_VERSIONS.length);
    });

    it('should have correct label format', () => {
      const completions = getEditionVersionCompletions();
      const edition2023 = completions.find(c => c.label === '2023');
      expect(edition2023).toBeDefined();
      expect(edition2023?.detail).toBe('Edition 2023');
    });

    it('should have documentation for 2023 edition', () => {
      const completions = getEditionVersionCompletions();
      const edition2023 = completions.find(c => c.label === '2023');
      expect(edition2023?.documentation).toContain('First edition release');
    });

    it('should have documentation for 2024 edition', () => {
      const completions = getEditionVersionCompletions();
      const edition2024 = completions.find(c => c.label === '2024');
      expect(edition2024?.documentation).toContain('Updated edition');
    });

    it('should have test edition documentation', () => {
      const completions = getEditionVersionCompletions();
      const testEdition = completions.find(c => c.label === '1_test_only');
      expect(testEdition?.documentation).toContain('Test edition');
    });

    it('should have correct insert text format', () => {
      const completions = getEditionVersionCompletions();
      completions.forEach(c => {
        expect(c.insertText).toBe(`"${c.label}"`);
      });
    });

    it('should preselect 2023 edition', () => {
      const completions = getEditionVersionCompletions();
      const edition2023 = completions.find(c => c.label === '2023');
      expect(edition2023?.preselect).toBe(true);
    });

    it('should have correct kind', () => {
      const completions = getEditionVersionCompletions();
      completions.forEach(c => {
        expect(c.kind).toBe(12); // CompletionItemKind.Value
      });
    });
  });

  describe('getFieldFeaturesOptionCompletion', () => {
    it('should return field features option completion', () => {
      const completion = getFieldFeaturesOptionCompletion();
      expect(completion.label).toBe('features.field_presence');
    });

    it('should have correct detail', () => {
      const completion = getFieldFeaturesOptionCompletion();
      expect(completion.detail).toContain('Field presence semantics');
    });

    it('should have snippet insert text', () => {
      const completion = getFieldFeaturesOptionCompletion();
      expect(completion.insertText).toContain('features.field_presence = ');
      expect(completion.insertTextFormat).toBe(2); // InsertTextFormat.Snippet
    });

    it('should have all feature values in snippet', () => {
      const completion = getFieldFeaturesOptionCompletion();
      expect(completion.insertText).toContain('EXPLICIT');
      expect(completion.insertText).toContain('IMPLICIT');
      expect(completion.insertText).toContain('LEGACY_REQUIRED');
    });

    it('should have correct kind', () => {
      const completion = getFieldFeaturesOptionCompletion();
      expect(completion.kind).toBe(10); // CompletionItemKind.Property
    });
  });
});
