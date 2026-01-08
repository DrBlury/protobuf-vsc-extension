/**
 * References Provider for Protocol Buffers
 * Finds all references to a symbol
 */

import type { Location, Position, Range } from 'vscode-languageserver/node';
import type { MessageDefinition, ProtoFile } from '../core/ast';
import { BUILTIN_TYPES, PROTOBUF_KEYWORDS } from '../core/ast';
import type { SemanticAnalyzer } from '../core/analyzer';

export class ReferencesProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  findReferences(uri: string, position: Position, lineText: string, includeDeclaration: boolean): Location[] {
    // Extract word at position
    const word = this.getWordAtPosition(lineText, position.character);
    if (!word) {
      return [];
    }

    // Built-in types don't have references
    if (BUILTIN_TYPES.includes(word)) {
      return [];
    }

    // Keywords don't have references
    if (PROTOBUF_KEYWORDS.includes(word)) {
      return [];
    }

    // Find the symbol - use containing message scope for correct resolution
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const containingScope = file ? this.findContainingMessageScope(file, position, packageName) : packageName;
    const symbol = this.analyzer.resolveType(word, uri, containingScope);

    if (!symbol) {
      return [];
    }

    // Get all references
    const references = this.analyzer.findReferences(symbol.name, symbol.fullName);

    // Optionally include the declaration
    if (includeDeclaration) {
      references.unshift(symbol.location);
    }

    return references;
  }

  private getWordAtPosition(line: string, character: number): string | null {
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
      if (this.contains(msg.range, position)) {
        const nestedChain = this.findContainingMessageChain(msg.nestedMessages, position);
        return [msg, ...nestedChain];
      }
    }
    return [];
  }

  private contains(range: Range, pos: { line: number; character: number }): boolean {
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
