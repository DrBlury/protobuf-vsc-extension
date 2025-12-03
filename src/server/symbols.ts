/**
 * Symbol Provider for Protocol Buffers
 * Provides document and workspace symbols
 */

import {
  DocumentSymbol,
  SymbolInformation,
  SymbolKind as VSCodeSymbolKind,
  Range
} from 'vscode-languageserver/node';

import {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  SymbolKind
} from './ast';
import { SemanticAnalyzer } from './analyzer';

export class SymbolProvider {
  private analyzer: SemanticAnalyzer;

  constructor(analyzer: SemanticAnalyzer) {
    this.analyzer = analyzer;
  }

  getDocumentSymbols(uri: string): DocumentSymbol[] {
    const file = this.analyzer.getFile(uri);
    if (!file) return [];

    const symbols: DocumentSymbol[] = [];

    // Package
    if (file.package) {
      symbols.push({
        name: file.package.name,
        kind: VSCodeSymbolKind.Namespace,
        range: this.toRange(file.package.range),
        selectionRange: this.toRange(file.package.range)
      });
    }

    // Messages
    for (const message of file.messages) {
      symbols.push(this.messageToSymbol(message));
    }

    // Enums
    for (const enumDef of file.enums) {
      symbols.push(this.enumToSymbol(enumDef));
    }

    // Services
    for (const service of file.services) {
      symbols.push(this.serviceToSymbol(service));
    }

    return symbols;
  }

  getWorkspaceSymbols(query: string): SymbolInformation[] {
    const symbols = this.analyzer.getAllSymbols();
    const results: SymbolInformation[] = [];

    const lowerQuery = query.toLowerCase();

    for (const symbol of symbols) {
      // Filter by query
      if (query && !symbol.name.toLowerCase().includes(lowerQuery)) {
        continue;
      }

      // Only include main symbol types
      if (symbol.kind === SymbolKind.Field || symbol.kind === SymbolKind.EnumValue) {
        continue;
      }

      results.push({
        name: symbol.name,
        kind: this.toVSCodeSymbolKind(symbol.kind),
        location: {
          uri: symbol.location.uri,
          range: this.toRange(symbol.location.range)
        },
        containerName: symbol.containerName
      });
    }

    return results;
  }

  private messageToSymbol(message: MessageDefinition): DocumentSymbol {
    const children: DocumentSymbol[] = [];

    // Fields
    for (const field of message.fields) {
      children.push({
        name: field.name,
        detail: `${field.fieldType} = ${field.number}`,
        kind: VSCodeSymbolKind.Field,
        range: this.toRange(field.range),
        selectionRange: this.toRange(field.nameRange)
      });
    }

    // Map fields
    for (const mapField of message.maps) {
      children.push({
        name: mapField.name,
        detail: `map<${mapField.keyType}, ${mapField.valueType}> = ${mapField.number}`,
        kind: VSCodeSymbolKind.Field,
        range: this.toRange(mapField.range),
        selectionRange: this.toRange(mapField.nameRange)
      });
    }

    // Oneofs
    for (const oneof of message.oneofs) {
      const oneofChildren = oneof.fields.map(f => ({
        name: f.name,
        detail: `${f.fieldType} = ${f.number}`,
        kind: VSCodeSymbolKind.Field,
        range: this.toRange(f.range),
        selectionRange: this.toRange(f.nameRange)
      }));

      children.push({
        name: oneof.name,
        kind: VSCodeSymbolKind.Struct,
        range: this.toRange(oneof.range),
        selectionRange: this.toRange(oneof.nameRange),
        children: oneofChildren
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

    return {
      name: message.name,
      kind: VSCodeSymbolKind.Class,
      range: this.toRange(message.range),
      selectionRange: this.toRange(message.nameRange),
      children
    };
  }

  private enumToSymbol(enumDef: EnumDefinition): DocumentSymbol {
    const children = enumDef.values.map(value => ({
      name: value.name,
      detail: `= ${value.number}`,
      kind: VSCodeSymbolKind.EnumMember,
      range: this.toRange(value.range),
      selectionRange: this.toRange(value.nameRange)
    }));

    return {
      name: enumDef.name,
      kind: VSCodeSymbolKind.Enum,
      range: this.toRange(enumDef.range),
      selectionRange: this.toRange(enumDef.nameRange),
      children
    };
  }

  private serviceToSymbol(service: ServiceDefinition): DocumentSymbol {
    const children = service.rpcs.map(rpc => {
      const inputDesc = rpc.inputStream ? `stream ${rpc.inputType}` : rpc.inputType;
      const outputDesc = rpc.outputStream ? `stream ${rpc.outputType}` : rpc.outputType;

      return {
        name: rpc.name,
        detail: `(${inputDesc}) returns (${outputDesc})`,
        kind: VSCodeSymbolKind.Method,
        range: this.toRange(rpc.range),
        selectionRange: this.toRange(rpc.nameRange)
      };
    });

    return {
      name: service.name,
      kind: VSCodeSymbolKind.Interface,
      range: this.toRange(service.range),
      selectionRange: this.toRange(service.nameRange),
      children
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

  private toRange(range: any): Range {
    return {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character }
    };
  }
}
