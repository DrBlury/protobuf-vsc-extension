/**
 * Shared naming convention utilities for Protocol Buffers
 * Used by diagnostics (validation) and codeActions (conversion)
 *
 * Protobuf style guide conventions:
 * - Messages/Enums: PascalCase (e.g., MyMessage, StatusCode)
 * - Fields: snake_case (e.g., user_name, created_at)
 * - Enum values: SCREAMING_SNAKE_CASE (e.g., STATUS_OK, UNKNOWN_VALUE)
 * - Services: PascalCase (e.g., UserService)
 * - RPCs: PascalCase (e.g., GetUser, CreateOrder)
 */

/**
 * Check if a name follows PascalCase convention
 * Used for: messages, enums, services, rpcs, groups
 */
export function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Check if a name follows snake_case convention
 * Used for: fields, oneofs
 */
export function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

/**
 * Check if a name follows SCREAMING_SNAKE_CASE convention
 * Used for: enum values
 */
export function isScreamingSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/**
 * Convert a name to PascalCase
 */
export function toPascalCase(name: string): string {
  // Handle snake_case
  if (name.includes('_')) {
    return name
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
  // Handle camelCase or already PascalCase
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Convert a name to snake_case
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert a name to SCREAMING_SNAKE_CASE
 */
export function toScreamingSnakeCase(name: string): string {
  return toSnakeCase(name).toUpperCase();
}

/**
 * Protobuf element types for naming validation
 */
export type ProtoElementType = 'message' | 'enum' | 'service' | 'rpc' | 'field' | 'oneof' | 'enumValue' | 'group';

/**
 * Check if a name follows the correct convention for its element type
 */
export function isValidNaming(name: string, elementType: ProtoElementType): boolean {
  switch (elementType) {
    case 'message':
    case 'enum':
    case 'service':
    case 'rpc':
    case 'group':
      return isPascalCase(name);
    case 'field':
    case 'oneof':
      return isSnakeCase(name);
    case 'enumValue':
      return isScreamingSnakeCase(name);
    default:
      return true;
  }
}

/**
 * Get the expected convention name for an element type
 */
export function getConventionName(elementType: ProtoElementType): string {
  switch (elementType) {
    case 'message':
    case 'enum':
    case 'service':
    case 'rpc':
    case 'group':
      return 'PascalCase';
    case 'field':
    case 'oneof':
      return 'snake_case';
    case 'enumValue':
      return 'SCREAMING_SNAKE_CASE';
    default:
      return 'unknown';
  }
}
