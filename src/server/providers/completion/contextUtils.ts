/**
 * Context detection utilities for completion
 */

import type { Position } from 'vscode-languageserver/node';
import type { TypePrefix, ContainerBounds, ContainerInfo } from './types';

/**
 * Check if the cursor is in a type context (expecting a type name)
 */
export function isTypeContext(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed === '') {
    return true;
  }

  // Allow package-qualified type names like google.protobuf.Timestamp
  const typeFragment = '[A-Za-z_][\\w.]*';

  const withModifier = new RegExp(`^\\s*(?:optional|required|repeated)\\s+${typeFragment}$`);
  const modifierOnly = /^\s*(?:optional|required|repeated)\s+$/;
  const bareType = new RegExp(`^\\s*${typeFragment}$`);

  return withModifier.test(text) || modifierOnly.test(text) || bareType.test(text);
}

/**
 * Extract type prefix from text being typed
 */
export function getTypePrefix(text: string): TypePrefix | undefined {
  const match = text.match(/([A-Za-z_][\w.]*)$/);
  if (!match) {
    return undefined;
  }

  const full = match[1]!;
  const parts = full.split('.');

  if (parts.length === 1) {
    return { partial: parts[0]! };
  }

  const partial = parts.pop() || '';
  const qualifier = parts.join('.');
  return { qualifier, partial };
}

/**
 * Check if cursor is in a keyword context
 */
export function isKeywordContext(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === '' ||
         /^\s*\w*$/.test(trimmed) ||
         /^\s*(message|enum|service|oneof)\s+\w+\s*\{?\s*$/.test(text);
}

/**
 * Check if cursor is in a field assignment context (after field name, before =)
 */
export function isFieldAssignmentContext(text: string): boolean {
  // Match pattern like: "  string name" or "  optional string name" or "  repeated Type name"
  return /^\s*(?:optional|required|repeated)?\s*[A-Za-z_][\w.<>,]*\s+[A-Za-z_]\w*\s*$/.test(text);
}

/**
 * Check if cursor is in an enum value context
 */
export function isEnumValueContext(text: string, position: Position, documentText?: string): boolean {
  // Check if we're defining an enum value (identifier without type prefix)
  const isEnumValueDef = /^\s*[A-Z][A-Z0-9_]*\s*$/.test(text);

  // Also verify we're actually inside an enum block
  if (isEnumValueDef && documentText) {
    const container = getContainerInfo(position, documentText);
    return container?.kind === 'enum';
  }

  return false;
}

/**
 * Check if cursor is in a field name context
 */
export function isFieldNameContext(text: string): boolean {
  // After a type, before the field name
  return /(?:optional|required|repeated)?\s*[A-Za-z_][\w.<>,]+\s+$/.test(text);
}

/**
 * Get container bounds for a position (finds enclosing message/enum/service)
 */
export function getContainerBounds(position: Position, lines: string[]): ContainerBounds | undefined {
  let braceCount = 0;
  let containerStartLine = -1;

  // Look backwards to find opening brace
  for (let i = position.line; i >= 0; i--) {
    const line = lines[i]!;

    for (let j = (i === position.line ? position.character : line.length) - 1; j >= 0; j--) {
      const char = line[j]!;

      if (char === '}') {
        braceCount++;
      } else if (char === '{') {
        if (braceCount === 0) {
          containerStartLine = i;
          break;
        }
        braceCount--;
      }
    }

    if (containerStartLine !== -1) {
      break;
    }
  }

  if (containerStartLine === -1) {
    return undefined;
  }

  // Look forward to find closing brace
  braceCount = 1;
  let containerEndLine = lines.length - 1;

  for (let i = containerStartLine; i < lines.length; i++) {
    const line = lines[i]!;
    const startChar = i === containerStartLine ? line.indexOf('{') + 1 : 0;

    for (let j = startChar; j < line.length; j++) {
      const char = line[j]!;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          containerEndLine = i;
          break;
        }
      }
    }

    if (braceCount === 0) {
      break;
    }
  }

  return { start: containerStartLine, end: containerEndLine };
}

/**
 * Get container info including kind (enum/message/service)
 */
export function getContainerInfo(position: Position, documentText: string): ContainerInfo | undefined {
  const lines = documentText.split('\n');
  const bounds = getContainerBounds(position, lines);

  if (!bounds) {
    return undefined;
  }

  // Determine the kind by looking at the container start line
  const startLine = lines[bounds.start]!;
  let kind: 'enum' | 'message' | 'service' | undefined;

  if (/\benum\b/.test(startLine)) {
    kind = 'enum';
  } else if (/\bmessage\b/.test(startLine)) {
    kind = 'message';
  } else if (/\bservice\b/.test(startLine)) {
    kind = 'service';
  }

  return { ...bounds, kind };
}
