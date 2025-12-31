/**
 * Types and interfaces for completion providers
 */

import type { Position, Range } from 'vscode-languageserver/node';

/**
 * Represents a prefix being typed with optional package qualifier
 */
export interface TypePrefix {
  /** Package qualifier (e.g., "google.protobuf") */
  qualifier?: string;
  /** Partial name being typed (e.g., "Time" for Timestamp) */
  partial?: string;
}

/**
 * Container bounds for determining field number context
 */
export interface ContainerBounds {
  /** Start line of container (message/enum) */
  start: number;
  /** End line of container */
  end: number;
}

/**
 * Extended container info with type information
 */
export interface ContainerInfo extends ContainerBounds {
  /** Kind of container */
  kind?: 'enum' | 'message' | 'service';
}

/**
 * CEL expression context information
 */
export interface CelContext {
  /** Full CEL expression string */
  expression: string;
  /** Type of rule (e.g., 'message', 'field') */
  ruleType: 'message' | 'field' | 'oneof';
  /** Name of the containing message */
  messageName: string;
  /** Name of the field (for field-level rules) */
  fieldName?: string;
  /** Type of the field */
  fieldType?: string;
}

/**
 * Calculate the range of text to replace for a completion
 */
export function calculateReplaceRange(position: Position, prefixLength: number): Range {
  return {
    start: { line: position.line, character: position.character - prefixLength },
    end: { line: position.line, character: position.character }
  };
}
