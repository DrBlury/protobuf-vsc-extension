/**
 * Shared Response Types
 * These types define the contract between client and server
 * for all custom LSP requests. Both sides MUST use these types.
 */

/**
 * Common error information included in failed responses
 */
export interface ErrorInfo {
  /** Human-readable error message */
  message: string;
  /** Detailed explanation (for logs) */
  details?: string;
  /** Error code if available */
  code?: string;
  /** Suggested fix or action */
  suggestion?: string;
  /** Related setting key if the error can be fixed via settings */
  settingKey?: string;
}

/**
 * Individual compilation/lint error with location
 */
export interface LocationError {
  /** File path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** End line for ranges */
  endLine?: number;
  /** End column for ranges */
  endColumn?: number;
  /** Error/warning message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Rule or error code */
  rule?: string;
}

/**
 * Response from protoc compilation requests
 */
export interface CompilationResponse {
  /** Whether compilation succeeded */
  success: boolean;
  /** Standard output from protoc */
  stdout: string;
  /** Standard error from protoc */
  stderr: string;
  /** Parsed errors with locations */
  errors: LocationError[];
  /** Error info if protoc failed to run */
  errorInfo?: ErrorInfo;
}

/**
 * Response from external linter requests
 */
export interface LinterResponse {
  /** Whether linting completed (even with issues) */
  success: boolean;
  /** Lint issues found */
  issues: LocationError[];
  /** Raw output from the linter */
  rawOutput?: string;
  /** Error info if linter failed to run */
  errorInfo?: ErrorInfo;
}

/**
 * Response from tool availability checks
 */
export interface ToolAvailabilityResponse {
  /** Whether the tool is available */
  available: boolean;
  /** Tool version if available */
  version?: string;
  /** Path to the tool */
  path?: string;
  /** Error info if tool is not available */
  errorInfo?: ErrorInfo;
}

/**
 * Helper to create an error response
 */
export function createErrorResponse<T extends { success: boolean; errorInfo?: ErrorInfo }>(
  message: string,
  options?: {
    details?: string;
    code?: string;
    suggestion?: string;
    settingKey?: string;
  }
): Partial<T> {
  return {
    success: false,
    errorInfo: {
      message,
      ...options
    }
  } as Partial<T>;
}

/**
 * Format LocationError array to human-readable string
 */
export function formatErrors(errors: LocationError[]): string {
  if (errors.length === 0) {
    return '';
  }

  return errors
    .map(e => {
      const location = e.file ? `${e.file}:${e.line}:${e.column}` : `line ${e.line}`;
      const prefix = e.severity === 'error' ? '❌' : e.severity === 'warning' ? '⚠️' : 'ℹ️';
      return `${prefix} ${location}: ${e.message}${e.rule ? ` (${e.rule})` : ''}`;
    })
    .join('\n');
}
