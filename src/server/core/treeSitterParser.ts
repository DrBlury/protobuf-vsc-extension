/**
 * Tree-sitter Parser Adapter for Protocol Buffers
 *
 * This adapter uses Tree-sitter for parsing .proto files into our AST format.
 * It provides better error recovery and more robust parsing than the custom parser.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require('web-tree-sitter');
const TreeSitterParser = TreeSitter.Parser;
type Parser = InstanceType<typeof TreeSitterParser>;
type Language = unknown;
interface Point { row: number; column: number; }
interface Node {
  type: string;
  text: string;
  startPosition: Point;
  endPosition: Point;
  childCount: number;
  child(index: number): Node | null;
  childForFieldName(name: string): Node | null;
  isMissing(): boolean;
  parent: Node | null;
}

import type {
  ProtoFile,
  SyntaxStatement,
  EditionStatement,
  PackageStatement,
  ImportStatement,
  OptionStatement,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  ExtendDefinition,
  FieldDefinition,
  FieldOption,
  MapFieldDefinition,
  GroupFieldDefinition,
  OneofDefinition,
  EnumValue,
  RpcDefinition,
  ReservedStatement,
  ExtensionsStatement,
  Range,
  Position,
  SyntaxError,
} from './ast';

import { logger } from '../utils/logger';

let parserInstance: Parser | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the Tree-sitter parser
 * This should be called once at extension activation
 */
export async function initTreeSitterParser(wasmPath: string): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await TreeSitterParser.init();
      parserInstance = new TreeSitterParser();
      const Proto = await TreeSitter.Language.load(wasmPath) as Language;
      parserInstance.setLanguage(Proto);
      logger.info('Tree-sitter parser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Tree-sitter parser:', error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if Tree-sitter parser is initialized
 */
export function isTreeSitterInitialized(): boolean {
  return parserInstance !== null;
}

/**
 * Get the singleton parser instance
 */
function getParser(): Parser {
  if (!parserInstance) {
    throw new Error('Tree-sitter parser not initialized. Call initTreeSitterParser() first.');
  }
  return parserInstance;
}

/**
 * Convert Tree-sitter Point to our Position format
 */
function pointToPosition(point: Point): Position {
  return {
    line: point.row,
    character: point.column
  };
}

/**
 * Convert Tree-sitter node to our Range format
 */
function nodeToRange(node: Node): Range {
  return {
    start: pointToPosition(node.startPosition),
    end: pointToPosition(node.endPosition)
  };
}

/**
 * Extract text content from a node
 */
function getText(node: Node): string {
  return node.text;
}

/**
 * Get child node by field name
 */
function getField(node: Node, fieldName: string): Node | null {
  return node.childForFieldName(fieldName);
}

/**
 * Get all children of a specific type
 */
function getChildren(node: Node, type?: string): Node[] {
  const children: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && (!type || child.type === type)) {
      children.push(child);
    }
  }
  return children;
}

/**
 * Parse a proto file using Tree-sitter
 */
export class TreeSitterProtoParser {
  parse(content: string, _uri: string): ProtoFile {
    const parser = getParser();
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error('Failed to parse proto file');
    }
    return this.convertToAST(tree.rootNode);
  }

  private convertToAST(root: Node): ProtoFile {
    const file: ProtoFile = {
      type: 'file',
      range: nodeToRange(root),
      imports: [],
      options: [],
      messages: [],
      enums: [],
      services: [],
      extends: [],
      syntaxErrors: [],
    };

    this.collectSyntaxErrors(root, file);

    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (!child) {continue;}

      try {
        switch (child.type) {
          case 'syntax':
            file.syntax = this.parseSyntax(child);
            break;
          case 'edition':
            file.edition = this.parseEdition(child);
            break;
          case 'package':
            file.package = this.parsePackage(child);
            break;
          case 'import':
            file.imports.push(this.parseImport(child));
            break;
          case 'option':
            file.options.push(this.parseOption(child));
            break;
          case 'message':
            file.messages.push(this.parseMessage(child));
            break;
          case 'enum':
            file.enums.push(this.parseEnum(child));
            break;
          case 'service':
            file.services.push(this.parseService(child));
            break;
          case 'extend':
            file.extends.push(this.parseExtend(child));
            break;
        }
      } catch (error) {
        // Log but continue parsing - Tree-sitter provides error recovery
        logger.error(`Error parsing ${child.type} at line ${child.startPosition.row}:`, error);
      }
    }

    return file;
  }

  private findErrorNodes(node: Node, errors: Node[] = []): Node[] {
    if (node.type === 'ERROR' || node.isMissing()) {
      errors.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.findErrorNodes(child, errors);
      }
    }
    return errors;
  }

  private collectSyntaxErrors(root: Node, file: ProtoFile): void {
    const errorNodes = this.findErrorNodes(root);
    for (const errorNode of errorNodes) {
        if (errorNode.isMissing()) {
            const parent = errorNode.parent;
            const message = parent
                ? `Syntax error: missing '${errorNode.type}' in ${parent.type}`
                : `Syntax error: missing '${errorNode.type}'`;
            file.syntaxErrors?.push({
                range: nodeToRange(errorNode),
                message,
            });
        } else {
            file.syntaxErrors?.push({
                range: nodeToRange(errorNode),
                message: `Syntax error: unexpected "${errorNode.text}"`,
            });
        }
    }
  }

  private parseSyntax(node: Node): SyntaxStatement {
    const text = getText(node);
    const version = text.includes('proto2') ? 'proto2' : 'proto3';

    return {
      type: 'syntax',
      version,
      range: nodeToRange(node)
    };
  }

  private parseEdition(node: Node): EditionStatement {
    const text = getText(node);
    const match = text.match(/edition\s*=\s*["']?([^"';]+)["']?/);
    const edition = match?.[1] ?? '2023';

    return {
      type: 'edition',
      edition,
      range: nodeToRange(node)
    };
  }

  private parsePackage(node: Node): PackageStatement {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    return {
      type: 'package',
      name,
      range: nodeToRange(node)
    };
  }

  private parseImport(node: Node): ImportStatement {
    const text = getText(node);
    const pathMatch = text.match(/["']([^"']+)["']/);
    const path = pathMatch?.[1] ?? '';

    let modifier: 'weak' | 'public' | undefined;
    if (text.includes('weak')) { modifier = 'weak'; }
    else if (text.includes('public')) { modifier = 'public'; }

    return {
      type: 'import',
      path,
      modifier,
      range: nodeToRange(node)
    };
  }

  private parseOption(node: Node): OptionStatement {
    const text = getText(node);
    // Use a more sophisticated regex that handles quoted strings with semicolons
    // Match: option name = value; where value can be a quoted string, number, bool, or identifier
    const match = text.match(/option\s+([^\s=]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]+);/);

    if (!match) {
      return {
        type: 'option',
        name: '',
        value: '',
        range: nodeToRange(node)
      };
    }

    const name = match[1]?.trim() ?? '';
    let valueText = match[2]?.trim() ?? '';

    // Parse value based on type
    let value: string | number | boolean = valueText;
    if (valueText === 'true') { value = true; }
    else if (valueText === 'false') { value = false; }
    else if (/^-?\d+$/.test(valueText)) { value = parseInt(valueText, 10); }
    else if (/^-?\d+\.\d+$/.test(valueText)) { value = parseFloat(valueText); }
    else if ((valueText.startsWith('"') && valueText.endsWith('"')) ||
             (valueText.startsWith("'") && valueText.endsWith("'"))) {
      // Remove quotes from string values
      value = valueText.slice(1, -1);
    }
    // else keep as identifier/enum value

    return {
      type: 'option',
      name,
      value,
      range: nodeToRange(node)
    };
  }

  private parseMessage(node: Node): MessageDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';
    const bodyNode = getField(node, 'body');

    const message: MessageDefinition = {
      type: 'message',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      range: nodeToRange(node),
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: []
    };

    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) {continue;}

        try {
          switch (child.type) {
            case 'field':
              // parseField may return multiple fields if Tree-sitter over-captured
              message.fields.push(...this.parseFields(child));
              break;
            case 'map_field':
              message.maps.push(this.parseMapField(child));
              break;
            case 'oneof':
              message.oneofs.push(this.parseOneof(child));
              break;
            case 'option':
              message.options.push(this.parseOption(child));
              break;
            case 'reserved':
              message.reserved.push(this.parseReserved(child));
              break;
            case 'extensions':
              message.extensions.push(this.parseExtensions(child));
              break;
            case 'message':
              message.nestedMessages.push(this.parseMessage(child));
              break;
            case 'enum':
              message.nestedEnums.push(this.parseEnum(child));
              break;
            case 'group':
              message.groups.push(this.parseGroup(child));
              break;
          }
        } catch (error) {
          logger.error(`Error parsing message child ${child.type}:`, error);
        }
      }
    }

    return message;
  }

  /**
   * Parse field(s) from a Tree-sitter node.
   * Tree-sitter sometimes over-captures multiple fields into one node,
   * so this method extracts all fields from the text.
   */
  private parseFields(node: Node): FieldDefinition[] {
    const text = getText(node);
    const fields: FieldDefinition[] = [];

    // Global regex to find all field definitions in the text
    // Pattern: [modifier] type name = number (without options - we extract those separately)
    // NOTE: Modifier group uses word boundary (\b) to prevent "RepeatedRules" from matching as modifier "Repeated" + type "Rules"
    const fieldRegex = /(?:(optional|required|repeated)\s+)?(\.?\w+(?:\.\w+)*)\s+(\w+)\s*=\s*(?:\/\/[^\r\n]*)?\s*(0x[0-9a-fA-F]+|\d+)/gi;

    let match;
    while ((match = fieldRegex.exec(text)) !== null) {
      const modifier = match[1] as 'optional' | 'required' | 'repeated' | undefined;
      const fieldType = match[2] || 'string';
      const name = match[3] || '';
      const numberStr = match[4] || '0';
      const number = numberStr.toLowerCase().startsWith('0x')
        ? parseInt(numberStr, 16)
        : parseInt(numberStr, 10);

      // Extract options using bracket matching
      const matchEnd = match.index + match[0].length;
      const restOfText = text.slice(matchEnd);
      const optionsStr = this.extractFieldOptions(restOfText);

      // Calculate base range for options - find where options start in the text
      let optionsBaseRange: Range | undefined;
      if (optionsStr) {
        const optionsOffset = matchEnd + restOfText.indexOf(optionsStr);
        const textBeforeOptions = text.slice(0, optionsOffset);
        const newlinesBefore = (textBeforeOptions.match(/\n/g) || []).length;
        const lastNewlineBefore = textBeforeOptions.lastIndexOf('\n');
        const startChar = lastNewlineBefore === -1
          ? node.startPosition.column + optionsOffset
          : optionsOffset - lastNewlineBefore - 1;
        optionsBaseRange = {
          start: { line: node.startPosition.row + newlinesBefore, character: startChar },
          end: { line: node.startPosition.row + newlinesBefore, character: startChar }
        };
      }

      // Parse field options if present
      let options = optionsStr ? this.parseFieldOptionsFromString(optionsStr, optionsBaseRange) : undefined;
      // Convert empty array to undefined for consistency
      if (options && options.length === 0) {
        options = undefined;
      }

      // Update regex lastIndex to skip past the options we just parsed
      if (optionsStr) {
        fieldRegex.lastIndex = matchEnd + text.slice(matchEnd).indexOf(optionsStr) + optionsStr.length;
      }

      const matchText = match[0] ?? '';
      const matchIndex = match.index ?? 0;
      const typeOffsetInMatch = matchText.indexOf(fieldType);
      const nameOffsetInMatch = matchText.indexOf(name, typeOffsetInMatch + fieldType.length);
      const typeOffset = typeOffsetInMatch >= 0 ? matchIndex + typeOffsetInMatch : matchIndex;
      const nameOffset = nameOffsetInMatch >= 0 ? matchIndex + nameOffsetInMatch : matchIndex;

      const fieldTypeRange = this.rangeFromOffsets(node, text, typeOffset, fieldType.length);
      const nameRange = this.rangeFromOffsets(node, text, nameOffset, name.length);

      fields.push({
        type: 'field',
        modifier,
        fieldType,
        fieldTypeRange,
        name,
        nameRange,
        number,
        options,
        range: nodeToRange(node)
      });
    }

    // Fallback to single field parsing if regex didn't match
    if (fields.length === 0) {
      fields.push(this.parseField(node));
    }

    return fields;
  }

  private parseField(node: Node): FieldDefinition {
    const text = getText(node);
    // Multi-line aware regex to capture field definitions
    // Handles: [modifier] type name = [// comment] number [// comment] [options];
    // Type can be: simple (int32), qualified (foo.bar), or absolute (.foo.bar)
    // IMPORTANT: hex pattern must come FIRST in alternation to match before decimal captures the leading 0
    // Note: /i flag needed for case-insensitive hex matching (0x vs 0X)
    // Allows optional comment after = and before number (handles multi-line fields with comments)
    // NOTE: Modifier group requires whitespace after to prevent "RepeatedRules" from matching as modifier "Repeated" + type "Rules"
    const match = text.match(/(?:(optional|required|repeated)\s+)?(\.?\w+(?:\.\w+)*)\s+(\w+)\s*=\s*(?:\/\/[^\r\n]*)?\s*(0x[0-9a-fA-F]+|\d+)/i);

    if (!match) {
      return {
        type: 'field',
        fieldType: 'string',
        fieldTypeRange: nodeToRange(node),
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const modifier = match[1] as 'optional' | 'required' | 'repeated' | undefined;
    const fieldType = match[2] || 'string';
    const name = match[3] || '';
    const numberStr = match[4] || '0';
    const number = numberStr.startsWith('0x') || numberStr.startsWith('0X')
      ? parseInt(numberStr, 16)
      : parseInt(numberStr, 10);

    // Extract options using bracket matching instead of regex
    // Find where the field number match ends
    const matchEnd = (match.index || 0) + match[0].length;
    const restOfText = text.slice(matchEnd);
    const optionsStr = this.extractFieldOptions(restOfText);

    // Calculate base range for options
    let optionsBaseRange: Range | undefined;
    if (optionsStr) {
      const optionsOffset = matchEnd + restOfText.indexOf(optionsStr);
      const textBeforeOptions = text.slice(0, optionsOffset);
      const newlinesBefore = (textBeforeOptions.match(/\n/g) || []).length;
      const lastNewlineBefore = textBeforeOptions.lastIndexOf('\n');
      const startChar = lastNewlineBefore === -1
        ? node.startPosition.column + optionsOffset
        : optionsOffset - lastNewlineBefore - 1;
      optionsBaseRange = {
        start: { line: node.startPosition.row + newlinesBefore, character: startChar },
        end: { line: node.startPosition.row + newlinesBefore, character: startChar }
      };
    }

    // Parse field options if present
    const options = optionsStr ? this.parseFieldOptionsFromString(optionsStr, optionsBaseRange) : undefined;

    const matchText = match[0] ?? '';
    const matchIndex = match.index ?? 0;
    const typeOffsetInMatch = matchText.indexOf(fieldType);
    const nameOffsetInMatch = matchText.indexOf(name, typeOffsetInMatch + fieldType.length);
    const typeOffset = typeOffsetInMatch >= 0 ? matchIndex + typeOffsetInMatch : matchIndex;
    const nameOffset = nameOffsetInMatch >= 0 ? matchIndex + nameOffsetInMatch : matchIndex;

    return {
      type: 'field',
      modifier,
      fieldType,
      fieldTypeRange: this.rangeFromOffsets(node, text, typeOffset, fieldType.length),
      name,
      nameRange: this.rangeFromOffsets(node, text, nameOffset, name.length),
      number,
      options,
      range: nodeToRange(node)
    };
  }

  private rangeFromOffsets(node: Node, text: string, startOffset: number, length: number): Range {
    const start = this.offsetToPosition(node, text, startOffset);
    const end = this.offsetToPosition(node, text, startOffset + length);
    return { start, end };
  }

  private offsetToPosition(node: Node, text: string, offset: number): Position {
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    const before = text.slice(0, clampedOffset);
    const newlineMatches = before.match(/\n/g);
    const lineDelta = newlineMatches ? newlineMatches.length : 0;
    const lastNewline = before.lastIndexOf('\n');
    const character = lineDelta === 0
      ? node.startPosition.column + clampedOffset
      : clampedOffset - (lastNewline + 1);

    return {
      line: node.startPosition.row + lineDelta,
      character
    };
  }

  /**
   * Extract field options from text using bracket matching.
   * Finds the first [...] block, properly handling nested brackets, strings, and braces.
   */
  private extractFieldOptions(text: string): string | null {
    // Skip whitespace and comments to find the opening bracket
    let i = 0;
    while (i < text.length) {
      // Skip whitespace
      if (/\s/.test(text[i]!)) {
        i++;
        continue;
      }
      // Skip single-line comments
      if (text[i] === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') {
          i++;
        }
        continue;
      }
      // Found the start
      break;
    }

    // If we hit a semicolon or end before finding '[', no options
    if (i >= text.length || text[i] === ';') {
      return null;
    }

    // Must start with '['
    if (text[i] !== '[') {
      return null;
    }

    const start = i;
    let depth = 0;
    let inString = false;
    let stringChar = '';

    while (i < text.length) {
      const char = text[i]!;
      const prevChar = i > 0 ? text[i - 1] : '';

      if (inString) {
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
        }
        i++;
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        i++;
        continue;
      }

      if (char === '[' || char === '(' || char === '{') {
        depth++;
      } else if (char === ']' || char === ')' || char === '}') {
        depth--;
        if (depth === 0 && char === ']') {
          // Found the closing bracket
          return text.slice(start, i + 1);
        }
      }

      i++;
    }

    return null;
  }

  /**
   * Parse field options from a string like "[deprecated = true, json_name = \"foo\"]"
   * @param optionsStr The options string including brackets
   * @param baseRange Optional base range to calculate option positions from
   */
  private parseFieldOptionsFromString(optionsStr: string, baseRange?: Range): FieldOption[] {
    const options: FieldOption[] = [];

    // Remove surrounding brackets
    const inner = optionsStr.slice(1, -1).trim();
    if (!inner) {return options;}

    // Split by comma, but be careful with nested structures
    const parts = this.splitFieldOptions(inner);

    for (const part of parts) {
      // Strip comments from the part before parsing
      const strippedPart = this.stripComments(part);
      const trimmed = strippedPart.trim();
      if (!trimmed) {continue;}

      // Match option patterns: name = value or (name).path = value
      // Pattern breakdown:
      // - \([\w.]+\)(?:\.[\w]+)* : parenthesized name like (custom.option).path.subpath
      // - [\w.]+ : simple dotted name like deprecated or json_name
      // Use [\s\S] instead of . to match newlines in multi-line values
      const optMatch = trimmed.match(/^(\([\w.]+\)(?:\.[\w]+)*|[\w.]+)\s*=\s*([\s\S]+)$/);
      if (optMatch) {
        const name = optMatch[1]!;
        const valueStr = optMatch[2]!.trim();
        let value: string | number | boolean = valueStr;

        // Parse the value - handle all numeric formats including +/- prefixes, inf, nan
        if (valueStr === 'true') {
          value = true;
        } else if (valueStr === 'false') {
          value = false;
        } else if (valueStr === 'inf' || valueStr === '+inf') {
          value = Infinity;
        } else if (valueStr === '-inf') {
          value = -Infinity;
        } else if (valueStr === 'nan' || valueStr === '+nan' || valueStr === '-nan') {
          value = NaN;
        } else if (/^[+-]?\d+$/.test(valueStr)) {
          value = parseInt(valueStr, 10);
        } else if (/^[+-]?\d*\.\d+(?:e[+-]?\d+)?$/i.test(valueStr) || /^[+-]?\.\d+(?:e[+-]?\d+)?$/i.test(valueStr)) {
          value = parseFloat(valueStr);
        } else if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
          // Handle string concatenation per protobuf spec: strLit = strLitSingle { strLitSingle }
          // Adjacent string literals like "foo" "bar" 'baz' should be concatenated
          value = this.parseStringConcatenation(valueStr);
        }
        // Else keep as identifier/enum value string

        // Calculate proper range for this option if baseRange is provided
        let optRange: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
        if (baseRange) {
          // Find the position of this option in the original optionsStr
          const optionIdx = optionsStr.indexOf(part.trim());
          if (optionIdx !== -1) {
            // Calculate offset from the base range
            // Count newlines and chars to get the start position
            const beforeOption = optionsStr.slice(0, optionIdx);
            const newlines = (beforeOption.match(/\n/g) || []).length;
            const lastNewline = beforeOption.lastIndexOf('\n');
            const startChar = lastNewline === -1
              ? baseRange.start.character + optionIdx
              : optionIdx - lastNewline - 1;
            const startLine = baseRange.start.line + newlines;

            // Calculate end position
            const optionText = part.trim();
            const optNewlines = (optionText.match(/\n/g) || []).length;
            const optLastNewline = optionText.lastIndexOf('\n');
            const endChar = optNewlines > 0
              ? optionText.length - optLastNewline - 1
              : startChar + optionText.length;
            const endLine = startLine + optNewlines;

            optRange = {
              start: { line: startLine, character: startChar },
              end: { line: endLine, character: endChar }
            };
          }
        }

        options.push({
          type: 'field_option',
          name,
          value,
          range: optRange
        });
      }
    }

    return options;
  }

  /**
   * Parse and concatenate adjacent string literals per protobuf spec
   * Handles: "foo" "bar" 'baz' -> "foobarbaz"
   */
  private parseStringConcatenation(valueStr: string): string {
    const result: string[] = [];
    let remaining = valueStr;

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (remaining.length === 0) {break;}

      // Match a single-quoted or double-quoted string
      const match = remaining.match(/^(["'])((?:[^\\]|\\.)*?)\1/s);
      if (match) {
        // Extract the string content (without quotes)
        result.push(match[2]!);
        remaining = remaining.slice(match[0].length);
      } else {
        // No more string literals - shouldn't happen for valid input
        break;
      }
    }

    return result.join('');
  }

  /**
   * Strip comments from a string while preserving string literals
   */
  private stripComments(str: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';
    let inBlockComment = false;
    let inLineComment = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i]!;
      const nextChar = i + 1 < str.length ? str[i + 1] : '';
      const prevChar = i > 0 ? str[i - 1] : '';

      // Handle block comment
      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++; // Skip the '/'
        }
        continue;
      }

      // Handle line comment
      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
          result += char;
        }
        continue;
      }

      // Handle string content
      if (inString) {
        result += char;
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
        }
        continue;
      }

      // Check for comment start
      if (char === '/') {
        if (nextChar === '*') {
          inBlockComment = true;
          i++; // Skip the '*'
          continue;
        } else if (nextChar === '/') {
          inLineComment = true;
          i++; // Skip the second '/'
          continue;
        }
      }

      // Check for string start
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      }

      result += char;
    }

    return result;
  }

  /**
   * Split field options by comma, handling nested brackets and comments
   */
  private splitFieldOptions(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let inBlockComment = false;
    let inLineComment = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i]!;
      const nextChar = i + 1 < str.length ? str[i + 1] : '';
      const prevChar = i > 0 ? str[i - 1] : '';

      // Handle block comment end
      if (inBlockComment) {
        current += char;
        if (char === '*' && nextChar === '/') {
          current += nextChar;
          i++; // Skip the '/'
          inBlockComment = false;
        }
        continue;
      }

      // Handle line comment end
      if (inLineComment) {
        current += char;
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }

      // Handle string content
      if (inString) {
        current += char;
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
        }
        continue;
      }

      // Check for comment start
      if (char === '/') {
        if (nextChar === '*') {
          inBlockComment = true;
          current += char + nextChar;
          i++; // Skip the '*'
          continue;
        } else if (nextChar === '/') {
          inLineComment = true;
          current += char + nextChar;
          i++; // Skip the second '/'
          continue;
        }
      }

      // Check for string start
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === '[' || char === '(' || char === '{') {
        depth++;
        current += char;
      } else if (char === ']' || char === ')' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  private parseMapField(node: Node): MapFieldDefinition {
    const text = getText(node);
    // Handle both decimal and hex field numbers in map fields
    // IMPORTANT: hex pattern must come FIRST in alternation to match before decimal captures the leading 0
    const match = text.match(/map<\s*(\w+)\s*,\s*(\w+(?:\.\w+)*)\s*>\s+(\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/i);

    if (!match) {
      return {
        type: 'map',
        keyType: 'string',
        valueType: 'string',
        valueTypeRange: nodeToRange(node),
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const keyType = match[1] || 'string';
    const valueType = match[2] || 'string';
    const name = match[3] || '';
    const numberStr = match[4] || '0';
    const number = numberStr.toLowerCase().startsWith('0x')
      ? parseInt(numberStr, 16)
      : parseInt(numberStr, 10);

    return {
      type: 'map',
      keyType,
      valueType,
      valueTypeRange: nodeToRange(node),
      name,
      nameRange: nodeToRange(node),
      number,
      range: nodeToRange(node)
    };
  }

  private parseOneof(node: Node): OneofDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    const oneof: OneofDefinition = {
      type: 'oneof',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      fields: [],
      range: nodeToRange(node)
    };

    const fields = getChildren(node, 'oneof_field');
    for (const fieldNode of fields) {
      oneof.fields.push(this.parseField(fieldNode));
    }

    return oneof;
  }

  private parseGroup(node: Node): GroupFieldDefinition {
    const text = getText(node);
    const match = text.match(/(optional|required|repeated)?\s*group\s+(\w+)\s*=\s*(\d+)/);

    const modifier = match?.[1] as 'optional' | 'required' | 'repeated' | undefined;
    const name = match?.[2] || '';
    const number = match?.[3] ? parseInt(match[3], 10) : 0;

    return {
      type: 'group',
      modifier,
      name,
      nameRange: nodeToRange(node),
      number,
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: [],
      range: nodeToRange(node)
    };
  }

  private parseEnum(node: Node): EnumDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';
    const bodyNode = getField(node, 'body');

    const enumDef: EnumDefinition = {
      type: 'enum',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      values: [],
      options: [],
      reserved: [],
      range: nodeToRange(node)
    };

    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) {continue;}

        try {
          switch (child.type) {
            case 'enum_field':
              enumDef.values.push(this.parseEnumValue(child));
              break;
            case 'option':
              enumDef.options.push(this.parseOption(child));
              break;
            case 'reserved':
              enumDef.reserved.push(this.parseReserved(child));
              break;
          }
        } catch (error) {
          logger.error(`Error parsing enum child ${child.type}:`, error);
        }
      }
    }

    return enumDef;
  }

  private parseEnumValue(node: Node): EnumValue {
    const text = getText(node);
    // Match enum value with optional hex number and options
    // Pattern: NAME = [-]number [options];
    const match = text.match(/(\w+)\s*=\s*(-?(?:0x[0-9a-fA-F]+|\d+))(?:\s*(\[[\s\S]*?\]))?/i);

    if (!match) {
      return {
        type: 'enum_value',
        name: '',
        nameRange: nodeToRange(node),
        number: 0,
        range: nodeToRange(node)
      };
    }

    const name = match[1] ?? '';
    const numberStr = match[2] ?? '0';
    let number: number;
    const lowerNumStr = numberStr.toLowerCase();
    // Check for hex (including negative hex like -0x01)
    if (lowerNumStr.includes('0x')) {
      number = parseInt(numberStr, 16);
    } else {
      number = parseInt(numberStr, 10);
    }

    // Parse options if present
    const optionsStr = match[3];
    let optionsBaseRange: Range | undefined;
    if (optionsStr) {
      const optionsIdx = text.indexOf(optionsStr);
      const textBeforeOptions = text.slice(0, optionsIdx);
      const newlinesBefore = (textBeforeOptions.match(/\n/g) || []).length;
      const lastNewlineBefore = textBeforeOptions.lastIndexOf('\n');
      const startChar = lastNewlineBefore === -1
        ? node.startPosition.column + optionsIdx
        : optionsIdx - lastNewlineBefore - 1;
      optionsBaseRange = {
        start: { line: node.startPosition.row + newlinesBefore, character: startChar },
        end: { line: node.startPosition.row + newlinesBefore, character: startChar }
      };
    }
    const options = optionsStr ? this.parseFieldOptionsFromString(optionsStr, optionsBaseRange) : undefined;

    return {
      type: 'enum_value',
      name,
      nameRange: nodeToRange(node),
      number,
      options,
      range: nodeToRange(node)
    };
  }

  private parseService(node: Node): ServiceDefinition {
    const nameNode = getField(node, 'name');
    const name = nameNode ? getText(nameNode) : '';

    const service: ServiceDefinition = {
      type: 'service',
      name,
      nameRange: nameNode ? nodeToRange(nameNode) : nodeToRange(node),
      rpcs: [],
      options: [],
      range: nodeToRange(node)
    };

    const rpcNodes = getChildren(node, 'rpc');
    for (const rpcNode of rpcNodes) {
      try {
        service.rpcs.push(this.parseRpc(rpcNode));
      } catch (error) {
        logger.error('Error parsing RPC:', error);
      }
    }

    return service;
  }

  private parseRpc(node: Node): RpcDefinition {
    const text = getText(node);
    const match = text.match(/rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+(?:\.\w+)*)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+(?:\.\w+)*)\s*\)/);

    if (!match) {
      return {
        type: 'rpc',
        name: '',
        nameRange: nodeToRange(node),
        requestType: '',
        requestTypeRange: nodeToRange(node),
        responseType: '',
        responseTypeRange: nodeToRange(node),
        requestStreaming: false,
        responseStreaming: false,
        options: [],
        range: nodeToRange(node)
      };
    }

    const name = match[1] ?? '';
    const requestStreaming = !!match[2];
    const requestType = match[3] ?? '';
    const responseStreaming = !!match[4];
    const responseType = match[5] ?? '';

    return {
      type: 'rpc',
      name,
      nameRange: nodeToRange(node),
      requestType,
      requestTypeRange: nodeToRange(node),
      responseType,
      responseTypeRange: nodeToRange(node),
      requestStreaming,
      responseStreaming,
      options: [],
      // Backward compatibility
      inputType: requestType,
      inputTypeRange: nodeToRange(node),
      outputType: responseType,
      outputTypeRange: nodeToRange(node),
      inputStream: requestStreaming,
      outputStream: responseStreaming,
      range: nodeToRange(node)
    };
  }

  private parseExtend(node: Node): ExtendDefinition {
    const text = getText(node);
    const match = text.match(/extend\s+(\w+(?:\.\w+)*)/);
    const extendType = match?.[1] ?? '';

    return {
      type: 'extend',
      extendType,
      extendTypeRange: nodeToRange(node),
      fields: [],
      groups: [],
      // Backward compatibility
      messageName: extendType,
      messageNameRange: nodeToRange(node),
      range: nodeToRange(node)
    };
  }

  private parseReserved(node: Node): ReservedStatement {
    const text = getText(node);
    const reserved: ReservedStatement = {
      type: 'reserved',
      ranges: [],
      names: [],
      range: nodeToRange(node)
    };

    // Try to parse as ranges
    // Handle both "N to M" ranges and comma-separated single values like "5, 7"
    // First, check if there are any name strings - if so, skip range parsing for this statement
    const hasNames = /["'][^"']+["']/.test(text);

    if (!hasNames) {
      // Extract the content after 'reserved' keyword
      const reservedMatch = text.match(/reserved\s+(.+?)\s*;/s);
      if (reservedMatch && reservedMatch[1]) {
        const content = reservedMatch[1];
        // Split by comma to handle "5, 7" style
        const parts = content.split(',').map(p => p.trim());
        for (const part of parts) {
          // Check for range pattern "N to M"
          const rangeMatch = part.match(/(\d+)\s+to\s+(\d+|max)/i);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1] ?? '0', 10);
            const end = rangeMatch[2] === 'max' ? 536870911 : parseInt(rangeMatch[2] ?? '0', 10);
            reserved.ranges.push({ start, end });
          } else {
            // Single number
            const numMatch = part.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1] ?? '0', 10);
              reserved.ranges.push({ start: num, end: num });
            }
          }
        }
      }
    }

    // Try to parse as field names
    const namePattern = /["']([^"']+)["']/g;
    const nameMatches = Array.from(text.matchAll(namePattern));
    for (const match of nameMatches) {
      if (match[1]) {
        reserved.names.push(match[1]);
      }
    }

    return reserved;
  }

  private parseExtensions(node: Node): ExtensionsStatement {
    let text = getText(node);
    const extensions: ExtensionsStatement = {
      type: 'extensions',
      ranges: [],
      range: nodeToRange(node)
    };

    // Remove the 'extensions' keyword and any options in brackets to avoid
    // matching numbers inside [declaration = { number: ... }]
    text = text.replace(/^extensions\s*/, '');
    text = text.replace(/\s*\[.*\]\s*;?\s*$/s, '');  // Remove [...] options block
    text = text.replace(/;$/, '');  // Remove trailing semicolon

    const rangePattern = /(\d+)(?:\s+to\s+(\d+|max))?/g;
    const rangeMatches = Array.from(text.matchAll(rangePattern));
    for (const match of rangeMatches) {
      const start = parseInt(match[1] ?? '0', 10);
      if (match[2]) {
        const end = match[2] === 'max' ? 536870911 : parseInt(match[2], 10);
        extensions.ranges.push({ start, end });
      } else {
        extensions.ranges.push({ start, end: start });
      }
    }

    return extensions;
  }
}

// Export a singleton instance
export const treeSitterParser = new TreeSitterProtoParser();
