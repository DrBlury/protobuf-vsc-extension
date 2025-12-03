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
  DidChangeWatchedFilesParams,
  FileChangeType,
  RenameParams,
  PrepareRenameParams,
  CodeActionParams,
  CodeAction
} from 'vscode-languageserver/node';

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProtoParser } from './parser';
import { SemanticAnalyzer } from './analyzer';
import { DiagnosticsProvider, DiagnosticsSettings } from './diagnostics';
import { ProtoFormatter, FormatterSettings } from './formatter';
import { CompletionProvider } from './completion';
import { HoverProvider } from './hover';
import { DefinitionProvider } from './definition';
import { ReferencesProvider } from './references';
import { SymbolProvider } from './symbols';
import { RenumberProvider } from './renumber';
import { RenameProvider } from './rename';
import { CodeActionsProvider } from './codeActions';
import { ProtocCompiler } from './protoc';
import { BreakingChangeDetector } from './breaking';
import { ExternalLinterProvider } from './externalLinter';
import { ClangFormatProvider } from './clangFormat';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Create service instances
const parser = new ProtoParser();
const analyzer = new SemanticAnalyzer();
const diagnosticsProvider = new DiagnosticsProvider(analyzer);
const formatter = new ProtoFormatter();
const completionProvider = new CompletionProvider(analyzer);
const hoverProvider = new HoverProvider(analyzer);
const definitionProvider = new DefinitionProvider(analyzer);
const referencesProvider = new ReferencesProvider(analyzer);
const symbolProvider = new SymbolProvider(analyzer);
const renumberProvider = new RenumberProvider(parser);
const renameProvider = new RenameProvider(analyzer);
const codeActionsProvider = new CodeActionsProvider(analyzer);
const protocCompiler = new ProtocCompiler();
const breakingChangeDetector = new BreakingChangeDetector();
const externalLinter = new ExternalLinterProvider();
const clangFormat = new ClangFormatProvider();

// Configuration
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

interface Settings {
  protobuf: {
    formatterEnabled: boolean;
    formatOnSave: boolean;
    indentSize: number;
    useTabIndent: boolean;
    maxLineLength: number;
    includes: string[];
    renumber: {
      startNumber: number;
      increment: number;
      preserveReserved: boolean;
      skipInternalRange: boolean;
      autoSuggestNext: boolean;
      onFormat: boolean;
    };
    diagnostics: {
      enabled: boolean;
      namingConventions: boolean;
      referenceChecks: boolean;
      importChecks: boolean;
      fieldTagChecks: boolean;
      duplicateFieldChecks: boolean;
      discouragedConstructs: boolean;
      severity: {
        namingConventions: string;
        referenceErrors: string;
        fieldTagIssues: string;
        discouragedConstructs: string;
      };
    };
    completion: {
      autoImport: boolean;
      includeGoogleTypes: boolean;
    };
    hover: {
      showFieldNumbers: boolean;
      showDocumentation: boolean;
    };
    // New settings
    protoc: {
      path: string;
      compileOnSave: boolean;
      compileAllPath: string;
      useAbsolutePath: boolean;
      options: string[];
    };
    breaking: {
      enabled: boolean;
      againstStrategy: string;
      againstGitRef: string;
      againstFilePath: string;
    };
    externalLinter: {
      enabled: boolean;
      linter: string;
      bufPath: string;
      protolintPath: string;
      bufConfigPath: string;
      protolintConfigPath: string;
      runOnSave: boolean;
    };
    clangFormat: {
      enabled: boolean;
      path: string;
      style: string;
      fallbackStyle: string;
    };
  };
}

const defaultSettings: Settings = {
  protobuf: {
    formatterEnabled: true,
    formatOnSave: false,
    indentSize: 2,
    useTabIndent: false,
    maxLineLength: 120,
    includes: [],
    renumber: {
      startNumber: 1,
      increment: 1,
      preserveReserved: true,
      skipInternalRange: true,
      autoSuggestNext: true,
      onFormat: false
    },
    diagnostics: {
      enabled: true,
      namingConventions: true,
      referenceChecks: true,
      importChecks: true,
      fieldTagChecks: true,
      duplicateFieldChecks: true,
      discouragedConstructs: true,
      severity: {
        namingConventions: 'warning',
        referenceErrors: 'error',
        fieldTagIssues: 'error',
        discouragedConstructs: 'warning'
      }
    },
    completion: {
      autoImport: true,
      includeGoogleTypes: true
    },
    hover: {
      showFieldNumbers: true,
      showDocumentation: true
    },
    // New default settings
    protoc: {
      path: 'protoc',
      compileOnSave: false,
      compileAllPath: '',
      useAbsolutePath: false,
      options: []
    },
    breaking: {
      enabled: false,
      againstStrategy: 'git',
      againstGitRef: 'HEAD~1',
      againstFilePath: ''
    },
    externalLinter: {
      enabled: false,
      linter: 'none',
      bufPath: 'buf',
      protolintPath: 'protolint',
      bufConfigPath: '',
      protolintConfigPath: '',
      runOnSave: true
    },
    clangFormat: {
      enabled: false,
      path: 'clang-format',
      style: 'Google',
      fallbackStyle: 'Google'
    }
  }
};

let globalSettings: Settings = defaultSettings;
let workspaceFolders: string[] = [];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  // Store workspace folders for scanning
  if (params.workspaceFolders) {
    workspaceFolders = params.workspaceFolders.map(folder => URI.parse(folder.uri).fsPath);
  } else if (params.rootUri) {
    workspaceFolders = [URI.parse(params.rootUri).fsPath];
  } else if (params.rootPath) {
    workspaceFolders = [params.rootPath];
  }

  // Set workspace root for new providers
  if (workspaceFolders.length > 0) {
    protocCompiler.setWorkspaceRoot(workspaceFolders[0]);
    breakingChangeDetector.setWorkspaceRoot(workspaceFolders[0]);
    externalLinter.setWorkspaceRoot(workspaceFolders[0]);
  }

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
      }
    }
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  // Scan workspace for proto files on initialization
  scanWorkspaceForProtoFiles();
});

/**
 * Recursively find all .proto files in a directory
 */
function findProtoFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          findProtoFiles(fullPath, files);
        }
      } else if (entry.isFile() && entry.name.endsWith('.proto')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore permission errors
  }
  return files;
}

/**
 * Scan workspace folders for proto files and parse them
 */
function scanWorkspaceForProtoFiles(): void {
  for (const folder of workspaceFolders) {
    const protoFiles = findProtoFiles(folder);
    for (const filePath of protoFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const uri = URI.file(filePath).toString();
        const file = parser.parse(content, uri);
        analyzer.updateFile(uri, file);
      } catch (e) {
        // Ignore parse errors during initial scan
        console.error(`Failed to parse ${filePath}: ${e}`);
      }
    }
  }
}

// Handle file changes from workspace file watcher
connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    const uri = change.uri;
    if (uri.endsWith('.proto')) {
      if (change.type === FileChangeType.Deleted) {
        analyzer.removeFile(uri);
      } else {
        // File created or changed - try to read and parse it
        try {
          const filePath = URI.parse(uri).fsPath;
          const content = fs.readFileSync(filePath, 'utf-8');
          const file = parser.parse(content, uri);
          analyzer.updateFile(uri, file);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  }
});

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Update settings
    globalSettings = change.settings || defaultSettings;

    // Update providers with new settings
    const diag = globalSettings.protobuf.diagnostics;
    diagnosticsProvider.updateSettings({
      namingConventions: diag.namingConventions,
      referenceChecks: diag.referenceChecks,
      importChecks: diag.importChecks,
      fieldTagChecks: diag.fieldTagChecks,
      duplicateFieldChecks: diag.duplicateFieldChecks,
      discouragedConstructs: diag.discouragedConstructs
    });

    formatter.updateSettings({
      indentSize: globalSettings.protobuf.indentSize,
      useTabIndent: globalSettings.protobuf.useTabIndent,
      maxLineLength: globalSettings.protobuf.maxLineLength,
      renumberOnFormat: globalSettings.protobuf.renumber.onFormat,
      renumberStartNumber: globalSettings.protobuf.renumber.startNumber,
      renumberIncrement: globalSettings.protobuf.renumber.increment
    });

    const renumberSettings = globalSettings.protobuf.renumber;
    renumberProvider.updateSettings({
      startNumber: renumberSettings.startNumber,
      increment: renumberSettings.increment,
      preserveReserved: renumberSettings.preserveReserved,
      skipReservedRange: renumberSettings.skipInternalRange
    });

    // Update analyzer with import paths
    analyzer.setImportPaths(globalSettings.protobuf.includes || []);

    // Update new providers
    const protocSettings = globalSettings.protobuf.protoc;
    protocCompiler.updateSettings({
      path: protocSettings.path,
      compileOnSave: protocSettings.compileOnSave,
      compileAllPath: protocSettings.compileAllPath,
      useAbsolutePath: protocSettings.useAbsolutePath,
      options: protocSettings.options
    });

    const breakingSettings = globalSettings.protobuf.breaking;
    breakingChangeDetector.updateSettings({
      enabled: breakingSettings.enabled,
      againstStrategy: breakingSettings.againstStrategy as 'git' | 'file' | 'none',
      againstGitRef: breakingSettings.againstGitRef,
      againstFilePath: breakingSettings.againstFilePath
    });

    const linterSettings = globalSettings.protobuf.externalLinter;
    externalLinter.updateSettings({
      enabled: linterSettings.enabled,
      linter: linterSettings.linter as 'buf' | 'protolint' | 'none',
      bufPath: linterSettings.bufPath,
      protolintPath: linterSettings.protolintPath,
      bufConfigPath: linterSettings.bufConfigPath,
      protolintConfigPath: linterSettings.protolintConfigPath,
      runOnSave: linterSettings.runOnSave
    });

    const clangSettings = globalSettings.protobuf.clangFormat;
    clangFormat.updateSettings({
      enabled: clangSettings.enabled,
      path: clangSettings.path,
      style: clangSettings.style,
      fallbackStyle: clangSettings.fallbackStyle
    });
  }

  // Revalidate all documents
  documents.all().forEach(validateDocument);
});

// Document events
documents.onDidChangeContent(change => {
  validateDocument(change.document);
});

documents.onDidClose(event => {
  analyzer.removeFile(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateDocument(document: TextDocument): Promise<void> {
  const text = document.getText();
  const uri = document.uri;

  try {
    // Parse the document
    const file = parser.parse(text, uri);

    // Update analyzer
    analyzer.updateFile(uri, file);

    // Run diagnostics
    const diagnostics = diagnosticsProvider.validate(uri, file);

    connection.sendDiagnostics({ uri, diagnostics });
  } catch (error) {
    // Send parse error as diagnostic
    const diagnostics: Diagnostic[] = [{
      severity: 1, // Error
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 }
      },
      message: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'protobuf'
    }];

    connection.sendDiagnostics({ uri, diagnostics });
  }
}

// Completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const documentText = document.getText();
  const lines = documentText.split('\n');
  const lineText = lines[params.position.line] || '';

  return completionProvider.getCompletions(
    params.textDocument.uri,
    params.position,
    lineText,
    undefined,
    documentText
  );
});

// Hover
connection.onHover((params: HoverParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return hoverProvider.getHover(
    params.textDocument.uri,
    params.position,
    lineText
  );
});

// Definition
connection.onDefinition((params: DefinitionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return definitionProvider.getDefinition(
    params.textDocument.uri,
    params.position,
    lineText
  );
});

// References
connection.onReferences((params: ReferenceParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  return referencesProvider.findReferences(
    params.textDocument.uri,
    params.position,
    lineText,
    params.context.includeDeclaration
  );
});

// Document Symbols
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  return symbolProvider.getDocumentSymbols(params.textDocument.uri);
});

// Workspace Symbols
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
  return symbolProvider.getWorkspaceSymbols(params.query);
});

// Formatting
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  if (!globalSettings.protobuf.formatterEnabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  return formatter.formatDocument(document.getText());
});

connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams) => {
  if (!globalSettings.protobuf.formatterEnabled) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  return formatter.formatRange(document.getText(), params.range);
});

// Folding Ranges
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const lines = text.split('\n');
  const ranges: FoldingRange[] = [];
  const stack: { start: number; isComment: boolean }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Multi-line comment start
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      stack.push({ start: i, isComment: true });
    }

    // Multi-line comment end
    if (trimmed.includes('*/') && stack.length > 0 && stack[stack.length - 1].isComment) {
      const start = stack.pop()!;
      ranges.push({
        startLine: start.start,
        endLine: i,
        kind: FoldingRangeKind.Comment
      });
    }

    // Block start
    if (trimmed.includes('{') && !trimmed.startsWith('//')) {
      stack.push({ start: i, isComment: false });
    }

    // Block end
    if (trimmed.includes('}') && !trimmed.startsWith('//')) {
      if (stack.length > 0 && !stack[stack.length - 1].isComment) {
        const start = stack.pop()!;
        if (i > start.start) {
          ranges.push({
            startLine: start.start,
            endLine: i,
            kind: FoldingRangeKind.Region
          });
        }
      }
    }
  }

  return ranges;
});

// Custom request handlers for renumbering
connection.onRequest('protobuf/renumberDocument', (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  return renumberProvider.renumberDocument(document.getText(), params.uri);
});

connection.onRequest('protobuf/renumberMessage', (params: { uri: string; messageName: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  return renumberProvider.renumberMessage(document.getText(), params.uri, params.messageName);
});

connection.onRequest('protobuf/renumberFromPosition', (params: { uri: string; position: { line: number; character: number } }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  return renumberProvider.renumberFromField(document.getText(), params.uri, params.position);
});

connection.onRequest('protobuf/renumberEnum', (params: { uri: string; enumName: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  return renumberProvider.renumberEnum(document.getText(), params.uri, params.enumName);
});

connection.onRequest('protobuf/getMessages', (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  const file = parser.parse(document.getText(), params.uri);
  const messages: string[] = [];

  function collectMessages(msgs: any[], prefix: string = '') {
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

connection.onRequest('protobuf/getEnums', (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  const file = parser.parse(document.getText(), params.uri);
  const enums: string[] = [];

  function collectEnums(enumList: any[], prefix: string = '') {
    for (const e of enumList) {
      const fullName = prefix ? `${prefix}.${e.name}` : e.name;
      enums.push(fullName);
    }
  }

  function collectFromMessages(msgs: any[], prefix: string = '') {
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

connection.onRequest('protobuf/getMessageAtPosition', (params: { uri: string; position: { line: number; character: number } }) => {
  const document = documents.get(params.uri);
  if (!document) return null;

  const file = parser.parse(document.getText(), params.uri);

  function findMessageAtPosition(msgs: any[], prefix: string = ''): string | null {
    for (const msg of msgs) {
      const fullName = prefix ? `${prefix}.${msg.name}` : msg.name;
      if (isPositionInRange(params.position, msg.range)) {
        // Check nested messages first
        if (msg.nestedMessages) {
          const nested = findMessageAtPosition(msg.nestedMessages, fullName);
          if (nested) return nested;
        }
        return fullName;
      }
    }
    return null;
  }

  function isPositionInRange(pos: { line: number; character: number }, range: any): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) return false;
    if (pos.line === range.start.line && pos.character < range.start.character) return false;
    if (pos.line === range.end.line && pos.character > range.end.character) return false;
    return true;
  }

  return findMessageAtPosition(file.messages);
});

connection.onRequest('protobuf/getNextFieldNumber', (params: { uri: string; messageName: string }) => {
  const document = documents.get(params.uri);
  if (!document) return 1;

  return renumberProvider.getNextFieldNumber(document.getText(), params.uri, params.messageName);
});

// Rename - Prepare
connection.onPrepareRename((params: PrepareRenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = renameProvider.prepareRename(
    params.textDocument.uri,
    params.position,
    lineText
  );

  if (!result) return null;

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
  if (!document) return null;

  const lines = document.getText().split('\n');
  const lineText = lines[params.position.line] || '';

  const result = renameProvider.rename(
    params.textDocument.uri,
    params.position,
    lineText,
    params.newName
  );

  if (result.changes.size === 0) return null;

  // Convert to WorkspaceEdit format
  const changes: { [uri: string]: any[] } = {};
  for (const [uri, edits] of result.changes) {
    changes[uri] = edits;
  }

  return { changes };
});

// Code Actions
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  return codeActionsProvider.getCodeActions(
    params.textDocument.uri,
    params.range,
    params.context,
    document.getText()
  );
});

// Custom request handlers for protoc compilation
connection.onRequest('protobuf/compileFile', async (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) {
    return { success: false, errors: [{ message: 'Document not found' }] };
  }

  const filePath = URI.parse(params.uri).fsPath;
  return await protocCompiler.compileFile(filePath);
});

connection.onRequest('protobuf/compileAll', async () => {
  return await protocCompiler.compileAll();
});

connection.onRequest('protobuf/validateFile', async (params: { uri: string }) => {
  const filePath = URI.parse(params.uri).fsPath;
  return await protocCompiler.validate(filePath);
});

connection.onRequest('protobuf/isProtocAvailable', async () => {
  return await protocCompiler.isAvailable();
});

connection.onRequest('protobuf/getProtocVersion', async () => {
  return await protocCompiler.getVersion();
});

// Custom request handlers for external linter
connection.onRequest('protobuf/runExternalLinter', async (params: { uri: string }) => {
  const filePath = URI.parse(params.uri).fsPath;
  return await externalLinter.lint(filePath);
});

connection.onRequest('protobuf/runExternalLinterWorkspace', async () => {
  return await externalLinter.lintWorkspace();
});

connection.onRequest('protobuf/isExternalLinterAvailable', async () => {
  return await externalLinter.isAvailable();
});

connection.onRequest('protobuf/getAvailableLintRules', async () => {
  return await externalLinter.getAvailableRules();
});

// Custom request handlers for breaking change detection
connection.onRequest('protobuf/checkBreakingChanges', async (params: { uri: string }) => {
  const document = documents.get(params.uri);
  if (!document) return [];

  const filePath = URI.parse(params.uri).fsPath;
  const currentFile = parser.parse(document.getText(), params.uri);

  // Get baseline content from git
  const baselineContent = await breakingChangeDetector.getBaselineFromGit(filePath);
  let baselineFile = null;

  if (baselineContent) {
    try {
      baselineFile = parser.parse(baselineContent, params.uri);
    } catch (e) {
      // Baseline file might not be valid proto
    }
  }

  return breakingChangeDetector.detectBreakingChanges(currentFile, baselineFile, params.uri);
});

// Start listening
documents.listen(connection);
connection.listen();
