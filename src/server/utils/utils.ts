/**
 * Utility functions for Protocol Buffers Language Server
 * Common operations used across the codebase
 */

import * as path from 'path';
import { URI } from 'vscode-uri';

/**
 * Branded type for file URIs to prevent confusion with regular strings
 */
export type FileUri = string & { __brand: 'FileUri' };

/**
 * Branded type for file paths to prevent confusion with URIs
 */
export type FilePath = string & { __brand: 'FilePath' };

/**
 * Convert a URI string to a file path
 */
export function uriToPath(uri: string): FilePath {
  try {
    const parsed = URI.parse(uri);
    return parsed.fsPath as FilePath;
  } catch {
    // Fallback for non-standard URIs
    const cleaned = uri.replace(/^file:\/\//, '').replace(/^file:/, '');
    return path.resolve(cleaned) as FilePath;
  }
}

/**
 * Convert a file path to a URI string
 */
export function pathToUri(filePath: string): FileUri {
  try {
    const uri = URI.file(filePath);
    return uri.toString() as FileUri;
  } catch {
    // Fallback for invalid paths
    const resolved = path.resolve(filePath);
    return `file://${resolved}` as FileUri;
  }
}

/**
 * Normalize a path (resolve and use forward slashes)
 */
export function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * Check if a path is within a directory
 */
export function isPathInDirectory(filePath: string, directory: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedDir = normalizePath(directory);
  return normalizedPath.startsWith(`${normalizedDir}/`) || normalizedPath === normalizedDir;
}

/**
 * Get the relative path from one directory to another
 */
export function getRelativePath(from: string, to: string): string {
  try {
    return path.relative(from, to);
  } catch {
    return to;
  }
}

/**
 * Sanitize a file path to prevent path traversal
 */
export function sanitizePath(filePath: string): string {
  // Remove any path traversal attempts
  let sanitized = path.normalize(filePath);

  // Remove any remaining '..' or '.' components
  const parts = sanitized.split(path.sep);
  const cleaned: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      // Don't allow going up beyond root
      if (cleaned.length > 0) {
        cleaned.pop();
      }
    } else if (part !== '.' && part !== '') {
      cleaned.push(part);
    }
  }

  return cleaned.join(path.sep);
}

/**
 * Validate that a path is safe to use
 */
export function validatePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, error: 'Path cannot be empty' };
  }

  // Check for null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'Path contains null bytes' };
  }

  // Check for path traversal
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path contains traversal sequences' };
  }

  return { valid: true };
}

/**
 * Extract error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Extract error stack from an unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for Error objects
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Create a range from start and end positions
 */
export function createRange(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar }
  };
}

/**
 * Check if a position is within a range
 */
export function isPositionInRange(
  position: { line: number; character: number },
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}

/**
 * Deep clone an object (simple implementation)
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}
