/**
 * Hover Provider for Protocol Buffers
 */

import { Hover, MarkupContent, MarkupKind, Position } from 'vscode-languageserver/node';
import { ProtoFile, BUILTIN_TYPES, SymbolKind } from './ast';
import { SemanticAnalyzer } from './analyzer';

export class HoverProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getHover(uri: string, position: Position, lineText: string): Hover | null {
    // Extract word at position
    const word = this.getWordAtPosition(lineText, position.character);
    if (!word) return null;

    // Check for built-in types
    if (BUILTIN_TYPES.includes(word)) {
      return this.getBuiltinTypeHover(word);
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

    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
      start--;
    }

    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
      end++;
    }

    if (start === end) return null;
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

  private getSymbolHover(symbol: any): Hover {
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

    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: lines.join('\n')
    };

    return { contents: content };
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
}
