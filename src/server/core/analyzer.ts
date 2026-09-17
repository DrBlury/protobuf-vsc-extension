/**
 * Semantic Analyzer for Protocol Buffers
 * Provides symbol resolution and cross-file analysis
 * Supports both standard protobuf and buf-style imports
 */

import type {
  ProtoFile,
  MessageDefinition,
  EnumDefinition,
  GroupFieldDefinition,
  ServiceDefinition,
  SymbolInfo,
  Location,
} from '../core/ast';
import { SymbolKind, BUILTIN_TYPES } from '../core/ast';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { bufConfigProvider } from '../services/bufConfig';
import { logger } from '../utils/logger';

export function collectAncestorDirectories(
  directory: string,
  dirname: (value: string) => string = path.dirname
): string[] {
  const ancestors: string[] = [];
  let current = directory;
  while (current && current !== '.') {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    ancestors.push(current);
    current = parent;
  }
  return ancestors;
}

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
    importResolutions: new Map(),
  };

  private readonly fileSymbols = new Map<string, Map<string, SymbolInfo>>();
  private readonly missingImportResolutions = new Set<string>();
  private readonly visibleFileUrisCache = new Map<string, string[]>();
  private readonly normalizedUris = new Map<string, string>();

  // Configured import paths to search for proto files (e.g., from protobuf.includes setting)
  private importPaths: string[] = [];
  // Virtual path mappings (e.g., example.com/org=./) for Go-style imports
  private importPathMappings: Array<{ virtual: string; actual: string }> = [];

  // Workspace roots (from VS Code workspace folders)
  private workspaceRoots: string[] = [];

  // Detected proto roots (directories containing buf.yaml, buf.work.yaml, or being common ancestors)
  private protoRoots: Set<string> = new Set();
  private explicitProtoRoots = new Set<string>();
  private fileProtoRoots = new Map<string, string[]>();

  setImportPaths(paths: string[]): void {
    this.importPaths = paths;
    this.detectProtoRoots();
    // Clear import resolution cache when paths change to force re-resolution
    // This ensures diagnostics are updated when protobuf.includes or --proto_path changes
    this.clearImportResolutionCache();
  }

  setImportPathMappings(mappings: Array<{ virtual: string; actual: string }>): void {
    // Normalize and sort by virtual prefix length (longest first) for best match
    this.importPathMappings = mappings
      .map(mapping => ({
        virtual: mapping.virtual.replace(/\\/g, '/').replace(/\/+$/, ''),
        actual: mapping.actual.replace(/\\/g, '/').replace(/\/+$/, ''),
      }))
      .filter(mapping => mapping.virtual.length > 0 && mapping.actual.length > 0)
      .sort((a, b) => b.virtual.length - a.virtual.length);

    this.clearImportResolutionCache();
  }

  /** Import resolution always depends on the importing file and its roots. */
  private getImportCacheKey(sourceUri: string, importPath: string): string {
    return `${sourceUri}|||${importPath}`;
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots.map(r => r.replace(/\\/g, '/'));
    this.resetProtoRoots();
  }

  /** Discard root hints after workspace changes; retain current file/include roots. */
  resetProtoRoots(): void {
    this.explicitProtoRoots.clear();
    this.detectProtoRoots();
    this.clearImportResolutionCache();
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
    this.explicitProtoRoots.add(normalizedRoot);
    if (!this.protoRoots.has(normalizedRoot)) {
      this.protoRoots.add(normalizedRoot);
      this.clearImportResolutionCache();
    }
    logger.verbose(`Added proto root: ${normalizedRoot}`);
  }

  updateFile(uri: string, file: ProtoFile): void {
    this.clearImportResolutionCache();
    this.fileProtoRoots.delete(uri);
    // Remove old symbols for this file
    this.removeFileSymbols(uri);

    // Store file
    this.workspace.files.set(uri, file);

    // Extract and store imports
    const importPaths = file.imports.map(i => i.path);
    this.workspace.imports.set(uri, importPaths);

    // Update proto roots from buf.yaml if available
    try {
      const filePath = this.normalizeUri(uri).replace('file://', '');
      const bufRoots = bufConfigProvider.getProtoRoots(filePath);
      const workDirs = bufConfigProvider.getWorkDirectories(filePath);
      this.fileProtoRoots.set(uri, [...bufRoots, ...workDirs]);
    } catch {
      // Ignore errors
    }

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

    // Keep proto root hints up to date for import resolution
    this.detectProtoRoots();
  }

  /**
   * Normalize a URI for consistent comparison
   */
  private normalizeUri(uri: string): string {
    const cached = this.normalizedUris.get(uri);
    if (cached !== undefined) {
      return cached;
    }
    const normalized = uri.startsWith('file://')
      ? `file://${URI.parse(uri).fsPath.replace(/\\/g, '/')}`
      : uri.replace(/\\/g, '/');
    this.normalizedUris.set(uri, normalized);
    return normalized;
  }

  /**
   * Apply virtual path mappings to an import path (e.g., module path -> local directory)
   */
  private applyPathMappings(importPath: string): string | undefined {
    if (this.importPathMappings.length === 0) {
      return undefined;
    }

    const normalizedImport = importPath.replace(/\\/g, '/');

    for (const mapping of this.importPathMappings) {
      const virtual = mapping.virtual;
      if (normalizedImport === virtual || normalizedImport.startsWith(`${virtual}/`)) {
        const suffix = normalizedImport.slice(virtual.length).replace(/^\//, '');
        const mappedPath = path.posix.join(mapping.actual.replace(/\\/g, '/'), suffix).replace(/\\/g, '/');
        return mappedPath;
      }
    }

    return undefined;
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
    if (this.missingImportResolutions.has(cacheKey)) {
      return undefined;
    }

    const normalizedImport = importPath.replace(/\\/g, '/');

    // Strategy 1.5: Virtual path mappings (e.g., module path -> local directory)
    const mappedPath = this.applyPathMappings(normalizedImport);
    if (mappedPath) {
      const mappedUri = 'file://' + mappedPath;
      for (const [fileUri] of this.workspace.files) {
        const normalizedFileUri = this.normalizeUri(fileUri);
        if (normalizedFileUri === mappedUri || normalizedFileUri.endsWith('/' + mappedPath.replace(/^\//, ''))) {
          this.workspace.importResolutions.set(cacheKey, fileUri);
          return fileUri;
        }
      }
    }

    // Strategy 2: Relative path from current file
    const currentPath = this.normalizeUri(currentUri).replace('file://', '');
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
    const workspaceRoots = [...this.workspaceRoots].sort((left, right) => {
      const containsCurrent = (root: string) =>
        currentPath === root || currentPath.startsWith(`${root.replace(/\/$/, '')}/`);
      return Number(containsCurrent(right)) - Number(containsCurrent(left));
    });
    for (const workspaceRoot of workspaceRoots) {
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

      // Match the complete import path at a directory boundary. A substring
      // match would accept names such as "common.proto.generated.proto".
      const importPathWithSlash = '/' + normalizedImport;
      if (uriPath.endsWith(importPathWithSlash)) {
        this.workspace.importResolutions.set(cacheKey, fileUri);
        return fileUri;
      }
    }

    this.missingImportResolutions.add(cacheKey);
    return undefined;
  }

  /**
   * Detect proto roots from workspace files
   * Proto roots are directories that serve as the base for absolute imports
   */
  detectProtoRoots(): void {
    const previousRoots = this.protoRoots;
    this.protoRoots = new Set([
      ...this.importPaths,
      ...this.explicitProtoRoots,
      ...Array.from(this.fileProtoRoots.values()).flat(),
    ]);
    // Find common parent directories that could be proto roots
    const allPaths: string[] = [];
    for (const [fileUri] of this.workspace.files) {
      const filePath = this.normalizeUri(fileUri).replace('file://', '');
      allPaths.push(path.dirname(filePath));
    }

    // Add unique parent directories as potential proto roots
    const seen = new Set<string>();
    for (const p of allPaths) {
      for (const current of collectAncestorDirectories(p)) {
        if (!seen.has(current)) {
          seen.add(current);
          this.protoRoots.add(current);
        }
      }
    }
    if (previousRoots.size !== this.protoRoots.size || [...previousRoots].some(root => !this.protoRoots.has(root))) {
      this.clearImportResolutionCache();
    }
  }

  removeFile(uri: string): void {
    this.removeFileSymbols(uri);
    this.workspace.files.delete(uri);
    this.workspace.imports.delete(uri);
    this.fileProtoRoots.delete(uri);
    this.normalizedUris.delete(uri);
    this.clearImportResolutionCache();
    this.detectProtoRoots();
  }

  /**
   * Clear all cached import resolutions.
   * Call this when files are renamed or deleted to force re-resolution.
   */
  clearImportResolutionCache(): void {
    this.workspace.importResolutions.clear();
    this.missingImportResolutions.clear();
    this.visibleFileUrisCache.clear();
  }

  private registerSymbol(key: string, symbol: SymbolInfo): void {
    this.workspace.symbols.set(key, symbol);
    let symbols = this.fileSymbols.get(symbol.location.uri);
    if (!symbols) {
      symbols = new Map();
      this.fileSymbols.set(symbol.location.uri, symbols);
    }
    symbols.set(symbol.fullName, symbol);
  }

  private removeFileSymbols(uri: string): void {
    this.fileSymbols.delete(uri);
    for (const [name, symbol] of this.workspace.symbols) {
      if (symbol.location.uri === uri) {
        this.workspace.symbols.delete(name);
      }
    }
    // Removing an indexed copy must reveal any remaining declaration with the
    // same name instead of making that other file disappear from the workspace.
    for (const symbols of this.fileSymbols.values()) {
      for (const symbol of symbols.values()) {
        if (!this.workspace.symbols.has(symbol.fullName)) {
          this.workspace.symbols.set(symbol.fullName, symbol);
        }
        if (
          (symbol.kind === SymbolKind.Message || symbol.kind === SymbolKind.Enum) &&
          !this.workspace.symbols.has(symbol.name)
        ) {
          this.workspace.symbols.set(symbol.name, symbol);
        }
      }
    }
  }

  private extractMessageSymbols(uri: string, message: MessageDefinition, prefix: string): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    this.registerSymbol(fullName, {
      name: message.name,
      fullName,
      kind: SymbolKind.Message,
      location: { uri, range: message.nameRange },
      containerName: prefix || undefined,
    });

    // Also register by simple name for easier lookup
    if (!this.workspace.symbols.has(message.name)) {
      this.registerSymbol(message.name, {
        name: message.name,
        fullName,
        kind: SymbolKind.Message,
        location: { uri, range: message.nameRange },
        containerName: prefix || undefined,
      });
    }

    // Extract fields
    for (const field of message.fields) {
      this.registerSymbol(`${fullName}.${field.name}`, {
        name: field.name,
        fullName: `${fullName}.${field.name}`,
        kind: SymbolKind.Field,
        location: { uri, range: field.nameRange },
        containerName: fullName,
      });
    }

    // Extract oneofs
    for (const oneof of message.oneofs) {
      this.registerSymbol(`${fullName}.${oneof.name}`, {
        name: oneof.name,
        fullName: `${fullName}.${oneof.name}`,
        kind: SymbolKind.Oneof,
        location: { uri, range: oneof.nameRange },
        containerName: fullName,
      });

      for (const field of oneof.fields) {
        this.registerSymbol(`${fullName}.${field.name}`, {
          name: field.name,
          fullName: `${fullName}.${field.name}`,
          kind: SymbolKind.Field,
          location: { uri, range: field.nameRange },
          containerName: fullName,
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
      this.registerSymbol(groupFullName, {
        name: group.name,
        fullName: groupFullName,
        kind: SymbolKind.Message,
        location: { uri, range: group.nameRange },
        containerName: fullName,
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

    this.registerSymbol(fullName, {
      name: enumDef.name,
      fullName,
      kind: SymbolKind.Enum,
      location: { uri, range: enumDef.nameRange },
      containerName: prefix || undefined,
    });

    // Also register by simple name for easier lookup
    if (!this.workspace.symbols.has(enumDef.name)) {
      this.registerSymbol(enumDef.name, {
        name: enumDef.name,
        fullName,
        kind: SymbolKind.Enum,
        location: { uri, range: enumDef.nameRange },
        containerName: prefix || undefined,
      });
    }

    // Extract enum values
    for (const value of enumDef.values) {
      this.registerSymbol(`${fullName}.${value.name}`, {
        name: value.name,
        fullName: `${fullName}.${value.name}`,
        kind: SymbolKind.EnumValue,
        location: { uri, range: value.nameRange },
        containerName: fullName,
      });
    }
  }

  private extractServiceSymbols(uri: string, service: ServiceDefinition, prefix: string): void {
    const fullName = prefix ? `${prefix}.${service.name}` : service.name;

    this.registerSymbol(fullName, {
      name: service.name,
      fullName,
      kind: SymbolKind.Service,
      location: { uri, range: service.nameRange },
      containerName: prefix || undefined,
    });

    // Extract RPCs
    for (const rpc of service.rpcs) {
      this.registerSymbol(`${fullName}.${rpc.name}`, {
        name: rpc.name,
        fullName: `${fullName}.${rpc.name}`,
        kind: SymbolKind.Rpc,
        location: { uri, range: rpc.nameRange },
        containerName: fullName,
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
    return Array.from(this.fileSymbols.values()).flatMap(symbols => Array.from(symbols.values()));
  }

  /**
   * Returns imports for a file along with their resolution status.
   */
  getImportsWithResolutions(uri: string): { importPath: string; resolvedUri?: string; isResolved: boolean }[] {
    const imports = this.workspace.imports.get(uri) || [];
    return imports.map(importPath => {
      const cacheKey = this.getImportCacheKey(uri, importPath);
      const resolvedUri = this.workspace.importResolutions.get(cacheKey) ?? this.resolveImportPath(uri, importPath);
      return { importPath, resolvedUri, isResolved: !!resolvedUri };
    });
  }

  /**
   * Get the MessageDefinition for a fully qualified symbol name (package + nested names)
   */
  getMessageDefinition(fullName: string, uri?: string): MessageDefinition | undefined {
    for (const [fileUri, file] of this.workspace.files) {
      if (uri && fileUri !== uri) {
        continue;
      }
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
  getEnumDefinition(fullName: string, uri?: string): EnumDefinition | undefined {
    for (const [fileUri, file] of this.workspace.files) {
      if (uri && fileUri !== uri) {
        continue;
      }
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
    return Array.from(this.fileSymbols.get(uri)?.values() ?? []);
  }

  /**
   * Get the imported file URIs for a given file
   */
  getImportedFileUris(uri: string): string[] {
    const imports = this.workspace.imports.get(uri) || [];
    const resolvedUris: string[] = [];

    for (const importPath of imports) {
      const cacheKey = this.getImportCacheKey(uri, importPath);
      const resolvedUri = this.workspace.importResolutions.get(cacheKey) ?? this.resolveImportPath(uri, importPath);
      if (resolvedUri) {
        resolvedUris.push(resolvedUri);
      } else {
        logger.verbose(`Import not resolved: "${importPath}" from ${uri}`);
      }
    }

    logger.verbose(
      `getImportedFileUris for ${uri}: imports=${JSON.stringify(imports)}, resolved=${resolvedUris.length}`
    );
    return resolvedUris;
  }

  /**
   * Get symbols accessible from a file (including imports)
   */
  getAccessibleSymbols(uri: string): SymbolInfo[] {
    return this.getVisibleFileUris(uri).flatMap(visibleUri => this.getSymbolsInFile(visibleUri));
  }

  /** Files visible through direct imports and chains of public re-exports. */
  getVisibleFileUris(uri: string, includePrivateDirectImports = true): string[] {
    const cacheKey = `${includePrivateDirectImports ? 'all' : 'public'}|||${uri}`;
    const cached = this.visibleFileUrisCache.get(cacheKey);
    if (cached) {
      return [...cached];
    }
    const visible = new Set<string>([uri]);
    const visit = (importedUri: string): void => {
      if (visible.has(importedUri)) {
        return;
      }
      visible.add(importedUri);
      const file = this.workspace.files.get(importedUri);
      for (const statement of file?.imports ?? []) {
        if (statement.modifier === 'public') {
          const reexported = this.resolveImportToUri(importedUri, statement.path);
          if (reexported) {
            visit(reexported);
          }
        }
      }
    };
    for (const statement of this.workspace.files.get(uri)?.imports ?? []) {
      if (includePrivateDirectImports || statement.modifier === 'public') {
        const importedUri = this.resolveImportToUri(uri, statement.path);
        if (importedUri) {
          visit(importedUri);
        }
      }
    }
    const result = Array.from(visible);
    this.visibleFileUrisCache.set(cacheKey, result);
    return [...result];
  }

  /** Resolve types from the innermost lexical scope through the root scope. */
  resolveType(typeName: string, currentUri: string, currentPackage?: string): SymbolInfo | undefined {
    if (BUILTIN_TYPES.includes(typeName)) {
      return undefined;
    }
    const visibleUris = this.getVisibleFileUris(currentUri);
    const importedUris = visibleUris.filter(uri => uri !== currentUri);
    if (typeName.startsWith('.')) {
      return this.findTypeInAccessibleFilesByFullName(typeName.slice(1), currentUri, importedUris);
    }

    let scope = currentPackage ?? this.workspace.files.get(currentUri)?.package?.name ?? '';
    const firstPart = typeName.split('.')[0]!;
    const accessibleSymbols = visibleUris.flatMap(uri => this.getSymbolsInFile(uri));
    while (true) {
      const candidate = scope ? `${scope}.${typeName}` : typeName;
      const symbol = this.findTypeInAccessibleFilesByFullName(candidate, currentUri, importedUris);
      if (symbol) {
        return symbol;
      }
      // Once the first component resolves, protobuf does not retry a compound
      // name in an outer scope when its remaining components are absent.
      const firstCandidate = scope ? `${scope}.${firstPart}` : firstPart;
      if (
        accessibleSymbols.some(
          symbol => symbol.fullName === firstCandidate || symbol.fullName.startsWith(`${firstCandidate}.`)
        )
      ) {
        return undefined;
      }
      if (!scope) {
        return undefined;
      }
      scope = scope.includes('.') ? scope.slice(0, scope.lastIndexOf('.')) : '';
    }
  }

  private findTypeInAccessibleFilesByFullName(
    fullName: string,
    currentUri: string,
    importedUris: string[]
  ): SymbolInfo | undefined {
    const currentFileSymbol = this.findTypeInFileByFullName(currentUri, fullName);
    if (currentFileSymbol) {
      return currentFileSymbol;
    }

    for (const importedUri of importedUris) {
      const importedFileSymbol = this.findTypeInFileByFullName(importedUri, fullName);
      if (importedFileSymbol) {
        return importedFileSymbol;
      }
    }

    return undefined;
  }

  private findTypeInFileByFullName(uri: string, fullName: string): SymbolInfo | undefined {
    const file = this.workspace.files.get(uri);
    if (!file) {
      return undefined;
    }

    const packageName = file.package?.name || '';

    for (const message of file.messages) {
      const symbol = this.findMessageSymbolByFullName(uri, message, packageName, fullName);
      if (symbol) {
        return symbol;
      }
    }

    for (const enumDef of file.enums) {
      const symbol = this.findEnumSymbolByFullName(uri, enumDef, packageName, fullName);
      if (symbol) {
        return symbol;
      }
    }

    return undefined;
  }

  private findMessageSymbolByFullName(
    uri: string,
    message: MessageDefinition,
    prefix: string,
    targetFullName: string
  ): SymbolInfo | undefined {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;
    if (fullName === targetFullName) {
      return {
        name: message.name,
        fullName,
        kind: SymbolKind.Message,
        location: { uri, range: message.nameRange },
        containerName: prefix || undefined,
      };
    }

    for (const nested of message.nestedMessages) {
      const symbol = this.findMessageSymbolByFullName(uri, nested, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    for (const nested of message.nestedEnums) {
      const symbol = this.findEnumSymbolByFullName(uri, nested, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    for (const group of message.groups) {
      const symbol = this.findGroupSymbolByFullName(uri, group, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    return undefined;
  }

  private findGroupSymbolByFullName(
    uri: string,
    group: GroupFieldDefinition,
    prefix: string,
    targetFullName: string
  ): SymbolInfo | undefined {
    const fullName = prefix ? `${prefix}.${group.name}` : group.name;
    if (fullName === targetFullName) {
      return {
        name: group.name,
        fullName,
        kind: SymbolKind.Message,
        location: { uri, range: group.nameRange },
        containerName: prefix || undefined,
      };
    }

    for (const nested of group.nestedMessages) {
      const symbol = this.findMessageSymbolByFullName(uri, nested, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    for (const nested of group.nestedEnums) {
      const symbol = this.findEnumSymbolByFullName(uri, nested, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    for (const nestedGroup of group.groups) {
      const symbol = this.findGroupSymbolByFullName(uri, nestedGroup, fullName, targetFullName);
      if (symbol) {
        return symbol;
      }
    }

    return undefined;
  }

  private findEnumSymbolByFullName(
    uri: string,
    enumDef: EnumDefinition,
    prefix: string,
    targetFullName: string
  ): SymbolInfo | undefined {
    const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;
    if (fullName !== targetFullName) {
      return undefined;
    }

    return {
      name: enumDef.name,
      fullName,
      kind: SymbolKind.Enum,
      location: { uri, range: enumDef.nameRange },
      containerName: prefix || undefined,
    };
  }

  /**
   * Helper to find a nested type within a message definition
   */

  /**
   * Find all references to a symbol
   */
  findReferences(symbolName: string, fullyQualifiedName?: string, definitionUri?: string): Location[] {
    const references: Location[] = [];

    for (const [uri, file] of this.workspace.files) {
      const packageName = file.package?.name || '';

      // Search in messages
      for (const message of file.messages) {
        this.findReferencesInMessage(
          uri,
          message,
          symbolName,
          packageName,
          references,
          fullyQualifiedName,
          definitionUri
        );
      }

      // Search in services
      for (const service of file.services) {
        this.findReferencesInService(uri, service, symbolName, references, fullyQualifiedName, definitionUri);
      }

      // Search in extends
      for (const extend of file.extends) {
        const extendTypeName = extend.extendType ?? extend.messageName;
        const extendTypeRange = extend.extendTypeRange ?? extend.messageNameRange;

        if (
          extendTypeName &&
          this.matchesSymbolInContext(extendTypeName, symbolName, fullyQualifiedName, uri, packageName, definitionUri)
        ) {
          if (extendTypeRange) {
            references.push({ uri, range: extendTypeRange });
          }
        }
        for (const field of extend.fields) {
          if (
            this.matchesSymbolInContext(
              field.fieldType,
              symbolName,
              fullyQualifiedName,
              uri,
              packageName,
              definitionUri
            )
          ) {
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
    fullyQualifiedName?: string,
    definitionUri?: string
  ): void {
    const fullName = prefix ? `${prefix}.${message.name}` : message.name;

    // Check fields
    for (const field of message.fields) {
      if (this.matchesSymbolInContext(field.fieldType, symbolName, fullyQualifiedName, uri, fullName, definitionUri)) {
        references.push({ uri, range: field.fieldTypeRange });
      }
    }

    // Check map fields
    for (const mapField of message.maps) {
      if (
        this.matchesSymbolInContext(mapField.valueType, symbolName, fullyQualifiedName, uri, fullName, definitionUri)
      ) {
        references.push({ uri, range: mapField.valueTypeRange });
      }
    }

    // Check oneofs
    for (const oneof of message.oneofs) {
      for (const field of oneof.fields) {
        if (
          this.matchesSymbolInContext(field.fieldType, symbolName, fullyQualifiedName, uri, fullName, definitionUri)
        ) {
          references.push({ uri, range: field.fieldTypeRange });
        }
      }
    }

    // Check nested messages
    for (const nested of message.nestedMessages) {
      this.findReferencesInMessage(uri, nested, symbolName, fullName, references, fullyQualifiedName, definitionUri);
    }
  }

  private findReferencesInService(
    uri: string,
    service: ServiceDefinition,
    symbolName: string,
    references: Location[],
    fullyQualifiedName?: string,
    definitionUri?: string
  ): void {
    // Get the file's package for context
    const file = this.workspace.files.get(uri);
    const packageName = file?.package?.name || '';

    for (const rpc of service.rpcs) {
      const inputType = rpc.requestType ?? rpc.inputType;
      const inputTypeRange = rpc.requestTypeRange ?? rpc.inputTypeRange;
      const outputType = rpc.responseType ?? rpc.outputType;
      const outputTypeRange = rpc.responseTypeRange ?? rpc.outputTypeRange;

      if (
        inputType &&
        this.matchesSymbolInContext(inputType, symbolName, fullyQualifiedName, uri, packageName, definitionUri)
      ) {
        if (inputTypeRange) {
          references.push({ uri, range: inputTypeRange });
        }
      }
      if (
        outputType &&
        this.matchesSymbolInContext(outputType, symbolName, fullyQualifiedName, uri, packageName, definitionUri)
      ) {
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
    currentScope: string,
    definitionUri?: string
  ): boolean {
    // If no fully qualified name provided, fall back to simple matching
    if (!fullyQualifiedName) {
      return this.matchesSymbol(typeName, symbolName, fullyQualifiedName);
    }

    // Dotted names may still be relative (for example Outer.Inner inside a
    // package), so resolve all references in their containing scope.
    const resolved = this.resolveType(typeName, uri, currentScope);
    if (resolved) {
      return resolved.fullName === fullyQualifiedName && (!definitionUri || resolved.location.uri === definitionUri);
    }

    // If resolution failed, it might be an unimported type - don't match
    return false;
  }

  private matchesSymbol(typeName: string, symbolName: string, fullyQualifiedName?: string): boolean {
    if (fullyQualifiedName) {
      if (
        typeName === fullyQualifiedName ||
        fullyQualifiedName.endsWith(`.${typeName}`) ||
        typeName.endsWith(`.${fullyQualifiedName}`)
      ) {
        return true;
      }
    }

    return typeName === symbolName || typeName.endsWith(`.${symbolName}`) || symbolName.endsWith(`.${typeName}`);
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
      if ((symbol.kind === SymbolKind.Message || symbol.kind === SymbolKind.Enum) && !seenNames.has(symbol.fullName)) {
        completions.push(symbol);
        seenNames.add(symbol.fullName);
      }
    }

    // Also add all workspace symbols for discoverability
    for (const symbol of this.workspace.symbols.values()) {
      if ((symbol.kind === SymbolKind.Message || symbol.kind === SymbolKind.Enum) && !seenNames.has(symbol.fullName)) {
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
    return Array.from(this.workspace.symbols.values()).filter(s => s.kind === SymbolKind.Message);
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

    const currentPath = this.normalizeUri(currentUri).replace('file://', '');
    const targetPath = this.normalizeUri(targetUri).replace('file://', '');

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

    // Path mappings (virtual import prefix -> local directory)
    for (const mapping of this.importPathMappings) {
      const actual = mapping.actual.replace(/\\/g, '/');
      if (targetPath.startsWith(`${actual}/`)) {
        const relPath = path.posix.relative(actual, targetPath);
        const virtual = mapping.virtual.replace(/\\/g, '/').replace(/\/+$/, '');
        const mappedPath = relPath ? `${virtual}/${relPath}` : virtual;
        candidates.push({ path: mappedPath, source: 'path-mapping' });
      }
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
    const cleaned = candidates.map(c => ({ ...c, path: c.path.replace(/\\/g, '/') })).filter(c => c.path);

    // Remove duplicates, keeping the first occurrence
    const seen = new Set<string>();
    const unique = cleaned.filter(c => {
      if (seen.has(c.path)) {
        return false;
      }
      seen.add(c.path);
      return true;
    });

    // Sort by priority: path-mapping > import-path > forward-relative > workspace-root > others
    // Secondary sort by path length (shorter is better)
    const sorted = unique.sort((a, b) => {
      // Define priority order
      const priorityOrder = [
        'path-mapping',
        'import-path',
        'forward-relative',
        'basename',
        'workspace-root',
        'parent-relative',
      ];
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

  private findEnumDefinition(enums: EnumDefinition[], prefix: string, target: string): EnumDefinition | undefined {
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
