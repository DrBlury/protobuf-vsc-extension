/**
 * Code Formatter for Protocol Buffers
 */

import { TextEdit, Range } from 'vscode-languageserver/node';
import { FIELD_NUMBER } from '../utils/constants';

export interface FormatterSettings {
  indentSize: number;
  useTabIndent: boolean;
  maxLineLength?: number;
  renumberOnFormat?: boolean;
  renumberStartNumber?: number;
  renumberIncrement?: number;
}

const DEFAULT_SETTINGS: FormatterSettings = {
  indentSize: 2,
  useTabIndent: false,
  renumberOnFormat: true,
  renumberStartNumber: 1,
  renumberIncrement: 1
};

export class ProtoFormatter {
  private settings: FormatterSettings = DEFAULT_SETTINGS;

  updateSettings(settings: Partial<FormatterSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  format(text: string): string {
    const lines = text.split('\n');
    const formattedLines: string[] = [];
    let indentLevel = 0;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Handle block comments
      if (inBlockComment) {
        formattedLines.push(`${this.getIndent(indentLevel)} ${trimmedLine}`);
        if (trimmedLine.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmedLine.startsWith('/*') && !trimmedLine.includes('*/')) {
        inBlockComment = true;
        formattedLines.push(this.getIndent(indentLevel) + trimmedLine);
        continue;
      }

      // Skip empty lines but preserve them
      if (trimmedLine === '') {
        formattedLines.push('');
        continue;
      }

      // Check for closing brace
      const startsWithClosingBrace = trimmedLine.startsWith('}');
      if (startsWithClosingBrace && indentLevel > 0) {
        indentLevel--;
      }

      // Format the line
      const formattedLine = this.formatLine(trimmedLine, indentLevel);
      formattedLines.push(formattedLine);

      // Check for opening brace
      const hasOpeningBrace = trimmedLine.includes('{') && !trimmedLine.includes('}');
      const endsWithOpeningBrace = trimmedLine.endsWith('{');
      if (hasOpeningBrace || endsWithOpeningBrace) {
        indentLevel++;
      }

      // Handle single line with both braces
      if (trimmedLine.includes('{') && trimmedLine.includes('}')) {
        // No change to indent level
      }
    }

    let result = formattedLines.join('\n');

    // Apply renumbering if enabled
    if (this.settings.renumberOnFormat) {
      result = this.renumberFields(result);
    }

    return result;
  }

  private formatLine(line: string, indentLevel: number): string {
    const indent = this.getIndent(indentLevel);

    // Handle comments
    if (line.startsWith('//') || line.startsWith('/*')) {
      return indent + line;
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
    const mapMatch = line.match(/^map\s*<\s*(\w+)\s*,\s*(\S+)\s*>\s+(\w+)\s*=\s*(\d+)(.*)$/);
    if (mapMatch) {
      const [, keyType, valueType, name, number, rest] = mapMatch;
      return `${indent}map<${keyType}, ${valueType}> ${name} = ${number}${rest}`;
    }

    // Format enum values
    const enumValueMatch = line.match(/^(\w+)\s*=\s*(-?\d+)(.*)$/);
    if (enumValueMatch && !line.includes('option') && !line.includes('syntax') && !line.includes('edition')) {
      const [, name, value, rest] = enumValueMatch;
      return `${indent}${name} = ${value}${rest}`;
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

  private getIndent(level: number): string {
    if (this.settings.useTabIndent) {
      return '\t'.repeat(level);
    }
    return ' '.repeat(level * this.settings.indentSize);
  }

  formatDocument(text: string): TextEdit[] {
    const formatted = this.format(text);
    const lines = text.split('\n');

    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1].length }
      },
      newText: formatted
    }];
  }

  formatRange(text: string, range: Range): TextEdit[] {
    const lines = text.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Extract the range to format
    const rangeLines = lines.slice(startLine, endLine + 1);
    const rangeText = rangeLines.join('\n');

    // Determine indent level at start of range
    let indentLevel = 0;
    for (let i = 0; i < startLine; i++) {
      const line = lines[i].trim();
      if (line.includes('{') && !line.includes('}')) {
        indentLevel++;
      }
      if (line.startsWith('}')) {
        indentLevel--;
      }
    }

    // Format the range
    const formatted = this.formatRangeWithIndent(rangeText, indentLevel);

    return [{
      range: {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: lines[endLine].length }
      },
      newText: formatted
    }];
  }

  private formatRangeWithIndent(text: string, startIndentLevel: number): string {
    const lines = text.split('\n');
    const formattedLines: string[] = [];
    let indentLevel = startIndentLevel;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        formattedLines.push('');
        continue;
      }

      if (trimmedLine.startsWith('}') && indentLevel > 0) {
        indentLevel--;
      }

      formattedLines.push(this.formatLine(trimmedLine, indentLevel));

      if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
        indentLevel++;
      }
    }

    return formattedLines.join('\n');
  }

  /**
   * Renumber fields sequentially within each message/enum block
   * Removes gaps like 1,2,3,5,6 -> 1,2,3,4,5
   */
  private renumberFields(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];

    // Stack to track context: each entry is { type: 'message'|'enum'|'oneof', fieldCounter: number }
    const contextStack: Array<{ type: string; fieldCounter: number }> = [];
    const increment = this.settings.renumberIncrement || 1;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();

      // Check for message/enum/oneof/service start
      if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
        const type = trimmedLine.startsWith('message') ? 'message' : 'enum';
        // For enums, start at 0; for messages, start at configured value
        const startNum = type === 'enum' ? 0 : (this.settings.renumberStartNumber || 1);
        contextStack.push({ type, fieldCounter: startNum });
        result.push(line);
        continue;
      }

      if (/^oneof\s+\w+\s*\{/.test(trimmedLine)) {
        // Oneofs share field numbers with parent message, so don't reset counter
        // Just mark we're in a oneof
        const parentCounter = contextStack.length > 0 ? contextStack[contextStack.length - 1].fieldCounter : 1;
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
        const startNum = type === 'enum' ? 0 : (this.settings.renumberStartNumber || 1);
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
            contextStack[contextStack.length - 1].fieldCounter = popped.fieldCounter;
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

        // Field pattern: type name = NUMBER; or with options
        // Map field pattern: map<K, V> name [= NUMBER] [options] [;...]
        const mapMatch = line.match(/^(\s*)map\s*<\s*(\w+)\s*,\s*(\S+)\s*>\s+(\w+)(?:\s*=\s*(\d+))?(.*?)(;.*)?$/);

        if (mapMatch) {
          const [, indent, keyType, valueType, fieldName, existingNumber, options = '', ending = ''] = mapMatch;
          const numberSource = existingNumber ? parseInt(existingNumber, 10) : currentContext.fieldCounter;

          let finalNumber = numberSource;
          if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
            finalNumber = 20000;
          }

          const endingText = ending.includes(';') ? ending : `${ending};`;
          line = `${indent}map<${keyType}, ${valueType}> ${fieldName} = ${finalNumber}${options}${endingText}`;
          currentContext.fieldCounter = finalNumber + increment;

          result.push(line);
          continue;
        }

        // Field pattern: type name [= NUMBER] [options] [;...]
        const fieldMatch = line.match(/^(\s*)((?:optional|required|repeated)\s+)?(.+?)\s+(\w+)(?:\s*=\s*(\d+))?(.*?)(;.*)?$/);

        if (fieldMatch) {
          const [, indent, modifier, fieldType, fieldName, existingNumber, options = '', ending = ''] = fieldMatch;
          const modifierPart = modifier || '';
          const numberSource = existingNumber ? parseInt(existingNumber, 10) : currentContext.fieldCounter;

          let finalNumber = numberSource;
          if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
            finalNumber = 20000;
          }

          const endingText = ending.includes(';') ? ending : `${ending};`;
          line = `${indent}${modifierPart}${fieldType} ${fieldName} = ${finalNumber}${options}${endingText}`;
          currentContext.fieldCounter = finalNumber + increment;

          result.push(line);
          continue;
        }

        // Enum value pattern: NAME = NUMBER;
        if (currentContext.type === 'enum') {
          const enumMatch = line.match(/^(\s*)(\w+)\s*=\s*(-?\d+)(.*?)(;.*)$/);

          if (enumMatch && !trimmedLine.startsWith('option')) {
            const [, indent, valueName, _oldNumber, options, ending] = enumMatch;
            const newNumber = currentContext.fieldCounter;

            line = `${indent}${valueName} = ${newNumber}${options}${ending}`;
            currentContext.fieldCounter += (this.settings.renumberIncrement || 1);

            result.push(line);
            continue;
          }
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }
}

export const formatter = new ProtoFormatter();
