/**
 * References Provider for Protocol Buffers
 * Finds all references to a symbol
 */

import { Location, Position } from 'vscode-languageserver/node';
import { BUILTIN_TYPES } from '../core/ast';
import { SemanticAnalyzer } from '../core/analyzer';

export class ReferencesProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  findReferences(
    uri: string,
    position: Position,
    lineText: string,
    includeDeclaration: boolean
  ): Location[] {
    // Extract word at position
    const word = this.getWordAtPosition(lineText, position.character);
    if (!word) {
      return [];
    }

    // Built-in types don't have references
    if (BUILTIN_TYPES.includes(word)) {
      return [];
    }

    // Find the symbol
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';
    const symbol = this.analyzer.resolveType(word, uri, packageName);

        if (!symbol) {
      return [];
    }

    // Get all references
    const references = this.analyzer.findReferences(symbol.name);

    // Optionally include the declaration
    if (includeDeclaration) {
      references.unshift(symbol.location);
    }

    return references;
  }

  private getWordAtPosition(line: string, character: number): string | null {
    let start = character;
    let end = character;

    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
      start--;
    }

    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
      end++;
    }

        if (start === end) {
      return null;
    }
    return line.substring(start, end);
  }
}
