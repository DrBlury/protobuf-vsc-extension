/**
 * Google API hover support for google.api.* annotations
 */

import type { HoverHandler } from './types';
import { createMarkdownHover } from './types';

/**
 * Google API field behavior values
 */
export const FIELD_BEHAVIORS: Record<string, string> = {
  REQUIRED: 'The field is required. Clients must specify this field when creating or updating the resource.',
  OUTPUT_ONLY: 'The field is set by the server and should not be specified by clients. It\'s output only.',
  INPUT_ONLY: 'The field is set by clients when making requests. It\'s not returned in responses.',
  IMMUTABLE: 'The field cannot be modified after creation. It can only be set during resource creation.',
  OPTIONAL: 'The field is optional. This is explicit documentation that the field is not required.',
  UNORDERED_LIST: 'The field is a list where order does not matter.',
  NON_EMPTY_DEFAULT: 'The field has a non-empty default value when created.',
  IDENTIFIER: 'The field is the identifier for the resource.'
};

/**
 * Google API HTTP methods
 */
export const HTTP_METHODS: Record<string, { description: string; aip?: string }> = {
  get: {
    description: 'Maps the RPC to an HTTP GET request. Used for reading/retrieving resources.',
    aip: 'https://google.aip.dev/131'
  },
  post: {
    description: 'Maps the RPC to an HTTP POST request. Used for creating resources or custom methods.',
    aip: 'https://google.aip.dev/133'
  },
  put: {
    description: 'Maps the RPC to an HTTP PUT request. Used for full resource replacement.',
    aip: 'https://google.aip.dev/134'
  },
  delete: {
    description: 'Maps the RPC to an HTTP DELETE request. Used for deleting resources.',
    aip: 'https://google.aip.dev/135'
  },
  patch: {
    description: 'Maps the RPC to an HTTP PATCH request. Used for partial updates to resources.',
    aip: 'https://google.aip.dev/134'
  },
  custom: {
    description: 'Maps the RPC to a custom HTTP method. Used for non-standard operations.',
    aip: 'https://google.aip.dev/136'
  }
};

/**
 * HTTP option fields
 */
export const HTTP_FIELDS: Record<string, string> = {
  body: 'Specifies which request field should be mapped to the HTTP request body. Use `*` to map all fields except path parameters.',
  response_body: 'Specifies which response field should be mapped to the HTTP response body.',
  additional_bindings: 'Additional HTTP bindings for the same RPC method, allowing multiple URL patterns.',
  selector: 'Selects a method to which this rule applies.',
  pattern: 'URL path pattern with variable bindings like `{resource_id}`.'
};

/**
 * Resource option fields
 */
export const RESOURCE_FIELDS: Record<string, string> = {
  type: 'The resource type name in the format `{Service}/{Kind}`, e.g., `library.googleapis.com/Book`.',
  pattern: 'The resource name pattern, e.g., `projects/{project}/books/{book}`.',
  name_field: 'The field in the message that contains the resource name.',
  history: 'The history of this resource type, used for migration.',
  plural: 'The plural form of the resource type name.',
  singular: 'The singular form of the resource type name.',
  style: 'The style guide for resource naming (e.g., DECLARATIVE_FRIENDLY).',
  child_type: 'Resource type of a child resource.'
};

/**
 * Get Google API hover information
 */
export const getGoogleApiHover: HoverHandler = (word: string, lineText: string) => {
  // Check if we're in a Google API context
  const isGoogleApiContext = lineText.includes('google.api');

  // Field behaviors
  if (FIELD_BEHAVIORS[word] && (isGoogleApiContext || lineText.includes('field_behavior'))) {
    return createMarkdownHover([
      `**${word}** *(google.api.field_behavior)*`,
      '',
      FIELD_BEHAVIORS[word],
      '',
      '[Documentation](https://google.aip.dev/203)'
    ]);
  }

  // HTTP methods
  if (HTTP_METHODS[word] && (isGoogleApiContext || lineText.includes('google.api.http'))) {
    const method = HTTP_METHODS[word];
    const lines = [
      `**${word}** *(google.api.http)*`,
      '',
      method.description
    ];
    if (method.aip) {
      lines.push('', `[AIP Documentation](${method.aip})`);
    }
    return createMarkdownHover(lines);
  }

  // HTTP fields
  if (HTTP_FIELDS[word] && isGoogleApiContext) {
    return createMarkdownHover([
      `**${word}** *(google.api.http field)*`,
      '',
      HTTP_FIELDS[word]
    ]);
  }

  // Resource fields
  if (RESOURCE_FIELDS[word] && (isGoogleApiContext || lineText.includes('resource'))) {
    return createMarkdownHover([
      `**${word}** *(google.api.resource field)*`,
      '',
      RESOURCE_FIELDS[word],
      '',
      '[AIP-123: Resource Types](https://google.aip.dev/123)'
    ]);
  }

  return null;
};
