/**
 * Types and interfaces for formatter provider
 */

/**
 * Formatter settings configuration
 */
export interface FormatterSettings {
  indentSize: number;
  useTabIndent: boolean;
  maxLineLength?: number;
  renumberOnFormat?: boolean;
  renumberStartNumber?: number;
  renumberIncrement?: number;
  preset?: 'minimal' | 'google' | 'buf' | 'custom';
  alignFields?: boolean;
}

/**
 * Alignment data for a block of fields
 */
export interface AlignmentData {
  maxFieldNameLength: number;
  maxTypeLength: number;
  isOptionBlock: boolean;
  maxKeyLength: number;
}

/**
 * Default formatter settings
 */
export const DEFAULT_SETTINGS: FormatterSettings = {
  indentSize: 2,
  useTabIndent: false,
  renumberOnFormat: false,
  renumberStartNumber: 1,
  renumberIncrement: 1,
  preset: 'minimal',
  alignFields: true
};

/**
 * Re-export splitLines from shared for backwards compatibility
 */
export { splitLines } from '../../../shared/textUtils';
