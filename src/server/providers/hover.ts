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
import { getBuiltinTypeHover, getKeywordHover } from './hover/builtinHover';
import { getCelHover } from './hover/celHover';
import { getGoogleApiHover } from './hover/googleApiHover';
import { getProtovalidateHover } from './hover/protovalidateHover';
import { getEditionFeaturesHover, getEditionHover } from './hover/editionFeaturesHover';

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
      return getBuiltinTypeHover(word);
    }

    // Check for edition features - do this early before symbol resolution
    // This handles features.field_presence, EXPLICIT, etc.
    if (lineText.includes('features') || lineText.includes('edition')) {
      const editionFeaturesHover = getEditionFeaturesHover(word, lineText);
      if (editionFeaturesHover) {
        return editionFeaturesHover;
      }

      // Check for edition keyword and versions
      const editionHover = getEditionHover(word, lineText);
      if (editionHover) {
        return editionHover;
      }
    }

    // Check for CEL functions and keywords
    const celHover = getCelHover(word, lineText);
    if (celHover) {
      return celHover;
    }

    // Check for Google API annotations
    const googleApiHover = getGoogleApiHover(word, lineText);
    if (googleApiHover) {
      return googleApiHover;
    }

    // Check for protovalidate/buf.validate options
    const protovalidateHover = getProtovalidateHover(word, lineText);
    if (protovalidateHover) {
      return protovalidateHover;
    }

    // Check for symbols
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';

    // Find the containing message scope at the cursor position
    // This is crucial for resolving nested types correctly (e.g., B.Flags vs A.Flags)
    const containingScope = file ? this.findContainingMessageScope(file, position, packageName) : packageName;
    const symbol = this.analyzer.resolveType(word, uri, containingScope);

    if (symbol) {
      return this.getSymbolHover(symbol);
    }

    // Check for keywords
    const keywordHover = getKeywordHover(word);
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
      return msg;
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

  /**
   * Find the fully qualified scope for the containing message at a position.
   * This is used to resolve nested types correctly.
   * For example, if the cursor is inside message B, and B has a nested enum Flags,
   * when resolving the type "Flags" we should first look in B.Flags before A.Flags.
   *
   * @param file The proto file
   * @param position The cursor position
   * @param packageName The package name
   * @returns The fully qualified scope (e.g., "package.A.B" or just "package")
   */
  private findContainingMessageScope(
    file: ProtoFile,
    position: { line: number, character: number },
    packageName: string
  ): string {
    // Try to find the containing message chain
    const messageChain = this.findContainingMessageChain(file.messages, position);

    if (messageChain.length > 0) {
      const messageNames = messageChain.map(m => m.name).join('.');
      return packageName ? `${packageName}.${messageNames}` : messageNames;
    }

    return packageName;
  }

  /**
   * Find the chain of containing messages at a position (from outermost to innermost).
   * For example, if the cursor is inside message A.B.C, returns [A, B, C].
   */
  private findContainingMessageChain(
    messages: MessageDefinition[],
    position: { line: number, character: number }
  ): MessageDefinition[] {
    for (const msg of messages) {
      if (this.contains(msg.range, position)) {
        // Found a containing message, now check for nested messages
        const nestedChain = this.findContainingMessageChain(msg.nestedMessages, position);
        return [msg, ...nestedChain];
      }
    }
    return [];
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
}
