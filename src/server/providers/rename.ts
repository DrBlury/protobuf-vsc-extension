/**
 * Rename Provider for Protocol Buffers
 * Provides rename refactoring across files
 */

import type { Range, Position, TextEdit } from 'vscode-languageserver/node';
import type { ProtoFile, MessageDefinition } from '../core/ast';
import { BUILTIN_TYPES, PROTOBUF_KEYWORDS } from '../core/ast';
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

    // Find the symbol - use containing message scope for correct resolution
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const containingScope = file ? this.findContainingMessageScope(file, position, packageName) : packageName;
    const symbol = this.analyzer.resolveType(word.text, uri, containingScope);

    if (!symbol) {
      // Check if it's a field name or other local symbol
      const localSymbol = this.findLocalSymbol(file, word.text, position);
      if (localSymbol) {
        return {
          range: word.range,
          placeholder: word.text,
        };
      }
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

    // Find the symbol - use containing message scope for correct resolution
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const containingScope = file ? this.findContainingMessageScope(file, position, packageName) : packageName;
    const symbol = this.analyzer.resolveType(word.text, uri, containingScope);

    if (!symbol) {
      // Try to rename local symbol (field name)
      return this.renameLocalSymbol(uri, file, word.text, newName, position);
    }

    // Get all references to this symbol
    const references = this.analyzer.findReferences(symbol.name, symbol.fullName);

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
        if (value.name === name) {
          return { kind: 'enumValue', range: value.nameRange };
        }
      }
    }

    // Search in services
    for (const service of file.services) {
      for (const rpc of service.rpcs) {
        if (rpc.name === name) {
          return { kind: 'rpc', range: rpc.nameRange };
        }
      }
    }

    return null;
  }

  private findInMessage(
    message: MessageDefinition,
    name: string,
    position: Position
  ): { kind: string; range: Range } | null {
    // Check fields
    for (const field of message.fields) {
      if (field.name === name) {
        return { kind: 'field', range: field.nameRange };
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      if (oneof.name === name) {
        return { kind: 'oneof', range: oneof.nameRange };
      }
      for (const field of oneof.fields) {
        if (field.name === name) {
          return { kind: 'field', range: field.nameRange };
        }
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      const result = this.findInMessage(nested, name, position);
      if (result) {
        return result;
      }
    }

    // Check nested enums
    for (const enumDef of message.nestedEnums) {
      for (const value of enumDef.values) {
        if (value.name === name) {
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
    _position: Position
  ): RenameResult {
    const result: RenameResult = {
      changes: new Map(),
    };

    if (!file) {
      return result;
    }

    // Find all occurrences of this name in the file
    const edits: TextEdit[] = [];

    // Search in messages
    for (const message of file.messages) {
      this.collectFieldRenames(message, oldName, newName, edits);
    }

    // Search in enums
    for (const enumDef of file.enums) {
      for (const value of enumDef.values) {
        if (value.name === oldName) {
          edits.push({
            range: value.nameRange,
            newText: newName,
          });
        }
      }
    }

    // Search in services
    for (const service of file.services) {
      for (const rpc of service.rpcs) {
        if (rpc.name === oldName) {
          edits.push({
            range: rpc.nameRange,
            newText: newName,
          });
        }
      }
    }

    if (edits.length > 0) {
      result.changes.set(uri, edits);
    }

    return result;
  }

  private collectFieldRenames(message: MessageDefinition, oldName: string, newName: string, edits: TextEdit[]): void {
    // Check fields
    for (const field of message.fields) {
      if (field.name === oldName) {
        edits.push({
          range: field.nameRange,
          newText: newName,
        });
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      if (oneof.name === oldName) {
        edits.push({
          range: oneof.nameRange,
          newText: newName,
        });
      }
      for (const field of oneof.fields) {
        if (field.name === oldName) {
          edits.push({
            range: field.nameRange,
            newText: newName,
          });
        }
      }
    }

    // Check map fields
    for (const mapField of message.maps) {
      if (mapField.name === oldName) {
        edits.push({
          range: mapField.nameRange,
          newText: newName,
        });
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.collectFieldRenames(nested, oldName, newName, edits);
    }

    // Check nested enums
    for (const enumDef of message.nestedEnums) {
      for (const value of enumDef.values) {
        if (value.name === oldName) {
          edits.push({
            range: value.nameRange,
            newText: newName,
          });
        }
      }
    }
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
