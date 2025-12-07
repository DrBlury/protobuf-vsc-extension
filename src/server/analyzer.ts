/**
 * Semantic Analyzer for Protocol Buffers
 * Provides symbol resolution and cross-file analysis
 * Supports both standard protobuf and buf-style imports
 */

import {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  ServiceDefinition,
  SymbolInfo,
  SymbolKind,
  Location,
  BUILTIN_TYPES
} from './ast';
import * as path from 'path';
import { bufConfigProvider } from './bufConfig';

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

  // Configured import paths to search for proto files (e.g., from protobuf.includes setting)
  private importPaths: string[] = [];

  // Workspace roots (from VS Code workspace folders)
  private workspaceRoots: string[] = [];

  // Detected proto roots (directories containing buf.yaml, buf.work.yaml, or being common ancestors)
  private protoRoots: Set<string> = new Set();

  setImportPaths(paths: string[]): void {
    this.importPaths = paths;
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots.map(r => r.replace(/\\/g, '/'));
  }

  updateFile(uri: string, file: ProtoFile): void {
    // Remove old symbols for this file
    this.removeFileSymbols(uri);

    // Store file
    this.workspace.files.set(uri, file);

    // Extract and store imports
    const importPaths = file.imports.map(i => i.path);
    this.workspace.imports.set(uri, importPaths);

    // Update proto roots from buf.yaml if available
    try {
      const filePath = uri.replace('file://', '');
      const bufRoots = bufConfigProvider.getProtoRoots(filePath);
      for (const root of bufRoots) {
        this.protoRoots.add(root);
      }
      const workDirs = bufConfigProvider.getWorkDirectories(filePath);
      for (const dir of workDirs) {
        this.protoRoots.add(dir);
      }
    } catch (_e) {
      // Ignore errors
    }

    // Try to resolve imports to URIs
    for (const importPath of importPaths) {
      this.resolveImportPath(uri, importPath);
    }

    // Re-resolve any unresolved imports from other files that might now match this new file
    this.resolveUnresolvedImports(uri);

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

    // Keep proto root hints up to date for import resolution
    this.detectProtoRoots();
  }

  /**
   * When a new file is added, check if it resolves any pending imports from other files
   */
  private resolveUnresolvedImports(newFileUri: string): void {
    const normalizedNewUri = this.normalizeUri(newFileUri);

    // Check all files' imports to see if any can now be resolved to this new file
    for (const [fileUri, importPaths] of this.workspace.imports) {
      if (fileUri === newFileUri) {
        continue;
      }

      for (const importPath of importPaths) {
        // Skip if already resolved
        if (this.workspace.importResolutions.has(importPath)) {
          continue;
        }

        // Try to match this import to the new file
        if (this.doesFileMatchImport(normalizedNewUri, importPath)) {
          this.workspace.importResolutions.set(importPath, newFileUri);
        }
      }
    }
  }

  /**
   * Normalize a URI for consistent comparison
   */
  private normalizeUri(uri: string): string {
    return uri.replace(/\\/g, '/');
  }

  /**
   * Check if a file URI matches an import path
   * Supports multiple import styles:
   * - Relative: "date.proto", "../common/date.proto"
   * - Absolute from proto root: "domain/v1/date.proto" (buf style)
   * - Google well-known types: "google/protobuf/timestamp.proto"
   */
  private doesFileMatchImport(normalizedUri: string, importPath: string): boolean {
    const normalizedImport = importPath.replace(/\\/g, '/');

    // Direct suffix match (most common case)
    if (normalizedUri.endsWith('/' + normalizedImport) ||
        normalizedUri.endsWith(normalizedImport)) {
      return true;
    }

    // Filename-only match for simple imports like "date.proto"
    const importFileName = path.basename(normalizedImport);
    const uriFileName = path.basename(normalizedUri);
    if (importFileName === uriFileName && !normalizedImport.includes('/')) {
      return true;
    }

    return false;
  }

  /**
   * Resolve an import path to a workspace file URI
   * Handles multiple import conventions:
   * 1. Relative imports: "./file.proto", "../dir/file.proto"
   * 2. Absolute imports from proto root: "domain/v1/file.proto" (buf style)
   * 3. Package-based imports: "google/protobuf/timestamp.proto"
   * 4. Simple filename imports: "file.proto"
   */
  private resolveImportPath(currentUri: string, importPath: string): string | undefined {
    // Check if already resolved
    const existing = this.workspace.importResolutions.get(importPath);
    if (existing) {
      return existing;
    }

    const normalizedImport = importPath.replace(/\\/g, '/');

    // Strategy 1: Direct path matching (works for buf-style and absolute imports)
    for (const [fileUri] of this.workspace.files) {
      const normalizedUri = this.normalizeUri(fileUri);

      if (this.doesFileMatchImport(normalizedUri, importPath)) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }
    }

    // Strategy 2: Relative path from current file
    const currentPath = currentUri.replace('file://', '').replace(/\\/g, '/');
    const currentDir = path.dirname(currentPath);
    const resolvedPath = path.resolve(currentDir, normalizedImport).replace(/\\/g, '/');
    const resolvedUri = 'file://' + resolvedPath;

    for (const [fileUri] of this.workspace.files) {
      const normalizedFileUri = this.normalizeUri(fileUri);
      if (normalizedFileUri === resolvedUri) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }
    }

    // Strategy 3: Search in configured import paths
    for (const importRoot of this.importPaths) {
      const searchPath = path.join(importRoot, normalizedImport).replace(/\\/g, '/');
      const searchUri = 'file://' + searchPath;

      for (const [fileUri] of this.workspace.files) {
        const normalizedFileUri = this.normalizeUri(fileUri);
        if (normalizedFileUri === searchUri || normalizedFileUri.endsWith(searchPath)) {
          this.workspace.importResolutions.set(importPath, fileUri);
          return fileUri;
        }
      }
    }

    // Strategy 4: Search in workspace roots (for buf-style imports like "domain/v1/file.proto")
    for (const workspaceRoot of this.workspaceRoots) {
      const searchPath = path.join(workspaceRoot, normalizedImport).replace(/\\/g, '/');
      const searchUri = 'file://' + searchPath;

      for (const [fileUri] of this.workspace.files) {
        const normalizedFileUri = this.normalizeUri(fileUri);
        if (normalizedFileUri === searchUri || normalizedFileUri.endsWith('/' + searchPath)) {
          this.workspace.importResolutions.set(importPath, fileUri);
          return fileUri;
        }
      }
    }

    // Strategy 5: Search in detected proto roots (more specific than generic suffix match)
    for (const protoRoot of this.protoRoots) {
      const searchPath = path.join(protoRoot, normalizedImport).replace(/\\/g, '/');
      const searchUri = 'file://' + searchPath;

      for (const [fileUri] of this.workspace.files) {
        const normalizedFileUri = this.normalizeUri(fileUri);
        if (normalizedFileUri === searchUri || normalizedFileUri.endsWith('/' + searchPath)) {
          this.workspace.importResolutions.set(importPath, fileUri);
          return fileUri;
        }
      }
    }

    // Strategy 6: Try to find by matching the import path as a suffix at any directory level
    // This handles cases where the proto root isn't at the workspace root
    for (const [fileUri] of this.workspace.files) {
      const normalizedUri = this.normalizeUri(fileUri);
      const uriPath = normalizedUri.replace('file://', '');

      // Check if the file path contains the import path at a directory boundary
      const importPathWithSlash = '/' + normalizedImport;
      if (uriPath.includes(importPathWithSlash)) {
        this.workspace.importResolutions.set(importPath, fileUri);
        return fileUri;
      }
    }

    return undefined;
  }

  /**
   * Detect proto roots from workspace files
   * Proto roots are directories that serve as the base for absolute imports
   */
  detectProtoRoots(): void {
    // Find common parent directories that could be proto roots
    const allPaths: string[] = [];
    for (const [fileUri] of this.workspace.files) {
      const filePath = fileUri.replace('file://', '').replace(/\\/g, '/');
      allPaths.push(path.dirname(filePath));
    }

    // Add unique parent directories as potential proto roots
    const seen = new Set<string>();
    for (const p of allPaths) {
      let current = p;
      while (current && current !== '/' && current !== '.') {
        if (!seen.has(current)) {
          seen.add(current);
          this.protoRoots.add(current);
        }
        current = path.dirname(current);
      }
    }
  }

  removeFile(uri: string): void {
    this.removeFileSymbols(uri);
    this.workspace.files.delete(uri);
    this.workspace.imports.delete(uri);

    // Clean up import resolutions that pointed to this file
    for (const [importPath, resolvedUri] of this.workspace.importResolutions) {
      if (resolvedUri === uri) {
        this.workspace.importResolutions.delete(importPath);
      }
    }
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

  /**
   * Returns imports for a file along with their resolution status.
   */
  getImportsWithResolutions(uri: string): { importPath: string; resolvedUri?: string; isResolved: boolean }[] {
    const imports = this.workspace.imports.get(uri) || [];
    return imports.map(importPath => {
      const resolvedUri = this.workspace.importResolutions.get(importPath);
      return { importPath, resolvedUri, isResolved: !!resolvedUri };
    });
  }

  /**
   * Get the MessageDefinition for a fully qualified symbol name (package + nested names)
   */
  getMessageDefinition(fullName: string): MessageDefinition | undefined {
    for (const [, file] of this.workspace.files) {
      const pkg = file.package?.name || '';
      const found = this.findMessageDefinition(file.messages, pkg, fullName);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Get the EnumDefinition for a fully qualified symbol name (package + nested names)
   */
  getEnumDefinition(fullName: string): EnumDefinition | undefined {
    for (const [, file] of this.workspace.files) {
      const pkg = file.package?.name || '';
      const foundTop = this.findEnumDefinition(file.enums, pkg, fullName);
      if (foundTop) {
        return foundTop;
      }

      // Enums nested under messages
      const nestedFound = this.findEnumInMessages(file.messages, pkg, fullName);
      if (nestedFound) {
        return nestedFound;
      }
    }
    return undefined;
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
    if (visitedUris.has(uri)) {
      return;
    }
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
    if (symbol) {
      return symbol;
    }

    // Get the current file to check its imports
    const importedUris = this.getImportedFileUris(currentUri);

    // Try with current package prefix
    if (currentPackage) {
      symbol = this.workspace.symbols.get(`${currentPackage}.${typeName}`);
      if (symbol) {
        return symbol;
      }
    }

    // Try searching in parent scopes (for nested types)
    const parts = currentPackage?.split('.') || [];
    while (parts.length > 0) {
      const prefix = parts.join('.');
      symbol = this.workspace.symbols.get(`${prefix}.${typeName}`);
      if (symbol) {
        return symbol;
      }
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
          if (symbol) {
            return symbol;
          }
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
  getTypeCompletions(currentUri: string, _currentPackage?: string): SymbolInfo[] {
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

  /**
   * Compute a reasonable import path for targetUri from currentUri, preferring proto roots,
   * then workspace roots, then relative path, and finally basename.
   */
  getImportPathForFile(currentUri: string, targetUri: string): string {
    // Built-in virtual files (e.g., google well-known stubs)
    if (targetUri.startsWith('builtin:///')) {
      return targetUri.replace('builtin:///', '');
    }

    const currentPath = currentUri.replace('file://', '').replace(/\\/g, '/');
    const targetPath = targetUri.replace('file://', '').replace(/\\/g, '/');

    // If the target sits under a google/* well-known path, prefer the canonical import
    const googleIndex = targetPath.lastIndexOf('/google/');
    if (googleIndex >= 0) {
      return targetPath.substring(googleIndex + 1); // drop leading slash
    }

    if (currentPath === targetPath) {
      return path.basename(targetPath);
    }

    const candidates: string[] = [];

    for (const root of this.protoRoots) {
      if (targetPath.startsWith(root + '/')) {
        candidates.push(path.posix.relative(root, targetPath));
      }
    }

    for (const root of this.workspaceRoots) {
      if (targetPath.startsWith(root + '/')) {
        candidates.push(path.posix.relative(root, targetPath));
      }
    }

    const relativeToCurrent = path.posix.relative(path.posix.dirname(currentPath), targetPath);
    if (relativeToCurrent) {
      candidates.push(relativeToCurrent);
    }

    candidates.push(path.basename(targetPath));

    const cleaned = candidates
      .map(c => c.replace(/\\/g, '/'))
      .filter(Boolean)
      .sort((a, b) => a.length - b.length);

    return cleaned[0];
  }

  private findMessageDefinition(
    messages: MessageDefinition[],
    prefix: string,
    target: string
  ): MessageDefinition | undefined {
    for (const message of messages) {
      const current = prefix ? `${prefix}.${message.name}` : message.name;
      if (current === target) {
        return message;
      }

      const nestedPrefix = current;
      const nested = this.findMessageDefinition(message.nestedMessages, nestedPrefix, target);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  private findEnumDefinition(
    enums: EnumDefinition[],
    prefix: string,
    target: string
  ): EnumDefinition | undefined {
    for (const e of enums) {
      const current = prefix ? `${prefix}.${e.name}` : e.name;
      if (current === target) {
        return e;
      }
    }
    return undefined;
  }

  private findEnumInMessages(
    messages: MessageDefinition[],
    prefix: string,
    target: string
  ): EnumDefinition | undefined {
    for (const message of messages) {
      const current = prefix ? `${prefix}.${message.name}` : message.name;

      const enumMatch = this.findEnumDefinition(message.nestedEnums, current, target);
      if (enumMatch) {
        return enumMatch;
      }

      const nestedMessageMatch = this.findEnumInMessages(message.nestedMessages, current, target);
      if (nestedMessageMatch) {
        return nestedMessageMatch;
      }
    }
    return undefined;
  }
}

export const analyzer = new SemanticAnalyzer();
