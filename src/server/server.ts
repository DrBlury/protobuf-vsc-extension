/**
 * Protocol Buffers Language Server
 * Main server implementation
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  TextDocumentPositionParams,
  DefinitionParams,
  ReferenceParams,
  DocumentFormattingParams,
  DocumentRangeFormattingParams,
  HoverParams,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  FoldingRangeParams,
  FoldingRange,
  FoldingRangeKind,
  DidChangeConfigurationNotification,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesParams,
  FileChangeType,
  RenameParams,
  PrepareRenameParams,
  CodeActionParams,
  CodeAction,
  TextEdit
} from 'vscode-languageserver/node';

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { URI } from 'vscode-uri';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Core functionality
import { ProtoParser } from './core/parser';
import { SemanticAnalyzer } from './core/analyzer';
import {
  MessageDefinition,
  EnumDefinition,
  ProtoFile,
  Range as AstRange,
  OptionStatement,
  ServiceDefinition,
  FieldDefinition,
  RpcDefinition
} from './core/ast';

// Providers and services are now managed through ProviderRegistry

// Utilities
import { logger, LogLevel } from './utils/logger';
import {
  PROTOC_INCLUDE_PATHS,
  GOOGLE_WELL_KNOWN_TEST_FILE,
  REQUEST_METHODS,
  DIAGNOSTIC_SOURCE,
  ERROR_CODES,
  TIMING,
  DEFAULT_POSITIONS
} from './utils/constants';
import { normalizePath, getErrorMessage } from './utils/utils';
import { Settings, defaultSettings } from './utils/types';
import { GOOGLE_WELL_KNOWN_FILES, GOOGLE_WELL_KNOWN_PROTOS } from './utils/googleWellKnown';
import { scanWorkspaceForProtoFiles, scanImportPaths } from './utils/workspace';
import { updateProvidersWithSettings } from './utils/configManager';
import { debounce } from './utils/debounce';
import { ContentHashCache, simpleHash } from './utils/cache';
import { ProviderRegistry } from './utils/providerRegistry';
import { refreshDocumentAndImports } from './utils/documentRefresh';
import { handleCompletion, handleHover } from './handlers';

// Shared types
import { SchemaGraphRequest } from '../shared/schemaGraph';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Initialize logger - will be updated when settings are loaded
logger.initialize(connection, LogLevel.INFO, false);

// Capture unexpected errors so the server doesn't silently die
process.on('uncaughtException', err => {
  logger.errorWithContext('Uncaught exception', { error: err });
});

process.on('unhandledRejection', reason => {
  logger.errorWithContext('Unhandled rejection', { error: reason });
});

// Create provider registry (manages all providers and their lifecycle)
const providers = new ProviderRegistry();

// Configuration
let hasConfigurationCapability = false;
let wellKnownCacheDir: string | undefined;

// Try to find real well-known proto includes (protoc install) so navigation
// can open the actual files; fall back to bundled stubs if not found.
const wellKnownIncludePath = discoverWellKnownIncludePath();

// Initialization options from client will set wellKnownCacheDir later; we still
// seed import paths with discovered include early.
if (wellKnownIncludePath) {
  providers.analyzer.setImportPaths([wellKnownIncludePath]);
}


let globalSettings: Settings = defaultSettings;
let workspaceFolders: string[] = [];

// Cache for parsed files to avoid re-parsing unchanged content
const parsedFileCache = new ContentHashCache<ProtoFile>();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);

  // Capture cache path from client initialization options
  const initOpts = params.initializationOptions as { wellKnownCachePath?: string } | undefined;
  if (initOpts?.wellKnownCachePath) {
    wellKnownCacheDir = initOpts.wellKnownCachePath;
  }

  // Store workspace folders for scanning
  if (params.workspaceFolders) {
    workspaceFolders = params.workspaceFolders.map((folder: { uri: string; name: string }) =>
      normalizePath(URI.parse(folder.uri).fsPath)
    );
  } else if (params.rootUri) {
    workspaceFolders = [normalizePath(URI.parse(params.rootUri).fsPath)];
  } else if (params.rootPath) {
    workspaceFolders = [normalizePath(params.rootPath)];
  }

  // Set workspace roots for providers
  providers.setWorkspaceRoots(workspaceFolders);

  // If cache dir is available, add it to import paths so built-in files can be resolved
  const importPaths: string[] = [];
  if (wellKnownIncludePath) {
    importPaths.push(wellKnownIncludePath);
  }
  if (wellKnownCacheDir) {
    importPaths.push(wellKnownCacheDir);
  }
  if (importPaths.length > 0) {
    providers.analyzer.setImportPaths(importPaths);
  }

  // Preload Google well-known protos after we know cache/include paths so
  // go-to-definition uses real file URIs where possible.
  preloadGoogleWellKnownProtos(wellKnownIncludePath, providers.parser, providers.analyzer);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '"', '<', ' ']
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      foldingRangeProvider: true,
      renameProvider: {
        prepareProvider: true
      },
      codeActionProvider: {
        codeActionKinds: [
          'quickfix',
          'refactor',
          'refactor.extract',
          'refactor.rewrite',
          'source.organizeImports'
        ]
      },
      codeLensProvider: {
        resolveProvider: false
      },
      documentLinkProvider: {
        resolveProvider: false
      }
    }
  };
});

connection.onExit(() => {
  logger.info('Language server process exiting');
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  // Scan workspace for proto files on initialization
  scanWorkspaceForProtoFiles(workspaceFolders, providers.parser, providers.analyzer);
});


/**
 * Add minimal built-in definitions for Google well-known protos.
 * This avoids "Unknown type google.protobuf.*" when users import them
 * without having the source files in their workspace.
 */
function preloadGoogleWellKnownProtos(
  discoveredIncludePath: string | undefined,
  _parser: ProtoParser,
  _analyzer: SemanticAnalyzer
): void {
  const resourcesRoot = path.join(__dirname, '..', '..', 'resources');

  for (const [importPath, fallbackContent] of Object.entries(GOOGLE_WELL_KNOWN_PROTOS)) {
    const relativePath = GOOGLE_WELL_KNOWN_FILES[importPath];

    // Order: discovered include path (user/system protoc), bundled resource, inline fallback
    const fromDiscovered = discoveredIncludePath
      ? path.join(discoveredIncludePath, importPath)
      : undefined;
    const fromResource = relativePath ? path.join(resourcesRoot, relativePath) : undefined;
    const fromCache = wellKnownCacheDir ? path.join(wellKnownCacheDir, importPath) : undefined;

    const firstExisting = [fromDiscovered, fromResource, fromCache].find(
      p => p && fs.existsSync(p)
    );

    let filePath = firstExisting;
    let content = filePath ? fs.readFileSync(filePath, 'utf-8') : fallbackContent;

    // If nothing exists yet but we have a cache dir, materialize the fallback into cache
    if (!filePath && fromCache) {
      try {
        fs.mkdirSync(path.dirname(fromCache), { recursive: true });
        fs.writeFileSync(fromCache, fallbackContent, 'utf-8');
        filePath = fromCache;
        content = fallbackContent;
      } catch (e) {
        logger.errorWithContext('Failed to write well-known cache', {
          uri: fromCache,
          error: e
        });
      }
    }

    const uri = filePath
      ? pathToFileURL(filePath).toString()
      : `builtin:///${importPath}`;

    try {
        const file = providers.parser.parse(content, uri);
        providers.analyzer.updateFile(uri, file);
    } catch (e) {
      logger.errorWithContext('Failed to preload well-known proto', {
        uri: importPath,
        error: e
      });
    }
  }
}

/**
 * Locate a protoc include directory that contains google/protobuf/timestamp.proto.
 * Checks env hint then common install locations.
 */
function discoverWellKnownIncludePath(): string | undefined {
  const candidates: string[] = [];

  if (process.env.PROTOC_INCLUDE) {
    candidates.push(...process.env.PROTOC_INCLUDE.split(path.delimiter));
  }

  candidates.push(...PROTOC_INCLUDE_PATHS);

  for (const base of candidates) {
    if (!base) {
      continue;
    }
    const testPath = path.join(base, GOOGLE_WELL_KNOWN_TEST_FILE);
    if (fs.existsSync(testPath)) {
      logger.debug(`Discovered protoc include path: ${base}`);
      return base;
    }
  }

  return undefined;
}

// Handle file changes from workspace file watcher
connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    const uri = change.uri;
    if (uri.endsWith('.proto')) {
      if (change.type === FileChangeType.Deleted) {
        providers.analyzer.removeFile(uri);
        parsedFileCache.delete(uri);
        logger.verboseWithContext('File deleted, removed from cache and analyzer', { uri });
      } else {
        // File created or changed - try to read and parse it
        try {
          const filePath = URI.parse(uri).fsPath;
          const content = fs.readFileSync(filePath, 'utf-8');
          const contentHash = simpleHash(content);

          // Check cache first
          const cachedFile = parsedFileCache.get(uri, contentHash);
          if (!cachedFile) {
            const file = providers.parser.parse(content, uri);
            parsedFileCache.set(uri, file, contentHash);
            providers.analyzer.updateFile(uri, file);
            logger.verboseWithContext('File changed, parsed and cached', { uri });
          } else {
            providers.analyzer.updateFile(uri, cachedFile);
            logger.verboseWithContext('File changed but content unchanged, using cache', { uri });
          }
        } catch (error) {
          // Clear cache on error
          parsedFileCache.delete(uri);
          logger.verboseWithContext('Failed to parse watched file change', {
            uri,
            error
          });
        }
      }
    }
  }
});

connection.onDidChangeConfiguration((change: { settings: typeof globalSettings }) => {
  if (hasConfigurationCapability) {
    // Update settings
    globalSettings = change.settings || defaultSettings;

    // Update all providers with new settings using config manager
    const userIncludePaths = updateProvidersWithSettings(
      globalSettings,
      providers.diagnostics,
      providers.formatter,
      providers.renumber,
      providers.analyzer,
      providers.protoc,
      providers.breaking,
      providers.externalLinter,
      providers.clangFormat,
      wellKnownIncludePath,
      wellKnownCacheDir,
      workspaceFolders
    );

    // Scan user-configured import paths for proto files (e.g., .buf-deps)
    if (userIncludePaths.length > 0) {
      scanImportPaths(userIncludePaths, providers.parser, providers.analyzer);
    }
  }

  // Revalidate all documents
  documents.all().forEach(validateDocument);
});

// Debounced validation to avoid excessive computation on rapid edits
const debouncedValidate = debounce<[TextDocument]>((document: TextDocument) => {
  validateDocument(document);
}, TIMING.VALIDATION_DEBOUNCE_MS);

// Document events
documents.onDidChangeContent((change: { document: TextDocument }) => {
  debouncedValidate(change.document);
});

documents.onDidClose((event: { document: TextDocument }) => {
  // Keep symbols cached so go-to-definition still works after the editor is closed
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateDocument(document: TextDocument): Promise<void> {
  const text = document.getText();
  const uri = document.uri;
  const startTime = Date.now();

  try {
    // Check cache first
    const contentHash = simpleHash(text);
    const cachedFile = parsedFileCache.get(uri, contentHash);

    let file: ProtoFile;
    if (!cachedFile) {
      // Cache miss - parse the document
      logger.verboseWithContext('Cache miss, parsing document', { uri });
      file = providers.parser.parse(text, uri);
      parsedFileCache.set(uri, file, contentHash);
    } else {
      file = cachedFile;
      logger.verboseWithContext('Using cached parse result', { uri });
    }

    // Update analyzer (always needed for symbol resolution)
    providers.analyzer.updateFile(uri, file);

    // Run diagnostics
    const diagnostics = providers.diagnostics.validate(uri, file, text);

    const duration = Date.now() - startTime;
    logger.verboseWithContext('Document validation complete', {
      uri,
      diagnosticsCount: diagnostics.length,
      duration
    });

    connection.sendDiagnostics({ uri, diagnostics });
  } catch (error) {
    // Clear cache entry on parse error
    parsedFileCache.delete(uri);

    // Send parse error as diagnostic
    const diagnostics: Diagnostic[] = [{
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: DEFAULT_POSITIONS.ERROR_START_LINE, character: DEFAULT_POSITIONS.ERROR_START_CHAR },
        end: { line: DEFAULT_POSITIONS.ERROR_START_LINE, character: DEFAULT_POSITIONS.ERROR_END_CHAR }
      },
      message: `Parse error: ${getErrorMessage(error)}`,
      source: DIAGNOSTIC_SOURCE,
      code: ERROR_CODES.PARSE_ERROR
    }];

    logger.errorWithContext('Document validation failed', {
      uri,
      error
    });

    connection.sendDiagnostics({ uri, diagnostics });
  }
}

// Completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  return handleCompletion(params, documents, providers.completion);
});

// Hover
connection.onHover((params: HoverParams) => {
  return handleHover(params, documents, providers.hover);
});

// Definition
connection.onDefinition((params: DefinitionParams) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const lines = document.getText().split('\n');
    const lineText = lines[params.position.line] || '';

    const identifier = extractIdentifierAtPosition(lineText, params.position.character);

    // Refresh analyzer state for this document and its open imports to avoid stale symbols
    const touchedUris = refreshDocumentAndImports(
      params.textDocument.uri,
      documents,
      providers.parser,
      providers.analyzer,
      parsedFileCache
    );

    // Log incoming definition request for diagnostics
    logger.debug(
      `Definition request: uri=${params.textDocument.uri} line=${params.position.line} char=${params.position.character} identifier=${identifier || '<none>'}`
    );

    const result = providers.definition.getDefinition(
      params.textDocument.uri,
      params.position,
      lineText
    );

    if (result) {
      const locations = Array.isArray(result) ? result : [result];
      for (const loc of locations) {
        logger.debug(`Definition resolved: ${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`);
      }
    } else {
        logger.debug(`Definition resolved: null (symbols=${providers.analyzer.getAllSymbols().length}, touched=${touchedUris.length})`);
    }
    return result;
  } catch (error) {
    logger.errorWithContext('Definition handler failed', {
      uri: params.textDocument.uri,
      position: params.position,
      error
    });
    return null;
  }
});

/**
 * Extracts an identifier (word) at the given character position in a line.
 * Handles protobuf identifiers which may contain letters, numbers, underscores, and dots.
 *
 * @param line - The line of text to search in
 * @param character - The character position to extract the identifier from
 * @returns The extracted identifier, or null if no identifier is found at the position
 */
function extractIdentifierAtPosition(line: string, character: number): string | null {
  const isIdentifierChar = (ch: string): boolean => /[a-zA-Z0-9_.]/.test(ch) || ch === '_';

  let startIndex = character;
  let endIndex = character;

  // If cursor is at a non-identifier character but immediately after one, move back
  if (startIndex > 0 && !isIdentifierChar(line[startIndex]) && isIdentifierChar(line[startIndex - 1])) {
    startIndex -= 1;
    endIndex = startIndex;
  }

  // Expand backwards to find the start of the identifier
  while (startIndex > 0 && isIdentifierChar(line[startIndex - 1])) {
    startIndex--;
  }

  // Expand forwards to find the end of the identifier
  while (endIndex < line.length && isIdentifierChar(line[endIndex])) {
    endIndex++;
  }

  if (startIndex === endIndex) {
    return null;
  }

  // Remove trailing dots (handles cases like "package.Type.")
  return line.substring(startIndex, endIndex).replace(/\.+$/g, '');
}

// References
connection.onReferences((params: ReferenceParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return providers.references.findReferences(
    params.textDocument.uri,
    params.position,
    lineText,
    params.context.includeDeclaration
  );
});

// Document Symbols
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  return providers.symbols.getDocumentSymbols(params.textDocument.uri);
});

// Workspace Symbols
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
  return providers.symbols.getWorkspaceSymbols(params.query);
});

// Code Lens
connection.onCodeLens((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    const file = providers.parser.parse(document.getText(), params.textDocument.uri);
    return providers.codeLens.getCodeLenses(params.textDocument.uri, file);
  } catch (_e) {
    return [];
  }
});

// Document Links
connection.onDocumentLinks((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    const file = providers.parser.parse(document.getText(), params.textDocument.uri);
    return providers.documentLinks.getDocumentLinks(params.textDocument.uri, file);
  } catch (_e) {
    return [];
  }
});

// Formatting
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  if (!globalSettings.protobuf.formatterEnabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return providers.formatter.formatDocument(document.getText());
});

connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams) => {
  if (!globalSettings.protobuf.formatterEnabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return providers.formatter.formatRange(document.getText(), params.range);
});

// Folding Ranges
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const text = document.getText();
  const lines = text.split('\n');
  const ranges: FoldingRange[] = [];
  const stack: { start: number; isComment: boolean }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    // Multi-line comment start
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      stack.push({ start: lineIndex, isComment: true });
    }

    // Multi-line comment end
    if (trimmed.includes('*/') && stack.length > 0 && stack[stack.length - 1].isComment) {
      const startInfo = stack.pop()!;
      ranges.push({
        startLine: startInfo.start,
        endLine: lineIndex,
        kind: FoldingRangeKind.Comment
      });
    }

    // Block start
    if (trimmed.includes('{') && !trimmed.startsWith('//')) {
      stack.push({ start: lineIndex, isComment: false });
    }

    // Block end
    if (trimmed.includes('}') && !trimmed.startsWith('//')) {
      if (stack.length > 0 && !stack[stack.length - 1].isComment) {
        const startInfo = stack.pop()!;
        if (lineIndex > startInfo.start) {
          ranges.push({
            startLine: startInfo.start,
            endLine: lineIndex,
            kind: FoldingRangeKind.Region
          });
        }
      }
    }
  }

  return ranges;
});

// Schema graph
connection.onRequest(REQUEST_METHODS.GET_SCHEMA_GRAPH, (params: SchemaGraphRequest) => {
  const startTime = Date.now();

  // Refresh analyzer state for current document and its open imports to avoid empty graphs
  if (params.uri) {
    refreshDocumentAndImports(
      params.uri,
      documents,
      providers.parser,
      providers.analyzer,
      parsedFileCache
    );
  }

  const graph = providers.schemaGraph.buildGraph(params);
  const duration = Date.now() - startTime;

  logger.verboseWithContext('Schema graph built', {
    scope: graph.scope,
    uri: params.uri || '<none>',
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    duration
  });

  return graph;
});

// List imports with resolution status
connection.onRequest(REQUEST_METHODS.LIST_IMPORTS, (params: { uri: string }) => {
  return providers.analyzer.getImportsWithResolutions(params.uri);
});

// Custom request handlers for renumbering
connection.onRequest(REQUEST_METHODS.RENUMBER_DOCUMENT, (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  return providers.renumber.renumberDocument(document.getText(), params.uri);
});

connection.onRequest(REQUEST_METHODS.RENUMBER_MESSAGE, (params: { uri: string; messageName: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  return providers.renumber.renumberMessage(document.getText(), params.uri, params.messageName);
});

connection.onRequest(REQUEST_METHODS.RENUMBER_FROM_POSITION, (params: { uri: string; position: { line: number; character: number } }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  return providers.renumber.renumberFromField(document.getText(), params.uri, params.position);
});

connection.onRequest(REQUEST_METHODS.RENUMBER_ENUM, (params: { uri: string; enumName: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  return providers.renumber.renumberEnum(document.getText(), params.uri, params.enumName);
});

connection.onRequest(REQUEST_METHODS.GET_MESSAGES, (params: { uri: string; text?: string }) => {
  const document = documents.get(params.uri);
  const text = document?.getText() || params.text;
  if (!text) {
    return [];
  }

  const file = providers.parser.parse(text, params.uri);
  const messages: string[] = [];

  function collectMessages(msgs: MessageDefinition[], prefix: string = '') {
    for (const msg of msgs) {
      const fullName = prefix ? `${prefix}.${msg.name}` : msg.name;
      messages.push(fullName);
      if (msg.nestedMessages) {
        collectMessages(msg.nestedMessages, fullName);
      }
    }
  }

  collectMessages(file.messages);
  return messages;
});

connection.onRequest(REQUEST_METHODS.GET_ENUMS, (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  const file = providers.parser.parse(document.getText(), params.uri);
  const enums: string[] = [];

  function collectEnums(enumList: EnumDefinition[], prefix: string = '') {
    for (const enumDef of enumList) {
      const fullName = prefix ? `${prefix}.${enumDef.name}` : enumDef.name;
      enums.push(fullName);
    }
  }

  function collectFromMessages(msgs: MessageDefinition[], prefix: string = '') {
    for (const msg of msgs) {
      const fullName = prefix ? `${prefix}.${msg.name}` : msg.name;
      if (msg.nestedEnums) {
        collectEnums(msg.nestedEnums, fullName);
      }
      if (msg.nestedMessages) {
        collectFromMessages(msg.nestedMessages, fullName);
      }
    }
  }

  collectEnums(file.enums);
  collectFromMessages(file.messages);
  return enums;
});

connection.onRequest(REQUEST_METHODS.GET_MESSAGE_AT_POSITION, (params: { uri: string; position: { line: number; character: number }; text?: string }) => {
  const document = documents.get(params.uri);
  const text = document?.getText() || params.text;
  if (!text) {
    return null;
  }

  const file = providers.parser.parse(text, params.uri);

  function findMessageAtPosition(msgs: MessageDefinition[], prefix: string = ''): string | null {
    for (const msg of msgs) {
      const fullName = prefix ? `${prefix}.${msg.name}` : msg.name;
      if (isPositionInRange(params.position, msg.range)) {
        // Check nested messages first
        if (msg.nestedMessages) {
          const nested = findMessageAtPosition(msg.nestedMessages, fullName);
          if (nested) {
            return nested;
          }
        }
        return fullName;
      }
    }
    return null;
  }

  function isPositionInRange(pos: { line: number; character: number }, range: AstRange): boolean {
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

  return findMessageAtPosition(file.messages);
});

connection.onRequest(REQUEST_METHODS.GET_NEXT_FIELD_NUMBER, (params: { uri: string; messageName: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return 1;
  }

  return providers.renumber.getNextFieldNumber(document.getText(), params.uri, params.messageName);
});

// Rename - Prepare
connection.onPrepareRename((params: PrepareRenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = providers.rename.prepareRename(
    params.textDocument.uri,
    params.position,
    lineText
  );

  if (!result) {
    return null;
  }

  // Adjust range to correct line
  return {
    range: {
      start: { line: params.position.line, character: result.range.start.character },
      end: { line: params.position.line, character: result.range.end.character }
    },
    placeholder: result.placeholder
  };
});

// Rename - Execute
connection.onRenameRequest((params: RenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = providers.rename.rename(
    params.textDocument.uri,
    params.position,
    lineText,
    params.newName
  );

  if (result.changes.size === 0) {
    return null;
  }

  // Convert to WorkspaceEdit format
  const changes: { [uri: string]: TextEdit[] } = {};
  for (const [uri, edits] of result.changes) {
    changes[uri] = edits;
  }

  return { changes };
});

// Code Actions
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return providers.codeActions.getCodeActions(
    params.textDocument.uri,
    params.range,
    params.context,
    document.getText()
  );
});

// Custom request handlers for protoc compilation
connection.onRequest(REQUEST_METHODS.COMPILE_FILE, async (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return { success: false, errors: [{ message: 'Document not found' }] };
  }

  const filePath = URI.parse(params.uri).fsPath;
  return await providers.protoc.compileFile(filePath);
});

connection.onRequest(REQUEST_METHODS.COMPILE_ALL, async () => {
  return await providers.protoc.compileAll();
});

connection.onRequest(REQUEST_METHODS.VALIDATE_FILE, async (params: { uri: string }) => {
  const filePath = URI.parse(params.uri).fsPath;
  return await providers.protoc.validate(filePath);
});

connection.onRequest(REQUEST_METHODS.IS_PROTOC_AVAILABLE, async () => {
  return await providers.protoc.isAvailable();
});

connection.onRequest(REQUEST_METHODS.GET_PROTOC_VERSION, async () => {
  return await providers.protoc.getVersion();
});

// Custom request handlers for external linter
connection.onRequest(REQUEST_METHODS.RUN_EXTERNAL_LINTER, async (params: { uri: string }) => {
  const filePath = URI.parse(params.uri).fsPath;
  return await providers.externalLinter.lint(filePath);
});

connection.onRequest(REQUEST_METHODS.RUN_EXTERNAL_LINTER_WORKSPACE, async () => {
  return await providers.externalLinter.lintWorkspace();
});

connection.onRequest(REQUEST_METHODS.IS_EXTERNAL_LINTER_AVAILABLE, async () => {
  return await providers.externalLinter.isAvailable();
});

connection.onRequest(REQUEST_METHODS.GET_AVAILABLE_LINT_RULES, async () => {
  return await providers.externalLinter.getAvailableRules();
});

// Custom request handlers for breaking change detection
connection.onRequest(REQUEST_METHODS.CHECK_BREAKING_CHANGES, async (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }

  const filePath = URI.parse(params.uri).fsPath;
  const currentFile = providers.parser.parse(document.getText(), params.uri);

  // Get baseline content from git
  const baselineContent = await providers.breaking.getBaselineFromGit(filePath);
  let baselineFile: ProtoFile | null = null;

  if (baselineContent) {
    try {
      baselineFile = providers.parser.parse(baselineContent, params.uri);
    } catch (_e) {
      // Baseline file might not be valid proto
    }
  }

  return providers.breaking.detectBreakingChanges(currentFile, baselineFile, params.uri);
});

// Helper to collect options from AST
interface CollectedOption {
  name: string;
  value: string | number | boolean;
  range: AstRange;
  parent: string;
}

interface NodeWithOptions {
  options?: OptionStatement[];
  messages?: MessageDefinition[];
  nestedMessages?: MessageDefinition[];
  enums?: EnumDefinition[];
  nestedEnums?: EnumDefinition[];
  services?: ServiceDefinition[];
  fields?: FieldDefinition[];
  rpcs?: RpcDefinition[];
}

function collectOptions(file: ProtoFile): CollectedOption[] {
  const options: CollectedOption[] = [];

  function addOptions(container: NodeWithOptions, parentName: string): void {
    if (container.options) {
      for (const opt of container.options) {
        options.push({
          name: opt.name,
          value: opt.value,
          range: opt.range,
          parent: parentName
        });
      }
    }
  }

  // File options
  addOptions(file, 'File');

  // Traverse
  function traverse(node: NodeWithOptions, prefix: string): void {
    if (node.messages) {
      for (const msg of node.messages) {
        addOptions(msg, `Message ${prefix}${msg.name}`);
        traverse(msg, `${prefix}${msg.name}.`);
      }
    }
    if (node.nestedMessages) {
      for (const msg of node.nestedMessages) {
        addOptions(msg, `Message ${prefix}${msg.name}`);
        traverse(msg, `${prefix}${msg.name}.`);
      }
    }
    if (node.enums) {
      for (const enm of node.enums) {
        addOptions(enm, `Enum ${prefix}${enm.name}`);
      }
    }
    if (node.nestedEnums) {
      for (const enm of node.nestedEnums) {
        addOptions(enm, `Enum ${prefix}${enm.name}`);
      }
    }
    if (node.services) {
      for (const svc of node.services) {
        addOptions(svc, `Service ${prefix}${svc.name}`);
        if (svc.rpcs) {
          for (const rpc of svc.rpcs) {
            addOptions(rpc, `RPC ${prefix}${svc.name}.${rpc.name}`);
          }
        }
      }
    }
    if (node.fields) {
        for (const field of node.fields) {
            // Field options are inside options array in FieldDefinition, but AST defines it as FieldOption[] which has name/value
            if (field.options) {
                for (const opt of field.options) {
                    options.push({
                        name: opt.name,
                        value: opt.value,
                        range: field.range, // Approximate range or we need range on field option
                        parent: `Field ${prefix}${field.name}`
                    });
                }
            }
        }
    }
  }

  traverse(file, '');
  return options;
}

connection.onRequest(REQUEST_METHODS.GET_ALL_OPTIONS, (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }
  const file = providers.parser.parse(document.getText(), params.uri);
  return collectOptions(file);
});

// gRPC Service handlers
connection.onRequest(REQUEST_METHODS.GET_GRPC_SERVICES, () => {
  return providers.grpc.getAllServices();
});

connection.onRequest(REQUEST_METHODS.GET_GRPC_SERVICE, (params: { serviceName: string; uri?: string }) => {
  return providers.grpc.getService(params.serviceName, params.uri);
});

connection.onRequest(REQUEST_METHODS.GET_GRPC_RPC, (params: { rpcFullName: string }) => {
  return providers.grpc.getRpc(params.rpcFullName);
});

connection.onRequest(REQUEST_METHODS.GET_GRPC_RPCS_USING_TYPE, (params: { typeName: string }) => {
  return providers.grpc.getRpcsUsingType(params.typeName);
});

connection.onRequest(REQUEST_METHODS.GENERATE_GRPC_CLIENT_STUB, (params: { serviceName: string; language: 'go' | 'java' | 'python' | 'typescript'; uri?: string }) => {
  const service = providers.grpc.getService(params.serviceName, params.uri);
  if (!service) {
    return { error: `Service ${params.serviceName} not found` };
  }
  return { code: providers.grpc.generateClientStubPreview(service, params.language) };
});

connection.onRequest(REQUEST_METHODS.GENERATE_GRPC_SERVER_TEMPLATE, (params: { serviceName: string; language: 'go' | 'java' | 'python' | 'typescript'; uri?: string }) => {
  const service = providers.grpc.getService(params.serviceName, params.uri);
  if (!service) {
    return { error: `Service ${params.serviceName} not found` };
  }
  return { code: providers.grpc.generateServerTemplate(service, params.language) };
});

connection.onRequest(REQUEST_METHODS.GET_GRPC_SERVICE_STATS, (params: { serviceName: string; uri?: string }) => {
  const service = providers.grpc.getService(params.serviceName, params.uri);
  if (!service) {
    return { error: `Service ${params.serviceName} not found` };
  }
  return providers.grpc.getServiceStats(service);
});

connection.onRequest(REQUEST_METHODS.MIGRATE_TO_PROTO3, (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return [];
  }
  const file = providers.parser.parse(document.getText(), params.uri);
  return providers.migration.convertToProto3(file, document.getText(), params.uri);
});

// Start listening
documents.listen(connection);
connection.listen();
