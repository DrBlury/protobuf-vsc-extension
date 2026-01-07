/**
 * Symbol Provider for Protocol Buffers
 * Provides document and workspace symbols
 */

import type { DocumentSymbol, SymbolInformation, Range } from 'vscode-languageserver/node';
import { SymbolKind as VSCodeSymbolKind } from 'vscode-languageserver/node';

import type { MessageDefinition, EnumDefinition, ServiceDefinition, Range as AstRange } from '../core/ast';
import { SymbolKind } from '../core/ast';
import type { SemanticAnalyzer } from '../core/analyzer';

export class SymbolProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getDocumentSymbols(uri: string): DocumentSymbol[] {
    const file = this.analyzer.getFile(uri);
    if (!file) {
      return [];
    }

    const symbols: DocumentSymbol[] = [];

    // Package - only include if name is non-empty
    if (file.package && file.package.name) {
      symbols.push({
        name: file.package.name,
        kind: VSCodeSymbolKind.Namespace,
        range: this.toRange(file.package.range),
        selectionRange: this.toRange(file.package.range),
      });
    }

    // Messages - skip messages with empty names
    for (const message of file.messages) {
      if (message.name) {
        symbols.push(this.messageToSymbol(message));
      }
    }

    // Enums - skip enums with empty names
    for (const enumDef of file.enums) {
      if (enumDef.name) {
        symbols.push(this.enumToSymbol(enumDef));
      }
    }

    // Services - skip services with empty names
    for (const service of file.services) {
      if (service.name) {
        symbols.push(this.serviceToSymbol(service));
      }
    }

    return symbols;
  }

  getWorkspaceSymbols(query: string): SymbolInformation[] {
    const symbols = this.analyzer.getAllSymbols();
    const results: Array<SymbolInformation & { score: number }> = [];

    const lowerQuery = query.toLowerCase();

    for (const symbol of symbols) {
      // Only include main symbol types
      if (symbol.kind === SymbolKind.Field || symbol.kind === SymbolKind.EnumValue) {
        continue;
      }

      if (!query) {
        // No query - return all symbols
        results.push({
          name: symbol.name,
          kind: this.toVSCodeSymbolKind(symbol.kind),
          location: {
            uri: symbol.location.uri,
            range: this.toRange(symbol.location.range),
          },
          containerName: symbol.containerName,
          score: 0,
        });
        continue;
      }

      // Calculate match score
      const score = this.calculateMatchScore(symbol, lowerQuery);
      if (score > 0) {
        results.push({
          name: symbol.name,
          kind: this.toVSCodeSymbolKind(symbol.kind),
          location: {
            uri: symbol.location.uri,
            range: this.toRange(symbol.location.range),
          },
          containerName: symbol.containerName,
          score,
        });
      }
    }

    // Sort by score (higher is better), then by name
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });

    // Return top 100 results
    return results.slice(0, 100).map(({ score: _score, ...rest }) => rest);
  }

  /**
   * Calculate match score for fuzzy search
   * Higher score = better match
   */
  private calculateMatchScore(symbol: { name: string; fullName: string }, query: string): number {
    const nameLower = symbol.name.toLowerCase();
    const fullNameLower = symbol.fullName.toLowerCase();

    // Exact match gets highest score
    if (nameLower === query) {
      return 1000;
    }

    // Full name exact match
    if (fullNameLower === query) {
      return 900;
    }

    // Starts with query
    if (nameLower.startsWith(query)) {
      return 800;
    }

    // Full name starts with query
    if (fullNameLower.startsWith(query)) {
      return 700;
    }

    // Contains query (substring match)
    if (nameLower.includes(query)) {
      return 500;
    }

    // Full name contains query
    if (fullNameLower.includes(query)) {
      return 400;
    }

    // Fuzzy match - check if all query characters appear in order
    if (this.fuzzyMatch(nameLower, query)) {
      return 300;
    }

    if (this.fuzzyMatch(fullNameLower, query)) {
      return 200;
    }

    // Check if query matches parts of the name (e.g., "UserMsg" matches "UserMessage")
    const nameParts = nameLower.split(/(?=[A-Z])|_/).filter(p => p.length > 0);
    const queryParts = query.split(/(?=[A-Z])|_/).filter(p => p.length > 0);
    let partsMatch = 0;
    for (const qp of queryParts) {
      for (const np of nameParts) {
        if (np.startsWith(qp) || np.includes(qp)) {
          partsMatch++;
          break;
        }
      }
    }
    if (partsMatch === queryParts.length && partsMatch > 0) {
      return 100;
    }

    return 0;
  }

  /**
   * Check if query characters appear in order in the text (fuzzy match)
   */
  private fuzzyMatch(text: string, query: string): boolean {
    let textIndex = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query[i]!;
      const foundIndex = text.indexOf(char, textIndex);
      if (foundIndex === -1) {
        return false;
      }
      textIndex = foundIndex + 1;
    }
    return true;
  }

  private messageToSymbol(message: MessageDefinition): DocumentSymbol {
    const children: DocumentSymbol[] = [];

    // Fields - skip fields with empty names
    for (const field of message.fields) {
      if (!field.name) {
        continue;
      }
      const fieldRange = this.toRange(field.range);
      const fieldSelectionRange = this.toRange(field.nameRange);
      children.push({
        name: field.name,
        detail: `${field.fieldType} = ${field.number}`,
        kind: VSCodeSymbolKind.Field,
        range: fieldRange,
        selectionRange: this.safeSelectionRange(fieldRange, fieldSelectionRange),
      });
    }

    // Map fields - skip fields with empty names
    for (const mapField of message.maps) {
      if (!mapField.name) {
        continue;
      }
      const mapRange = this.toRange(mapField.range);
      const mapSelectionRange = this.toRange(mapField.nameRange);
      children.push({
        name: mapField.name,
        detail: `map<${mapField.keyType}, ${mapField.valueType}> = ${mapField.number}`,
        kind: VSCodeSymbolKind.Field,
        range: mapRange,
        selectionRange: this.safeSelectionRange(mapRange, mapSelectionRange),
      });
    }

    // Oneofs - skip oneofs with empty names
    for (const oneof of message.oneofs) {
      if (!oneof.name) {
        continue;
      }
      const oneofChildren = oneof.fields
        .filter(f => f.name) // Filter out fields with empty names
        .map(f => {
          const fRange = this.toRange(f.range);
          const fSelectionRange = this.toRange(f.nameRange);
          return {
            name: f.name,
            detail: `${f.fieldType} = ${f.number}`,
            kind: VSCodeSymbolKind.Field,
            range: fRange,
            selectionRange: this.safeSelectionRange(fRange, fSelectionRange),
          };
        });

      const oneofRange = this.toRange(oneof.range);
      const oneofSelectionRange = this.toRange(oneof.nameRange);
      children.push({
        name: oneof.name,
        kind: VSCodeSymbolKind.Struct,
        range: oneofRange,
        selectionRange: this.safeSelectionRange(oneofRange, oneofSelectionRange),
        children: oneofChildren,
      });
    }

    // Nested messages
    for (const nested of message.nestedMessages) {
      children.push(this.messageToSymbol(nested));
    }

    // Nested enums
    for (const nested of message.nestedEnums) {
      children.push(this.enumToSymbol(nested));
    }

    const messageRange = this.toRange(message.range);
    const messageSelectionRange = this.toRange(message.nameRange);
    return {
      name: message.name,
      kind: VSCodeSymbolKind.Class,
      range: messageRange,
      selectionRange: this.safeSelectionRange(messageRange, messageSelectionRange),
      children,
    };
  }

  private enumToSymbol(enumDef: EnumDefinition): DocumentSymbol {
    const children = enumDef.values
      .filter(value => value.name) // Filter out values with empty names
      .map(value => {
        const valueRange = this.toRange(value.range);
        const valueSelectionRange = this.toRange(value.nameRange);
        return {
          name: value.name,
          detail: `= ${value.number}`,
          kind: VSCodeSymbolKind.EnumMember,
          range: valueRange,
          selectionRange: this.safeSelectionRange(valueRange, valueSelectionRange),
        };
      });

    const enumRange = this.toRange(enumDef.range);
    const enumSelectionRange = this.toRange(enumDef.nameRange);
    return {
      name: enumDef.name,
      kind: VSCodeSymbolKind.Enum,
      range: enumRange,
      selectionRange: this.safeSelectionRange(enumRange, enumSelectionRange),
      children,
    };
  }

  private serviceToSymbol(service: ServiceDefinition): DocumentSymbol {
    const children = service.rpcs
      .filter(rpc => rpc.name) // Filter out RPCs with empty names
      .map(rpc => {
        const inputDesc = rpc.inputStream ? `stream ${rpc.inputType}` : rpc.inputType;
        const outputDesc = rpc.outputStream ? `stream ${rpc.outputType}` : rpc.outputType;
        const rpcRange = this.toRange(rpc.range);
        const rpcSelectionRange = this.toRange(rpc.nameRange);

        return {
          name: rpc.name,
          detail: `(${inputDesc}) returns (${outputDesc})`,
          kind: VSCodeSymbolKind.Method,
          range: rpcRange,
          selectionRange: this.safeSelectionRange(rpcRange, rpcSelectionRange),
        };
      });

    const serviceRange = this.toRange(service.range);
    const serviceSelectionRange = this.toRange(service.nameRange);
    return {
      name: service.name,
      kind: VSCodeSymbolKind.Interface,
      range: serviceRange,
      selectionRange: this.safeSelectionRange(serviceRange, serviceSelectionRange),
      children,
    };
  }

  private toVSCodeSymbolKind(kind: SymbolKind): VSCodeSymbolKind {
    switch (kind) {
      case SymbolKind.Message:
        return VSCodeSymbolKind.Class;
      case SymbolKind.Enum:
        return VSCodeSymbolKind.Enum;
      case SymbolKind.Service:
        return VSCodeSymbolKind.Interface;
      case SymbolKind.Rpc:
        return VSCodeSymbolKind.Method;
      case SymbolKind.Field:
        return VSCodeSymbolKind.Field;
      case SymbolKind.EnumValue:
        return VSCodeSymbolKind.EnumMember;
      case SymbolKind.Oneof:
        return VSCodeSymbolKind.Struct;
      case SymbolKind.Package:
        return VSCodeSymbolKind.Namespace;
      default:
        return VSCodeSymbolKind.Variable;
    }
  }

  private toRange(range: AstRange): Range {
    // Ensure all values are valid numbers (not NaN or undefined)
    const startLine = Number.isFinite(range.start.line) ? range.start.line : 0;
    const startChar = Number.isFinite(range.start.character) ? range.start.character : 0;
    const endLine = Number.isFinite(range.end.line) ? range.end.line : startLine;
    const endChar = Number.isFinite(range.end.character) ? range.end.character : startChar;

    return {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    };
  }

  /**
   * Ensures selectionRange is contained within range.
   * If not, returns the range as selectionRange to prevent VS Code errors.
   */
  private safeSelectionRange(range: Range, selectionRange: Range): Range {
    // Check if selectionRange is within range
    const selectionIsValid =
      (selectionRange.start.line > range.start.line ||
        (selectionRange.start.line === range.start.line && selectionRange.start.character >= range.start.character)) &&
      (selectionRange.end.line < range.end.line ||
        (selectionRange.end.line === range.end.line && selectionRange.end.character <= range.end.character));

    return selectionIsValid ? selectionRange : range;
  }
}
