/**
 * Rename Provider for Protocol Buffers
 * Provides rename refactoring across files
 */

import type { Range, Position, TextEdit } from 'vscode-languageserver/node';
import type { ProtoFile, MessageDefinition, GroupFieldDefinition, SymbolInfo } from '../core/ast';
import { BUILTIN_TYPES, PROTOBUF_KEYWORDS, SymbolKind } from '../core/ast';
import type { SemanticAnalyzer } from '../core/analyzer';

export interface RenameResult {
  changes: Map<string, TextEdit[]>;
}

export class RenameProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Prepare rename - check if rename is possible at position
   */
  prepareRename(uri: string, position: Position, lineText: string): { range: Range; placeholder: string } | null {
    const word = this.getWordAtPosition(lineText, position.character, position.line);
    if (!word) {
      return null;
    }

    // Can't rename built-in types
    if (BUILTIN_TYPES.includes(word.text)) {
      return null;
    }

    // Can't rename keywords
    if (PROTOBUF_KEYWORDS.includes(word.text)) {
      return null;
    }

    const file = this.analyzer.getFile(uri);
    const localSymbol = this.findLocalSymbol(file, word.text, position);
    const symbol = localSymbol ? undefined : this.findTypeSymbol(uri, position, lineText, word);
    if (!localSymbol && !symbol) {
      return null;
    }

    return {
      range: word.range,
      placeholder: word.text,
    };
  }

  /**
   * Perform rename across workspace
   */
  rename(uri: string, position: Position, lineText: string, newName: string): RenameResult {
    const result: RenameResult = {
      changes: new Map(),
    };

    const word = this.getWordAtPosition(lineText, position.character, position.line);
    if (!word) {
      return result;
    }

    // Validate new name
    if (!this.isValidIdentifier(newName)) {
      return result;
    }

    // Can't rename built-in types
    if (BUILTIN_TYPES.includes(word.text)) {
      return result;
    }

    // Can't rename keywords
    if (PROTOBUF_KEYWORDS.includes(word.text)) {
      return result;
    }

    const file = this.analyzer.getFile(uri);
    if (this.findLocalSymbol(file, word.text, position)) {
      return this.renameLocalSymbol(uri, file, word.text, newName, position);
    }

    const symbol = this.findTypeSymbol(uri, position, lineText, word);
    if (!symbol) {
      return result;
    }

    const references = this.getRenameReferences(symbol);

    // Add the definition location
    this.addEdit(result.changes, symbol.location.uri, {
      range: symbol.location.range,
      newText: newName,
    });

    // Add all reference locations
    for (const ref of references) {
      this.addEdit(result.changes, ref.uri, {
        range: ref.range,
        newText: newName,
      });
    }

    return result;
  }

  /**
   * Find a local symbol (field, enum value, etc.) at position
   */
  private findLocalSymbol(
    file: ProtoFile | undefined,
    name: string,
    position: Position
  ): { kind: string; range: Range } | null {
    if (!file) {
      return null;
    }

    // Search in messages
    for (const message of file.messages) {
      const result = this.findInMessage(message, name, position);
      if (result) {
        return result;
      }
    }

    // Search in enums
    for (const enumDef of file.enums) {
      for (const value of enumDef.values) {
        if (value.name === name && this.containsPosition(value.nameRange, position)) {
          return { kind: 'enumValue', range: value.nameRange };
        }
      }
    }

    // Search in services
    for (const service of file.services) {
      for (const rpc of service.rpcs) {
        if (rpc.name === name && this.containsPosition(rpc.nameRange, position)) {
          return { kind: 'rpc', range: rpc.nameRange };
        }
      }
    }

    return null;
  }

  private findInMessage(
    message: MessageDefinition | GroupFieldDefinition,
    name: string,
    position: Position
  ): { kind: string; range: Range } | null {
    // Check fields
    for (const field of [...message.fields, ...message.maps]) {
      if (field.name === name && this.containsPosition(field.nameRange, position)) {
        return { kind: 'field', range: field.nameRange };
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      if (oneof.name === name && this.containsPosition(oneof.nameRange, position)) {
        return { kind: 'oneof', range: oneof.nameRange };
      }
      for (const field of oneof.fields) {
        if (field.name === name && this.containsPosition(field.nameRange, position)) {
          return { kind: 'field', range: field.nameRange };
        }
      }
    }

    // Check nested messages
    for (const nested of [...message.nestedMessages, ...message.groups]) {
      const result = this.findInMessage(nested, name, position);
      if (result) {
        return result;
      }
    }

    // Check nested enums
    for (const enumDef of message.nestedEnums) {
      for (const value of enumDef.values) {
        if (value.name === name && this.containsPosition(value.nameRange, position)) {
          return { kind: 'enumValue', range: value.nameRange };
        }
      }
    }

    return null;
  }

  /**
   * Rename a local symbol (field, enum value, etc.)
   */
  private renameLocalSymbol(
    uri: string,
    file: ProtoFile | undefined,
    oldName: string,
    newName: string,
    position: Position
  ): RenameResult {
    const result: RenameResult = { changes: new Map() };
    const symbol = this.findLocalSymbol(file, oldName, position);
    if (symbol) {
      this.addEdit(result.changes, uri, { range: symbol.range, newText: newName });
    }
    return result;
  }

  private findTypeSymbol(
    uri: string,
    position: Position,
    lineText: string,
    word: { text: string; range: Range }
  ): SymbolInfo | undefined {
    const declaration = this.analyzer
      .getSymbolsInFile(uri)
      .find(symbol => symbol.name === word.text && this.containsPosition(symbol.location.range, position));
    if (declaration) {
      return declaration;
    }

    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const scope = file ? this.findContainingMessageScope(file, position, packageName) : packageName;
    let start = word.range.start.character;
    while (start > 0 && /[a-zA-Z0-9_.]/.test(lineText[start - 1]!)) {
      start--;
    }
    const typeName = lineText.slice(start, word.range.end.character);
    const symbol = this.analyzer.resolveType(typeName, uri, scope);
    if (!symbol || (symbol.kind !== SymbolKind.Message && symbol.kind !== SymbolKind.Enum)) {
      return undefined;
    }

    // Only rename actual type references, never matching text in comments,
    // string options, or unrelated declarations.
    return this.getRenameReferences(symbol).some(
      reference => reference.uri === uri && this.containsPosition(reference.range, position)
    )
      ? symbol
      : undefined;
  }

  private getRenameReferences(symbol: SymbolInfo): Array<{ uri: string; range: Range }> {
    const references: Array<{ uri: string; range: Range }> = [];
    const types = new Map<string, SymbolInfo>([[symbol.fullName, symbol]]);
    for (const candidate of this.analyzer.getAllSymbols()) {
      if (
        (candidate.kind === SymbolKind.Message || candidate.kind === SymbolKind.Enum) &&
        candidate.fullName.startsWith(`${symbol.fullName}.`) &&
        candidate.location.uri === symbol.location.uri
      ) {
        types.set(candidate.fullName, candidate);
      }
    }

    for (const type of types.values()) {
      const suffixLength = type.fullName.length - symbol.fullName.length;
      for (const reference of this.analyzer.findReferences(type.name, type.fullName, type.location.uri)) {
        // A reference may include a package or enclosing message prefix. Keep
        // that prefix and only replace the identifier being renamed. References
        // to nested types also need their explicit enclosing message updated.
        const end = reference.range.end.character - suffixLength;
        const start = end - symbol.name.length;
        if (reference.range.start.line !== reference.range.end.line || start < reference.range.start.character) {
          continue;
        }
        references.push({
          uri: reference.uri,
          range: {
            start: { line: reference.range.end.line, character: start },
            end: { line: reference.range.end.line, character: end },
          },
        });
      }
    }
    return references;
  }

  private addEdit(changes: Map<string, TextEdit[]>, uri: string, edit: TextEdit): void {
    if (!changes.has(uri)) {
      changes.set(uri, []);
    }

    // Avoid duplicate edits
    const existing = changes.get(uri)!;
    const isDuplicate = existing.some(
      e =>
        e.range.start.line === edit.range.start.line &&
        e.range.start.character === edit.range.start.character &&
        e.range.end.line === edit.range.end.line &&
        e.range.end.character === edit.range.end.character
    );

    if (!isDuplicate) {
      existing.push(edit);
    }
  }

  private isValidIdentifier(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  private getWordAtPosition(
    line: string,
    character: number,
    lineNumber: number
  ): { text: string; range: Range } | null {
    let start = character;
    let end = character;

    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1]!)) {
      start--;
    }

    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end]!)) {
      end++;
    }

    if (start === end) {
      return null;
    }

    return {
      text: line.substring(start, end),
      range: {
        start: { line: lineNumber, character: start },
        end: { line: lineNumber, character: end },
      },
    };
  }

  /**
   * Find the fully qualified scope for the containing message at a position.
   * This is used to resolve nested types correctly.
   */
  private findContainingMessageScope(
    file: ProtoFile,
    position: { line: number; character: number },
    packageName: string
  ): string {
    const messageChain = this.findContainingMessageChain(file.messages, position);

    if (messageChain.length > 0) {
      const messageNames = messageChain.map(m => m.name).join('.');
      return packageName ? `${packageName}.${messageNames}` : messageNames;
    }

    return packageName;
  }

  /**
   * Find the chain of containing messages at a position (from outermost to innermost).
   */
  private findContainingMessageChain(
    messages: MessageDefinition[],
    position: { line: number; character: number }
  ): MessageDefinition[] {
    for (const msg of messages) {
      if (this.containsPosition(msg.range, position)) {
        const nestedChain = this.findContainingMessageChain(msg.nestedMessages, position);
        return [msg, ...nestedChain];
      }
    }
    return [];
  }

  private containsPosition(range: Range, pos: { line: number; character: number }): boolean {
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
}
