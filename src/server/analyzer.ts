/**
 * Semantic Analyzer for Protocol Buffers
 * Provides symbol resolution and cross-file analysis
 */

import {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  FieldDefinition,
  RpcDefinition,
  SymbolInfo,
  SymbolKind,
  Location,
  Range,
  BUILTIN_TYPES
} from './ast';
import * as path from 'path';

export interface WorkspaceSymbols {
  // URI -> ProtoFile
  files: Map<string, ProtoFile>;
  // Full name -> SymbolInfo
  symbols: Map<string, SymbolInfo>;
  // URI -> import paths
  imports: Map<string, string[]>;
  // Import path -> resolved URI
  importResolutions: Map<string, string>;
}

export class SemanticAnalyzer {
  private workspace: WorkspaceSymbols = {
    files: new Map(),
    symbols: new Map(),
    imports: new Map(),
    importResolutions: new Map()
  };

  // Configured import paths to search for proto files
  private importPaths: string[] = [];

  setImportPaths(paths: string[]): void {
    this.importPaths = paths;
  }

  updateFile(uri: string, file: ProtoFile): void {
    // Remove old symbols for this file
    this.removeFileSymbols(uri);

    // Store file
    this.workspace.files.set(uri, file);

    // Extract and store imports
    const importPaths = file.imports.map(i => i.path);
    this.workspace.imports.set(uri, importPaths);

    // Try to resolve imports to URIs
    for (const importPath of importPaths) {
      this.resolveImportPath(uri, importPath);
    }

    // Extract symbols
    const packageName = file.package?.name || '';

    for (const message of file.messages) {
      this.extractMessageSymbols(uri, message, packageName);
    }

    for (const enumDef of file.enums) {
      this.extractEnumSymbols(uri, enumDef, packageName);
    }

    for (const service of file.services) {
      this.extractServiceSymbols(uri, service, packageName);
    }
  }

  /**
   * Resolve an import path to a workspace file URI
   */
  private resolveImportPath(currentUri: string, importPath: string): string | undefined {
    // Check if already resolved
    const existing = this.workspace.importResolutions.get(importPath);
    if (existing) return existing;

    // Try to find the file in workspace
    for (const [fileUri, _] of this.workspace.files) {
      // Check if the file URI ends with the import path
      const normalizedUri = fileUri.replace(/\\/g, '/');
      const normalizedImport = importPath.replace(/\\/g, '/');

      if (normalizedUri.endsWith(normalizedImport) ||
          normalizedUri.endsWith('/' + normalizedImport)) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }

      // Check by filename only
      const fileName = path.basename(normalizedImport);
      const uriFileName = path.basename(normalizedUri);
      if (fileName === uriFileName) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }
    }

    // Try relative path from current file
    const currentDir = path.dirname(currentUri.replace('file://', ''));
    const resolvedPath = path.resolve(currentDir, importPath);
    const resolvedUri = 'file://' + resolvedPath;

    for (const [fileUri, _] of this.workspace.files) {
      const normalizedFileUri = fileUri.replace(/\\/g, '/');
      const normalizedResolved = resolvedUri.replace(/\\/g, '/');

      if (normalizedFileUri === normalizedResolved) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }
    }

    return undefined;
  }

  removeFile(uri: string): void {
    this.removeFileSymbols(uri);
    this.workspace.files.delete(uri);
    this.workspace.imports.delete(uri);
  }

  private removeFileSymbols(uri: string): void {
    for (const [name, symbol] of this.workspace.symbols) {
      if (symbol.location.uri === uri) {
        this.workspace.symbols.delete(name);
      }
    }
  }

  private extractMessageSymbols(uri: string, message: MessageDefinition, prefix: string): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    this.workspace.symbols.set(fullName, {
      name: message.name,
      fullName,
      kind: SymbolKind.Message,
      location: { uri, range: message.nameRange },
      containerName: prefix || undefined
    });

    // Also register by simple name for easier lookup
    if (!this.workspace.symbols.has(message.name)) {
      this.workspace.symbols.set(message.name, {
        name: message.name,
        fullName,
        kind: SymbolKind.Message,
        location: { uri, range: message.nameRange },
        containerName: prefix || undefined
      });
    }

    // Extract fields
    for (const field of message.fields) {
      this.workspace.symbols.set(`${fullName}.${field.name}`, {
        name: field.name,
        fullName: `${fullName}.${field.name}`,
        kind: SymbolKind.Field,
        location: { uri, range: field.nameRange },
        containerName: fullName
      });
    }

    // Extract oneofs
    for (const oneof of message.oneofs) {
      this.workspace.symbols.set(`${fullName}.${oneof.name}`, {
        name: oneof.name,
        fullName: `${fullName}.${oneof.name}`,
        kind: SymbolKind.Oneof,
        location: { uri, range: oneof.nameRange },
        containerName: fullName
      });

      for (const field of oneof.fields) {
        this.workspace.symbols.set(`${fullName}.${field.name}`, {
          name: field.name,
          fullName: `${fullName}.${field.name}`,
          kind: SymbolKind.Field,
          location: { uri, range: field.nameRange },
          containerName: fullName
        });
      }
    }

    // Extract nested messages
    for (const nested of message.nestedMessages) {
      this.extractMessageSymbols(uri, nested, fullName);
    }

    // Extract nested enums
    for (const nested of message.nestedEnums) {
      this.extractEnumSymbols(uri, nested, fullName);
    }
  }

  private extractEnumSymbols(uri: string, enumDef: EnumDefinition, prefix: string): void {
    const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;

    this.workspace.symbols.set(fullName, {
      name: enumDef.name,
      fullName,
      kind: SymbolKind.Enum,
      location: { uri, range: enumDef.nameRange },
      containerName: prefix || undefined
    });

    // Also register by simple name for easier lookup
    if (!this.workspace.symbols.has(enumDef.name)) {
      this.workspace.symbols.set(enumDef.name, {
        name: enumDef.name,
        fullName,
        kind: SymbolKind.Enum,
        location: { uri, range: enumDef.nameRange },
        containerName: prefix || undefined
      });
    }

    // Extract enum values
    for (const value of enumDef.values) {
      this.workspace.symbols.set(`${fullName}.${value.name}`, {
        name: value.name,
        fullName: `${fullName}.${value.name}`,
        kind: SymbolKind.EnumValue,
        location: { uri, range: value.nameRange },
        containerName: fullName
      });
    }
  }

  private extractServiceSymbols(uri: string, service: ServiceDefinition, prefix: string): void {
    const fullName = prefix ? `${prefix}.${service.name}` : service.name;

    this.workspace.symbols.set(fullName, {
      name: service.name,
      fullName,
      kind: SymbolKind.Service,
      location: { uri, range: service.nameRange },
      containerName: prefix || undefined
    });

    // Extract RPCs
    for (const rpc of service.rpcs) {
      this.workspace.symbols.set(`${fullName}.${rpc.name}`, {
        name: rpc.name,
        fullName: `${fullName}.${rpc.name}`,
        kind: SymbolKind.Rpc,
        location: { uri, range: rpc.nameRange },
        containerName: fullName
      });
    }
  }

  getFile(uri: string): ProtoFile | undefined {
    return this.workspace.files.get(uri);
  }

  getAllFiles(): Map<string, ProtoFile> {
    return this.workspace.files;
  }

  getSymbol(fullName: string): SymbolInfo | undefined {
    return this.workspace.symbols.get(fullName);
  }

  getAllSymbols(): SymbolInfo[] {
    return Array.from(this.workspace.symbols.values());
  }

  getSymbolsInFile(uri: string): SymbolInfo[] {
    return Array.from(this.workspace.symbols.values())
      .filter(s => s.location.uri === uri);
  }

  /**
   * Get the imported file URIs for a given file
   */
  getImportedFileUris(uri: string): string[] {
    const imports = this.workspace.imports.get(uri) || [];
    const resolvedUris: string[] = [];

    for (const importPath of imports) {
      const resolvedUri = this.workspace.importResolutions.get(importPath);
      if (resolvedUri) {
        resolvedUris.push(resolvedUri);
      }
    }

    return resolvedUris;
  }

  /**
   * Get symbols accessible from a file (including imports)
   */
  getAccessibleSymbols(uri: string): SymbolInfo[] {
    const accessible: SymbolInfo[] = [];
    const visitedUris = new Set<string>();

    this.collectAccessibleSymbols(uri, accessible, visitedUris);

    return accessible;
  }

  private collectAccessibleSymbols(uri: string, symbols: SymbolInfo[], visitedUris: Set<string>): void {
    if (visitedUris.has(uri)) return;
    visitedUris.add(uri);

    // Add symbols from this file
    for (const symbol of this.workspace.symbols.values()) {
      if (symbol.location.uri === uri) {
        symbols.push(symbol);
      }
    }

    // Recursively add symbols from imported files
    const importedUris = this.getImportedFileUris(uri);
    for (const importedUri of importedUris) {
      this.collectAccessibleSymbols(importedUri, symbols, visitedUris);
    }
  }

  /**
   * Resolve a type reference to its symbol
   */
  resolveType(typeName: string, currentUri: string, currentPackage?: string): SymbolInfo | undefined {
    // Check if it's a builtin type
    if (BUILTIN_TYPES.includes(typeName)) {
      return undefined;
    }

    // Try exact match first (fully qualified name)
    let symbol = this.workspace.symbols.get(typeName);
    if (symbol) return symbol;

    // Get the current file to check its imports
    const currentFile = this.workspace.files.get(currentUri);
    const importedUris = this.getImportedFileUris(currentUri);

    // Try with current package prefix
    if (currentPackage) {
      symbol = this.workspace.symbols.get(`${currentPackage}.${typeName}`);
      if (symbol) return symbol;
    }

    // Try searching in parent scopes (for nested types)
    const parts = currentPackage?.split('.') || [];
    while (parts.length > 0) {
      const prefix = parts.join('.');
      symbol = this.workspace.symbols.get(`${prefix}.${typeName}`);
      if (symbol) return symbol;
      parts.pop();
    }

    // Search in imported files' packages
    for (const importedUri of importedUris) {
      const importedFile = this.workspace.files.get(importedUri);
      if (importedFile) {
        const importedPackage = importedFile.package?.name || '';

        // Try with imported package prefix
        if (importedPackage) {
          symbol = this.workspace.symbols.get(`${importedPackage}.${typeName}`);
          if (symbol) return symbol;
        }

        // Try finding symbol in imported file by simple name
        for (const [fullName, sym] of this.workspace.symbols) {
          if (sym.location.uri === importedUri &&
              (sym.name === typeName || fullName.endsWith(`.${typeName}`))) {
            return sym;
          }
        }
      }
    }

    // Try finding by simple name in all files (fallback for unresolved imports)
    for (const [fullName, sym] of this.workspace.symbols) {
      if (sym.name === typeName) {
        return sym;
      }
      if (fullName.endsWith(`.${typeName}`)) {
        return sym;
      }
    }

    return undefined;
  }

  /**
   * Find all references to a symbol
   */
  findReferences(symbolName: string): Location[] {
    const references: Location[] = [];

    for (const [uri, file] of this.workspace.files) {
      const packageName = file.package?.name || '';

      // Search in messages
      for (const message of file.messages) {
        this.findReferencesInMessage(uri, message, symbolName, packageName, references);
      }

      // Search in services
      for (const service of file.services) {
        this.findReferencesInService(uri, service, symbolName, references);
      }

      // Search in extends
      for (const extend of file.extends) {
        if (this.matchesSymbol(extend.messageName, symbolName)) {
          references.push({ uri, range: extend.messageNameRange });
        }
        for (const field of extend.fields) {
          if (this.matchesSymbol(field.fieldType, symbolName)) {
            references.push({ uri, range: field.fieldTypeRange });
          }
        }
      }
    }

    return references;
  }

  private findReferencesInMessage(
    uri: string,
    message: MessageDefinition,
    symbolName: string,
    prefix: string,
    references: Location[]
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check fields
    for (const field of message.fields) {
      if (this.matchesSymbol(field.fieldType, symbolName)) {
        references.push({ uri, range: field.fieldTypeRange });
      }
    }

    // Check map fields
    for (const mapField of message.maps) {
      if (this.matchesSymbol(mapField.valueType, symbolName)) {
        references.push({ uri, range: mapField.valueTypeRange });
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        if (this.matchesSymbol(field.fieldType, symbolName)) {
          references.push({ uri, range: field.fieldTypeRange });
        }
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.findReferencesInMessage(uri, nested, symbolName, fullName, references);
    }
  }

  private findReferencesInService(
    uri: string,
    service: ServiceDefinition,
    symbolName: string,
    references: Location[]
  ): void {
    for (const rpc of service.rpcs) {
      if (this.matchesSymbol(rpc.inputType, symbolName)) {
        references.push({ uri, range: rpc.inputTypeRange });
      }
      if (this.matchesSymbol(rpc.outputType, symbolName)) {
        references.push({ uri, range: rpc.outputTypeRange });
      }
    }
  }

  private matchesSymbol(typeName: string, symbolName: string): boolean {
    return typeName === symbolName ||
           typeName.endsWith(`.${symbolName}`) ||
           symbolName.endsWith(`.${typeName}`);
  }

  /**
   * Get completion items for the current context
   */
  getTypeCompletions(currentUri: string, currentPackage?: string): SymbolInfo[] {
    const completions: SymbolInfo[] = [];
    const seenNames = new Set<string>();

    // First add symbols from current file and imports
    const accessibleSymbols = this.getAccessibleSymbols(currentUri);
    for (const symbol of accessibleSymbols) {
      if ((symbol.kind === SymbolKind.Message || symbol.kind === SymbolKind.Enum) &&
          !seenNames.has(symbol.fullName)) {
        completions.push(symbol);
        seenNames.add(symbol.fullName);
      }
    }

    // Also add all workspace symbols for discoverability
    for (const symbol of this.workspace.symbols.values()) {
      if ((symbol.kind === SymbolKind.Message || symbol.kind === SymbolKind.Enum) &&
          !seenNames.has(symbol.fullName)) {
        completions.push(symbol);
        seenNames.add(symbol.fullName);
      }
    }

    return completions;
  }

  /**
   * Get message symbols for RPC type completions
   */
  getMessageCompletions(): SymbolInfo[] {
    return Array.from(this.workspace.symbols.values())
      .filter(s => s.kind === SymbolKind.Message);
  }

  /**
   * Resolve an import path to a file URI
   */
  resolveImportToUri(currentUri: string, importPath: string): string | undefined {
    return this.resolveImportPath(currentUri, importPath);
  }
}

export const analyzer = new SemanticAnalyzer();
