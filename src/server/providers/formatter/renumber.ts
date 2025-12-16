/**
 * Field renumbering utilities for formatter
 */

import { FIELD_NUMBER } from '../../utils/constants';
import { FormatterSettings, splitLines } from './types';

/**
 * Context stack entry for tracking message/enum/oneof blocks
 */
interface RenumberContext {
  type: string;
  fieldCounter: number;
}

/**
 * Renumber fields sequentially within each message/enum block
 * Removes gaps like 1,2,3,5,6 -> 1,2,3,4,5
 */
export function renumberFields(text: string, settings: FormatterSettings): string {
  const lines = splitLines(text);
  const result: string[] = [];

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
            let finalNumber = currentContext.fieldCounter;

            // Skip the internal reserved range
            if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
              finalNumber = 20000;
            }

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
          let finalNumber = currentContext.fieldCounter;

          // Skip the internal reserved range
          if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
            finalNumber = 20000;
          }

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
    const multiLineFieldStart = /^(?:optional|required|repeated)?\s*[A-Za-z_][\w<>.,\s]*\s+[A-Za-z_]\w*\s*=\s*(\/\/.*)?$/.test(trimmedLine);
    if (multiLineFieldStart && contextStack.length > 0) {
      pendingMultiLineField = true;
      result.push(line);
      continue;
    }

    // Check for message/enum/oneof/service start
    if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
      const type = trimmedLine.startsWith('message') ? 'message' : 'enum';
      // For enums, start at 0; for messages, start at configured value
      const startNum = type === 'enum' ? 0 : (settings.renumberStartNumber || 1);
      contextStack.push({ type, fieldCounter: startNum });
      result.push(line);
      continue;
    }

    if (/^oneof\s+\w+\s*\{/.test(trimmedLine)) {
      // Oneofs share field numbers with parent message, so don't reset counter
      const parentCounter = contextStack.length > 0 ? contextStack[contextStack.length - 1]!.fieldCounter : 1;
      contextStack.push({ type: 'oneof', fieldCounter: parentCounter });
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
      const startNum = type === 'enum' ? 0 : (settings.renumberStartNumber || 1);
      contextStack.push({ type, fieldCounter: startNum });
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
      if (trimmedLine.startsWith('reserved') ||
          trimmedLine.startsWith('option') ||
          trimmedLine.startsWith('rpc') ||
          trimmedLine.startsWith('//') ||
          trimmedLine.startsWith('/*')) {
        result.push(line);
        continue;
      }

      // Handle enum values FIRST - before field matching
      if (currentContext!.type === 'enum') {
        const enumMatch = line.match(/^(.+=\s*)(-?\d+)(.*)$/);

        if (enumMatch && !trimmedLine.startsWith('option')) {
          const [, beforeNumber, firstNumber, rest] = enumMatch;

          // Remove any additional "= <number>" sequences after the first number
          const cleanedRest = rest!.replace(/(\s*=\s*-?\d+)+/g, '');

          // Ensure line ends with semicolon, but respect inline comments
          const commentIdx = (() => {
            const slIdx = cleanedRest.indexOf('//');
            const blkIdx = cleanedRest.indexOf('/*');
            if (slIdx === -1) {return blkIdx;}
            if (blkIdx === -1) {return slIdx;}
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
        let finalNumber = currentContext!.fieldCounter;

        // Skip the internal reserved range
        if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
          finalNumber = 20000;
        }

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
