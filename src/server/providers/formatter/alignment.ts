/**
 * Alignment calculation utilities for formatter
 */

import { AlignmentData } from './types';

/**
 * Parse map<K, V> types handling nested angle brackets
 */
export function parseMapTypes(mapContent: string): { keyType: string; valueType: string } {
  let depth = 0;
  let commaPos = -1;

  for (let i = 0; i < mapContent.length; i++) {
    if (mapContent[i] === '<') {depth++;}
    if (mapContent[i] === '>') {depth--;}
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
        valueType: mapContent.slice(firstCommaPos + 1).trim()
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
 * Calculate alignment info for each message/enum/option block
 */
export function calculateAlignmentInfo(lines: string[]): Map<number, AlignmentData> {
  const alignmentInfo = new Map<number, AlignmentData>();
  let blockStartLine = -1;
  let blockDepth = 0;
  let inOptionBlock = false;
  let maxFieldNameLength = 0;
  let maxTypeLength = 0;
  let maxKeyLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i]!.trim();

    // Track block starts (message, enum, option)
    if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
      if (blockStartLine >= 0 && blockDepth > 0) {
        // Save info for previous block
        alignmentInfo.set(blockStartLine, { maxFieldNameLength, maxTypeLength, isOptionBlock: inOptionBlock, maxKeyLength });
      }
      blockStartLine = i;
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      blockDepth = openBraces - closeBraces;
      inOptionBlock = false;
      maxFieldNameLength = 0;
      maxTypeLength = 0;
      maxKeyLength = 0;
      continue;
    }

    if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
      if (blockStartLine >= 0 && blockDepth > 0) {
        alignmentInfo.set(blockStartLine, { maxFieldNameLength, maxTypeLength, isOptionBlock: inOptionBlock, maxKeyLength });
      }
      blockStartLine = i;
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      blockDepth = openBraces - closeBraces;
      inOptionBlock = true;
      maxFieldNameLength = 0;
      maxTypeLength = 0;
      maxKeyLength = 0;
      continue;
    }

    // Track braces for depth
    if (trimmedLine.includes('{')) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      blockDepth += openBraces;
    }
    if (trimmedLine.includes('}')) {
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      blockDepth -= closeBraces;
      if (blockDepth === 0 && blockStartLine >= 0) {
        // Save info for completed block
        alignmentInfo.set(blockStartLine, { maxFieldNameLength, maxTypeLength, isOptionBlock: inOptionBlock, maxKeyLength });
        blockStartLine = -1;
      }
      continue;
    }

    // Only analyze direct children (blockDepth > 0, in the block)
    if (blockDepth <= 0 || blockStartLine < 0) {
      continue;
    }

    // Analyze option block lines (e.g., "id: value", "message: value")
    if (inOptionBlock) {
      const optionKeyMatch = trimmedLine.match(/^(\w+):\s*/);
      if (optionKeyMatch) {
        const keyLen = optionKeyMatch[1]!.length;
        maxKeyLength = Math.max(maxKeyLength, keyLen);
      }
      continue;
    }

    // Analyze field lines for messages/enums
    // Field pattern: [modifier] type name = number
    const fieldMatch = trimmedLine.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=/);
    if (fieldMatch) {
      const [, modifier, type, name] = fieldMatch;
      const typeWithModifier = modifier ? `${modifier} ${type}` : type!;
      maxTypeLength = Math.max(maxTypeLength, typeWithModifier.length);
      maxFieldNameLength = Math.max(maxFieldNameLength, name!.length);
      continue;
    }

    // Map field pattern: map<K, V> name = number
    const mapMatch = trimmedLine.match(/^map\s*<(.+)>\s+(\w+)\s*=/);
    if (mapMatch) {
      const [, mapContent, name] = mapMatch;
      const { keyType, valueType } = parseMapTypes(mapContent!);
      const mapType = `map<${keyType}, ${valueType}>`;
      maxTypeLength = Math.max(maxTypeLength, mapType.length);
      maxFieldNameLength = Math.max(maxFieldNameLength, name!.length);
      continue;
    }

    // Enum value pattern: NAME = number
    const enumMatch = trimmedLine.match(/^(\w+)\s*=/);
    if (enumMatch && !trimmedLine.startsWith('option')) {
      const [, name] = enumMatch;
      maxFieldNameLength = Math.max(maxFieldNameLength, name!.length);
    }
  }

  return alignmentInfo;
}
