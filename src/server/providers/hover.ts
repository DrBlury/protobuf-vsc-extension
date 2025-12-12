/**
 * Hover Provider for Protocol Buffers
 */

import { Hover, MarkupContent, MarkupKind, Position } from 'vscode-languageserver/node';
import {
  BUILTIN_TYPES,
  SymbolKind,
  SymbolInfo,
  MessageDefinition,
  EnumDefinition,
  FieldDefinition,
  MapFieldDefinition,
  OneofDefinition,
  ProtoNode,
  ProtoFile,
  ServiceDefinition,
  Range
} from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';

const GOOGLE_WKT_BASE_URL = 'https://protobuf.dev/reference/protobuf/google.protobuf/';

export class HoverProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getHover(uri: string, position: Position, lineText: string): Hover | null {
    // Extract word at position
    const word = this.getWordAtPosition(lineText, position.character);
    if (!word) {
      return null;
    }

    // Check for built-in types
    if (BUILTIN_TYPES.includes(word)) {
      return this.getBuiltinTypeHover(word);
    }

    // Check for CEL functions and keywords
    const celHover = this.getCelHover(word, lineText);
    if (celHover) {
      return celHover;
    }

    // Check for Google API annotations
    const googleApiHover = this.getGoogleApiHover(word, lineText);
    if (googleApiHover) {
      return googleApiHover;
    }

    // Check for protovalidate/buf.validate options
    const protovalidateHover = this.getProtovalidateHover(word, lineText);
    if (protovalidateHover) {
      return protovalidateHover;
    }

    // Check for symbols
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const symbol = this.analyzer.resolveType(word, uri, packageName);

    if (symbol) {
      return this.getSymbolHover(symbol);
    }

    // Check for keywords
    const keywordHover = this.getKeywordHover(word);
    if (keywordHover) {
      return keywordHover;
    }

    return null;
  }

  private getWordAtPosition(line: string, character: number): string | null {
    // Find word boundaries
    let start = character;
    let end = character;

    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1]!)) {
      start--;
    }

    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end]!)) {
      end++;
    }

    if (start === end) {
      return null;
    }
    return line.substring(start, end);
  }

  private getBuiltinTypeHover(type: string): Hover {
    const descriptions: Record<string, string> = {
      double: '64-bit floating point number',
      float: '32-bit floating point number',
      int32: '32-bit signed integer. Uses variable-length encoding. Inefficient for negative numbers.',
      int64: '64-bit signed integer. Uses variable-length encoding. Inefficient for negative numbers.',
      uint32: '32-bit unsigned integer. Uses variable-length encoding.',
      uint64: '64-bit unsigned integer. Uses variable-length encoding.',
      sint32: '32-bit signed integer. Uses variable-length encoding. Efficient for negative numbers.',
      sint64: '64-bit signed integer. Uses variable-length encoding. Efficient for negative numbers.',
      fixed32: '32-bit unsigned integer. Always 4 bytes. More efficient than uint32 if values are often > 2^28.',
      fixed64: '64-bit unsigned integer. Always 8 bytes. More efficient than uint64 if values are often > 2^56.',
      sfixed32: '32-bit signed integer. Always 4 bytes.',
      sfixed64: '64-bit signed integer. Always 8 bytes.',
      bool: 'Boolean value (true or false)',
      string: 'UTF-8 encoded or 7-bit ASCII text string',
      bytes: 'Arbitrary byte sequence'
    };

    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${type}**`,
        '',
        descriptions[type] || 'Built-in protobuf scalar type'
      ].join('\n')
    };

    return { contents: content };
  }

  private getSymbolHover(symbol: SymbolInfo): Hover {
    const kindLabels: Record<string, string> = {
      [SymbolKind.Message]: 'message',
      [SymbolKind.Enum]: 'enum',
      [SymbolKind.Service]: 'service',
      [SymbolKind.Rpc]: 'rpc',
      [SymbolKind.Field]: 'field',
      [SymbolKind.EnumValue]: 'enum value',
      [SymbolKind.Oneof]: 'oneof'
    };

    const lines = [
      `**${kindLabels[symbol.kind] || symbol.kind}** \`${symbol.name}\``,
      ''
    ];

    if (symbol.fullName !== symbol.name) {
      lines.push(`Full name: \`${symbol.fullName}\``);
    }

    if (symbol.containerName) {
      lines.push(`Defined in: \`${symbol.containerName}\``);
    }

    // Add Well-Known Type Link
    if (symbol.fullName.startsWith('google.protobuf.')) {
        const typeName = symbol.fullName.replace('google.protobuf.', '');
        const wktUrl = `${GOOGLE_WKT_BASE_URL}#${typeName}`;
        lines.push(`[Open Documentation](${wktUrl})`);
    }

    // Add reference count
    const references = this.analyzer.findReferences(symbol.fullName);
    if (references.length > 0) {
      const externalRefs = references.filter(r => r.uri !== symbol.location.uri);
      lines.push(`References: ${references.length} (${externalRefs.length} external)`);
    }

    // Resolve definition to get comments
    let comments = '';

    // Helper to find the definition node in the file
    // This is a bit inefficient but robust
    const file = this.analyzer.getFile(symbol.location.uri);
    if (file) {
        const node = this.findNodeAt(file, symbol.location.range.start);
        if (node && node.comments) {
            comments = node.comments;
        }
    }

    if (comments) {
        lines.push('', '---', '', comments);
    }

    // Add rich detail for messages and enums
    if (symbol.kind === SymbolKind.Message) {
      const message = this.analyzer.getMessageDefinition(symbol.fullName);
      if (message) {
        lines.push('', '```proto');
        lines.push(...this.formatMessage(message));
        lines.push('```');
      }
    } else if (symbol.kind === SymbolKind.Enum) {
      const enumDef = this.analyzer.getEnumDefinition(symbol.fullName);
      if (enumDef) {
        lines.push('', '```proto');
        lines.push(...this.formatEnum(enumDef));
        lines.push('```');
      }
    }

    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: lines.join('\n')
    };

    return { contents: content };
  }

  // Simplified node finder based on position
  private findNodeAt(file: ProtoFile, position: { line: number, character: number }): ProtoNode | undefined {
      // Traverse file to find node
      // Check top level messages, enums, etc.
      for (const msg of file.messages) {
          if (this.contains(msg.range, position)) {
              if (this.isNameRange(msg.nameRange, position)) {
                  return msg;
              }
              return this.findInMessage(msg, position);
          }
      }
      for (const enm of file.enums) {
          if (this.contains(enm.range, position)) {
              if (this.isNameRange(enm.nameRange, position)) {
                  return enm;
              }
              return this.findInEnum(enm, position);
          }
      }
      for (const svc of file.services) {
          if (this.contains(svc.range, position)) {
              if (this.isNameRange(svc.nameRange, position)) {
                  return svc;
              }
              return this.findInService(svc, position);
          }
      }
      return undefined;
  }

  private findInMessage(msg: MessageDefinition, position: { line: number, character: number }): ProtoNode | undefined {
      for (const field of msg.fields) {
          if (this.contains(field.range, position)) {
              return field;
          }
      }
      for (const nested of msg.nestedMessages) {
          if (this.contains(nested.range, position)) {
              if (this.isNameRange(nested.nameRange, position)) {
                  return nested;
              }
              return this.findInMessage(nested, position);
          }
      }
      for (const enm of msg.nestedEnums) {
          if (this.contains(enm.range, position)) {
              if (this.isNameRange(enm.nameRange, position)) {
                  return enm;
              }
              return this.findInEnum(enm, position);
          }
      }
      return msg; // Fallback to message itself if inside but not on sub-node
  }

  private findInEnum(enm: EnumDefinition, position: { line: number, character: number }): ProtoNode | undefined {
      for (const val of enm.values) {
          if (this.contains(val.range, position)) {
              return val;
          }
      }
      return enm;
  }

  private findInService(svc: ServiceDefinition, position: { line: number, character: number }): ProtoNode | undefined {
      for (const rpc of svc.rpcs) {
          if (this.contains(rpc.range, position)) {
              return rpc;
          }
      }
      return svc;
  }

  private contains(range: Range, pos: { line: number, character: number }): boolean {
      if (pos.line < range.start.line || pos.line > range.end.line) {
          return false;
      }
      if (pos.line === range.start.line && pos.character < range.start.character) {
          return false;
      }
      if (pos.line === range.end.line && pos.character > range.end.character) {
          return false;
      }
      return true;
  }

  private isNameRange(range: Range, pos: { line: number, character: number }): boolean {
      return this.contains(range, pos);
  }

  private getKeywordHover(word: string): Hover | null {
    const keywords: Record<string, string> = {
      syntax: 'Declares the protobuf syntax version (proto2 or proto3)',
      edition: 'Declares the protobuf edition (e.g., 2023)',
      package: 'Declares the package namespace for the proto file',
      import: 'Imports definitions from another proto file',
      option: 'Sets a file-level, message-level, field-level, or service-level option',
      message: 'Defines a message type (structured data)',
      enum: 'Defines an enumeration type',
      service: 'Defines a service for RPC methods',
      rpc: 'Defines an RPC method within a service',
      returns: 'Specifies the return type of an RPC method',
      stream: 'Indicates streaming for RPC input or output',
      oneof: 'Defines a oneof field group where only one field can be set',
      extend: 'Extends a message with additional fields (proto2)',
      extensions: 'Declares extension field number ranges (proto2)',
      reserved: 'Reserves field numbers or names that cannot be used',
      optional: 'Field modifier indicating the field is optional',
      required: 'Field modifier indicating the field is required (proto2, deprecated)',
      repeated: 'Field modifier indicating the field can have multiple values',
      map: 'Defines a map field with key-value pairs',
      weak: 'Import modifier for weak dependencies',
      public: 'Import modifier to re-export imported definitions'
    };

    if (keywords[word]) {
      const content: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: [
          `**${word}**`,
          '',
          keywords[word]
        ].join('\n')
      };

      return { contents: content };
    }

    return null;
  }

  private formatMessage(message: MessageDefinition): string[] {
    const body: string[] = [];

    for (const field of message.fields) {
      body.push(this.formatField(field));
    }

    for (const mapField of message.maps) {
      body.push(this.formatMapField(mapField));
    }

    for (const oneof of message.oneofs) {
      body.push(...this.formatOneof(oneof));
    }

    // Show nested type names (summary only to keep hover compact)
    for (const nestedMessage of message.nestedMessages) {
      body.push(`  message ${nestedMessage.name} { ... }`);
    }
    for (const nestedEnum of message.nestedEnums) {
      body.push(`  enum ${nestedEnum.name} { ... }`);
    }

    return [
      `message ${message.name} {`,
      ...body,
      '}'
    ];
  }

  private formatEnum(enumDef: EnumDefinition): string[] {
    const values = enumDef.values.map(v => `  ${v.name} = ${v.number};`);
    return [
      `enum ${enumDef.name} {`,
      ...values,
      '}'
    ];
  }

  private formatField(field: FieldDefinition): string {
    const modifier = field.modifier ? `${field.modifier} ` : '';
    return `  ${modifier}${field.fieldType} ${field.name} = ${field.number};`;
  }

  private formatMapField(field: MapFieldDefinition): string {
    return `  map<${field.keyType}, ${field.valueType}> ${field.name} = ${field.number};`;
  }

  private formatOneof(oneof: OneofDefinition): string[] {
    const lines = [`  oneof ${oneof.name} {`];
    for (const field of oneof.fields) {
      lines.push(this.formatField(field));
    }
    lines.push('  }');
    return lines;
  }

  // ============================================================================
  // CEL Hover Support
  // ============================================================================

  private getCelHover(word: string, lineText: string): Hover | null {
    // Check if we're in a CEL expression context (inside buf.validate or expression:)
    const isCelContext = lineText.includes('buf.validate') ||
                         lineText.includes('expression:') ||
                         lineText.includes('.cel') ||
                         lineText.includes('cel =');

    // Handle dot-separated words - extract segments for matching
    const wordParts = word.split('.');
    const firstPart = wordParts[0]!;
    const lastPart = wordParts[wordParts.length - 1]!;

    // CEL functions - always show if the word matches (check both full word and last segment)
    const celFunctions: Record<string, { signature: string; description: string; example?: string }> = {
      // Field presence
      has: {
        signature: 'has(field) → bool',
        description: 'Returns true if the specified field is set (not the default value).',
        example: 'has(this.email)'
      },

      // Size functions
      size: {
        signature: 'size(value) → int',
        description: 'Returns the size/length of a string, bytes, list, or map.',
        example: 'size(this.name) > 0'
      },

      // String methods
      startsWith: {
        signature: 'string.startsWith(prefix) → bool',
        description: 'Returns true if the string starts with the specified prefix.',
        example: '"hello".startsWith("he") // true'
      },
      endsWith: {
        signature: 'string.endsWith(suffix) → bool',
        description: 'Returns true if the string ends with the specified suffix.',
        example: '"hello".endsWith("lo") // true'
      },
      contains: {
        signature: 'string.contains(substring) → bool',
        description: 'Returns true if the string contains the specified substring.',
        example: '"hello".contains("ell") // true'
      },
      matches: {
        signature: 'string.matches(regex) → bool',
        description: 'Returns true if the string matches the regular expression pattern.',
        example: 'this.email.matches("^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$")'
      },
      toLowerCase: {
        signature: 'string.toLowerCase() → string',
        description: 'Returns the string converted to lowercase.',
        example: '"Hello".toLowerCase() // "hello"'
      },
      toUpperCase: {
        signature: 'string.toUpperCase() → string',
        description: 'Returns the string converted to uppercase.',
        example: '"hello".toUpperCase() // "HELLO"'
      },
      trim: {
        signature: 'string.trim() → string',
        description: 'Returns the string with leading and trailing whitespace removed.',
        example: '"  hello  ".trim() // "hello"'
      },

      // List macros
      all: {
        signature: 'list.all(x, predicate) → bool',
        description: 'Returns true if the predicate is true for all elements in the list.',
        example: '[1, 2, 3].all(x, x > 0) // true'
      },
      exists: {
        signature: 'list.exists(x, predicate) → bool',
        description: 'Returns true if the predicate is true for any element in the list.',
        example: '[1, 2, 3].exists(x, x > 2) // true'
      },
      exists_one: {
        signature: 'list.exists_one(x, predicate) → bool',
        description: 'Returns true if the predicate is true for exactly one element.',
        example: '[1, 2, 3].exists_one(x, x == 2) // true'
      },
      filter: {
        signature: 'list.filter(x, predicate) → list',
        description: 'Returns a new list containing only elements where the predicate is true.',
        example: '[1, 2, 3, 4].filter(x, x > 2) // [3, 4]'
      },
      map: {
        signature: 'list.map(x, transform) → list',
        description: 'Returns a new list with each element transformed.',
        example: '[1, 2, 3].map(x, x * 2) // [2, 4, 6]'
      },

      // Type conversions
      int: {
        signature: 'int(value) → int',
        description: 'Converts a value to an integer.',
        example: 'int("42") // 42'
      },
      uint: {
        signature: 'uint(value) → uint',
        description: 'Converts a value to an unsigned integer.',
        example: 'uint(42) // 42u'
      },
      double: {
        signature: 'double(value) → double',
        description: 'Converts a value to a double (floating point).',
        example: 'double("3.14") // 3.14'
      },
      string: {
        signature: 'string(value) → string',
        description: 'Converts a value to a string representation.',
        example: 'string(42) // "42"'
      },
      bytes: {
        signature: 'bytes(value) → bytes',
        description: 'Converts a value to bytes.',
        example: 'bytes("hello")'
      },
      bool: {
        signature: 'bool(value) → bool',
        description: 'Converts a value to a boolean.',
        example: 'bool("true") // true'
      },
      type: {
        signature: 'type(value) → type',
        description: 'Returns the type of the given value.',
        example: 'type(42) // int'
      },
      dyn: {
        signature: 'dyn(value) → dyn',
        description: 'Casts a value to dynamic type, disabling type checking.',
        example: 'dyn(this.field)'
      },

      // Duration/Timestamp
      duration: {
        signature: 'duration(string) → google.protobuf.Duration',
        description: 'Creates a Duration from a string like "1h30m", "3600s", or "100ms".',
        example: 'duration("1h30m")'
      },
      timestamp: {
        signature: 'timestamp(string) → google.protobuf.Timestamp',
        description: 'Creates a Timestamp from an RFC3339 formatted string.',
        example: 'timestamp("2023-01-01T00:00:00Z")'
      },

      // Timestamp methods
      getDate: {
        signature: 'timestamp.getDate(timezone?) → int',
        description: 'Gets the day of month (1-31) from a timestamp.',
        example: 'this.created_at.getDate()'
      },
      getDayOfMonth: {
        signature: 'timestamp.getDayOfMonth(timezone?) → int',
        description: 'Gets the day of month (1-31) from a timestamp.',
        example: 'this.created_at.getDayOfMonth()'
      },
      getDayOfWeek: {
        signature: 'timestamp.getDayOfWeek(timezone?) → int',
        description: 'Gets the day of week (0=Sunday, 6=Saturday) from a timestamp.',
        example: 'this.created_at.getDayOfWeek()'
      },
      getDayOfYear: {
        signature: 'timestamp.getDayOfYear(timezone?) → int',
        description: 'Gets the day of year (1-366) from a timestamp.',
        example: 'this.created_at.getDayOfYear()'
      },
      getFullYear: {
        signature: 'timestamp.getFullYear(timezone?) → int',
        description: 'Gets the four-digit year from a timestamp.',
        example: 'this.created_at.getFullYear()'
      },
      getHours: {
        signature: 'timestamp.getHours(timezone?) → int',
        description: 'Gets the hours component (0-23) from a timestamp.',
        example: 'this.created_at.getHours()'
      },
      getMilliseconds: {
        signature: 'timestamp.getMilliseconds(timezone?) → int',
        description: 'Gets the milliseconds component from a timestamp.',
        example: 'this.created_at.getMilliseconds()'
      },
      getMinutes: {
        signature: 'timestamp.getMinutes(timezone?) → int',
        description: 'Gets the minutes component (0-59) from a timestamp.',
        example: 'this.created_at.getMinutes()'
      },
      getMonth: {
        signature: 'timestamp.getMonth(timezone?) → int',
        description: 'Gets the month (0-11, 0=January) from a timestamp.',
        example: 'this.created_at.getMonth()'
      },
      getSeconds: {
        signature: 'timestamp.getSeconds(timezone?) → int',
        description: 'Gets the seconds component (0-59) from a timestamp.',
        example: 'this.created_at.getSeconds()'
      },

      // protovalidate-specific CEL functions
      isNan: {
        signature: 'double.isNan() → bool',
        description: 'Returns true if the double value is NaN (Not a Number).',
        example: 'this.value.isNan()'
      },
      isInf: {
        signature: 'double.isInf(sign?) → bool',
        description: 'Returns true if the double value is infinity. Optional sign: 1 for +∞, -1 for -∞.',
        example: 'this.value.isInf()'
      },
      isEmail: {
        signature: 'string.isEmail() → bool',
        description: 'Returns true if the string is a valid email address (protovalidate extension).',
        example: 'this.email.isEmail()'
      },
      isUri: {
        signature: 'string.isUri() → bool',
        description: 'Returns true if the string is a valid URI (protovalidate extension).',
        example: 'this.url.isUri()'
      },
      isUriRef: {
        signature: 'string.isUriRef() → bool',
        description: 'Returns true if the string is a valid URI reference (protovalidate extension).',
        example: 'this.link.isUriRef()'
      },
      isHostname: {
        signature: 'string.isHostname() → bool',
        description: 'Returns true if the string is a valid hostname (protovalidate extension).',
        example: 'this.host.isHostname()'
      },
      isIp: {
        signature: 'string.isIp(version?) → bool',
        description: 'Returns true if the string is a valid IP address. Optional version: 4 or 6.',
        example: 'this.ip_address.isIp(4)'
      },
      isIpPrefix: {
        signature: 'string.isIpPrefix(version?, strict?) → bool',
        description: 'Returns true if the string is a valid IP prefix (CIDR notation).',
        example: 'this.network.isIpPrefix()'
      },
      unique: {
        signature: 'list.unique() → bool',
        description: 'Returns true if all elements in the list are unique (protovalidate extension).',
        example: 'this.items.unique()'
      }
    };

    // Check if the word is a CEL function (check full word, last segment, and first segment)
    const functionMatch = celFunctions[word] || celFunctions[lastPart] || celFunctions[firstPart];
    const matchedFnName = celFunctions[word] ? word : (celFunctions[lastPart] ? lastPart : firstPart);
    if (functionMatch) {
      const fn = functionMatch;
      const lines = [
        `**${matchedFnName}** *(CEL function)*`,
        '',
        `\`${fn.signature}\``,
        '',
        fn.description
      ];
      if (fn.example) {
        lines.push('', '**Example:**', '```cel', fn.example, '```');
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: lines.join('\n')
        }
      };
    }

    // CEL keywords/variables - only show in CEL context
    if (isCelContext) {
      const celKeywords: Record<string, string> = {
        this: 'Reference to the current message being validated. Use `this.field_name` to access fields.',
        true: 'Boolean literal representing true.',
        false: 'Boolean literal representing false.',
        null: 'Null literal representing absence of value.',
        in: 'Membership operator. Checks if a value exists in a list or map.',
        rule: 'Reference to the current validation rule context (protovalidate).'
      };

      // Check for keywords in both full word and first segment (for "this.field")
      const keywordMatch = celKeywords[word] || celKeywords[firstPart];
      const matchedKeyword = celKeywords[word] ? word : firstPart;
      if (keywordMatch) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: [
              `**${matchedKeyword}** *(CEL keyword)*`,
              '',
              keywordMatch
            ].join('\n')
          }
        };
      }
    }

    return null;
  }

  // ============================================================================
  // Google API Hover Support
  // ============================================================================

  private getGoogleApiHover(word: string, lineText: string): Hover | null {
    // Check if we're in a Google API context
    const isGoogleApiContext = lineText.includes('google.api');

    // Google API field behavior values
    const fieldBehaviors: Record<string, string> = {
      REQUIRED: 'The field is required. Clients must specify this field when creating or updating the resource.',
      OUTPUT_ONLY: 'The field is set by the server and should not be specified by clients. It\'s output only.',
      INPUT_ONLY: 'The field is set by clients when making requests. It\'s not returned in responses.',
      IMMUTABLE: 'The field cannot be modified after creation. It can only be set during resource creation.',
      OPTIONAL: 'The field is optional. This is explicit documentation that the field is not required.',
      UNORDERED_LIST: 'The field is a list where order does not matter.',
      NON_EMPTY_DEFAULT: 'The field has a non-empty default value when created.',
      IDENTIFIER: 'The field is the identifier for the resource.'
    };

    if (fieldBehaviors[word] && (isGoogleApiContext || lineText.includes('field_behavior'))) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${word}** *(google.api.field_behavior)*`,
            '',
            fieldBehaviors[word],
            '',
            '[Documentation](https://google.aip.dev/203)'
          ].join('\n')
        }
      };
    }

    // Google API HTTP methods
    const httpMethods: Record<string, { description: string; aip?: string }> = {
      get: {
        description: 'Maps the RPC to an HTTP GET request. Used for reading/retrieving resources.',
        aip: 'https://google.aip.dev/131'
      },
      post: {
        description: 'Maps the RPC to an HTTP POST request. Used for creating resources or custom methods.',
        aip: 'https://google.aip.dev/133'
      },
      put: {
        description: 'Maps the RPC to an HTTP PUT request. Used for full resource replacement.',
        aip: 'https://google.aip.dev/134'
      },
      delete: {
        description: 'Maps the RPC to an HTTP DELETE request. Used for deleting resources.',
        aip: 'https://google.aip.dev/135'
      },
      patch: {
        description: 'Maps the RPC to an HTTP PATCH request. Used for partial updates to resources.',
        aip: 'https://google.aip.dev/134'
      },
      custom: {
        description: 'Maps the RPC to a custom HTTP method. Used for non-standard operations.',
        aip: 'https://google.aip.dev/136'
      }
    };

    if (httpMethods[word] && (isGoogleApiContext || lineText.includes('google.api.http'))) {
      const method = httpMethods[word];
      const lines = [
        `**${word}** *(google.api.http)*`,
        '',
        method.description
      ];
      if (method.aip) {
        lines.push('', `[AIP Documentation](${method.aip})`);
      }
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: lines.join('\n')
        }
      };
    }

    // HTTP option fields
    const httpFields: Record<string, string> = {
      body: 'Specifies which request field should be mapped to the HTTP request body. Use `*` to map all fields except path parameters.',
      response_body: 'Specifies which response field should be mapped to the HTTP response body.',
      additional_bindings: 'Additional HTTP bindings for the same RPC method, allowing multiple URL patterns.',
      selector: 'Selects a method to which this rule applies.',
      pattern: 'URL path pattern with variable bindings like `{resource_id}`.'
    };

    if (httpFields[word] && isGoogleApiContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${word}** *(google.api.http field)*`,
            '',
            httpFields[word]
          ].join('\n')
        }
      };
    }

    // Resource options
    const resourceFields: Record<string, string> = {
      type: 'The resource type name in the format `{Service}/{Kind}`, e.g., `library.googleapis.com/Book`.',
      pattern: 'The resource name pattern, e.g., `projects/{project}/books/{book}`.',
      name_field: 'The field in the message that contains the resource name.',
      history: 'The history of this resource type, used for migration.',
      plural: 'The plural form of the resource type name.',
      singular: 'The singular form of the resource type name.',
      style: 'The style guide for resource naming (e.g., DECLARATIVE_FRIENDLY).',
      child_type: 'Resource type of a child resource.'
    };

    if (resourceFields[word] && (isGoogleApiContext || lineText.includes('resource'))) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${word}** *(google.api.resource field)*`,
            '',
            resourceFields[word],
            '',
            '[AIP-123: Resource Types](https://google.aip.dev/123)'
          ].join('\n')
        }
      };
    }

    return null;
  }

  // ============================================================================
  // Protovalidate/buf.validate Hover Support
  // ============================================================================

  private getProtovalidateHover(word: string, lineText: string): Hover | null {
    // Check if we're in a buf.validate context
    const isValidateContext = lineText.includes('buf.validate') ||
                              lineText.includes('validate.') ||
                              lineText.includes('.cel');

    // Handle dot-separated words - extract the last segment for constraint matching
    const wordParts = word.split('.');
    const lastPart = wordParts[wordParts.length - 1]!;
    // Also check if this is part of a constraint path like "string.min_len"
    const checkWord = lastPart;

    // buf.validate constraint types
    const validateTypes: Record<string, string> = {
      field: 'Validation constraints applied to a specific field.',
      message: 'Validation constraints applied to the entire message, using CEL expressions.',
      oneof: 'Validation constraints for oneof fields (e.g., requiring one to be set).'
    };

    if (validateTypes[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate)*`,
            '',
            validateTypes[checkWord],
            '',
            '[protovalidate Documentation](https://buf.build/docs/bsr/remote-validation/protovalidate)'
          ].join('\n')
        }
      };
    }

    // String validation options
    const stringConstraints: Record<string, string> = {
      min_len: 'Minimum string length in characters (UTF-8 code points).',
      max_len: 'Maximum string length in characters (UTF-8 code points).',
      len: 'Exact string length in characters.',
      min_bytes: 'Minimum string length in bytes.',
      max_bytes: 'Maximum string length in bytes.',
      pattern: 'Regular expression pattern the string must match.',
      prefix: 'String must start with this prefix.',
      suffix: 'String must end with this suffix.',
      contains: 'String must contain this substring.',
      not_contains: 'String must not contain this substring.',
      email: 'String must be a valid email address.',
      hostname: 'String must be a valid hostname.',
      ip: 'String must be a valid IP address.',
      ipv4: 'String must be a valid IPv4 address.',
      ipv6: 'String must be a valid IPv6 address.',
      uri: 'String must be a valid URI.',
      uri_ref: 'String must be a valid URI reference.',
      uuid: 'String must be a valid UUID.',
      address: 'String must be a valid address (hostname or IP).',
      well_known_regex: 'String must match a well-known regex pattern.'
    };

    if (stringConstraints[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate.field.string)*`,
            '',
            stringConstraints[checkWord]
          ].join('\n')
        }
      };
    }

    // Numeric validation options
    const numericConstraints: Record<string, string> = {
      const: 'Field must equal this exact value.',
      lt: 'Field must be less than this value.',
      lte: 'Field must be less than or equal to this value.',
      gt: 'Field must be greater than this value.',
      gte: 'Field must be greater than or equal to this value.',
      in: 'Field must be one of the specified values.',
      not_in: 'Field must not be any of the specified values.'
    };

    if (numericConstraints[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate numeric constraint)*`,
            '',
            numericConstraints[checkWord]
          ].join('\n')
        }
      };
    }

    // List/repeated validation options
    const repeatedConstraints: Record<string, string> = {
      min_items: 'Minimum number of items in the list.',
      max_items: 'Maximum number of items in the list.',
      unique: 'All items in the list must be unique.',
      items: 'Constraints applied to each item in the list.'
    };

    if (repeatedConstraints[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate.field.repeated)*`,
            '',
            repeatedConstraints[checkWord]
          ].join('\n')
        }
      };
    }

    // CEL option fields
    const celFields: Record<string, string> = {
      cel: 'Custom CEL expression for validation. Provides flexible validation logic.',
      id: 'Unique identifier for this CEL validation rule. Used for error tracking.',
      message: 'Human-readable error message when the CEL expression evaluates to false.',
      expression: 'The CEL expression that must evaluate to true for valid data, or return an error string.'
    };

    if (celFields[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate.cel)*`,
            '',
            celFields[checkWord],
            '',
            '[CEL Specification](https://github.com/google/cel-spec)'
          ].join('\n')
        }
      };
    }

    // Common validation options
    const commonConstraints: Record<string, string> = {
      required: 'Field is required and must be set to a non-default value.',
      ignore: 'Controls when validation should be skipped (IGNORE_UNSPECIFIED, IGNORE_IF_UNPOPULATED, IGNORE_IF_DEFAULT_VALUE, IGNORE_ALWAYS).',
      disabled: 'Disables all validation for this field or message.',
      skipped: 'Validation is skipped for this field.'
    };

    if (commonConstraints[checkWord] && isValidateContext) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${checkWord}** *(buf.validate)*`,
            '',
            commonConstraints[checkWord]
          ].join('\n')
        }
      };
    }

    return null;
  }
}
