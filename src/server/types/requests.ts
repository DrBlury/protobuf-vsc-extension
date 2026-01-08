/**
 * Request and Response Types
 * Centralized type definitions for all custom LSP requests
 */

import type { Position, Range } from 'vscode-languageserver/node';
import type { SchemaGraphRequest } from '../../shared/schemaGraph';
export type { SchemaGraphRequest };

/**
 * Renumber document request parameters
 */
export interface RenumberDocumentRequest {
  /** URI of the document to renumber */
  uri: string;
}

/**
 * Renumber message request parameters
 */
export interface RenumberMessageRequest {
  /** URI of the document containing the message */
  uri: string;
  /** Name of the message to renumber */
  messageName: string;
}

/**
 * Renumber from position request parameters
 */
export interface RenumberFromPositionRequest {
  /** URI of the document */
  uri: string;
  /** Position to start renumbering from */
  position: Position;
}

/**
 * Renumber enum request parameters
 */
export interface RenumberEnumRequest {
  /** URI of the document containing the enum */
  uri: string;
  /** Name of the enum to renumber */
  enumName: string;
}

/**
 * Get messages request parameters
 */
export interface GetMessagesRequest {
  /** URI of the document */
  uri: string;
}

/**
 * Get enums request parameters
 */
export interface GetEnumsRequest {
  /** URI of the document */
  uri: string;
}

/**
 * Get message at position request parameters
 */
export interface GetMessageAtPositionRequest {
  /** URI of the document */
  uri: string;
  /** Position to check */
  position: Position;
}

/**
 * Get next field number request parameters
 */
export interface GetNextFieldNumberRequest {
  /** URI of the document */
  uri: string;
  /** Name of the message */
  messageName: string;
}

/**
 * Compile file request parameters
 */
export interface CompileFileRequest {
  /** URI of the file to compile */
  uri: string;
}

/**
 * Compile file response
 */
export interface CompileFileResponse {
  /** Whether compilation was successful */
  success: boolean;
  /** Compilation errors (if any) */
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
  /** Compilation output (if any) */
  output?: string;
}

/**
 * Validate file request parameters
 */
export interface ValidateFileRequest {
  /** URI of the file to validate */
  uri: string;
}

/**
 * Run external linter request parameters
 */
export interface RunExternalLinterRequest {
  /** URI of the file to lint */
  uri: string;
}

/**
 * Linter result
 */
export interface LinterResult {
  /** Whether linting was successful */
  success: boolean;
  /** Linter errors/warnings */
  issues: Array<{
    message: string;
    line?: number;
    column?: number;
    severity?: 'error' | 'warning' | 'info';
  }>;
}

/**
 * Check breaking changes request parameters
 */
export interface CheckBreakingChangesRequest {
  /** URI of the file to check */
  uri: string;
}

/**
 * Breaking change information
 */
export interface BreakingChange {
  /** Type of breaking change */
  type:
    | 'field_removed'
    | 'field_type_changed'
    | 'field_number_changed'
    | 'enum_value_removed'
    | 'service_method_removed';
  /** Message describing the change */
  message: string;
  /** Location of the change */
  location?: Range;
}

/**
 * List imports request parameters
 */
export interface ListImportsRequest {
  /** URI of the document */
  uri: string;
}

/**
 * Import resolution information
 */
export interface ImportResolution {
  /** Import path */
  path: string;
  /** Whether the import is resolved */
  resolved: boolean;
  /** Resolved URI (if resolved) */
  uri?: string;
  /** Error message (if not resolved) */
  error?: string;
}
