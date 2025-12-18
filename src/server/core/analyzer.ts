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
} from '../core/ast';
import * as path from 'path';
import { bufConfigProvider } from '../services/bufConfig';
import { logger } from '../utils/logger';

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
    // Import paths (from --proto_path, buf includes, etc.) should also be proto roots
    // for import path calculation purposes
    for (const importPath of paths) {
      const normalized = importPath.replace(/\\/g, '/');
      this.protoRoots.add(normalized);
    }
    // Clear import resolution cache when paths change to force re-resolution
    // This ensures diagnostics are updated when protobuf.includes or --proto_path changes
    this.clearImportResolutionCache();
  }

  /**
   * Generate a cache key for import resolution.
   * Simple filename imports (without '/') need per-file resolution
   * because different files in different directories might import different files
   * with the same simple name.
   * Path-based imports (with '/') can be cached globally.
   */
  private getImportCacheKey(sourceUri: string, importPath: string): string {
    // Simple filename imports need per-file resolution
    if (!importPath.includes('/')) {
      return `${sourceUri}|||${importPath}`;
    }
    // Path-based imports can be resolved globally
    return importPath;
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots.map(r => r.replace(/\\/g, '/'));
  }

  /**
   * Get configured import paths (from protobuf.includes, --proto_path, etc.)
   */
  getImportPaths(): string[] {
    return [...this.importPaths];
  }

  /**
   * Get detected proto roots (directories that serve as base paths for imports)
   */
  getProtoRoots(): string[] {
    return Array.from(this.protoRoots);
  }

  /**
   * Get workspace root directories
   */
  getWorkspaceRoots(): string[] {
    return [...this.workspaceRoots];
  }

  /**
   * Add a directory as a proto root for import path resolution.
   * Proto roots are directories that serve as base paths for proto imports.
   */
  addProtoRoot(root: string): void {
    const normalizedRoot = root.replace(/\\/g, '/');
    this.protoRoots.add(normalizedRoot);
    logger.verbose(`Added proto root: ${normalizedRoot}`);
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
    } catch {
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
        // Use composite cache key for per-file resolution of simple imports
        const cacheKey = this.getImportCacheKey(fileUri, importPath);

        // Skip if already resolved
        if (this.workspace.importResolutions.has(cacheKey)) {
          continue;
        }

        // Try to match this import to the new file
        if (this.doesFileMatchImport(normalizedNewUri, importPath)) {
          this.workspace.importResolutions.set(cacheKey, newFileUri);
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
    // Check if already resolved using the appropriate cache key
    const cacheKey = this.getImportCacheKey(currentUri, importPath);
    const existing = this.workspace.importResolutions.get(cacheKey);
    if (existing) {
      return existing;
    }

    const normalizedImport = importPath.replace(/\\/g, '/');

    // Strategy 1: Direct path matching (works for buf-style and absolute imports)
    for (const [fileUri] of this.workspace.files) {
      const normalizedUri = this.normalizeUri(fileUri);

      if (this.doesFileMatchImport(normalizedUri, importPath)) {
        this.workspace.importResolutions.set(cacheKey, fileUri);
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
        this.workspace.importResolutions.set(cacheKey, fileUri);
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
          this.workspace.importResolutions.set(cacheKey, fileUri);
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
          this.workspace.importResolutions.set(cacheKey, fileUri);
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
          this.workspace.importResolutions.set(cacheKey, fileUri);
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
        this.workspace.importResolutions.set(cacheKey, fileUri);
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

  /**
   * Clear all cached import resolutions.
   * Call this when files are renamed or deleted to force re-resolution.
   */
  clearImportResolutionCache(): void {
    this.workspace.importResolutions.clear();
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

    // Extract symbols from groups (proto2)
    // Groups are like nested messages in terms of symbol extraction
    for (const group of message.groups) {
      const groupFullName = fullName ? `${fullName}.${group.name}` : group.name;

      // Add group as a symbol (groups act as both a field and a message type)
      this.workspace.symbols.set(groupFullName, {
        name: group.name,
        fullName: groupFullName,
        kind: SymbolKind.Message,
        location: { uri, range: group.range },
        containerName: fullName
      });

      // Extract nested messages and enums from the group
      for (const nested of group.nestedMessages) {
        this.extractMessageSymbols(uri, nested, groupFullName);
      }

      for (const nested of group.nestedEnums) {
        this.extractEnumSymbols(uri, nested, groupFullName);
      }
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
      const cacheKey = this.getImportCacheKey(uri, importPath);
      const resolvedUri = this.workspace.importResolutions.get(cacheKey);
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
      const cacheKey = this.getImportCacheKey(uri, importPath);
      const resolvedUri = this.workspace.importResolutions.get(cacheKey);
      if (resolvedUri) {
        resolvedUris.push(resolvedUri);
      } else {
        logger.verbose(`Import not resolved: "${importPath}" from ${uri}`);
      }
    }

    logger.verbose(`getImportedFileUris for ${uri}: imports=${JSON.stringify(imports)}, resolved=${resolvedUris.length}`);
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
   * Supports forward references within the same file (proto3 feature)
   *
   * Resolution priority:
   * 1. Exact match (fully qualified name - must contain a dot)
   * 2. Current package prefix
   * 3. Parent scopes (nested types)
   * 4. Same file symbols (for forward references)
   * 5. Imported files' packages
   * 6. Imported files' symbols by simple name
   *
   * Note: We intentionally do NOT fall back to searching all workspace files
   * by simple name, as this would incorrectly resolve types from non-imported files.
   */
  resolveType(typeName: string, currentUri: string, currentPackage?: string): SymbolInfo | undefined {
    // Check if it's a builtin type
    if (BUILTIN_TYPES.includes(typeName)) {
      return undefined;
    }

    // Handle absolute type references (starting with .)
    // In protobuf, a leading dot means "absolute path from root"
    // e.g., ".com.example.MyMessage" is the same as "com.example.MyMessage"
    const normalizedTypeName = typeName.startsWith('.') ? typeName.slice(1) : typeName;

    // Try exact match first ONLY for fully qualified names (containing a dot)
    // Simple names like "User" should go through proper scope resolution
    if (normalizedTypeName.includes('.')) {
      const symbol = this.workspace.symbols.get(normalizedTypeName);
      if (symbol) {
        return symbol;
      }
    }

    // If it was an absolute reference, don't do relative resolution
    if (typeName.startsWith('.')) {
      return undefined;
    }

    // Get the current file to check its imports AND its local definitions (for forward references)
    const currentFile = this.workspace.files.get(currentUri);
    const importedUris = this.getImportedFileUris(currentUri);

    // Try with current package prefix
    if (currentPackage) {
      const symbol = this.workspace.symbols.get(`${currentPackage}.${typeName}`);
      if (symbol) {
        return symbol;
      }
    }

    // Try searching in parent scopes (for nested types)
    const parts = currentPackage?.split('.') || [];
    while (parts.length > 0) {
      const prefix = parts.join('.');
      const symbol = this.workspace.symbols.get(`${prefix}.${typeName}`);
      if (symbol) {
        return symbol;
      }
      parts.pop();
    }

    // IMPORTANT: Check same-file symbols BEFORE searching imported files
    // This handles forward references and types defined in the same file
    if (currentFile) {
      const currentFilePackage = currentFile.package?.name || '';

      // Check messages in current file
      for (const message of currentFile.messages) {
        if (message.name === typeName) {
          const fullName = currentFilePackage ? `${currentFilePackage}.${message.name}` : message.name;
          return {
            name: message.name,
            fullName,
            kind: SymbolKind.Message,
            location: { uri: currentUri, range: message.range }
          };
        }
        // Check nested messages
        const nestedSymbol = this.findNestedType(message, typeName, currentFilePackage, currentUri);
        if (nestedSymbol) {
          return nestedSymbol;
        }
      }

      // Check enums in current file
      for (const enumDef of currentFile.enums) {
        if (enumDef.name === typeName) {
          const fullName = currentFilePackage ? `${currentFilePackage}.${enumDef.name}` : enumDef.name;
          return {
            name: enumDef.name,
            fullName,
            kind: SymbolKind.Enum,
            location: { uri: currentUri, range: enumDef.range }
          };
        }
      }
    }

    // Search in imported files' packages
    for (const importedUri of importedUris) {
      const importedFile = this.workspace.files.get(importedUri);
      if (importedFile) {
        const importedPackage = importedFile.package?.name || '';

        // Try with imported package prefix
        if (importedPackage) {
          const symbol = this.workspace.symbols.get(`${importedPackage}.${typeName}`);
          if (symbol) {
            return symbol;
          }
        }

        // Try finding symbol in imported file by simple name
        for (const [fullName, sym] of this.workspace.symbols) {
          if (sym.location.uri === importedUri &&
              (sym.name === typeName || fullName.endsWith(`.${typeName}`))) {
            logger.verbose(`resolveType: Found "${typeName}" as "${fullName}" in imported file`);
            return sym;
          }
        }
      }
    }

    // Note: We do NOT fall back to searching all workspace files by simple name.
    // Types from non-imported files should not be resolved - they need an import.
    // The diagnostics will flag unresolved types, and the user can add the import.
    logger.verbose(`resolveType: Could not resolve "${typeName}" from ${currentUri} (importedUris: ${importedUris.length})`);

    return undefined;
  }

  /**
   * Helper to find a nested type within a message definition
   */
  private findNestedType(
    message: MessageDefinition,
    typeName: string,
    prefix: string,
    uri: string
  ): SymbolInfo | undefined {
    const messageFullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check nested messages
    for (const nested of message.nestedMessages) {
      if (nested.name === typeName) {
        const fullName = `${messageFullName}.${nested.name}`;
        return {
          name: nested.name,
          fullName,
          kind: SymbolKind.Message,
          location: { uri, range: nested.range }
        };
      }
      // Recursively check deeper nesting
      const deeperSymbol = this.findNestedType(nested, typeName, messageFullName, uri);
      if (deeperSymbol) {
        return deeperSymbol;
      }
    }

    // Check nested enums
    for (const nested of message.nestedEnums) {
      if (nested.name === typeName) {
        const fullName = `${messageFullName}.${nested.name}`;
        return {
          name: nested.name,
          fullName,
          kind: SymbolKind.Enum,
          location: { uri, range: nested.range }
        };
      }
    }

    return undefined;
  }

  /**
   * Find all references to a symbol
   */
  findReferences(symbolName: string, fullyQualifiedName?: string): Location[] {
    const references: Location[] = [];

    for (const [uri, file] of this.workspace.files) {
      const packageName = file.package?.name || '';

      // Search in messages
      for (const message of file.messages) {
        this.findReferencesInMessage(uri, message, symbolName, packageName, references, fullyQualifiedName);
      }

      // Search in services
      for (const service of file.services) {
        this.findReferencesInService(uri, service, symbolName, references, fullyQualifiedName);
      }

      // Search in extends
      for (const extend of file.extends) {
        const extendTypeName = extend.extendType ?? extend.messageName;
        const extendTypeRange = extend.extendTypeRange ?? extend.messageNameRange;

        if (extendTypeName && this.matchesSymbolInContext(extendTypeName, symbolName, fullyQualifiedName, uri, packageName)) {
          if (extendTypeRange) {
            references.push({ uri, range: extendTypeRange });
          }
        }
        for (const field of extend.fields) {
          if (this.matchesSymbolInContext(field.fieldType, symbolName, fullyQualifiedName, uri, packageName)) {
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
    references: Location[],
    fullyQualifiedName?: string
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check fields
    for (const field of message.fields) {
      if (this.matchesSymbolInContext(field.fieldType, symbolName, fullyQualifiedName, uri, fullName)) {
        references.push({ uri, range: field.fieldTypeRange });
      }
    }

    // Check map fields
    for (const mapField of message.maps) {
      if (this.matchesSymbolInContext(mapField.valueType, symbolName, fullyQualifiedName, uri, fullName)) {
        references.push({ uri, range: mapField.valueTypeRange });
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        if (this.matchesSymbolInContext(field.fieldType, symbolName, fullyQualifiedName, uri, fullName)) {
          references.push({ uri, range: field.fieldTypeRange });
        }
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.findReferencesInMessage(uri, nested, symbolName, fullName, references, fullyQualifiedName);
    }
  }

  private findReferencesInService(
    uri: string,
    service: ServiceDefinition,
    symbolName: string,
    references: Location[],
    fullyQualifiedName?: string
  ): void {
    // Get the file's package for context
    const file = this.workspace.files.get(uri);
    const packageName = file?.package?.name || '';

    for (const rpc of service.rpcs) {
      const inputType = rpc.requestType ?? rpc.inputType;
      const inputTypeRange = rpc.requestTypeRange ?? rpc.inputTypeRange;
      const outputType = rpc.responseType ?? rpc.outputType;
      const outputTypeRange = rpc.responseTypeRange ?? rpc.outputTypeRange;

      if (inputType && this.matchesSymbolInContext(inputType, symbolName, fullyQualifiedName, uri, packageName)) {
        if (inputTypeRange) {
          references.push({ uri, range: inputTypeRange });
        }
      }
      if (outputType && this.matchesSymbolInContext(outputType, symbolName, fullyQualifiedName, uri, packageName)) {
        if (outputTypeRange) {
          references.push({ uri, range: outputTypeRange });
        }
      }
    }
  }

  /**
   * Check if a type reference matches a symbol by resolving it in context.
   * This properly handles package scoping to avoid false matches across packages.
   */
  private matchesSymbolInContext(
    typeName: string,
    symbolName: string,
    fullyQualifiedName: string | undefined,
    uri: string,
    currentScope: string
  ): boolean {
    // If no fully qualified name provided, fall back to simple matching
    if (!fullyQualifiedName) {
      return this.matchesSymbol(typeName, symbolName, fullyQualifiedName);
    }

    // If typeName is already fully qualified (contains a dot or starts with dot),
    // normalize and compare directly
    if (typeName.includes('.')) {
      const normalizedTypeName = typeName.startsWith('.') ? typeName.slice(1) : typeName;
      return normalizedTypeName === fullyQualifiedName;
    }

    // For simple names, resolve to get the actual fully qualified name
    const resolved = this.resolveType(typeName, uri, currentScope);
    if (resolved) {
      return resolved.fullName === fullyQualifiedName;
    }

    // If resolution failed, it might be an unimported type - don't match
    return false;
  }

  private matchesSymbol(typeName: string, symbolName: string, fullyQualifiedName?: string): boolean {
    if (fullyQualifiedName) {
      if (typeName === fullyQualifiedName || fullyQualifiedName.endsWith(`.${typeName}`) || typeName.endsWith(`.${fullyQualifiedName}`)) {
        return true;
      }
    }

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
   * Compute a reasonable import path for targetUri from currentUri.
   *
   * The algorithm prefers shorter, simpler paths that are still valid:
   * 1. Same directory -> just filename
   * 2. Forward-only relative path (e.g., "nested/file.proto") - simplest when target is a descendant
   * 3. Short import path relative paths (when shorter than forward-only)
   * 4. Workspace root relative paths
   * 5. Relative path with parent traversal (e.g., "../other/file.proto")
   * 6. Fallback to basename (only if target is at a root level)
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

    const currentDir = path.posix.dirname(currentPath);
    const targetDir = path.posix.dirname(targetPath);
    const targetBasename = path.basename(targetPath);

    // If both files are in the same directory, use just the filename
    if (currentDir === targetDir) {
      return targetBasename;
    }

    // Collect all valid candidate paths
    const candidates: Array<{ path: string; source: string }> = [];

    // Forward-only relative path from current file (no parent traversal)
    const relativeToCurrent = path.posix.relative(currentDir, targetPath);
    if (relativeToCurrent && !relativeToCurrent.startsWith('..')) {
      // This is the most intuitive path when target is a descendant of current dir
      candidates.push({ path: relativeToCurrent, source: 'forward-relative' });
    }

    // Check explicitly configured import paths
    for (const importPath of this.importPaths) {
      const normalizedImportPath = importPath.replace(/\\/g, '/');
      if (targetPath.startsWith(`${normalizedImportPath}/`)) {
        const relPath = path.posix.relative(normalizedImportPath, targetPath);
        candidates.push({ path: relPath, source: 'import-path' });
      }
    }

    // Check workspace roots
    for (const root of this.workspaceRoots) {
      if (currentPath.startsWith(`${root}/`) && targetPath.startsWith(`${root}/`)) {
        const relPath = path.posix.relative(root, targetPath);
        candidates.push({ path: relPath, source: 'workspace-root' });
      }
    }

    // Relative path with parent traversal (lower priority - only if no forward path)
    if (relativeToCurrent && relativeToCurrent.startsWith('..')) {
      candidates.push({ path: relativeToCurrent, source: 'parent-relative' });
    }

    // Only add basename as a candidate if the file is at an explicitly configured root level
    for (const root of [...this.importPaths.map(p => p.replace(/\\/g, '/')), ...this.workspaceRoots]) {
      if (targetDir === root) {
        candidates.push({ path: targetBasename, source: 'basename' });
        break;
      }
    }

    // Clean and deduplicate candidates
    const cleaned = candidates
      .map(c => ({ ...c, path: c.path.replace(/\\/g, '/') }))
      .filter(c => c.path);

    // Remove duplicates, keeping the first occurrence
    const seen = new Set<string>();
    const unique = cleaned.filter(c => {
      if (seen.has(c.path)) {
        return false;
      }
      seen.add(c.path);
      return true;
    });

    // Sort by priority: import-path > forward-relative > workspace-root > others
    // Secondary sort by path length (shorter is better)
    const sorted = unique.sort((a, b) => {
      // Define priority order
      const priorityOrder = ['import-path', 'forward-relative', 'basename', 'workspace-root', 'parent-relative'];
      const aPriority = priorityOrder.indexOf(a.source);
      const bPriority = priorityOrder.indexOf(b.source);

      // Primary sort by priority (lower index = higher priority)
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Secondary sort by path length (shorter is better)
      return a.path.length - b.path.length;
    });

    // Fallback to relative path if no candidates found
    return sorted[0]?.path ?? relativeToCurrent ?? targetBasename;
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
