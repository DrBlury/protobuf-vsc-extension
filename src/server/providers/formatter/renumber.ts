/**
 * Field renumbering utilities for formatter
 */

import { FIELD_NUMBER } from '../../utils/constants';
import type { FormatterSettings } from './types';
import { splitLines } from './types';

/**
 * Context stack entry for tracking message/enum/oneof blocks
 */
interface RenumberContext {
  type: string;
  fieldCounter: number;
  reservedRanges?: ReservedRange[];
}

interface ReservedRange {
  start: number;
  end: number;
}

function parseIntegerLiteral(value: string): number | null {
  let trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let sign = 1;
  if (trimmed.startsWith('-')) {
    sign = -1;
    trimmed = trimmed.slice(1);
  } else if (trimmed.startsWith('+')) {
    trimmed = trimmed.slice(1);
  }

  if (!trimmed) {
    return null;
  }

  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return sign * parseInt(trimmed, 16);
  }

  if (trimmed.startsWith('0') && trimmed.length > 1 && /^0[0-7]+$/.test(trimmed)) {
    return sign * parseInt(trimmed, 8);
  }

  if (/^\d+$/.test(trimmed)) {
    return sign * parseInt(trimmed, 10);
  }

  return null;
}

function stripInlineComments(line: string): string {
  const slIdx = line.indexOf('//');
  const blockIdx = line.indexOf('/*');

  if (slIdx === -1 && blockIdx === -1) {
    return line;
  }

  if (slIdx === -1) {
    return line.slice(0, blockIdx);
  }

  if (blockIdx === -1) {
    return line.slice(0, slIdx);
  }

  return line.slice(0, Math.min(slIdx, blockIdx));
}

function parseReservedRanges(line: string): ReservedRange[] {
  const withoutComments = stripInlineComments(line);
  const match = withoutComments.match(/reserved\s+(.+?)\s*;/i);
  if (!match?.[1]) {
    return [];
  }

  const content = match[1].trim();
  if (!content) {
    return [];
  }

  if (/["']/.test(content)) {
    return [];
  }

  const ranges: ReservedRange[] = [];
  const parts = content
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\S+)\s+to\s+(\S+)$/i);
    if (rangeMatch) {
      const startValue = parseIntegerLiteral(rangeMatch[1]!);
      const endRaw = rangeMatch[2]!.toLowerCase();
      const endValue = endRaw === 'max' ? FIELD_NUMBER.MAX : parseIntegerLiteral(rangeMatch[2]!);

      if (startValue === null || endValue === null) {
        continue;
      }

      const start = Math.min(startValue, endValue);
      const end = Math.max(startValue, endValue);

      if (end < FIELD_NUMBER.MIN) {
        continue;
      }

      ranges.push({
        start: Math.max(start, FIELD_NUMBER.MIN),
        end: Math.min(end, FIELD_NUMBER.MAX),
      });
      continue;
    }

    const value = parseIntegerLiteral(part);
    if (value === null) {
      continue;
    }

    if (value < FIELD_NUMBER.MIN || value > FIELD_NUMBER.MAX) {
      continue;
    }

    ranges.push({ start: value, end: value });
  }

  return ranges;
}

function collectMessageReservedRanges(lines: string[]): Map<number, ReservedRange[]> {
  const reservedByMessage = new Map<number, ReservedRange[]>();
  const stack: Array<{ type: string; startLine: number; reservedRanges: ReservedRange[] }> = [];
  let pendingReserved: { context: { reservedRanges: ReservedRange[] }; buffer: string } | null = null;
  let optionBraceDepth = 0;
  let inlineOptionBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();

    if (optionBraceDepth > 0) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      optionBraceDepth += openBraces - closeBraces;
      continue;
    }

    if (inlineOptionBraceDepth > 0) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      inlineOptionBraceDepth += openBraces - closeBraces;
      continue;
    }

    if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      optionBraceDepth = openBraces - closeBraces;
      continue;
    }

    if (trimmedLine.includes('[') && trimmedLine.includes('{')) {
      const bracketStart = trimmedLine.indexOf('[');
      const afterBracket = trimmedLine.slice(bracketStart);
      const openBraces = (afterBracket.match(/\{/g) || []).length;
      const closeBraces = (afterBracket.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        inlineOptionBraceDepth = openBraces - closeBraces;
        continue;
      }
    }

    if (pendingReserved) {
      pendingReserved.buffer = `${pendingReserved.buffer} ${trimmedLine}`.trim();
      if (pendingReserved.buffer.includes(';')) {
        pendingReserved.context.reservedRanges.push(...parseReservedRanges(pendingReserved.buffer));
        pendingReserved = null;
      }
      continue;
    }

    if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
      const type = trimmedLine.startsWith('message') ? 'message' : 'enum';
      stack.push({ type, startLine: i, reservedRanges: [] });
      continue;
    }

    if (/^oneof\s+\w+\s*\{/.test(trimmedLine)) {
      stack.push({ type: 'oneof', startLine: i, reservedRanges: [] });
      continue;
    }

    if (/^service\s+\w+\s*\{/.test(trimmedLine)) {
      stack.push({ type: 'service', startLine: i, reservedRanges: [] });
      continue;
    }

    if (trimmedLine === '}' || trimmedLine.startsWith('}')) {
      const popped = stack.pop();
      if (popped?.type === 'message') {
        reservedByMessage.set(popped.startLine, popped.reservedRanges);
      }
      pendingReserved = null;
      continue;
    }

    if (trimmedLine.startsWith('reserved') && stack.length > 0) {
      const current = stack[stack.length - 1]!;
      if (current.type === 'message') {
        if (trimmedLine.includes(';')) {
          current.reservedRanges.push(...parseReservedRanges(trimmedLine));
        } else {
          pendingReserved = { context: current, buffer: trimmedLine };
        }
      }
    }
  }

  for (const context of stack) {
    if (context.type === 'message' && !reservedByMessage.has(context.startLine)) {
      reservedByMessage.set(context.startLine, context.reservedRanges);
    }
  }

  return reservedByMessage;
}

function isReservedNumber(value: number, ranges: ReservedRange[]): boolean {
  for (const range of ranges) {
    if (value >= range.start && value <= range.end) {
      return true;
    }
  }
  return false;
}

function getNextFieldNumber(currentContext: RenumberContext, increment: number, skipInternalRange: boolean): number {
  let next = currentContext.fieldCounter;
  const ranges = currentContext.reservedRanges ?? [];

  while (true) {
    const inInternalRange =
      skipInternalRange && next >= FIELD_NUMBER.RESERVED_RANGE_START && next <= FIELD_NUMBER.RESERVED_RANGE_END;
    if (inInternalRange || isReservedNumber(next, ranges)) {
      next += increment;
      continue;
    }
    return next;
  }
}

/**
 * Renumber fields sequentially within each message/enum block
 * Removes gaps like 1,2,3,5,6 -> 1,2,3,4,5
 */
export function renumberFields(text: string, settings: FormatterSettings): string {
  const lines = splitLines(text);
  const result: string[] = [];
  const preserveReserved = settings.preserveReserved ?? true;
  const skipInternalRange = settings.skipInternalRange ?? true;
  const reservedByMessage = preserveReserved ? collectMessageReservedRanges(lines) : new Map<number, ReservedRange[]>();

  // Stack to track context: each entry is { type: 'message'|'enum'|'oneof', fieldCounter: number }
  const contextStack: RenumberContext[] = [];
  const increment = settings.renumberIncrement || 1;

  // Track depth inside option blocks (aggregate options like CEL)
  // When > 0, we're inside a multi-line option and should not renumber anything
  let optionBraceDepth = 0;
  // Track depth inside inline field options [...] containing braces
  let inlineOptionBraceDepth = 0;
  // Track multi-line field declarations (field_type field_name =\n   NUMBER;)
  let pendingMultiLineField = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    const trimmedLine = line.trim();

    // Track multi-line option blocks (e.g., option (buf.validate.message).cel = { ... })
    // Count braces to know when we exit the option block
    if (optionBraceDepth > 0) {
      // Count opening and closing braces on this line
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      optionBraceDepth += openBraces - closeBraces;

      // Don't process lines inside option blocks - just pass them through
      result.push(line);
      continue;
    }

    // Track inline field options with braces (e.g., field = 1 [(buf.validate.field).cel = { ... }])
    if (inlineOptionBraceDepth > 0) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      inlineOptionBraceDepth += openBraces - closeBraces;

      // Don't process lines inside inline option blocks - just pass them through
      result.push(line);
      continue;
    }

    // Check if this line starts an option with an opening brace (multi-line option)
    if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      optionBraceDepth = openBraces - closeBraces;
      result.push(line);
      continue;
    }

    // Check if this line has inline field options with braces
    if (trimmedLine.includes('[') && trimmedLine.includes('{')) {
      const bracketStart = trimmedLine.indexOf('[');
      const afterBracket = trimmedLine.slice(bracketStart);
      const openBraces = (afterBracket.match(/\{/g) || []).length;
      const closeBraces = (afterBracket.match(/\}/g) || []).length;

      if (openBraces > closeBraces) {
        // Multi-line inline option - renumber the field but preserve the structure
        if (contextStack.length > 0) {
          const currentContext = contextStack[contextStack.length - 1]!;
          const fieldNumberMatch = line.match(/^(.+=\s*)(\d+)(.*)$/);

          if (fieldNumberMatch && (currentContext.type === 'message' || currentContext.type === 'oneof')) {
            const [, beforeNumber, , afterNumber] = fieldNumberMatch;
            const finalNumber = getNextFieldNumber(currentContext, increment, skipInternalRange);

            // Replace with the new sequential number
            line = `${beforeNumber}${finalNumber}${afterNumber}`;
            currentContext.fieldCounter = finalNumber + increment;
          }
        }

        // Track brace depth and continue to next line
        inlineOptionBraceDepth = openBraces - closeBraces;
        result.push(line);
        continue;
      }
    }

    // Handle multi-line field declarations
    // Check if this is a continuation line (just a number with semicolon) after a field start
    if (pendingMultiLineField && contextStack.length > 0) {
      const continuationMatch = trimmedLine.match(/^(\d+)\s*(.*)$/);
      if (continuationMatch) {
        const currentContext = contextStack[contextStack.length - 1]!;
        if (currentContext.type === 'message' || currentContext.type === 'oneof') {
          const finalNumber = getNextFieldNumber(currentContext, increment, skipInternalRange);

          const [, , rest] = continuationMatch;
          // Preserve the original indentation
          const leadingWhitespace = line.match(/^(\s*)/)?.[1] || '';
          line = `${leadingWhitespace}${finalNumber}${rest}`;
          currentContext.fieldCounter = finalNumber + increment;
        }
        pendingMultiLineField = false;
        result.push(line);
        continue;
      }
    }

    // Check if this line starts a multi-line field declaration (ends with '=' or '= // comment')
    const multiLineFieldStart =
      /^(?:optional|required|repeated)?\s*[A-Za-z_][\w<>.,\s]*\s+[A-Za-z_]\w*\s*=\s*(\/\/.*)?$/.test(trimmedLine);
    if (multiLineFieldStart && contextStack.length > 0) {
      pendingMultiLineField = true;
      result.push(line);
      continue;
    }

    // Check for message/enum/oneof/service start
    if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
      const type = trimmedLine.startsWith('message') ? 'message' : 'enum';
      // For enums, start at 0; for messages, start at configured value
      const startNum = type === 'enum' ? 0 : settings.renumberStartNumber || 1;
      const reservedRanges = type === 'message' ? (reservedByMessage.get(i) ?? []) : [];
      contextStack.push({ type, fieldCounter: startNum, reservedRanges });
      result.push(line);
      continue;
    }

    if (/^oneof\s+\w+\s*\{/.test(trimmedLine)) {
      // Oneofs share field numbers with parent message, so don't reset counter
      const parentCounter = contextStack.length > 0 ? contextStack[contextStack.length - 1]!.fieldCounter : 1;
      const parentMessage = [...contextStack].reverse().find(ctx => ctx.type === 'message');
      const reservedRanges = parentMessage?.reservedRanges ?? [];
      contextStack.push({ type: 'oneof', fieldCounter: parentCounter, reservedRanges });
      result.push(line);
      continue;
    }

    if (/^service\s+\w+\s*\{/.test(trimmedLine)) {
      contextStack.push({ type: 'service', fieldCounter: 0 });
      result.push(line);
      continue;
    }

    // Check for nested message/enum inside a message
    if (contextStack.length > 0 && /^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
      const type = trimmedLine.startsWith('message') ? 'message' : 'enum';
      const startNum = type === 'enum' ? 0 : settings.renumberStartNumber || 1;
      const reservedRanges = type === 'message' ? (reservedByMessage.get(i) ?? []) : [];
      contextStack.push({ type, fieldCounter: startNum, reservedRanges });
      result.push(line);
      continue;
    }

    // Check for closing brace
    if (trimmedLine === '}' || trimmedLine.startsWith('}')) {
      if (contextStack.length > 0) {
        const popped = contextStack.pop()!;
        // If we're exiting a oneof, update parent's counter
        if (popped.type === 'oneof' && contextStack.length > 0) {
          contextStack[contextStack.length - 1]!.fieldCounter = popped.fieldCounter;
        }
      }
      result.push(line);
      continue;
    }

    // Check if we're in a message or enum context and this is a field line
    if (contextStack.length > 0) {
      const currentContext = contextStack[contextStack.length - 1];

      // Skip reserved, option, rpc lines
      // Note: use 'option ' or 'option(' to avoid matching 'optional' field modifier
      if (
        trimmedLine.startsWith('reserved') ||
        trimmedLine.startsWith('option ') ||
        trimmedLine.startsWith('option(') ||
        trimmedLine.startsWith('rpc') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('/*')
      ) {
        result.push(line);
        continue;
      }

      // Handle enum values FIRST - before field matching
      if (currentContext!.type === 'enum') {
        const enumMatch = line.match(/^(.+=\s*)(-?\d+)(.*)$/);

        // Skip option statements (option followed by space or parenthesis)
        if (enumMatch && !trimmedLine.startsWith('option ') && !trimmedLine.startsWith('option(')) {
          const [, beforeNumber, firstNumber, rest] = enumMatch;

          // Remove any additional "= <number>" sequences after the first number
          const cleanedRest = rest!.replace(/(\s*=\s*-?\d+)+/g, '');

          // Ensure line ends with semicolon, but respect inline comments
          const commentIdx = (() => {
            const slIdx = cleanedRest.indexOf('//');
            const blkIdx = cleanedRest.indexOf('/*');
            if (slIdx === -1) {
              return blkIdx;
            }
            if (blkIdx === -1) {
              return slIdx;
            }
            return Math.min(slIdx, blkIdx);
          })();

          let finalRest = cleanedRest;

          // If there's a comment, handle semicolon placement before it
          if (commentIdx >= 0) {
            const beforeComment = cleanedRest.slice(0, commentIdx);
            const comment = cleanedRest.slice(commentIdx);

            // Clean up multiple semicolons and ensure exactly one before comment
            const cleanedBefore = beforeComment.replace(/;+$/, '').trimEnd();
            finalRest = `${cleanedBefore}; ${comment}`;
          } else {
            // No comment: clean up multiple semicolons and add one if needed
            const cleanedNoComment = finalRest.replace(/;+$/, '');
            const withoutTrailingWhitespace = cleanedNoComment.replace(/\s+$/, '');
            finalRest = `${withoutTrailingWhitespace};`;
          }

          line = `${beforeNumber}${firstNumber}${finalRest}`;

          result.push(line);
          continue;
        }

        result.push(line);
        continue;
      }

      // Field pattern: type name = NUMBER; or with options
      const fieldNumberMatch = line.match(/^(.+=\s*)(\d+)(.*)$/);

      if (fieldNumberMatch) {
        const [, beforeNumber, , afterNumber] = fieldNumberMatch;

        // Use the current field counter for renumbering
        const finalNumber = getNextFieldNumber(currentContext!, increment, skipInternalRange);

        // Replace with the new sequential number
        line = `${beforeNumber}${finalNumber}${afterNumber}`;
        currentContext!.fieldCounter = finalNumber + increment;

        result.push(line);
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}
