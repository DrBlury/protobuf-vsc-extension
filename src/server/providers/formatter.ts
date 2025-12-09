/**
 * Code Formatter for Protocol Buffers
 */

import { TextEdit, Range } from 'vscode-languageserver/node';
import { FIELD_NUMBER } from '../utils/constants';
import { ClangFormatProvider } from '../services/clangFormat';
import { BufFormatProvider } from '../services/bufFormat';

export interface FormatterSettings {
  indentSize: number;
  useTabIndent: boolean;
  maxLineLength?: number;
  renumberOnFormat?: boolean;
  renumberStartNumber?: number;
  renumberIncrement?: number;
  preset?: 'minimal' | 'google' | 'buf' | 'custom';
  alignFields?: boolean;
}

interface AlignmentData {
  maxFieldNameLength: number;
  maxTypeLength: number;
  isOptionBlock: boolean;
  maxKeyLength: number;
}

const DEFAULT_SETTINGS: FormatterSettings = {
  indentSize: 2,
  useTabIndent: false,
  renumberOnFormat: true,
  renumberStartNumber: 1,
  renumberIncrement: 1,
  preset: 'minimal',
  alignFields: true
};

export class ProtoFormatter {
  private settings: FormatterSettings = DEFAULT_SETTINGS;

  constructor(
    private clangFormat?: ClangFormatProvider,
    private bufFormat?: BufFormatProvider
  ) {}

  updateSettings(settings: Partial<FormatterSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  async formatDocument(text: string): Promise<TextEdit[]> {
    if (this.settings.preset === 'google' && this.clangFormat) {
      const lines = text.split('\n');
      const range = Range.create(0, 0, lines.length, lines[lines.length - 1].length);
      const edits = await this.clangFormat.formatRange(text, range);
      if (edits && edits.length > 0) {
          return edits;
      }
    }

    if (this.settings.preset === 'buf' && this.bufFormat) {
      const formatted = await this.bufFormat.format(text);
      if (formatted) {
        const lines = text.split('\n');
        return [{
          range: Range.create(0, 0, lines.length, lines[lines.length - 1].length),
          newText: formatted
        }];
      }
    }

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

  async formatRange(text: string, range: Range): Promise<TextEdit[]> {
    if (this.settings.preset === 'google' && this.clangFormat) {
      const edits = await this.clangFormat.formatRange(text, range);
      if (edits && edits.length > 0) {
          return edits;
      }
    }

    // Buf doesn't support range formatting easily, fall back to minimal

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

  private format(text: string): string {
    const lines = text.split('\n');

    // If alignment is enabled, first pass to collect alignment info
    let alignmentInfo: Map<number, AlignmentData> | undefined;
    if (this.settings.alignFields) {
      alignmentInfo = this.calculateAlignmentInfo(lines);
    }

    const formattedLines: string[] = [];
    let indentLevel = 0;
    let inBlockComment = false;
    // Track depth inside option blocks (aggregate options like CEL)
    // When > 0, we're inside a multi-line option and should not format lines
    let optionBraceDepth = 0;
    // Track depth inside inline field options [...] containing braces
    let inlineOptionBraceDepth = 0;
    let currentBlockStartLine = 0;

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

      // Track multi-line option blocks (e.g., option (buf.validate.message).cel = { ... })
      // When inside an option block, format with alignment
      if (optionBraceDepth > 0) {
        // Count opening and closing braces on this line
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;

        // Adjust indent for closing brace
        if (trimmedLine.startsWith('}') && indentLevel > 0) {
          indentLevel--;
        }

        // Format option block lines with alignment if enabled
        const formattedLine = this.settings.alignFields && alignmentInfo
          ? this.formatOptionLine(trimmedLine, indentLevel, alignmentInfo.get(currentBlockStartLine))
          : this.getIndent(indentLevel) + trimmedLine;
        formattedLines.push(formattedLine);

        // Adjust indent for opening brace
        if (openBraces > closeBraces) {
          indentLevel++;
        }

        optionBraceDepth += openBraces - closeBraces;
        continue;
      }

      // Track inline field options with braces (e.g., field = 1 [(buf.validate.field).cel = { ... }])
      if (inlineOptionBraceDepth > 0) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;

        // Adjust indent for closing brace
        if (trimmedLine.startsWith('}') && indentLevel > 0) {
          indentLevel--;
        }

        formattedLines.push(this.getIndent(indentLevel) + trimmedLine);

        // Adjust indent for opening brace
        if (openBraces > closeBraces) {
          indentLevel++;
        }

        inlineOptionBraceDepth += openBraces - closeBraces;
        continue;
      }

      // Check if this line starts an option with an opening brace (multi-line option)
      if (trimmedLine.startsWith('option') && trimmedLine.includes('{')) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;
        optionBraceDepth = openBraces - closeBraces;
        currentBlockStartLine = i;

        formattedLines.push(this.getIndent(indentLevel) + trimmedLine);

        if (optionBraceDepth > 0) {
          indentLevel++;
        }
        continue;
      }

      // Check if this line has inline field options with braces (e.g., string city = 1 [(buf.validate.field).cel = {)
      if (trimmedLine.includes('[') && trimmedLine.includes('{')) {
        const bracketStart = trimmedLine.indexOf('[');
        const afterBracket = trimmedLine.slice(bracketStart);
        const openBraces = (afterBracket.match(/\{/g) || []).length;
        const closeBraces = (afterBracket.match(/\}/g) || []).length;

        if (openBraces > closeBraces) {
          // Multi-line inline option - preserve and track
          inlineOptionBraceDepth = openBraces - closeBraces;
          formattedLines.push(this.getIndent(indentLevel) + trimmedLine);
          indentLevel++;
          continue;
        }
      }

      // Track message/enum block starts for alignment
      if (/^(message|enum)\s+\w+\s*\{/.test(trimmedLine)) {
        currentBlockStartLine = i;
      }

      // Check for closing brace
      const startsWithClosingBrace = trimmedLine.startsWith('}');
      if (startsWithClosingBrace && indentLevel > 0) {
        indentLevel--;
      }

      // Format the line with alignment if enabled
      const formattedLine = this.settings.alignFields && alignmentInfo
        ? this.formatLineWithAlignment(trimmedLine, indentLevel, alignmentInfo.get(currentBlockStartLine))
        : this.formatLine(trimmedLine, indentLevel);
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
    // Handle nested maps like map<K, map<K2, V2>>
    // The greedy match (.+) is correct here - it will match all content until the last >
    // before the field name, which is what we want for nested maps
    const mapMatch = line.match(/^map\s*<(.+)>\s+(\w+)\s*=\s*(\d+)(.*)$/);
    if (mapMatch) {
      const [, mapContent, name, number, rest] = mapMatch;
      const { keyType, valueType } = this.parseMapTypes(mapContent);
      return `${indent}map<${keyType}, ${valueType}> ${name} = ${number}${rest}`;
    }

    // Format enum values - strip any duplicate = N patterns
    const enumValueMatch = line.match(/^(\w+)\s*=\s*(-?\d+)(.*)$/);
    // Check that this is not a statement line (option, syntax, edition) by checking the start
    if (enumValueMatch && !line.match(/^(option|syntax|edition)\s/)) {
      const [, name, value, rest] = enumValueMatch;
      // Strip any repeated "= N" patterns from rest, but keep options [...] and comments
      const cleanedRest = rest.replace(/\s*=\s*-?\d+/g, '');
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
   * Parse map<K, V> types handling nested angle brackets
   */
  private parseMapTypes(mapContent: string): { keyType: string; valueType: string } {
    let depth = 0;
    let commaPos = -1;

    for (let i = 0; i < mapContent.length; i++) {
      if (mapContent[i] === '<') depth++;
      if (mapContent[i] === '>') depth--;
      if (mapContent[i] === ',' && depth === 0) {
        commaPos = i;
        break;
      }
    }

    if (commaPos === -1) {
      // Fallback: try to find the first comma (for malformed or simple cases)
      // This handles cases where depth tracking failed or simple maps without nesting
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
  private calculateAlignmentInfo(lines: string[]): Map<number, AlignmentData> {
    const alignmentInfo = new Map<number, AlignmentData>();
    let blockStartLine = -1;
    let blockDepth = 0;
    let inOptionBlock = false;
    let maxFieldNameLength = 0;
    let maxTypeLength = 0;
    let maxKeyLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();

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
          const keyLen = optionKeyMatch[1].length;
          maxKeyLength = Math.max(maxKeyLength, keyLen);
        }
        continue;
      }

      // Analyze field lines for messages/enums
      // Field pattern: [modifier] type name = number
      const fieldMatch = trimmedLine.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=/);
      if (fieldMatch) {
        const [, modifier, type, name] = fieldMatch;
        const typeWithModifier = modifier ? `${modifier} ${type}` : type;
        maxTypeLength = Math.max(maxTypeLength, typeWithModifier.length);
        maxFieldNameLength = Math.max(maxFieldNameLength, name.length);
        continue;
      }

      // Map field pattern: map<K, V> name = number
      // Need to handle nested maps like map<K, map<K2, V2>>
      const mapMatch = trimmedLine.match(/^map\s*<(.+)>\s+(\w+)\s*=/);
      if (mapMatch) {
        const [, mapContent, name] = mapMatch;
        // Parse key and value types (find comma at depth 0)
        const { keyType, valueType } = this.parseMapTypes(mapContent);
        const mapType = `map<${keyType}, ${valueType}>`;
        maxTypeLength = Math.max(maxTypeLength, mapType.length);
        maxFieldNameLength = Math.max(maxFieldNameLength, name.length);
        continue;
      }

      // Enum value pattern: NAME = number
      const enumMatch = trimmedLine.match(/^(\w+)\s*=/);
      if (enumMatch && !trimmedLine.startsWith('option')) {
        const [, name] = enumMatch;
        maxFieldNameLength = Math.max(maxFieldNameLength, name.length);
      }
    }

    return alignmentInfo;
  }

  /**
   * Format a field line with alignment
   */
  private formatLineWithAlignment(line: string, indentLevel: number, alignmentData?: AlignmentData): string {
    if (!alignmentData || alignmentData.isOptionBlock) {
      return this.formatLine(line, indentLevel);
    }

    const indent = this.getIndent(indentLevel);
    const { maxFieldNameLength, maxTypeLength } = alignmentData;

    // Handle comments
    if (line.startsWith('//') || line.startsWith('/*')) {
      return indent + line;
    }

    // Format field definitions with alignment
    const fieldMatch = line.match(/^(optional|required|repeated)?\s*(\S+)\s+(\w+)\s*=\s*(\d+)(.*)$/);
    if (fieldMatch) {
      const [, modifier, type, name, number, rest] = fieldMatch;
      const typeWithModifier = modifier ? `${modifier} ${type}` : type;
      const typePadding = ' '.repeat(Math.max(0, maxTypeLength - typeWithModifier.length));
      const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name.length));
      return `${indent}${typeWithModifier}${typePadding} ${name}${namePadding} = ${number}${rest}`;
    }

    // Format map fields with alignment
    // Handle nested maps like map<K, map<K2, V2>>
    const mapMatch = line.match(/^map\s*<(.+)>\s+(\w+)\s*=\s*(\d+)(.*)$/);
    if (mapMatch) {
      const [, mapContent, name, number, rest] = mapMatch;
      const { keyType, valueType } = this.parseMapTypes(mapContent);
      const mapType = `map<${keyType}, ${valueType}>`;
      const typePadding = ' '.repeat(Math.max(0, maxTypeLength - mapType.length));
      const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name.length));
      return `${indent}${mapType}${typePadding} ${name}${namePadding} = ${number}${rest}`;
    }

    // Format enum values with alignment
    const enumValueMatch = line.match(/^(\w+)\s*=\s*(-?\d+)(.*)$/);
    // Check that this is not a statement line (option, syntax, edition) by checking the start
    if (enumValueMatch && !line.match(/^(option|syntax|edition)\s/)) {
      const [, name, value, rest] = enumValueMatch;
      const cleanedRest = rest.replace(/\s*=\s*-?\d+/g, '');
      const namePadding = ' '.repeat(Math.max(0, maxFieldNameLength - name.length));
      return `${indent}${name}${namePadding} = ${value}${cleanedRest}`;
    }

    // For other lines, use standard formatting
    return this.formatLine(line, indentLevel);
  }

  /**
   * Format an option block line with alignment (e.g., CEL expressions)
   */
  private formatOptionLine(line: string, indentLevel: number, alignmentData?: AlignmentData): string {
    const indent = this.getIndent(indentLevel);

    if (!alignmentData || !alignmentData.isOptionBlock) {
      return indent + line;
    }

    const { maxKeyLength } = alignmentData;

    // Match option key-value pairs (e.g., "id: value", "message: value")
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      const keyPadding = ' '.repeat(Math.max(0, maxKeyLength - key.length));
      return `${indent}${key}${keyPadding}: ${value}`;
    }

    // For other lines (like closing braces, expressions), just add indent
    return indent + line;
  }

  private getIndent(level: number): string {
    if (this.settings.useTabIndent) {
      return '\t'.repeat(level);
    }
    return ' '.repeat(level * this.settings.indentSize);
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

    // Track depth inside option blocks (aggregate options like CEL)
    // When > 0, we're inside a multi-line option and should not renumber anything
    let optionBraceDepth = 0;
    // Track depth inside inline field options [...] containing braces
    let inlineOptionBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
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

      // Check if this line has inline field options with braces (e.g., string city = 1 [(buf.validate.field).cel = {)
      // This is a field definition with [...] containing a { that doesn't close on same line
      if (trimmedLine.includes('[') && trimmedLine.includes('{')) {
        const bracketStart = trimmedLine.indexOf('[');
        const afterBracket = trimmedLine.slice(bracketStart);
        const openBraces = (afterBracket.match(/\{/g) || []).length;
        const closeBraces = (afterBracket.match(/\}/g) || []).length;

        if (openBraces > closeBraces) {
          // Multi-line inline option - preserve the line as-is and track brace depth
          inlineOptionBraceDepth = openBraces - closeBraces;
          result.push(line);
          continue;
        }
      }

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

        // Handle enum values FIRST - before field matching which would incorrectly match them
        // Enum values: preserve alignment, just clean up any duplicate assignments
        if (currentContext.type === 'enum') {
          const enumMatch = line.match(/^(.+=\s*)(-?\d+)(.*)$/);

          if (enumMatch && !trimmedLine.startsWith('option')) {
            const [, beforeNumber, firstNumber, rest] = enumMatch;

            // Remove any additional "= <number>" sequences after the first number
            const cleanedRest = rest.replace(/(\s*=\s*-?\d+)+/g, '');

            // Ensure line ends with semicolon
            const hasTrailingSemi = cleanedRest.includes(';');
            line = `${beforeNumber}${firstNumber}${cleanedRest}${hasTrailingSemi ? '' : ';'}`;
          }

          result.push(line);
          continue;
        }

        // Field pattern: type name = NUMBER; or with options
        // Use a regex that preserves spacing by only replacing the number
        // Match: everything before "= NUMBER" then the number, then everything after
        const fieldNumberMatch = line.match(/^(.+=\s*)(\d+)(.*)$/);

        if (fieldNumberMatch) {
          const [, beforeNumber, existingNumberStr, afterNumber] = fieldNumberMatch;
          const existingNumber = parseInt(existingNumberStr, 10);

          let finalNumber = existingNumber;
          if (finalNumber >= FIELD_NUMBER.RESERVED_RANGE_START && finalNumber <= FIELD_NUMBER.RESERVED_RANGE_END) {
            finalNumber = 20000;
          }

          // Preserve the original line structure, just replace the number
          line = `${beforeNumber}${finalNumber}${afterNumber}`;
          currentContext.fieldCounter = finalNumber + increment;

          result.push(line);
          continue;
        }

        // This point should not be reached for enums (handled above)
      }

      result.push(line);
    }

    return result.join('\n');
  }
}

export const formatter = new ProtoFormatter();
