/**
 * Tests for Google API hover support
 */

import {
  getGoogleApiHover,
  FIELD_BEHAVIORS,
  HTTP_METHODS,
  HTTP_FIELDS,
  RESOURCE_FIELDS
} from '../googleApiHover';
import type { Hover, MarkupContent } from 'vscode-languageserver';

describe('Google API Hover', () => {
  describe('FIELD_BEHAVIORS constant', () => {
    it('should have all expected field behaviors', () => {
      expect(FIELD_BEHAVIORS.REQUIRED).toBeDefined();
      expect(FIELD_BEHAVIORS.OUTPUT_ONLY).toBeDefined();
      expect(FIELD_BEHAVIORS.INPUT_ONLY).toBeDefined();
      expect(FIELD_BEHAVIORS.IMMUTABLE).toBeDefined();
      expect(FIELD_BEHAVIORS.OPTIONAL).toBeDefined();
      expect(FIELD_BEHAVIORS.UNORDERED_LIST).toBeDefined();
      expect(FIELD_BEHAVIORS.NON_EMPTY_DEFAULT).toBeDefined();
      expect(FIELD_BEHAVIORS.IDENTIFIER).toBeDefined();
    });
  });

  describe('HTTP_METHODS constant', () => {
    it('should have all expected HTTP methods', () => {
      expect(HTTP_METHODS.get).toBeDefined();
      expect(HTTP_METHODS.post).toBeDefined();
      expect(HTTP_METHODS.put).toBeDefined();
      expect(HTTP_METHODS.delete).toBeDefined();
      expect(HTTP_METHODS.patch).toBeDefined();
      expect(HTTP_METHODS.custom).toBeDefined();
    });

    it('should have AIP links for HTTP methods', () => {
      expect(HTTP_METHODS.get.aip).toContain('aip.dev');
      expect(HTTP_METHODS.post.aip).toContain('aip.dev');
      expect(HTTP_METHODS.delete.aip).toContain('aip.dev');
    });
  });

  describe('HTTP_FIELDS constant', () => {
    it('should have all expected HTTP fields', () => {
      expect(HTTP_FIELDS.body).toBeDefined();
      expect(HTTP_FIELDS.response_body).toBeDefined();
      expect(HTTP_FIELDS.additional_bindings).toBeDefined();
      expect(HTTP_FIELDS.selector).toBeDefined();
      expect(HTTP_FIELDS.pattern).toBeDefined();
    });
  });

  describe('RESOURCE_FIELDS constant', () => {
    it('should have all expected resource fields', () => {
      expect(RESOURCE_FIELDS.type).toBeDefined();
      expect(RESOURCE_FIELDS.pattern).toBeDefined();
      expect(RESOURCE_FIELDS.name_field).toBeDefined();
      expect(RESOURCE_FIELDS.history).toBeDefined();
      expect(RESOURCE_FIELDS.plural).toBeDefined();
      expect(RESOURCE_FIELDS.singular).toBeDefined();
      expect(RESOURCE_FIELDS.style).toBeDefined();
      expect(RESOURCE_FIELDS.child_type).toBeDefined();
    });
  });

  describe('getGoogleApiHover', () => {
    describe('field behaviors', () => {
      it('should return hover for REQUIRED in field_behavior context', () => {
        const result = getGoogleApiHover('REQUIRED', '  [(google.api.field_behavior) = REQUIRED];');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('REQUIRED');
        expect(content).toContain('google.api.field_behavior');
        expect(content).toContain('aip.dev/203');
      });

      it('should return hover for OUTPUT_ONLY in google.api context', () => {
        const result = getGoogleApiHover('OUTPUT_ONLY', '  [(google.api.field_behavior) = OUTPUT_ONLY];');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('OUTPUT_ONLY');
        expect(content).toContain('output only');
      });

      it('should return hover for IMMUTABLE field behavior', () => {
        const result = getGoogleApiHover('IMMUTABLE', '  [(google.api.field_behavior) = IMMUTABLE];');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('cannot be modified');
      });

      it('should return null for field behavior without proper context', () => {
        const result = getGoogleApiHover('REQUIRED', 'some random line');
        expect(result).toBeNull();
      });
    });

    describe('HTTP methods', () => {
      it('should return hover for get in google.api.http context', () => {
        const result = getGoogleApiHover('get', 'option (google.api.http) = { get: "/v1/resources" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('get');
        expect(content).toContain('google.api.http');
        expect(content).toContain('HTTP GET');
      });

      it('should return hover for post with AIP link', () => {
        const result = getGoogleApiHover('post', 'option (google.api.http) = { post: "/v1/resources" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('post');
        expect(content).toContain('AIP Documentation');
      });

      it('should return hover for delete method', () => {
        const result = getGoogleApiHover('delete', 'option (google.api.http) = { delete: "/v1/resources/{id}" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('delete');
        expect(content).toContain('HTTP DELETE');
      });

      it('should return hover for patch method', () => {
        const result = getGoogleApiHover('patch', 'option (google.api.http) = { patch: "/v1/resources/{id}" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('patch');
        expect(content).toContain('HTTP PATCH');
      });

      it('should return hover for put method', () => {
        const result = getGoogleApiHover('put', 'option (google.api.http) = { put: "/v1/resources/{id}" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('put');
      });

      it('should return hover for custom method', () => {
        const result = getGoogleApiHover('custom', 'option (google.api.http) = { custom: ... }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('custom');
      });

      it('should return null for HTTP method without proper context', () => {
        const result = getGoogleApiHover('get', 'some random text');
        expect(result).toBeNull();
      });
    });

    describe('HTTP fields', () => {
      it('should return hover for body field', () => {
        const result = getGoogleApiHover('body', 'option (google.api.http) = { body: "*" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('body');
        expect(content).toContain('request body');
      });

      it('should return hover for response_body field', () => {
        const result = getGoogleApiHover('response_body', 'option (google.api.http) = { response_body: "result" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('response_body');
      });

      it('should return hover for additional_bindings field', () => {
        const result = getGoogleApiHover('additional_bindings', 'option (google.api) = { additional_bindings: ... }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('additional_bindings');
      });
    });

    describe('resource fields', () => {
      it('should return hover for type field in resource context', () => {
        const result = getGoogleApiHover('type', 'option (google.api.resource) = { type: "library/Book" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('type');
        expect(content).toContain('resource type');
        expect(content).toContain('AIP-123');
      });

      it('should return hover for pattern field', () => {
        const result = getGoogleApiHover('pattern', 'option (google.api.resource) = { pattern: "projects/{project}" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('pattern');
      });

      it('should return hover for plural field', () => {
        const result = getGoogleApiHover('plural', 'option (google.api.resource) = { plural: "books" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('plural');
      });

      it('should return hover for singular field', () => {
        const result = getGoogleApiHover('singular', 'option (google.api.resource) = { singular: "book" }');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('singular');
      });

      it('should return hover for style field', () => {
        const result = getGoogleApiHover('style', 'option (google.api.resource) = { style: DECLARATIVE_FRIENDLY }');
        expect(result).not.toBeNull();
      });

      it('should return hover for child_type field', () => {
        const result = getGoogleApiHover('child_type', 'option (google.api.resource) = { child_type: "library/Page" }');
        expect(result).not.toBeNull();
      });

      it('should return hover for name_field', () => {
        const result = getGoogleApiHover('name_field', 'option (google.api.resource) = { name_field: "name" }');
        expect(result).not.toBeNull();
      });

      it('should return hover for history', () => {
        const result = getGoogleApiHover('history', 'option (google.api.resource) = { history: ORIGINALLY_SINGLE_PATTERN }');
        expect(result).not.toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should return null for unknown word', () => {
        const result = getGoogleApiHover('unknown_field', 'option (google.api) = {}');
        expect(result).toBeNull();
      });

      it('should return null for empty line', () => {
        const result = getGoogleApiHover('body', '');
        expect(result).toBeNull();
      });

      it('should handle INPUT_ONLY field behavior', () => {
        const result = getGoogleApiHover('INPUT_ONLY', '[(google.api.field_behavior) = INPUT_ONLY]');
        expect(result).not.toBeNull();
        const content = (result?.contents as MarkupContent).value;
        expect(content).toContain('INPUT_ONLY');
      });

      it('should handle OPTIONAL field behavior', () => {
        const result = getGoogleApiHover('OPTIONAL', '[(google.api.field_behavior) = OPTIONAL]');
        expect(result).not.toBeNull();
      });

      it('should handle UNORDERED_LIST field behavior', () => {
        const result = getGoogleApiHover('UNORDERED_LIST', '[(google.api.field_behavior) = UNORDERED_LIST]');
        expect(result).not.toBeNull();
      });

      it('should handle NON_EMPTY_DEFAULT field behavior', () => {
        const result = getGoogleApiHover('NON_EMPTY_DEFAULT', '[(google.api.field_behavior) = NON_EMPTY_DEFAULT]');
        expect(result).not.toBeNull();
      });

      it('should handle IDENTIFIER field behavior', () => {
        const result = getGoogleApiHover('IDENTIFIER', '[(google.api.field_behavior) = IDENTIFIER]');
        expect(result).not.toBeNull();
      });

      it('should handle selector HTTP field', () => {
        const result = getGoogleApiHover('selector', 'google.api selector: "something"');
        expect(result).not.toBeNull();
      });

      it('should handle pattern HTTP field', () => {
        const result = getGoogleApiHover('pattern', 'google.api pattern: "/v1/*"');
        expect(result).not.toBeNull();
      });
    });
  });
});
