/**
 * Protocol Buffers Language Server
 * Main server implementation
 */

import type {
  InitializeParams,
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
  Diagnostic,
  DidChangeWatchedFilesParams,
  RenameParams,
  PrepareRenameParams,
  CodeActionParams,
  CodeAction
} from 'vscode-languageserver/node';
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  FoldingRangeKind,
  DidChangeConfigurationNotification,
  DiagnosticSeverity,
  FileChangeType
} from 'vscode-languageserver/node';

import * as fs from 'fs';
import { URI } from 'vscode-uri';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Core functionality
import type {
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
  REQUEST_METHODS,
  DIAGNOSTIC_SOURCE,
  ERROR_CODES,
  TIMING,
  DEFAULT_POSITIONS
} from './utils/constants';
import { normalizePath, getErrorMessage } from './utils/utils';
import type { Settings} from './utils/types';
import { defaultSettings } from './utils/types';
import { scanWorkspaceForProtoFiles, scanImportPaths } from './utils/workspace';
import { updateProvidersWithSettings } from './utils/configManager';
import { debounce } from './utils/debounce';
import { ContentHashCache, simpleHash } from './utils/cache';
import { ProviderRegistry } from './utils/providerRegistry';
import { refreshDocumentAndImports } from './utils/documentRefresh';
import {
  handleCompletion,
  handleHover,
  handleDefinition,
  handleReferences,
  handleDocumentFormatting,
  handleRangeFormatting,
  handleDocumentSymbols,
  handleWorkspaceSymbols,
  handleCodeLens,
  handleDocumentLinks,
  handlePrepareRename,
  handleRename,
  handleCodeActions,
  handleSemanticTokensFull,
  handleInlayHints
} from './handlers';
import { bufConfigProvider } from './services/bufConfig';

// Initialization helpers
import { discoverWellKnownIncludePath, preloadGoogleWellKnownProtos } from './initialization';
import { getServerCapabilities } from './initialization';

// Shared types
import type { SchemaGraphRequest } from '../shared/schemaGraph';

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
let protoSrcsDir: string = '';

// Cache for parsed files to avoid re-parsing unchanged content
const parsedFileCache = new ContentHashCache<ProtoFile>();

type ParserPreference = 'tree-sitter' | 'legacy';

function resolveParserPreference(config: Settings['protobuf']): ParserPreference {
  if (config.parser === 'legacy') {
    return 'legacy';
  }
  if (config.parser === 'tree-sitter') {
    return 'tree-sitter';
  }

  const experimental = (config as { experimental?: { parser?: ParserPreference; useTreeSitter?: boolean } }).experimental;
  if (experimental?.parser === 'legacy' || experimental?.parser === 'tree-sitter') {
    return experimental.parser;
  }

  if (typeof experimental?.useTreeSitter === 'boolean') {
    return experimental.useTreeSitter ? 'tree-sitter' : 'legacy';
  }

  return 'tree-sitter';
}



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
  preloadGoogleWellKnownProtos(wellKnownIncludePath, providers.parser, providers.analyzer, wellKnownCacheDir);

  return getServerCapabilities();
});

connection.onExit(() => {
  logger.info('Language server process exiting');
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);

    // Fetch initial configuration from the client
    try {
      const config = await connection.workspace.getConfiguration('protobuf');
      if (config) {
        // Wrap in protobuf key to match Settings interface
        globalSettings = { protobuf: config } as Settings;

        // Apply settings to all providers
        const { includePaths: userIncludePaths, protoSrcsDir: newProtoSrcsDir } = updateProvidersWithSettings(
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
          workspaceFolders,
          providers.codeActions
        );

        protoSrcsDir = newProtoSrcsDir;

        // Update parser preference (Tree-sitter is the default)
        const parserPreference = resolveParserPreference(config);
        const useTreeSitter = parserPreference === 'tree-sitter';
        providers.setUseTreeSitter(useTreeSitter);
        logger.info(`Parser selection: ${parserPreference} (useTreeSitter=${useTreeSitter})`);

        // Scan user-configured import paths for proto files
        if (userIncludePaths.length > 0) {
          scanImportPaths(userIncludePaths, providers.parser, providers.analyzer);
        }
      }
    } catch (e) {
      logger.errorWithContext('Failed to fetch initial configuration', { error: e });
    }
  }

  // Scan workspace for proto files on initialization
  // Note: protoSrcsDir may now be set from initial config fetch above.
  scanWorkspaceForProtoFiles(workspaceFolders, providers.parser, providers.analyzer, protoSrcsDir);
});

// Handle Tree-sitter initialization request
connection.onRequest('protobuf/initTreeSitter', async (params: { wasmPath: string }) => {
  try {
    const { initTreeSitterParser } = await import('./core/treeSitterParser');
    await initTreeSitterParser(params.wasmPath);
    logger.info(`Tree-sitter parser initialized with wasmPath: ${params.wasmPath}`);

    // Initialize Tree-sitter in parser factory
    providers.parser.initializeTreeSitter();

    return { success: true };
  } catch (error) {
    logger.errorWithContext('Failed to initialize Tree-sitter parser', { error });
    return { success: false, error: String(error) };
  }
});


// Handle file changes from workspace file watcher
connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
  let needsRevalidation = false;
  let hasFileRenameOrDelete = false;
  let hasBufConfigChange = false;

  for (const change of params.changes) {
    const uri = change.uri;

    // Check if this is a buf config file change
    if (uri.endsWith('buf.yaml') || uri.endsWith('buf.yml') ||
        uri.endsWith('buf.work.yaml') || uri.endsWith('buf.work.yml') ||
        uri.endsWith('buf.lock')) {
      hasBufConfigChange = true;
      needsRevalidation = true;
      logger.verboseWithContext('Buf config file changed', { uri, type: change.type });
    }

    if (uri.endsWith('.proto')) {
      needsRevalidation = true;
      if (change.type === FileChangeType.Deleted) {
        hasFileRenameOrDelete = true;
        providers.analyzer.removeFile(uri);
        parsedFileCache.delete(uri);
        logger.verboseWithContext('File deleted, removed from cache and analyzer', { uri });
      } else if (change.type === FileChangeType.Created) {
        // A new file was created - this could be part of a rename operation
        hasFileRenameOrDelete = true;
        // File created - try to read and parse it
        try {
          const filePath = URI.parse(uri).fsPath;
          const content = fs.readFileSync(filePath, 'utf-8');
          const contentHash = simpleHash(content);

          const file = providers.parser.parse(content, uri);
          parsedFileCache.set(uri, file, contentHash);
          providers.analyzer.updateFile(uri, file);
          logger.verboseWithContext('File created, parsed and cached', { uri });
        } catch (error) {
          parsedFileCache.delete(uri);
          logger.verboseWithContext('Failed to parse created file', { uri, error });
        }
      } else {
        // File changed - try to read and parse it
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

  // Clear import resolution cache on file renames/deletes to force re-resolution
  if (hasFileRenameOrDelete) {
    providers.analyzer.clearImportResolutionCache();
    logger.verboseWithContext('Cleared import resolution cache due to file rename/delete', {});
  }

  // Clear buf config cache when buf.yaml/buf.lock changes
  if (hasBufConfigChange) {
    bufConfigProvider.clearCache();
    logger.verboseWithContext('Cleared buf config cache due to buf config file change', {});
  }

  // Re-validate all open documents when files change (handles renames, deletions, etc.)
  if (needsRevalidation) {
    documents.all().forEach(validateDocument);
  }
});

connection.onDidChangeConfiguration(async (change: { settings: unknown }) => {
  if (hasConfigurationCapability) {
    // Fetch configuration directly from the client to ensure we get the latest values
    // This is more reliable than using change.settings which may have caching issues
    try {
      const config = await connection.workspace.getConfiguration('protobuf');
      if (config) {
        // Wrap in protobuf key to match Settings interface (same as onInitialized)
        globalSettings = { protobuf: config } as Settings;
      } else {
        globalSettings = defaultSettings;
      }
    } catch {
      // Fallback to change.settings if direct fetch fails
      // change.settings may come in different formats depending on the LSP client
      const settings = change.settings as Record<string, unknown> | undefined;
      if (settings?.protobuf) {
        globalSettings = settings as unknown as Settings;
      } else if (settings) {
        globalSettings = { protobuf: settings } as unknown as Settings;
      } else {
        globalSettings = defaultSettings;
      }
    }

    // Update all providers with new settings using config manager
    const { includePaths: userIncludePaths, protoSrcsDir: newProtoSrcsDir } = updateProvidersWithSettings(
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

    // Update protoSrcsDir
    protoSrcsDir = newProtoSrcsDir;

    // Update parser preference (Tree-sitter is the default)
    const config = globalSettings.protobuf;
    const parserPreference = resolveParserPreference(config);
    const useTreeSitter = parserPreference === 'tree-sitter';
    providers.setUseTreeSitter(useTreeSitter);
    logger.info(`Parser selection updated: ${parserPreference} (useTreeSitter=${useTreeSitter})`);

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

    if (!globalSettings.protobuf.diagnostics.enabled) {
      logger.verboseWithContext('Diagnostics disabled via settings, skipping publish', { uri });
      connection.sendDiagnostics({ uri, diagnostics: [] });
      return;
    }

    // Run built-in diagnostics only if useBuiltIn is enabled
    let diagnostics: Diagnostic[] = [];
    if (globalSettings.protobuf.diagnostics.useBuiltIn !== false) {
      diagnostics = providers.diagnostics.validate(uri, file, text);
    } else {
      logger.verboseWithContext('Built-in diagnostics disabled, skipping AST validation', { uri });
    }

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

    logger.errorWithContext('Document validation failed', {
      uri,
      error
    });

    // Only send parse error as diagnostic if built-in diagnostics are enabled
    if (globalSettings.protobuf.diagnostics.useBuiltIn !== false) {
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
      connection.sendDiagnostics({ uri, diagnostics });
    } else {
      // Clear diagnostics when built-in is disabled
      connection.sendDiagnostics({ uri, diagnostics: [] });
    }
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
  return handleDefinition(
    params,
    documents,
    providers.definition,
    providers.parser,
    providers.analyzer,
    parsedFileCache
  );
});

// References
connection.onReferences((params: ReferenceParams) => {
  return handleReferences(params, documents, providers.references);
});

// Document Symbols
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  return handleDocumentSymbols(params, providers.symbols);
});

// Workspace Symbols
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
  return handleWorkspaceSymbols(params, providers.symbols);
});

// Code Lens
connection.onCodeLens((params) => {
  return handleCodeLens(params, documents, providers.codeLens, providers.parser);
});

// Document Links
connection.onDocumentLinks((params) => {
  return handleDocumentLinks(params, documents, providers.documentLinks, providers.parser);
});

// Semantic Tokens
connection.languages.semanticTokens.on((params) => {
  const mode = globalSettings.protobuf?.semanticHighlighting?.enabled ?? 'textmate';
  return handleSemanticTokensFull(
    params,
    providers.semanticTokens,
    (uri) => documents.get(uri),
    mode as 'hybrid' | 'semantic' | 'textmate'
  );
});

// Inlay Hints
connection.languages.inlayHint.on((params) => {
  return handleInlayHints(params, documents, providers.parser);
});

// Formatting
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  return handleDocumentFormatting(params, documents, providers.formatter, globalSettings);
});

connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams) => {
  return handleRangeFormatting(params, documents, providers.formatter, globalSettings);
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
    const line = lines[lineIndex]!;
    const trimmed = line.trim();

    // Multi-line comment start
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      stack.push({ start: lineIndex, isComment: true });
    }

    // Multi-line comment end
    if (trimmed.includes('*/') && stack.length > 0 && stack[stack.length - 1]!.isComment) {
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
      if (stack.length > 0 && !stack[stack.length - 1]!.isComment) {
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
  return handlePrepareRename(params, documents, providers.rename);
});

// Rename - Execute
connection.onRenameRequest((params: RenameParams) => {
  return handleRename(params, documents, providers.rename);
});

// Code Actions
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  return handleCodeActions(params, documents, providers.codeActions);
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
  try {
    const diagnostics = await providers.externalLinter.lint(filePath);
    return {
      success: true,
      diagnostics,
      issueCount: diagnostics.length
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      diagnostics: [],
      issueCount: 0,
      error: errorMessage,
      errorInfo: {
        message: errorMessage,
        suggestion: 'Check that your linter (buf or protolint) is installed and configured correctly.',
        settingKey: 'protobuf.externalLinter.linter'
      }
    };
  }
});

connection.onRequest(REQUEST_METHODS.RUN_EXTERNAL_LINTER_WORKSPACE, async () => {
  try {
    const diagnosticsMap = await providers.externalLinter.lintWorkspace();
    return {
      success: true,
      diagnosticsMap: Object.fromEntries(diagnosticsMap),
      fileCount: diagnosticsMap.size
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      diagnosticsMap: {},
      fileCount: 0,
      error: errorMessage
    };
  }
});

connection.onRequest(REQUEST_METHODS.IS_EXTERNAL_LINTER_AVAILABLE, async () => {
  const available = await providers.externalLinter.isAvailable();
  return {
    available,
    linter: providers.externalLinter['settings']?.linter || 'none'
  };
});

connection.onRequest(REQUEST_METHODS.GET_AVAILABLE_LINT_RULES, async () => {
  const rules = await providers.externalLinter.getAvailableRules();
  return { rules };
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
    } catch {
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
