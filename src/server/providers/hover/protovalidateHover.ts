/**
 * Protovalidate/buf.validate hover support
 */

import type { HoverHandler } from './types';
import { createMarkdownHover } from './types';

/**
 * buf.validate constraint types
 */
export const VALIDATE_TYPES: Record<string, string> = {
  field: 'Validation constraints applied to a specific field.',
  message: 'Validation constraints applied to the entire message, using CEL expressions.',
  oneof: 'Validation constraints for oneof fields (e.g., requiring one to be set).',
};

/**
 * String validation constraints
 */
export const STRING_CONSTRAINTS: Record<string, string> = {
  min_len: 'Minimum string length in characters (UTF-8 code points).',
  max_len: 'Maximum string length in characters (UTF-8 code points).',
  len: 'Exact string length in characters.',
  min_bytes: 'Minimum string length in bytes.',
  max_bytes: 'Maximum string length in bytes.',
  pattern: 'Regular expression pattern the string must match.',
  prefix: 'String must start with this prefix.',
  suffix: 'String must end with this suffix.',
  contains: 'String must contain this substring.',
  not_contains: 'String must not contain this substring.',
  email: 'String must be a valid email address.',
  hostname: 'String must be a valid hostname.',
  ip: 'String must be a valid IP address.',
  ipv4: 'String must be a valid IPv4 address.',
  ipv6: 'String must be a valid IPv6 address.',
  uri: 'String must be a valid URI.',
  uri_ref: 'String must be a valid URI reference.',
  uuid: 'String must be a valid UUID.',
  address: 'String must be a valid address (hostname or IP).',
  well_known_regex: 'String must match a well-known regex pattern.',
};

/**
 * Numeric validation constraints
 */
export const NUMERIC_CONSTRAINTS: Record<string, string> = {
  const: 'Field must equal this exact value.',
  lt: 'Field must be less than this value.',
  lte: 'Field must be less than or equal to this value.',
  gt: 'Field must be greater than this value.',
  gte: 'Field must be greater than or equal to this value.',
  in: 'Field must be one of the specified values.',
  not_in: 'Field must not be any of the specified values.',
};

/**
 * Repeated field validation constraints
 */
export const REPEATED_CONSTRAINTS: Record<string, string> = {
  min_items: 'Minimum number of items in the list.',
  max_items: 'Maximum number of items in the list.',
  unique: 'All items in the list must be unique.',
  items: 'Constraints applied to each item in the list.',
};

/**
 * CEL option fields
 */
export const CEL_FIELDS: Record<string, string> = {
  cel: 'Custom CEL expression for validation. Provides flexible validation logic.',
  id: 'Unique identifier for this CEL validation rule. Used for error tracking.',
  message: 'Human-readable error message when the CEL expression evaluates to false.',
  expression: 'The CEL expression that must evaluate to true for valid data, or return an error string.',
};

/**
 * Common validation constraints
 */
export const COMMON_CONSTRAINTS: Record<string, string> = {
  required: 'Field is required and must be set to a non-default value.',
  ignore:
    'Controls when validation should be skipped (IGNORE_UNSPECIFIED, IGNORE_IF_UNPOPULATED, IGNORE_IF_DEFAULT_VALUE, IGNORE_ALWAYS).',
  disabled: 'Disables all validation for this field or message.',
  skipped: 'Validation is skipped for this field.',
};

/**
 * Check if we're in a buf.validate context
 */
export function isValidateContext(lineText: string): boolean {
  return lineText.includes('buf.validate') || lineText.includes('validate.') || lineText.includes('.cel');
}

/**
 * Get protovalidate/buf.validate hover information
 */
export const getProtovalidateHover: HoverHandler = (word: string, lineText: string) => {
  const inValidateContext = isValidateContext(lineText);

  // Handle dot-separated words - extract the last segment for constraint matching
  const wordParts = word.split('.');
  const lastPart = wordParts[wordParts.length - 1]!;
  const checkWord = lastPart;

  // Validate types
  if (VALIDATE_TYPES[checkWord] && inValidateContext) {
    return createMarkdownHover([
      `**${checkWord}** *(buf.validate)*`,
      '',
      VALIDATE_TYPES[checkWord],
      '',
      '[protovalidate Documentation](https://buf.build/docs/bsr/remote-validation/protovalidate)',
    ]);
  }

  // String constraints
  if (STRING_CONSTRAINTS[checkWord] && inValidateContext) {
    return createMarkdownHover([`**${checkWord}** *(buf.validate.field.string)*`, '', STRING_CONSTRAINTS[checkWord]]);
  }

  // Numeric constraints
  if (NUMERIC_CONSTRAINTS[checkWord] && inValidateContext) {
    return createMarkdownHover([
      `**${checkWord}** *(buf.validate numeric constraint)*`,
      '',
      NUMERIC_CONSTRAINTS[checkWord],
    ]);
  }

  // Repeated constraints
  if (REPEATED_CONSTRAINTS[checkWord] && inValidateContext) {
    return createMarkdownHover([
      `**${checkWord}** *(buf.validate.field.repeated)*`,
      '',
      REPEATED_CONSTRAINTS[checkWord],
    ]);
  }

  // CEL fields
  if (CEL_FIELDS[checkWord] && inValidateContext) {
    return createMarkdownHover([
      `**${checkWord}** *(buf.validate.cel)*`,
      '',
      CEL_FIELDS[checkWord],
      '',
      '[CEL Specification](https://github.com/google/cel-spec)',
    ]);
  }

  // Common constraints
  if (COMMON_CONSTRAINTS[checkWord] && inValidateContext) {
    return createMarkdownHover([`**${checkWord}** *(buf.validate)*`, '', COMMON_CONSTRAINTS[checkWord]]);
  }

  return null;
};
