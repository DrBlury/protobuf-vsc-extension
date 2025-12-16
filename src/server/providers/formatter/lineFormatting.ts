/**
 * Line formatting utilities for formatter
 */

import { AlignmentData, FormatterSettings } from './types';
import { parseMapTypes } from './alignment';

/**
 * Get indent string for a given level
 */
export function getIndent(level: number, settings: FormatterSettings): string {
  if (settings.useTabIndent) {
    return '\t'.repeat(level);
  }
  return ' '.repeat(level * settings.indentSize);
}

/**
 * Format a basic line with indent
 */
export function formatLine(line: string, indentLevel: number, settings: FormatterSettings, originalLine?: string): string {
  const indent = getIndent(indentLevel, settings);

  // Handle comment-only lines - preserve original indentation for continuation comments
  // This handles cases like multi-line Doxygen comments where the continuation
  // is indented to align with the comment above
  if (line.startsWith('//') || line.startsWith('/*')) {
    // If we have the original line, preserve its leading whitespace
    if (originalLine !== undefined) {
      const originalIndent = originalLine.match(/^(\s*)/)?.[1] || '';
      return originalIndent + line;
    }
    return indent + line;
  }

  // Handle multi-line field declaration start (e.g., "float value =")
  // When preserveMultiLineFields is enabled, these should be preserved
  const multiLineFieldStart = line.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=\s*$/);
  if (multiLineFieldStart) {
    const [, modifier, type, name] = multiLineFieldStart;
    if (modifier) {
      return `${indent}${modifier} ${type} ${name} =`;
    }
    return `${indent}${type} ${name} =`;
  }

  // Handle multi-line field continuation (e.g., "    1;  // comment")
  // This is a line that starts with a number followed by semicolon
  const multiLineContinuation = line.match(/^(\d+)\s*(.*)$/);
  if (multiLineContinuation) {
    const [, number, rest] = multiLineContinuation;
    // Use a deeper indent for continuation lines
    const continuationIndent = getIndent(indentLevel + 2, settings);
    return `${continuationIndent}${number}${rest}`;
  }

  // Format field definitions with alignment
  const fieldMatch = line.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=\s*(\d+)(.*)$/);
  if (fieldMatch) {
    const [, modifier, type, name, number, rest] = fieldMatch;
    if (modifier) {
      return `${indent}${modifier} ${type} ${name} = ${number}${rest}`;
    }
    return `${indent}${type} ${name} = ${number}${rest}`;
  }

  // Format map fields
  const mapMatch = line.match(/^map\s*<(.+)>\s+(\w+)\s*=\s*(\d+)(.*)$/);
  if (mapMatch) {
    const [, mapContent, name, number, rest] = mapMatch;
    const { keyType, valueType } = parseMapTypes(mapContent!);
    return `${indent}map<${keyType}, ${valueType}> ${name} = ${number}${rest}`;
  }

  // Format enum values - strip any duplicate = N patterns
  const enumValueMatch = line.match(/^(\w+)\s*=\s*(-?\d+)(.*)$/);
  if (enumValueMatch && !line.match(/^(option|syntax|edition)\s/)) {
    const [, name, value, rest] = enumValueMatch;
    const cleanedRest = rest!.replace(/\s*=\s*-?\d+/g, '');
    return `${indent}${name} = ${value}${cleanedRest}`;
  }

  // Format declarations (message, enum, service, etc.)
  const declMatch = line.match(/^(message|enum|service|oneof|extend|rpc)\s+(.*)$/);
  if (declMatch) {
    const [, keyword, rest] = declMatch;
    return `${indent}${keyword} ${rest}`;
  }

  // Format option statements
  const optionMatch = line.match(/^option\s+(.*)$/);
  if (optionMatch) {
    return `${indent}option ${optionMatch[1]}`;
  }

  // Format syntax/edition/package/import statements (no indent)
  if (line.startsWith('syntax') || line.startsWith('edition') ||
      line.startsWith('package') || line.startsWith('import')) {
    return line;
  }

  return indent + line;
}

/**
 * Format a field line with alignment
 */
export function formatLineWithAlignment(
  line: string,
  indentLevel: number,
  alignmentData: AlignmentData | undefined,
  settings: FormatterSettings,
  originalLine?: string
): string {
  if (!alignmentData || alignmentData.isOptionBlock) {
    return formatLine(line, indentLevel, settings, originalLine);
  }

  const indent = getIndent(indentLevel, settings);
  const { maxFieldNameLength, maxTypeLength } = alignmentData;

  // Handle comment-only lines - preserve original indentation for continuation comments
  if (line.startsWith('//') || line.startsWith('/*')) {
    if (originalLine !== undefined) {
      const originalIndent = originalLine.match(/^(\s*)/)?.[1] || '';
      return originalIndent + line;
    }
    return indent + line;
  }

  // Handle multi-line field declaration start (e.g., "float value =")
  const multiLineFieldStart = line.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=\s*$/);
  if (multiLineFieldStart) {
    const [, modifier, type, name] = multiLineFieldStart;
    if (modifier) {
      return `${indent}${modifier} ${type} ${name} =`;
    }
    return `${indent}${type} ${name} =`;
  }

  // Handle multi-line field continuation (e.g., "    1;  // comment")
  const multiLineContinuation = line.match(/^(\d+)\s*(.*)$/);
  if (multiLineContinuation) {
    const [, number, rest] = multiLineContinuation;
    const continuationIndent = getIndent(indentLevel + 2, settings);
    return `${continuationIndent}${number}${rest}`;
  }

  // Format field definitions with alignment
  const fieldMatch = line.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=\s*(\d+)(.*)$/);
  if (fieldMatch) {
    const [, modifier, type, name, number, rest] = fieldMatch;
    const typeWithModifier = modifier ? `${modifier} ${type}` : type!;
    const typePadding = ' '.repeat(Math.max(0, maxTypeLength - typeWithModifier.length));
    const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name!.length));
    return `${indent}${typeWithModifier}${typePadding} ${name}${namePadding} = ${number}${rest}`;
  }

  // Format map fields with alignment
  const mapMatch = line.match(/^map\s*<(.+)>\s+(\w+)\s*=\s*(\d+)(.*)$/);
  if (mapMatch) {
    const [, mapContent, name, number, rest] = mapMatch;
    const { keyType, valueType } = parseMapTypes(mapContent!);
    const mapType = `map<${keyType}, ${valueType}>`;
    const typePadding = ' '.repeat(Math.max(0, maxTypeLength - mapType.length));
    const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name!.length));
    return `${indent}${mapType}${typePadding} ${name}${namePadding} = ${number}${rest}`;
  }

  // Format enum values with alignment
  const enumValueMatch = line.match(/^(\w+)\s*=\s*(-?\d+)(.*)$/);
  if (enumValueMatch && !line.match(/^(option|syntax|edition)\s/)) {
    const [, name, value, rest] = enumValueMatch;
    const cleanedRest = rest!.replace(/\s*=\s*-?\d+/g, '');
    const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name!.length));
    return `${indent}${name}${namePadding} = ${value}${cleanedRest}`;
  }

  // For other lines, use standard formatting
  return formatLine(line, indentLevel, settings);
}

/**
 * Format an option block line with alignment (e.g., CEL expressions)
 */
export function formatOptionLine(
  line: string,
  indentLevel: number,
  alignmentData: AlignmentData | undefined,
  settings: FormatterSettings
): string {
  const indent = getIndent(indentLevel, settings);

  if (!alignmentData || !alignmentData.isOptionBlock) {
    return indent + line;
  }

  const { maxKeyLength } = alignmentData;

  // Match option key-value pairs (e.g., "id: value", "message: value")
  const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
  if (keyValueMatch) {
    const [, key, value] = keyValueMatch;
    const keyPadding = ' '.repeat(Math.max(0, maxKeyLength - key!.length));
    return `${indent}${key}${keyPadding}: ${value}`;
  }

  // For other lines (like closing braces, expressions), just add indent
  return indent + line;
}
