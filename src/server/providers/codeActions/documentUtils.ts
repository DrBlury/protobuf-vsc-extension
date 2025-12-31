/**
 * Document utilities for code actions
 * Helpers for navigating and analyzing protobuf document structure
 */

import type { Range } from 'vscode-languageserver/node';
import { splitLines } from './types';

/**
 * Find the name of the enclosing message at the given range
 * Walks backwards through the document tracking brace depth
 *
 * @param range The range to search from
 * @param documentText The full document text
 * @returns The message name or null if not inside a message
 */
export function findEnclosingMessageName(range: Range, documentText: string): string | null {
  const lines = splitLines(documentText);
  let braceDepth = 0;

  for (let i = range.start.line; i >= 0; i--) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    for (const ch of line) {
      if (ch === '{') {
        braceDepth--;
      }
      if (ch === '}') {
        braceDepth++;
      }
    }

    const match = line.match(/\bmessage\s+(\w+)/);
    if (match && braceDepth <= 0) {
      return match[1] ?? null;
    }
  }

  return null;
}

/**
 * Find the name of the enclosing enum at the given range
 * Walks backwards through the document tracking brace depth
 *
 * @param range The range to search from
 * @param documentText The full document text
 * @returns The enum name or null if not inside an enum
 */
export function findEnclosingEnumName(range: Range, documentText: string): string | null {
  const lines = splitLines(documentText);
  let braceDepth = 0;

  for (let i = range.start.line; i >= 0; i--) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    for (const ch of line) {
      if (ch === '{') {
        braceDepth--;
      }
      if (ch === '}') {
        braceDepth++;
      }
    }

    const match = line.match(/\benum\s+(\w+)/);
    if (match && braceDepth <= 0) {
      return match[1] ?? null;
    }
  }

  return null;
}

/**
 * Find the name of the enclosing service at the given range
 *
 * @param range The range to search from
 * @param documentText The full document text
 * @returns The service name or null if not inside a service
 */
export function findEnclosingServiceName(range: Range, documentText: string): string | null {
  const lines = splitLines(documentText);
  let braceDepth = 0;

  for (let i = range.start.line; i >= 0; i--) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    for (const ch of line) {
      if (ch === '{') {
        braceDepth--;
      }
      if (ch === '}') {
        braceDepth++;
      }
    }

    const match = line.match(/\bservice\s+(\w+)/);
    if (match && braceDepth <= 0) {
      return match[1] ?? null;
    }
  }

  return null;
}

/**
 * Get the word at a specific range in the document
 *
 * @param documentText The full document text
 * @param range The range to extract from
 * @returns The word at that range or null if not found
 */
export function getWordAtRange(documentText: string, range: Range): string | null {
  const lines = splitLines(documentText);
  const line = lines[range.start.line];
  if (!line) {
    return null;
  }
  return line.substring(range.start.character, range.end.character) || null;
}

/**
 * Find the containing block type for a given position
 */
export type BlockType = 'message' | 'enum' | 'service' | 'oneof' | 'extend' | null;

export function findEnclosingBlockType(range: Range, documentText: string): BlockType {
  const lines = splitLines(documentText);
  let braceDepth = 0;

  for (let i = range.start.line; i >= 0; i--) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    for (const ch of line) {
      if (ch === '{') {
        braceDepth--;
      }
      if (ch === '}') {
        braceDepth++;
      }
    }

    if (braceDepth <= 0) {
      if (/\bmessage\s+\w+/.test(line)) {
        return 'message';
      }
      if (/\benum\s+\w+/.test(line)) {
        return 'enum';
      }
      if (/\bservice\s+\w+/.test(line)) {
        return 'service';
      }
      if (/\boneof\s+\w+/.test(line)) {
        return 'oneof';
      }
      if (/\bextend\s+\w+/.test(line)) {
        return 'extend';
      }
    }
  }

  return null;
}
