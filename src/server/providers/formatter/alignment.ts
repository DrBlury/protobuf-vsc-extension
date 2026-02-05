/**
 * Alignment calculation utilities for formatter
 *
 * Implements gofmt-style alignment: only adjacent fields (without blank lines)
 * are aligned together. Each group of consecutive fields forms its own
 * independent alignment context.
 */

import type { AlignmentData } from './types';

/**
 * Parse map<K, V> types handling nested angle brackets
 */
export function parseMapTypes(mapContent: string): { keyType: string; valueType: string } {
  let depth = 0;
  let commaPos = -1;

  for (let i = 0; i < mapContent.length; i++) {
    if (mapContent[i] === '<') {
      depth++;
    }
    if (mapContent[i] === '>') {
      depth--;
    }
    if (mapContent[i] === ',' && depth === 0) {
      commaPos = i;
      break;
    }
  }

  if (commaPos === -1) {
    // Fallback: try to find the first comma (for malformed or simple cases)
    const firstCommaPos = mapContent.indexOf(',');
    if (firstCommaPos !== -1) {
      return {
        keyType: mapContent.slice(0, firstCommaPos).trim(),
        valueType: mapContent.slice(firstCommaPos + 1).trim(),
      };
    }
    // If still no comma, return the whole content as keyType (malformed map)
    return { keyType: mapContent.trim(), valueType: '' };
  }

  const keyType = mapContent.slice(0, commaPos).trim();
  const valueType = mapContent.slice(commaPos + 1).trim();
  return { keyType, valueType };
}

/**
 * Check if a line is a field declaration (message field or enum value)
 */
function isFieldLine(trimmedLine: string): boolean {
  // Field pattern: [modifier] type name = number
  if (/^(optional|required|repeated)?\s*\S+\s+\w+\s*=/.test(trimmedLine)) {
    return true;
  }
  // Map field pattern: map<K, V> name = number
  if (/^map\s*<.+>\s+\w+\s*=/.test(trimmedLine)) {
    return true;
  }
  // Enum value pattern: NAME = number (but not option, syntax, edition)
  if (
    /^\w+\s*=/.test(trimmedLine) &&
    !trimmedLine.startsWith('option') &&
    !trimmedLine.startsWith('syntax') &&
    !trimmedLine.startsWith('edition')
  ) {
    return true;
  }
  return false;
}

/**
 * Check if a line is an option key-value line (e.g., "id: value" or "id  : value")
 * Allows optional whitespace before the colon to handle already-aligned lines
 */
function isOptionKeyLine(trimmedLine: string): boolean {
  return /^\w+\s*:\s*/.test(trimmedLine);
}

/**
 * Extract field info for alignment calculation
 */
function getFieldInfo(trimmedLine: string): { typeLength: number; nameLength: number } | null {
  // Field pattern: [modifier] type name = number
  const fieldMatch = trimmedLine.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=/);
  if (fieldMatch) {
    const [, modifier, type, name] = fieldMatch;
    const typeWithModifier = modifier ? `${modifier} ${type}` : type!;
    return { typeLength: typeWithModifier.length, nameLength: name!.length };
  }

  // Map field pattern: map<K, V> name = number
  const mapMatch = trimmedLine.match(/^map\s*<(.+)>\s+(\w+)\s*=/);
  if (mapMatch) {
    const [, mapContent, name] = mapMatch;
    const { keyType, valueType } = parseMapTypes(mapContent!);
    const mapType = `map<${keyType}, ${valueType}>`;
    return { typeLength: mapType.length, nameLength: name!.length };
  }

  // Enum value pattern: NAME = number
  const enumMatch = trimmedLine.match(/^(\w+)\s*=/);
  if (enumMatch && !trimmedLine.startsWith('option')) {
    const [, name] = enumMatch;
    return { typeLength: 0, nameLength: name!.length };
  }

  return null;
}

/**
 * Calculate alignment info for each line using gofmt-style grouping.
 * Only adjacent fields (without blank lines between them) at the same
 * nesting depth are aligned together.
 */
export function calculateAlignmentInfo(lines: string[]): Map<number, AlignmentData> {
  const alignmentInfo = new Map<number, AlignmentData>();

  // First pass: identify alignment groups
  // Each group is a contiguous set of field lines at the same depth
  // separated by blank lines or non-field lines

  interface AlignmentGroup {
    startLine: number;
    endLine: number;
    depth: number;
    isOptionBlock: boolean;
    lines: number[];
  }

  const groups: AlignmentGroup[] = [];
  let currentGroup: AlignmentGroup | null = null;
  let depth = 0;
  let inOptionBlock = false;
  let optionBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i]!.trim();

    // Track braces for depth
    const openBraces = (trimmedLine.match(/\{/g) || []).length;
    const closeBraces = (trimmedLine.match(/\}/g) || []).length;

    // Check if entering option block
    if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
      // Finish current group if any
      if (currentGroup && currentGroup.lines.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
      inOptionBlock = true;
      optionBraceDepth = openBraces - closeBraces;
      depth += openBraces - closeBraces;
      continue;
    }

    // Track option block depth
    if (inOptionBlock) {
      // Check if this line changes depth (before processing it)
      const hasOpeningBrace = openBraces > closeBraces;
      const hasClosingBrace = closeBraces > openBraces;

      // Handle closing braces - finish current group before decreasing depth
      if (hasClosingBrace) {
        if (currentGroup && currentGroup.lines.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = null;
      }

      optionBraceDepth += openBraces - closeBraces;
      if (optionBraceDepth <= 0) {
        inOptionBlock = false;
        // Finish current option group if any
        if (currentGroup && currentGroup.lines.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = null;
      } else if (isOptionKeyLine(trimmedLine)) {
        // Track option keys at any depth level (not just top-level)
        // Each depth level forms its own alignment group
        if (!currentGroup || !currentGroup.isOptionBlock || currentGroup.depth !== depth) {
          if (currentGroup && currentGroup.lines.length > 0) {
            groups.push(currentGroup);
          }
          currentGroup = { startLine: i, endLine: i, depth, isOptionBlock: true, lines: [i] };
        } else {
          currentGroup.endLine = i;
          currentGroup.lines.push(i);
        }

        // If this line opens a brace, finish the group (next lines will be at different depth)
        if (hasOpeningBrace) {
          if (currentGroup && currentGroup.lines.length > 0) {
            groups.push(currentGroup);
          }
          currentGroup = null;
        }
      }
      depth += openBraces - closeBraces;
      continue;
    }

    // Handle closing brace - decrements depth
    if (trimmedLine.startsWith('}')) {
      // Finish current group if any
      if (currentGroup && currentGroup.lines.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
      depth += openBraces - closeBraces;
      continue;
    }

    // Handle blank lines - they break alignment groups
    if (trimmedLine === '') {
      if (currentGroup && currentGroup.lines.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
      continue;
    }

    // Handle message/enum/oneof block starts
    if (/^(message|enum|oneof)\s+\w+\s*\{/.test(trimmedLine)) {
      // Finish current group if any
      if (currentGroup && currentGroup.lines.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
      depth += openBraces - closeBraces;
      continue;
    }

    // Check if this is a field line
    if (isFieldLine(trimmedLine) && depth > 0) {
      // Check if we should continue the current group or start a new one
      if (currentGroup && !currentGroup.isOptionBlock && currentGroup.depth === depth) {
        // Continue current group
        currentGroup.endLine = i;
        currentGroup.lines.push(i);
      } else {
        // Start new group
        if (currentGroup && currentGroup.lines.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = { startLine: i, endLine: i, depth, isOptionBlock: false, lines: [i] };
      }
    } else {
      // Non-field line breaks the group (comments, reserved, etc.)
      if (currentGroup && currentGroup.lines.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = null;
    }

    // Update depth for opening braces (after processing the line)
    if (openBraces > closeBraces && !trimmedLine.startsWith('}')) {
      depth += openBraces - closeBraces;
    }
  }

  // Don't forget the last group
  if (currentGroup && currentGroup.lines.length > 0) {
    groups.push(currentGroup);
  }

  // Second pass: calculate alignment for each group
  for (const group of groups) {
    let maxFieldNameLength = 0;
    let maxTypeLength = 0;
    let maxKeyLength = 0;

    for (const lineNum of group.lines) {
      const trimmedLine = lines[lineNum]!.trim();

      if (group.isOptionBlock) {
        // Match option keys allowing optional whitespace before colon (to handle already-aligned lines)
        const optionKeyMatch = trimmedLine.match(/^(\w+)\s*:\s*/);
        if (optionKeyMatch) {
          maxKeyLength = Math.max(maxKeyLength, optionKeyMatch[1]!.length);
        }
      } else {
        const fieldInfo = getFieldInfo(trimmedLine);
        if (fieldInfo) {
          maxTypeLength = Math.max(maxTypeLength, fieldInfo.typeLength);
          maxFieldNameLength = Math.max(maxFieldNameLength, fieldInfo.nameLength);
        }
      }
    }

    const alignmentData: AlignmentData = {
      maxFieldNameLength,
      maxTypeLength,
      isOptionBlock: group.isOptionBlock,
      maxKeyLength,
    };

    // Store alignment data for each line in the group
    for (const lineNum of group.lines) {
      alignmentInfo.set(lineNum, alignmentData);
    }
  }

  return alignmentInfo;
}
