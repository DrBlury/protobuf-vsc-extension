/**
 * Types and interfaces for code actions provider
 */

import { CodeActionKind, Diagnostic } from 'vscode-languageserver/node';

// Re-export text utilities from shared for backwards compatibility
export {
  splitLines,
  joinLines,
  getLineAt,
  lineCount
} from '../../../shared/textUtils';

/**
 * Context passed to code action handlers
 */
export interface CodeActionContext {
  diagnostics: Diagnostic[];
  only?: CodeActionKind[];
}

/**
 * Settings for code actions behavior
 */
export interface CodeActionsSettings {
  /** Whether to include renumbering in format operations */
  renumberOnFormat?: boolean;
  /** Whether the formatter is enabled */
  formatterEnabled?: boolean;
  /** Settings for organize imports feature */
  organizeImports?: {
    /** Enable or disable organize imports feature */
    enabled?: boolean;
    /** Group imports by category (google well-known, third-party, local) */
    groupByCategory?: boolean;
  };
}

/**
 * Default code actions settings
 */
export const DEFAULT_CODE_ACTIONS_SETTINGS: CodeActionsSettings = {
  renumberOnFormat: false,
  formatterEnabled: true,
  organizeImports: {
    enabled: true,
    groupByCategory: true
  }
};
