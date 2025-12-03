/**
 * Definition Provider for Protocol Buffers
 * Provides go-to-definition functionality
 */

import { Location, Position, Range } from 'vscode-languageserver/node';
import { ProtoFile, BUILTIN_TYPES, MessageDefinition } from './ast';
import { SemanticAnalyzer } from './analyzer';
import * as path from 'path';

export class DefinitionProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getDefinition(uri: string, position: Position, lineText: string): Location | Location[] | null {
    // Extract word at position (including dots for fully qualified names)
    const word = this.getWordAtPosition(lineText, position.character);
    if (!word) {
      return null;
    }

    // Built-in types don't have definitions
    if (BUILTIN_TYPES.includes(word)) {
      return null;
    }

    // Check if this is an import statement
    const importMatch = lineText.match(/import\s+(weak|public)?\s*"([^"]+)"/);
    if (importMatch) {
      const importPath = importMatch[2];
      return this.resolveImportLocation(uri, importPath);
    }

    // Get the file and current package context
    const file = this.analyzer.getFile(uri);
    const packageName = file?.package?.name || '';

    // Find the current message context (for resolving nested types)
    const currentContext = this.findContextAtPosition(file, position);

    // Try to resolve the type with various scopes
    const symbol = this.resolveTypeWithContext(word, uri, packageName, currentContext);

    if (symbol) {
      return symbol.location;
    }

    return null;
  }

  /**
   * Resolve type reference considering the current context
   */
  private resolveTypeWithContext(
    typeName: string,
    uri: string,
    packageName: string,
    currentContext?: string
  ): { location: Location } | undefined {
    // 1. Try exact match
    let symbol = this.analyzer.resolveType(typeName, uri, packageName);
    if (symbol) {
      return symbol;
    }

    // 2. If we're inside a message, try resolving relative to that message
    if (currentContext) {
      symbol = this.analyzer.resolveType(typeName, uri, currentContext);
      if (symbol) {
        return symbol;
      }
    }

    // 3. Try to resolve by searching all accessible symbols
    const allSymbols = this.analyzer.getAllSymbols();

    // Try simple name match
    for (const sym of allSymbols) {
      if (sym.name === typeName) {
        return sym;
      }
    }

    // Try suffix match for qualified names
    for (const sym of allSymbols) {
      if (sym.fullName.endsWith(`.${typeName}`) || sym.fullName === typeName) {
        return sym;
      }
    }

    return undefined;
  }

  /**
   * Find the current context (message/enum name) at the given position
   */
  private findContextAtPosition(file: ProtoFile | undefined, position: Position): string | undefined {
    if (!file) {
      return undefined;
    }

    for (const message of file.messages) {
      const context = this.findContextInMessage(message, position, file.package?.name || '');
      if (context) {
        return context;
      }
    }

    return file.package?.name;
  }

  private findContextInMessage(message: MessageDefinition, position: Position, prefix: string): string | undefined {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    if (this.isPositionInRange(position, message.range)) {
      // Check nested messages first for more specific context
      for (const nested of message.nestedMessages || []) {
        const nestedContext = this.findContextInMessage(nested, position, fullName);
        if (nestedContext) {
          return nestedContext;
        }
      }
      return fullName;
    }

    return undefined;
  }

  private isPositionInRange(position: Position, range: Range): boolean {
    if (!range) {
      return false;
    }
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    return true;
  }

  private getWordAtPosition(line: string, character: number): string | null {
    let start = character;
    let end = character;

    // Include dots for fully qualified names like "google.protobuf.Timestamp"
    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
      start--;
    }

    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
      end++;
    }

    if (start === end) {
      return null;
    }

    const word = line.substring(start, end);

    // Remove leading/trailing dots
    return word.replace(/^\.+|\.+$/g, '');
  }

  private resolveImportLocation(currentUri: string, importPath: string): Location | null {
    // First, try using the analyzer's import resolution
    const resolvedUri = this.analyzer.resolveImportToUri(currentUri, importPath);
    if (resolvedUri) {
      return {
        uri: resolvedUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        }
      };
    }

    // Fallback: Try to find the imported file in the workspace
    for (const [fileUri] of this.analyzer.getAllFiles()) {
      const normalizedUri = fileUri.replace(/\\/g, '/');
      const normalizedImport = importPath.replace(/\\/g, '/');

      if (normalizedUri.endsWith(normalizedImport) ||
          normalizedUri.endsWith('/' + normalizedImport) ||
          normalizedUri.includes(normalizedImport)) {
        return {
          uri: fileUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          }
        };
      }
    }

    // Try relative path resolution
    const currentDir = path.dirname(currentUri.replace('file://', ''));
    const resolvedPath = path.resolve(currentDir, importPath);

    for (const [fileUri] of this.analyzer.getAllFiles()) {
      const normalizedFileUri = fileUri.replace(/\\/g, '/').replace('file://', '');
      const normalizedResolved = resolvedPath.replace(/\\/g, '/');

      if (normalizedFileUri === normalizedResolved ||
          normalizedFileUri.endsWith(normalizedResolved)) {
        return {
          uri: fileUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          }
        };
      }
    }

    return null;
  }
}
