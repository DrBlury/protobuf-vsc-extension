/**
 * Types and interfaces for diagnostics provider
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';

/**
 * Settings for controlling which diagnostics are enabled
 */
export interface DiagnosticsSettings {
  namingConventions: boolean;
  referenceChecks: boolean;
  importChecks: boolean;
  fieldTagChecks: boolean;
  duplicateFieldChecks: boolean;
  discouragedConstructs: boolean;
  deprecatedUsage: boolean;
  unusedSymbols: boolean;
  circularDependencies: boolean;
  documentationComments: boolean;
  editionFeatures: boolean;
}

/**
 * Default settings - all checks enabled except unusedSymbols (can be noisy)
 */
export const DEFAULT_DIAGNOSTICS_SETTINGS: DiagnosticsSettings = {
  namingConventions: true,
  referenceChecks: true,
  importChecks: true,
  fieldTagChecks: true,
  duplicateFieldChecks: true,
  discouragedConstructs: true,
  deprecatedUsage: true,
  unusedSymbols: false,
  circularDependencies: true,
  documentationComments: true,
  editionFeatures: true
};

/**
 * Common patterns for external dependency directories that should be skipped
 */
export const EXTERNAL_DEP_PATTERNS = [
  '/.buf-deps/',      // Buf exported dependencies
  '/vendor/',         // Go vendor directory
  '/third_party/',    // Common third-party directory
  '/external/',       // External dependencies
  '/node_modules/',   // Node modules (unlikely for proto but possible)
];

/**
 * Check if a file is in an external dependency directory
 * These files should not be validated as they are managed by external tools
 */
export function isExternalDependencyFile(uri: string): boolean {
  const normalizedUri = uri.replace(/\\/g, '/');
  return EXTERNAL_DEP_PATTERNS.some(pattern => normalizedUri.includes(pattern));
}

/**
 * Diagnostic severity helpers
 */
export const Severity = {
  Error: DiagnosticSeverity.Error,
  Warning: DiagnosticSeverity.Warning,
  Information: DiagnosticSeverity.Information,
  Hint: DiagnosticSeverity.Hint
} as const;
