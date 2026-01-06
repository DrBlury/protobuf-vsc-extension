/**
 * Protocol Buffers Parser
 * Parses .proto files into an AST
 */

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
  MapFieldDefinition,
  GroupFieldDefinition,
  OneofDefinition,
  EnumValue,
  RpcDefinition,
  ReservedStatement,
  ExtensionsStatement,
  ReservedRange,
  Range,
  FieldOption,
  ProtoNode
} from '../core/ast';

import { logger } from '../utils/logger';

/**
 * Parse a number string that may be in decimal, hexadecimal (0x), or octal (0) format.
 * Also handles negative and positive (+) prefixed numbers as per protobuf spec.
 */
function parseIntegerLiteral(value: string): number {
  const trimmed = value.trim();

  // Handle negative numbers
  if (trimmed.startsWith('-')) {
    return -parseIntegerLiteral(trimmed.slice(1));
  }

  // Handle explicit positive sign (per spec: [ "-" | "+" ] intLit)
  if (trimmed.startsWith('+')) {
    return parseIntegerLiteral(trimmed.slice(1));
  }

  // Hexadecimal (0x or 0X prefix)
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return parseInt(trimmed, 16);
  }

  // Octal (0 prefix, but not just "0")
  if (trimmed.startsWith('0') && trimmed.length > 1 && /^0[0-7]+$/.test(trimmed)) {
    return parseInt(trimmed, 8);
  }

  // Decimal
  return parseInt(trimmed, 10);
}

/**
 * Parse a float literal string, handling special values 'inf' and 'nan' as per protobuf spec.
 * Also handles +/- prefixes.
 */
function parseFloatLiteral(value: string): number {
  const trimmed = value.trim().toLowerCase();

  // Handle special float values per spec: floatLit = ... | "inf" | "nan"
  if (trimmed === 'inf' || trimmed === '+inf') {
    return Infinity;
  }
  if (trimmed === '-inf') {
    return -Infinity;
  }
  if (trimmed === 'nan' || trimmed === '+nan' || trimmed === '-nan') {
    return NaN;
  }

  // Handle explicit positive sign
  if (trimmed.startsWith('+')) {
    return parseFloat(trimmed.slice(1));
  }

  return parseFloat(value);
}

interface Token {
  type: string;
  value: string;
  range: Range;
  comment?: string;
  trailingComment?: string;
}

export class ProtoParser {
  private tokens: Token[] = [];
  private pos = 0;
  private lines: string[] = [];
  private lastComment: string | undefined;

  parse(text: string, _uri: string): ProtoFile {
    this.lines = text.split('\n');
    this.tokens = this.tokenize(text);
    this.pos = 0;
    this.lastComment = undefined;

    const file: ProtoFile = {
      type: 'file',
      imports: [],
      options: [],
      messages: [],
      enums: [],
      services: [],
      extends: [],
      syntaxErrors: [],
      range: {
        start: { line: 0, character: 0 },
        end: { line: this.lines.length - 1, character: this.lines[this.lines.length - 1]?.length || 0 }
      }
    };

    while (!this.isAtEnd()) {
      try {
        this.parseTopLevel(file);
      } catch (error) {
        const errorToken = this.tokens[this.pos > 0 ? this.pos - 1 : 0];
        if (error instanceof Error && errorToken) {
            if (!file.syntaxErrors) {
                file.syntaxErrors = [];
            }
            file.syntaxErrors.push({
                range: errorToken.range,
                message: error.message,
            });
        }
        
        // Log parse error for debugging
        if (error instanceof Error) {
          logger.error(`Parse error at position ${this.pos}: ${error.message}`);
          const token = this.peek();
          if (token) {
            logger.error(`  Current token: ${token.type} = "${token.value}" at line ${token.range.start.line}`);
          }
        }
        // Skip to next statement on error
        this.skipToNextStatement();
      }
    }

    return file;
  }

  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let line = 0;
    let character = 0;
    let i = 0;

    // Comment buffer for attaching to next token (leading comments)
    let pendingComment: string[] = [];
    // Track the last token on the current line for trailing comments
    let lastTokenOnLine: number = -1;
    let lastTokenLine: number = -1;

    while (i < text.length) {
      const startLine = line;
      const startChar = character;

      // Skip whitespace
      if (/\s/.test(text[i]!)) {
        if (text[i]! === '\n') {
          line++;
          character = 0;
          // Reset line tracking on newline
          lastTokenOnLine = -1;
        } else {
          character++;
        }
        i++;
        continue;
      }

      // Single-line comment
      if (text[i] === '/' && text[i + 1] === '/') {
        const start = i;
        while (i < text.length && text[i] !== '\n') {
          i++;
          character++;
        }
        // Capture comment content
        const commentContent = text.slice(start + 2, i).trim();

        // Check if this is a trailing comment (token exists on same line before this comment)
        if (lastTokenOnLine >= 0 && lastTokenLine === startLine && tokens[lastTokenOnLine]) {
          // This is a trailing comment - attach to the previous token
          const prevToken = tokens[lastTokenOnLine]!;
          if (prevToken.trailingComment) {
            prevToken.trailingComment += '\n' + commentContent;
          } else {
            prevToken.trailingComment = commentContent;
          }
        } else {
          // This is a leading comment for the next token
          pendingComment.push(commentContent);
        }
        continue;
      }

      // Multi-line comment
      if (text[i] === '/' && text[i + 1] === '*') {
        i += 2;
        character += 2;
        const start = i;

        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
          if (text[i] === '\n') {
            line++;
            character = 0;
          } else {
            character++;
          }
          i++;
        }

        const commentContent = text.slice(start, i)
            .split('\n')
            .map(l => l.replace(/^\s*\*\s?/, '').trim())
            .join('\n')
            .trim();

        // Check if this is a trailing comment (same logic as single-line)
        if (lastTokenOnLine >= 0 && lastTokenLine === startLine && tokens[lastTokenOnLine]) {
          const prevToken = tokens[lastTokenOnLine]!;
          if (prevToken.trailingComment) {
            prevToken.trailingComment += '\n' + commentContent;
          } else {
            prevToken.trailingComment = commentContent;
          }
        } else {
          pendingComment.push(commentContent);
        }

        i += 2;
        character += 2;
        continue;
      }

      // Store any accumulated comments with the next token
      const comment = pendingComment.length > 0 ? pendingComment.join('\n') : undefined;
      if (comment) {
        // Clear buffer
        pendingComment = [];
      }

      // String literal
      if (text[i] === '"' || text[i] === "'") {
        const quote = text[i];
        const start = i;
        i++;
        character++;
        while (i < text.length && text[i] !== quote) {
          if (text[i] === '\\' && i + 1 < text.length) {
            i += 2;
            character += 2;
          } else {
            if (text[i] === '\n') {
              line++;
              character = 0;
            } else {
              character++;
            }
            i++;
          }
        }
        i++; // closing quote
        character++;
        tokens.push({
          type: 'string',
          value: text.slice(start, i),
          range: { start: { line: startLine, character: startChar }, end: { line, character } },
          comment
        });
        lastTokenOnLine = tokens.length - 1;
        lastTokenLine = line;
        continue;
      }

      // Number (including + or - prefix per spec, and floats starting with .)
      // Per protobuf spec: floatLit can be "." decimals [exponent] e.g., .5, .123e10
      if (/[0-9]/.test(text[i]!) ||
          ((text[i]! === '-' || text[i]! === '+') && /[0-9.]/.test(text[i + 1]!)) ||
          (text[i]! === '.' && /[0-9]/.test(text[i + 1]!))) {
        const start = i;
        if (text[i] === '-' || text[i] === '+') {
          i++;
          character++;
        }
        // Handle hex, octal, or decimal
        if (text[i]! === '0' && (text[i + 1] === 'x' || text[i + 1] === 'X')) {
          i += 2;
          character += 2;
          while (i < text.length && /[0-9a-fA-F]/.test(text[i]!)) {
            i++;
            character++;
          }
        } else {
          while (i < text.length && /[0-9.]/.test(text[i]!)) {
            i++;
            character++;
          }
          // Handle exponent
          if (text[i]! === 'e' || text[i]! === 'E') {
            i++;
            character++;
            if (text[i]! === '+' || text[i]! === '-') {
              i++;
              character++;
            }
            while (i < text.length && /[0-9]/.test(text[i]!)) {
              i++;
              character++;
            }
          }
        }
        tokens.push({
          type: 'number',
          value: text.slice(start, i),
          range: { start: { line: startLine, character: startChar }, end: { line, character } },
          comment
        });
        lastTokenOnLine = tokens.length - 1;
        lastTokenLine = line;
        continue;
      }

      // Identifier or keyword (dots are now handled as punctuation for option paths)
      if (/[a-zA-Z_]/.test(text[i]!)) {
        const start = i;
        while (i < text.length && /[a-zA-Z0-9_]/.test(text[i]!)) {
          i++;
          character++;
        }
        const value: string = text.slice(start, i);
        tokens.push({
          type: 'identifier',
          value,
          range: { start: { line: startLine, character: startChar }, end: { line, character } },
          comment
        });
        lastTokenOnLine = tokens.length - 1;
        lastTokenLine = line;
        continue;
      }

      // Punctuation (including dot for option path separators, and +/- for signed values)
      const punctuation = '{}[]()<>;=,.:-+';
      if (punctuation.includes(text[i]!)) {
        tokens.push({
          type: 'punctuation',
          value: text[i]!,
          range: { start: { line: startLine, character: startChar }, end: { line, character: character + 1 } },
          comment // Attaching comment to punctuation is rare but possible if it's the only thing left
        });
        lastTokenOnLine = tokens.length - 1;
        lastTokenLine = line;
        i++;
        character++;
        continue;
      }

      // Unknown character - skip it
      i++;
      character++;
    }

    return tokens;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos]! : null;
  }

  private advance(): Token | null {
    const token = this.pos < this.tokens.length ? this.tokens[this.pos++]! : null;
    if (token) {
      if (token.comment) {
        this.lastComment = token.comment;
      }
    }
    return token;
  }

  private expect(type: string, value?: string): Token {
    const token = this.advance();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` "${value}"` : ''}, got ${token?.type} "${token?.value}"`);
    }
    return token;
  }

  /**
   * Parse a qualified identifier (e.g., "google.protobuf.Timestamp" or "buf.validate.field")
   * Also supports fully-qualified names starting with "." (e.g., ".google.protobuf.Timestamp")
   * as per protobuf spec: messageType = [ "." ] { ident "." } messageName
   * Returns both the combined value and the range covering all parts.
   */
  private parseQualifiedIdentifier(): { value: string; range: Range } {
    let value = '';
    let startRange: Range | null = null;
    let endRange: Range;

    // Handle optional leading dot for fully-qualified names
    if (this.match('punctuation', '.')) {
      const dotToken = this.advance()!;
      value = '.';
      startRange = dotToken.range;
    }

    const firstToken = this.expect('identifier');
    value += firstToken.value;
    if (!startRange) {
      startRange = firstToken.range;
    }
    endRange = firstToken.range;

    while (this.match('punctuation', '.')) {
      this.advance(); // consume the dot
      const nextToken = this.expect('identifier');
      value += '.' + nextToken.value;
      endRange = nextToken.range;
    }

    return {
      value,
      range: { start: startRange.start, end: endRange.end }
    };
  }

  private match(type: string, value?: string): boolean {
    const token = this.peek();
    return token !== null && token.type === type && (value === undefined || token.value === value);
  }

  private skipToNextStatement(): void {
    while (!this.isAtEnd()) {
      const token = this.advance();
      if (token?.value === ';' || token?.value === '}') {
        break;
      }
    }
  }

  private attachComment(node: ProtoNode, token: Token) {
      if (token.comment) {
          node.comments = token.comment;
          // Clear lastComment since we've attached a comment to this node
          // This prevents the comment from being incorrectly attached to subsequent nodes
          this.lastComment = undefined;
      } else if (this.lastComment) {
          // If current token doesn't have comment, but previous one did (and we consumed it),
          // use that one. This is a heuristic.
          node.comments = this.lastComment;
          this.lastComment = undefined; // Consumed
      }
  }

  private parseTopLevel(file: ProtoFile): void {
    const token = this.peek();
    if (!token) {
      return;
    }

    switch (token.value) {
      case 'syntax':
        file.syntax = this.parseSyntax();
        break;
      case 'edition':
        file.edition = this.parseEdition();
        break;
      case 'package':
        file.package = this.parsePackage();
        break;
      case 'import':
        file.imports.push(this.parseImport());
        break;
      case 'option':
        file.options.push(this.parseOption());
        break;
      case 'message':
        file.messages.push(this.parseMessage());
        break;
      case 'enum':
        file.enums.push(this.parseEnum());
        break;
      case 'service':
        file.services.push(this.parseService());
        break;
      case 'extend':
        file.extends.push(this.parseExtend());
        break;
      default:
        this.advance(); // Skip unknown token
    }
  }

  private parseSyntax(): SyntaxStatement {
    const startToken = this.expect('identifier', 'syntax');
    this.expect('punctuation', '=');
    const versionToken = this.expect('string');
    this.expect('punctuation', ';');

    const version = versionToken.value.slice(1, -1) as 'proto2' | 'proto3';
    const node: SyntaxStatement = {
      type: 'syntax',
      version,
      range: { start: startToken.range.start, end: versionToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parseEdition(): EditionStatement {
    const startToken = this.expect('identifier', 'edition');
    this.expect('punctuation', '=');
    const editionToken = this.expect('string');
    this.expect('punctuation', ';');

    const node: EditionStatement = {
      type: 'edition',
      edition: editionToken.value.slice(1, -1),
      range: { start: startToken.range.start, end: editionToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parsePackage(): PackageStatement {
    const startToken = this.expect('identifier', 'package');
    const nameInfo = this.parseQualifiedIdentifier();
    this.expect('punctuation', ';');

    const node: PackageStatement = {
      type: 'package',
      name: nameInfo.value,
      range: { start: startToken.range.start, end: nameInfo.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parseImport(): ImportStatement {
    const startToken = this.expect('identifier', 'import');
    let modifier: 'weak' | 'public' | undefined;

    if (this.match('identifier', 'weak') || this.match('identifier', 'public')) {
      modifier = this.advance()!.value as 'weak' | 'public';
    }

    const pathToken = this.expect('string');
    this.expect('punctuation', ';');

    const node: ImportStatement = {
      type: 'import',
      path: pathToken.value.slice(1, -1),
      modifier,
      range: { start: startToken.range.start, end: pathToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parseOption(): OptionStatement {
    const startToken = this.expect('identifier', 'option');
    let name = '';

    // Handle parenthesized option names
    if (this.match('punctuation', '(')) {
      this.advance();
      const qualifiedName = this.parseQualifiedIdentifier();
      name = `(${qualifiedName.value})`;
      this.expect('punctuation', ')');
    } else {
      name = this.expect('identifier').value;
    }

    // Handle nested option names (like .cel after the parenthesized part)
    while (this.match('punctuation', '.')) {
      this.advance();
      if (this.match('identifier')) {
        name += '.' + this.advance()!.value;
      }
    }

    this.expect('punctuation', '=');

    let value: string | number | boolean;
    let endRange: Range;

    // Check for aggregate option value (braces)
    if (this.match('punctuation', '{')) {
      // Parse aggregate option value - skip everything until matching closing brace
      value = this.parseAggregateOptionValue();
      endRange = this.peek()?.range || startToken.range;
      this.expect('punctuation', ';');
    } else {
      const valueToken = this.advance()!;
      endRange = valueToken.range;

      if (valueToken.type === 'string') {
        // Handle string concatenation per spec: strLit = strLitSingle { strLitSingle }
        let strValue = valueToken.value.slice(1, -1);
        while (this.match('string')) {
          const nextStr = this.advance()!;
          strValue += nextStr.value.slice(1, -1);
          endRange = nextStr.range;
        }
        value = strValue;
      } else if (valueToken.type === 'number') {
        value = parseFloatLiteral(valueToken.value);
      } else if (valueToken.value === 'true') {
        value = true;
      } else if (valueToken.value === 'false') {
        value = false;
      } else if (valueToken.value === 'inf' || valueToken.value === 'nan') {
        // Handle inf/nan as identifier tokens (they're parsed as identifiers)
        value = parseFloatLiteral(valueToken.value);
      } else {
        value = valueToken.value;
      }

      this.expect('punctuation', ';');
    }

    const node: OptionStatement = {
      type: 'option',
      name,
      value,
      range: { start: startToken.range.start, end: endRange.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  /**
   * Parse an aggregate option value (text format within braces)
   * This handles complex options like buf.validate.message.cel
   * Includes support for multi-line string concatenation within the aggregate value
   */
  private parseAggregateOptionValue(): string {
    this.expect('punctuation', '{');
    let braceDepth = 1;
    const parts: string[] = ['{'];

    while (!this.isAtEnd() && braceDepth > 0) {
      const token = this.advance();
      if (!token) { break; }

      if (token.type === 'punctuation' && token.value === '{') {
        braceDepth++;
        parts.push(token.value);
      } else if (token.type === 'punctuation' && token.value === '}') {
        braceDepth--;
        if (braceDepth >= 0) {  // Include closing brace
          parts.push(token.value);
        }
      } else if (token.type === 'string') {
        // Handle string concatenation: consecutive string literals should be concatenated
        // This is common in CEL expressions that span multiple lines
        parts.push(token.value);
        // Look ahead for more string tokens (string concatenation)
        while (this.match('string')) {
          const nextStr = this.advance();
          if (nextStr) {
            parts.push(nextStr.value);
          }
        }
      } else {
        parts.push(token.value);
      }
    }

    return parts.join(' ');
  }

  private parseMessage(): MessageDefinition {
    const startToken = this.expect('identifier', 'message');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '{');

    const message: MessageDefinition = {
      type: 'message',
      name: nameToken.value,
      nameRange: nameToken.range,
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(message, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      switch (token.value) {
        case 'message':
          message.nestedMessages.push(this.parseMessage());
          break;
        case 'enum':
          message.nestedEnums.push(this.parseEnum());
          break;
        case 'oneof':
          message.oneofs.push(this.parseOneof());
          break;
        case 'option':
          message.options.push(this.parseOption());
          break;
        case 'reserved':
          message.reserved.push(this.parseReserved());
          break;
        case 'extensions':
          message.extensions.push(this.parseExtensions());
          break;
        case 'map':
          message.maps.push(this.parseMapField());
          break;
        case 'optional':
        case 'required':
        case 'repeated': {
          // Check if next token is 'group'
          const modifierToken = this.advance();
          const nextToken = this.peek();
          if (nextToken?.value === 'group') {
            // modifierToken cannot be null here since we matched the case
            message.groups.push(this.parseGroup(modifierToken!.value as 'optional' | 'required' | 'repeated'));
          } else {
            // Put back modifier and parse as regular field
            this.pos--;
            message.fields.push(this.parseField());
          }
          break;
        }
        case 'group':
          message.groups.push(this.parseGroup());
          break;
        default:
          // Handle fields - either starts with identifier (type name) or '.' (fully-qualified type)
          if (token.type === 'identifier' || (token.type === 'punctuation' && token.value === '.')) {
            message.fields.push(this.parseField());
          } else {
            this.advance();
          }
      }
    }

    const endToken = this.expect('punctuation', '}');
    message.range.end = endToken.range.end;

    return message;
  }

  private parseField(): FieldDefinition {
    let modifier: 'optional' | 'required' | 'repeated' | undefined;

    // Capture the first token for comment attachment
    let firstToken = this.peek();

    if (this.match('identifier', 'optional') || this.match('identifier', 'required') || this.match('identifier', 'repeated')) {
      const token = this.advance()!;
      modifier = token.value as 'optional' | 'required' | 'repeated';
      if (!firstToken) {
          firstToken = token;
      }
    }

    const typeInfo = this.parseQualifiedIdentifier();
    if (!firstToken) {
        firstToken = this.peek();
    }

    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.expect('number');

    const options = this.parseFieldOptions();
    const semicolon = this.expect('punctuation', ';');

    const node: FieldDefinition = {
      type: 'field',
      modifier,
      fieldType: typeInfo.value,
      fieldTypeRange: typeInfo.range,
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseIntegerLiteral(numberToken.value),
      options,
      range: { start: typeInfo.range.start, end: numberToken.range.end }
    };
    if (firstToken) {
        this.attachComment(node, firstToken);
    }
    // Also check for trailing comment on the semicolon
    if (semicolon.trailingComment && !node.comments) {
      node.comments = semicolon.trailingComment;
    } else if (semicolon.trailingComment && node.comments) {
      node.comments = node.comments + '\n' + semicolon.trailingComment;
    }
    return node;
  }

  private parseFieldOptions(): FieldOption[] | undefined {
    if (!this.match('punctuation', '[')) {
      return undefined;
    }

    const startBracket = this.advance()!;
    const options: FieldOption[] = [];

    while (!this.match('punctuation', ']')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      let name = '';
      const optionStart = this.peek()?.range.start || startBracket.range.start;
      if (this.match('punctuation', '(')) {
        this.advance();
        // Handle qualified names like buf.validate.field
        let qualifiedName = this.expect('identifier').value;
        while (this.match('punctuation', '.')) {
          this.advance();
          qualifiedName += '.' + this.expect('identifier').value;
        }
        name = `(${qualifiedName})`;
        this.expect('punctuation', ')');

        // Handle suffix like .cel, .string.min_len
        while (this.match('punctuation', '.')) {
          this.advance();
          name += '.' + this.expect('identifier').value;
        }
      } else {
        name = this.expect('identifier').value;
        // Handle dotted names like features.field_presence
        while (this.match('punctuation', '.')) {
          this.advance();
          name += '.' + this.expect('identifier').value;
        }
      }

      this.expect('punctuation', '=');

      let value: string | number | boolean;

      // Check for aggregate option value (braces)
      if (this.match('punctuation', '{')) {
        value = this.parseAggregateOptionValue();
      } else if (this.match('punctuation', '-') || this.match('punctuation', '+')) {
        // Handle signed values: -inf, +inf, -nan, +nan, -123, +456
        const signToken = this.advance()!;
        const sign = signToken.value;
        const nextToken = this.advance()!;

        if (nextToken.value === 'inf' || nextToken.value === 'nan') {
          // -inf, +inf, -nan, +nan
          value = parseFloatLiteral(sign + nextToken.value);
        } else if (nextToken.type === 'number') {
          // -123, +456
          value = parseFloatLiteral(sign + nextToken.value);
        } else {
          // Negative identifier (shouldn't happen in valid proto)
          value = sign + nextToken.value;
        }
      } else {
        const valueToken = this.advance()!;

        if (valueToken.type === 'string') {
          // Handle string concatenation per spec: strLit = strLitSingle { strLitSingle }
          let strValue = valueToken.value.slice(1, -1);
          while (this.match('string')) {
            const nextStr = this.advance()!;
            strValue += nextStr.value.slice(1, -1);
          }
          value = strValue;
        } else if (valueToken.type === 'number') {
          value = parseFloatLiteral(valueToken.value);
        } else if (valueToken.value === 'true') {
          value = true;
        } else if (valueToken.value === 'false') {
          value = false;
        } else if (valueToken.value === 'inf' || valueToken.value === 'nan') {
          // Handle inf/nan as identifier tokens
          value = parseFloatLiteral(valueToken.value);
        } else {
          value = valueToken.value;
        }
      }

      const valueEndPos = this.peek()?.range.start || optionStart;
      const optionRange = { start: optionStart, end: valueEndPos };

      options.push({ type: 'field_option', name, value, range: optionRange });
    }

    this.expect('punctuation', ']');
    return options.length > 0 ? options : undefined;
  }

  private parseMapField(): MapFieldDefinition {
    const startToken = this.expect('identifier', 'map');
    this.expect('punctuation', '<');
    const keyTypeToken = this.expect('identifier');
    this.expect('punctuation', ',');
    const valueTypeInfo = this.parseQualifiedIdentifier();
    this.expect('punctuation', '>');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.expect('number');
    this.parseFieldOptions(); // Consume but ignore for map
    const semicolon = this.expect('punctuation', ';');

    const node: MapFieldDefinition = {
      type: 'map',
      keyType: keyTypeToken.value,
      valueType: valueTypeInfo.value,
      valueTypeRange: valueTypeInfo.range,
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseIntegerLiteral(numberToken.value),
      range: { start: startToken.range.start, end: numberToken.range.end }
    };
    this.attachComment(node, startToken);
    // Also check for trailing comment on the semicolon
    if (semicolon.trailingComment && !node.comments) {
      node.comments = semicolon.trailingComment;
    } else if (semicolon.trailingComment && node.comments) {
      node.comments = node.comments + '\n' + semicolon.trailingComment;
    }
    return node;
  }

  private parseOneof(): OneofDefinition {
    const startToken = this.expect('identifier', 'oneof');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '{');

    const oneof: OneofDefinition = {
      type: 'oneof',
      name: nameToken.value,
      nameRange: nameToken.range,
      fields: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(oneof, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      if (token.value === 'option') {
        this.parseOption(); // Consume but don't store
      } else if (token.type === 'identifier' || (token.type === 'punctuation' && token.value === '.')) {
        // Handle fields - type can start with '.' for fully-qualified names
        oneof.fields.push(this.parseField());
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', '}');
    oneof.range.end = endToken.range.end;

    return oneof;
  }

  private parseEnum(): EnumDefinition {
    const startToken = this.expect('identifier', 'enum');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '{');

    const enumDef: EnumDefinition = {
      type: 'enum',
      name: nameToken.value,
      nameRange: nameToken.range,
      values: [],
      options: [],
      reserved: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(enumDef, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      if (token.value === 'option') {
        enumDef.options.push(this.parseOption());
      } else if (token.value === 'reserved') {
        enumDef.reserved.push(this.parseReserved());
      } else if (token.type === 'identifier') {
        enumDef.values.push(this.parseEnumValue());
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', '}');
    enumDef.range.end = endToken.range.end;

    return enumDef;
  }

  private parseEnumValue(): EnumValue {
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.advance()!;
    const options = this.parseFieldOptions();
    const semicolon = this.expect('punctuation', ';');

    const node: EnumValue = {
      type: 'enum_value',
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseIntegerLiteral(numberToken.value),
      options,
      range: { start: nameToken.range.start, end: numberToken.range.end }
    };
    this.attachComment(node, nameToken);
    // Also check for trailing comment on the semicolon
    if (semicolon.trailingComment && !node.comments) {
      node.comments = semicolon.trailingComment;
    } else if (semicolon.trailingComment && node.comments) {
      node.comments = node.comments + '\n' + semicolon.trailingComment;
    }
    return node;
  }

  private parseService(): ServiceDefinition {
    const startToken = this.expect('identifier', 'service');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '{');

    const service: ServiceDefinition = {
      type: 'service',
      name: nameToken.value,
      nameRange: nameToken.range,
      rpcs: [],
      options: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(service, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      if (token.value === 'rpc') {
        service.rpcs.push(this.parseRpc());
      } else if (token.value === 'option') {
        service.options.push(this.parseOption());
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', '}');
    service.range.end = endToken.range.end;

    return service;
  }

  private parseRpc(): RpcDefinition {
    const startToken = this.expect('identifier', 'rpc');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '(');

    let inputStream = false;
    if (this.match('identifier', 'stream')) {
      this.advance();
      inputStream = true;
    }

    const inputTypeInfo = this.parseQualifiedIdentifier();
    this.expect('punctuation', ')');
    this.expect('identifier', 'returns');
    this.expect('punctuation', '(');

    let outputStream = false;
    if (this.match('identifier', 'stream')) {
      this.advance();
      outputStream = true;
    }

    const outputTypeInfo = this.parseQualifiedIdentifier();
    this.expect('punctuation', ')');

    const rpc: RpcDefinition = {
      type: 'rpc',
      name: nameToken.value,
      nameRange: nameToken.range,
      requestType: inputTypeInfo.value,
      requestTypeRange: inputTypeInfo.range,
      requestStreaming: inputStream,
      responseType: outputTypeInfo.value,
      responseTypeRange: outputTypeInfo.range,
      responseStreaming: outputStream,
      // Legacy field names for backward compatibility
      inputType: inputTypeInfo.value,
      inputTypeRange: inputTypeInfo.range,
      inputStream,
      outputType: outputTypeInfo.value,
      outputTypeRange: outputTypeInfo.range,
      outputStream,
      options: [],
      range: { start: startToken.range.start, end: outputTypeInfo.range.end }
    };
    this.attachComment(rpc, startToken);

    // Handle rpc body or semicolon
    if (this.match('punctuation', '{')) {
      this.advance();
      while (!this.isAtEnd() && !this.match('punctuation', '}')) {
        if (this.match('identifier', 'option')) {
          rpc.options.push(this.parseOption());
        } else {
          this.advance();
        }
      }
      const endToken = this.expect('punctuation', '}');
      rpc.range.end = endToken.range.end;
      // Check for trailing comment on closing brace
      if (endToken.trailingComment && !rpc.comments) {
        rpc.comments = endToken.trailingComment;
      } else if (endToken.trailingComment && rpc.comments) {
        rpc.comments = rpc.comments + '\n' + endToken.trailingComment;
      }
    } else {
      const endToken = this.expect('punctuation', ';');
      rpc.range.end = endToken.range.end;
      // Check for trailing comment on semicolon
      if (endToken.trailingComment && !rpc.comments) {
        rpc.comments = endToken.trailingComment;
      } else if (endToken.trailingComment && rpc.comments) {
        rpc.comments = rpc.comments + '\n' + endToken.trailingComment;
      }
    }

    return rpc;
  }

  private parseExtend(): ExtendDefinition {
    const startToken = this.expect('identifier', 'extend');
    const messageNameInfo = this.parseQualifiedIdentifier();
    this.expect('punctuation', '{');

    const extend: ExtendDefinition = {
      type: 'extend',
      extendType: messageNameInfo.value,
      extendTypeRange: messageNameInfo.range,
      fields: [],
      groups: [],
      // Legacy field names for backward compatibility
      messageName: messageNameInfo.value,
      messageNameRange: messageNameInfo.range,
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(extend, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      // Handle fields - type can start with '.' for fully-qualified names
      if (token.type === 'identifier' || (token.type === 'punctuation' && token.value === '.')) {
        extend.fields.push(this.parseField());
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', '}');
    extend.range.end = endToken.range.end;

    return extend;
  }

  private parseReserved(): ReservedStatement {
    const startToken = this.expect('identifier', 'reserved');
    const ranges: ReservedRange[] = [];
    const names: string[] = [];

    while (!this.isAtEnd() && !this.match('punctuation', ';')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      if (this.match('string')) {
        const nameToken = this.advance()!;
        names.push(nameToken.value.slice(1, -1));
      } else if (this.match('number')) {
        const startNum = parseIntegerLiteral(this.advance()!.value);
        let endNum: number | 'max' = startNum;

        if (this.match('identifier', 'to')) {
          this.advance();
          if (this.match('identifier', 'max')) {
            this.advance();
            endNum = 'max';
          } else {
            endNum = parseIntegerLiteral(this.expect('number').value);
          }
        }

        ranges.push({ start: startNum, end: endNum });
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', ';');

    const node: ReservedStatement = {
      type: 'reserved',
      ranges,
      names,
      range: { start: startToken.range.start, end: endToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parseExtensions(): ExtensionsStatement {
    const startToken = this.expect('identifier', 'extensions');
    const ranges: ReservedRange[] = [];

    while (!this.isAtEnd() && !this.match('punctuation', ';')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      if (this.match('number')) {
        const startNum = parseIntegerLiteral(this.advance()!.value);
        let endNum: number | 'max' = startNum;

        if (this.match('identifier', 'to')) {
          this.advance();
          if (this.match('identifier', 'max')) {
            this.advance();
            endNum = 'max';
          } else {
            endNum = parseIntegerLiteral(this.expect('number').value);
          }
        }

        ranges.push({ start: startNum, end: endNum });
      } else {
        this.advance();
      }
    }

    const endToken = this.expect('punctuation', ';');

    const node: ExtensionsStatement = {
      type: 'extensions',
      ranges,
      range: { start: startToken.range.start, end: endToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
  }

  private parseGroup(modifier?: 'optional' | 'required' | 'repeated'): GroupFieldDefinition {
    const startToken = this.expect('identifier', 'group');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.expect('number');
    this.expect('punctuation', '{');

    const group: GroupFieldDefinition = {
      type: 'group',
      modifier,
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseIntegerLiteral(numberToken.value),
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
      groups: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(group, startToken);

    // Parse group body (same as message body)
    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      switch (token.value) {
        case 'message':
          group.nestedMessages.push(this.parseMessage());
          break;
        case 'enum':
          group.nestedEnums.push(this.parseEnum());
          break;
        case 'oneof':
          group.oneofs.push(this.parseOneof());
          break;
        case 'option':
          group.options.push(this.parseOption());
          break;
        case 'reserved':
          group.reserved.push(this.parseReserved());
          break;
        case 'extensions':
          group.extensions.push(this.parseExtensions());
          break;
        case 'map':
          // Note: Maps are proto3, groups are proto2. Parser is permissive.
          // Diagnostics should flag this as an error if needed.
          group.maps.push(this.parseMapField());
          break;
        case 'group':
          // Nested group without modifier
          group.groups.push(this.parseGroup());
          break;
        case 'optional':
        case 'required':
        case 'repeated': {
          // Check if this is a nested group with modifier
          const nextToken = this.tokens[this.pos + 1];
          if (nextToken?.value === 'group') {
            const modToken = this.advance()!;
            group.groups.push(this.parseGroup(modToken.value as 'optional' | 'required' | 'repeated'));
          } else {
            group.fields.push(this.parseField());
          }
          break;
        }
        default:
          // Handle fields - type can start with '.' for fully-qualified names
          if (token.type === 'identifier' || (token.type === 'punctuation' && token.value === '.')) {
            group.fields.push(this.parseField());
          } else {
            this.advance();
          }
      }
    }

    const endToken = this.expect('punctuation', '}');
    group.range.end = endToken.range.end;

    return group;
  }
}

export const parser = new ProtoParser();
