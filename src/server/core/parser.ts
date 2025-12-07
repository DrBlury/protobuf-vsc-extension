/**
 * Protocol Buffers Parser
 * Parses .proto files into an AST
 */

import {
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

interface Token {
  type: string;
  value: string;
  range: Range;
  comment?: string;
}

export class ProtoParser {
  private tokens: Token[] = [];
  private pos = 0;
  private text = '';
  private lines: string[] = [];
  private lastComment: string | undefined;

  parse(text: string, _uri: string): ProtoFile {
    this.text = text;
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
      range: {
        start: { line: 0, character: 0 },
        end: { line: this.lines.length - 1, character: this.lines[this.lines.length - 1]?.length || 0 }
      }
    };

    while (!this.isAtEnd()) {
      try {
        this.parseTopLevel(file);
      } catch (_e) {
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

    // Comment buffer for attaching to next token
    let pendingComment: string[] = [];

    while (i < text.length) {
      const startLine = line;
      const startChar = character;

      // Skip whitespace
      if (/\s/.test(text[i])) {
        if (text[i] === '\n') {
          line++;
          character = 0;
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
        pendingComment.push(commentContent);
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
        pendingComment.push(commentContent);

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
        continue;
      }

      // Number
      if (/[0-9]/.test(text[i]) || (text[i] === '-' && /[0-9]/.test(text[i + 1]))) {
        const start = i;
        if (text[i] === '-') {
          i++;
          character++;
        }
        // Handle hex, octal, or decimal
        if (text[i] === '0' && (text[i + 1] === 'x' || text[i + 1] === 'X')) {
          i += 2;
          character += 2;
          while (i < text.length && /[0-9a-fA-F]/.test(text[i])) {
            i++;
            character++;
          }
        } else {
          while (i < text.length && /[0-9.]/.test(text[i])) {
            i++;
            character++;
          }
          // Handle exponent
          if (text[i] === 'e' || text[i] === 'E') {
            i++;
            character++;
            if (text[i] === '+' || text[i] === '-') {
              i++;
              character++;
            }
            while (i < text.length && /[0-9]/.test(text[i])) {
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
        continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(text[i])) {
        const start = i;
        while (i < text.length && /[a-zA-Z0-9_.]/.test(text[i])) {
          i++;
          character++;
        }
        const value = text.slice(start, i);
        tokens.push({
          type: 'identifier',
          value,
          range: { start: { line: startLine, character: startChar }, end: { line, character } },
          comment
        });
        continue;
      }

      // Punctuation
      const punctuation = '{}[]()<>;=,';
      if (punctuation.includes(text[i])) {
        tokens.push({
          type: 'punctuation',
          value: text[i],
          range: { start: { line: startLine, character: startChar }, end: { line, character: character + 1 } },
          comment // Attaching comment to punctuation is rare but possible if it's the only thing left
        });
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
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private advance(): Token | null {
    const token = this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
    if (token?.comment) {
      this.lastComment = token.comment;
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
    const nameToken = this.expect('identifier');
    this.expect('punctuation', ';');

    const node: PackageStatement = {
      type: 'package',
      name: nameToken.value,
      range: { start: startToken.range.start, end: nameToken.range.end }
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
      const nameToken = this.expect('identifier');
      name = `(${nameToken.value})`;
      this.expect('punctuation', ')');
    } else {
      name = this.expect('identifier').value;
    }

    // Handle nested option names
    while (this.match('punctuation', '.') || this.match('identifier')) {
      if (this.match('punctuation', '.')) {
        this.advance();
        name += '.';
      }
      if (this.match('identifier')) {
        name += this.advance()!.value;
      }
    }

    this.expect('punctuation', '=');
    const valueToken = this.advance()!;
    let value: string | number | boolean;

    if (valueToken.type === 'string') {
      value = valueToken.value.slice(1, -1);
    } else if (valueToken.type === 'number') {
      value = parseFloat(valueToken.value);
    } else if (valueToken.value === 'true') {
      value = true;
    } else if (valueToken.value === 'false') {
      value = false;
    } else {
      value = valueToken.value;
    }

    this.expect('punctuation', ';');

    const node: OptionStatement = {
      type: 'option',
      name,
      value,
      range: { start: startToken.range.start, end: valueToken.range.end }
    };
    this.attachComment(node, startToken);
    return node;
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
        case 'repeated':
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
        case 'group':
          message.groups.push(this.parseGroup());
          break;
        default:
          if (token.type === 'identifier') {
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

    const typeToken = this.expect('identifier');
    if (!firstToken) {
        firstToken = typeToken;
    }

    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.expect('number');

    const options = this.parseFieldOptions();
    this.expect('punctuation', ';');

    const node: FieldDefinition = {
      type: 'field',
      modifier,
      fieldType: typeToken.value,
      fieldTypeRange: typeToken.range,
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseInt(numberToken.value, 10),
      options,
      range: { start: typeToken.range.start, end: numberToken.range.end }
    };
    if (firstToken) {
        this.attachComment(node, firstToken);
    }
    return node;
  }

  private parseFieldOptions(): FieldOption[] | undefined {
    if (!this.match('punctuation', '[')) {
      return undefined;
    }

    this.advance();
    const options: FieldOption[] = [];

    while (!this.match('punctuation', ']')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      let name = '';
      if (this.match('punctuation', '(')) {
        this.advance();
        name = `(${this.expect('identifier').value})`;
        this.expect('punctuation', ')');
      } else {
        name = this.expect('identifier').value;
      }

      this.expect('punctuation', '=');
      const valueToken = this.advance()!;
      let value: string | number | boolean;

      if (valueToken.type === 'string') {
        value = valueToken.value.slice(1, -1);
      } else if (valueToken.type === 'number') {
        value = parseFloat(valueToken.value);
      } else if (valueToken.value === 'true') {
        value = true;
      } else if (valueToken.value === 'false') {
        value = false;
      } else {
        value = valueToken.value;
      }

      options.push({ name, value });
    }

    this.expect('punctuation', ']');
    return options.length > 0 ? options : undefined;
  }

  private parseMapField(): MapFieldDefinition {
    const startToken = this.expect('identifier', 'map');
    this.expect('punctuation', '<');
    const keyTypeToken = this.expect('identifier');
    this.expect('punctuation', ',');
    const valueTypeToken = this.expect('identifier');
    this.expect('punctuation', '>');
    const nameToken = this.expect('identifier');
    this.expect('punctuation', '=');
    const numberToken = this.expect('number');
    this.parseFieldOptions(); // Consume but ignore for map
    this.expect('punctuation', ';');

    const node: MapFieldDefinition = {
      type: 'map',
      keyType: keyTypeToken.value,
      valueType: valueTypeToken.value,
      valueTypeRange: valueTypeToken.range,
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseInt(numberToken.value, 10),
      range: { start: startToken.range.start, end: numberToken.range.end }
    };
    this.attachComment(node, startToken);
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
      } else if (token.type === 'identifier') {
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
    this.expect('punctuation', ';');

    const node: EnumValue = {
      type: 'enumValue',
      name: nameToken.value,
      nameRange: nameToken.range,
      number: parseInt(numberToken.value, 10),
      options,
      range: { start: nameToken.range.start, end: numberToken.range.end }
    };
    this.attachComment(node, nameToken);
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

    const inputTypeToken = this.expect('identifier');
    this.expect('punctuation', ')');
    this.expect('identifier', 'returns');
    this.expect('punctuation', '(');

    let outputStream = false;
    if (this.match('identifier', 'stream')) {
      this.advance();
      outputStream = true;
    }

    const outputTypeToken = this.expect('identifier');
    this.expect('punctuation', ')');

    const rpc: RpcDefinition = {
      type: 'rpc',
      name: nameToken.value,
      nameRange: nameToken.range,
      inputType: inputTypeToken.value,
      inputTypeRange: inputTypeToken.range,
      inputStream,
      outputType: outputTypeToken.value,
      outputTypeRange: outputTypeToken.range,
      outputStream,
      options: [],
      range: { start: startToken.range.start, end: outputTypeToken.range.end }
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
    } else {
      const endToken = this.expect('punctuation', ';');
      rpc.range.end = endToken.range.end;
    }

    return rpc;
  }

  private parseExtend(): ExtendDefinition {
    const startToken = this.expect('identifier', 'extend');
    const messageNameToken = this.expect('identifier');
    this.expect('punctuation', '{');

    const extend: ExtendDefinition = {
      type: 'extend',
      messageName: messageNameToken.value,
      messageNameRange: messageNameToken.range,
      fields: [],
      range: { start: startToken.range.start, end: startToken.range.end }
    };
    this.attachComment(extend, startToken);

    while (!this.isAtEnd() && !this.match('punctuation', '}')) {
      const token = this.peek();
      if (!token) {
        break;
      }

      if (token.type === 'identifier') {
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

    while (!this.match('punctuation', ';')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      if (this.match('string')) {
        const nameToken = this.advance()!;
        names.push(nameToken.value.slice(1, -1));
      } else if (this.match('number')) {
        const startNum = parseInt(this.advance()!.value, 10);
        let endNum: number | 'max' = startNum;

        if (this.match('identifier', 'to')) {
          this.advance();
          if (this.match('identifier', 'max')) {
            this.advance();
            endNum = 'max';
          } else {
            endNum = parseInt(this.expect('number').value, 10);
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

    while (!this.match('punctuation', ';')) {
      if (this.match('punctuation', ',')) {
        this.advance();
        continue;
      }

      if (this.match('number')) {
        const startNum = parseInt(this.advance()!.value, 10);
        let endNum: number | 'max' = startNum;

        if (this.match('identifier', 'to')) {
          this.advance();
          if (this.match('identifier', 'max')) {
            this.advance();
            endNum = 'max';
          } else {
            endNum = parseInt(this.expect('number').value, 10);
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
      number: parseInt(numberToken.value, 10),
      fields: [],
      nestedMessages: [],
      nestedEnums: [],
      oneofs: [],
      options: [],
      reserved: [],
      extensions: [],
      maps: [],
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
        case 'optional':
        case 'required':
        case 'repeated':
          // Groups cannot be nested, so always parse as field
          group.fields.push(this.parseField());
          break;
        default:
          if (token.type === 'identifier') {
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
