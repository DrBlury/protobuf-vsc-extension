import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic } from 'vscode-languageserver/node';
import type { ProviderRegistry } from '../utils/providerRegistry';
import { defaultSettings } from '../utils/types';
import { TIMING } from '../utils/constants';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { URI } from 'vscode-uri';

const mockHandlers = new Map<string, (...args: any[]) => any>();
const mockDocuments = new Map<string, TextDocument>();
const mockSendDiagnostics = jest.fn();
const mockGetConfiguration = jest.fn();
let mockProviders: ProviderRegistry;

jest.mock('vscode-languageserver/node', () => {
  const actual = jest.requireActual('vscode-languageserver/node');
  const register = (name: string) => (handler: (...args: any[]) => any) => mockHandlers.set(name, handler);
  return {
    ...actual,
    createConnection: () =>
      new Proxy(
        {
          console: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
          sendDiagnostics: mockSendDiagnostics,
          workspace: {
            getConfiguration: mockGetConfiguration,
            onDidChangeWorkspaceFolders: register('workspaceFoldersChange'),
          },
          client: { register: jest.fn() },
          languages: { semanticTokens: { on: jest.fn() }, inlayHint: { on: jest.fn() } },
          onRequest: (method: string, handler: (...args: any[]) => any) => mockHandlers.set(method, handler),
          listen: jest.fn(),
        },
        { get: (target: any, key: string) => target[key] ?? register(key) }
      ),
    TextDocuments: class {
      get(uri: string) {
        return mockDocuments.get(uri);
      }
      all() {
        return [...mockDocuments.values()];
      }
      onDidChangeContent = register('documentChange');
      onDidClose = register('documentClose');
      listen() {}
    },
  };
});

jest.mock('../utils/providerRegistry', () => {
  const actual = jest.requireActual('../utils/providerRegistry');
  return {
    ProviderRegistry: jest.fn().mockImplementation(() => {
      mockProviders = new actual.ProviderRegistry();
      return mockProviders;
    }),
  };
});
jest.mock('../initialization', () => ({
  discoverWellKnownIncludePath: jest.fn(),
  preloadGoogleWellKnownProtos: jest.fn(),
  getServerCapabilities: () => ({ capabilities: {} }),
}));
jest.mock('../core/treeSitterParser', () => ({
  ...jest.requireActual('../core/treeSitterParser'),
  initTreeSitterParser: jest.fn().mockResolvedValue(undefined),
}));

describe('language server document lifecycle', () => {
  const firstUri = 'file:///first.proto';
  const secondUri = 'file:///second.proto';
  let validate: jest.SpyInstance;
  let directory: string;

  beforeAll(() => {
    // Loading the server must not install process-level handlers in Jest.
    const processOn = jest.spyOn(process, 'on').mockReturnValue(process);
    require('../server');
    processOn.mockRestore();
    mockHandlers.get('onInitialize')!({ capabilities: { workspace: { configuration: true } } });
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-lifecycle-'));
    mockSendDiagnostics.mockClear();
    mockGetConfiguration.mockResolvedValue(JSON.parse(JSON.stringify(defaultSettings.protobuf)));
    validate = jest.spyOn(mockProviders.diagnostics, 'validate').mockResolvedValue([]);
    mockHandlers.get('onInitialize')!({
      capabilities: { workspace: { configuration: true, workspaceFolders: true } },
      workspaceFolders: [{ uri: URI.file(directory).toString(), name: 'test' }],
    });
    await mockHandlers.get('onInitialized')!();
  });

  afterEach(() => {
    for (const document of mockDocuments.values()) {
      mockHandlers.get('documentClose')!({ document });
    }
    mockDocuments.clear();
    fs.rmSync(directory, { recursive: true, force: true });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function change(uri: string, version = 1, text = 'syntax = "proto3"; message Example {}'): TextDocument {
    const document = TextDocument.create(uri, 'proto', version, text);
    mockDocuments.set(uri, document);
    mockHandlers.get('documentChange')!({ document });
    return document;
  }

  async function flushValidation(): Promise<void> {
    jest.advanceTimersByTime(TIMING.VALIDATION_DEBOUNCE_MS);
    await Promise.resolve();
  }

  it('validates every file when multiple documents open within the debounce interval', async () => {
    change(firstUri);
    change(secondUri);
    await flushValidation();
    expect(mockSendDiagnostics.mock.calls.map(([params]) => params.uri)).toEqual([firstUri, secondUri]);
  });

  it('coalesces rapid edits to the same document', async () => {
    change(firstUri);
    change(firstUri, 2);
    await flushValidation();
    expect(validate).toHaveBeenCalledTimes(1);
    expect(mockSendDiagnostics).toHaveBeenCalledWith({ uri: firstUri, version: 2, diagnostics: [] });
  });

  it('does not validate a document closed before its timer runs', async () => {
    const document = change(firstUri);
    mockDocuments.delete(firstUri);
    mockHandlers.get('documentClose')!({ document });
    mockSendDiagnostics.mockClear();
    await flushValidation();
    expect(validate).not.toHaveBeenCalled();
    expect(mockSendDiagnostics).not.toHaveBeenCalled();
  });

  it('discards an old async result after a newer document version is validated', async () => {
    let resolveOld!: (diagnostics: Diagnostic[]) => void;
    validate.mockImplementationOnce(() => new Promise(resolve => (resolveOld = resolve)));
    change(firstUri);
    await flushValidation();
    change(firstUri, 2);
    await flushValidation();
    mockSendDiagnostics.mockClear();
    resolveOld([{ message: 'stale' } as Diagnostic]);
    await Promise.resolve();
    expect(mockSendDiagnostics).not.toHaveBeenCalled();
  });

  it('does not republish an in-flight result after the editor closes', async () => {
    let resolveOld!: (diagnostics: Diagnostic[]) => void;
    validate.mockImplementationOnce(() => new Promise(resolve => (resolveOld = resolve)));
    const document = change(firstUri);
    await flushValidation();
    mockDocuments.delete(firstUri);
    mockHandlers.get('documentClose')!({ document });
    mockSendDiagnostics.mockClear();
    resolveOld([{ message: 'closed' } as Diagnostic]);
    await Promise.resolve();
    expect(mockSendDiagnostics).not.toHaveBeenCalled();
  });

  it('applies changed formatter and import preferences to code actions without a restart', async () => {
    const config = JSON.parse(JSON.stringify(defaultSettings.protobuf));
    config.formatter.enabled = false;
    config.organizeImports.enabled = false;
    mockGetConfiguration.mockResolvedValue(config);
    const update = jest.spyOn(mockProviders.codeActions, 'updateSettings');
    await mockHandlers.get('onDidChangeConfiguration')!({ settings: {} });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ formatterEnabled: false, organizeImports: { enabled: false, groupByCategory: true } })
    );
  });

  it('reapplies the configured parser after asynchronous WASM initialization', async () => {
    const select = jest.spyOn(mockProviders, 'setUseTreeSitter');
    await mockHandlers.get('protobuf/initTreeSitter')!({ wasmPath: '/mock/proto.wasm' });
    expect(select).toHaveBeenLastCalledWith(true);
  });

  it('reparses open documents after a parser setting change instead of reusing the old AST', async () => {
    const parse = jest.spyOn(mockProviders.parser, 'parse');
    change(firstUri);
    await flushValidation();
    parse.mockClear();
    const config = JSON.parse(JSON.stringify(defaultSettings.protobuf));
    config.parser = 'legacy';
    mockGetConfiguration.mockResolvedValue(config);
    await mockHandlers.get('onDidChangeConfiguration')!({ settings: {} });
    expect(parse).toHaveBeenCalledWith(expect.any(String), firstUri);
    const select = jest.spyOn(mockProviders, 'setUseTreeSitter');
    await mockHandlers.get('protobuf/initTreeSitter')!({ wasmPath: '/mock/proto.wasm' });
    expect(select).toHaveBeenLastCalledWith(false);
  });

  it('answers symbol requests using edits that are still awaiting debounced validation', async () => {
    change(firstUri);
    await flushValidation();
    change(firstUri, 2, 'syntax = "proto3"; message Latest {}');
    const symbols = mockHandlers.get('onDocumentSymbol')!({ textDocument: { uri: firstUri } });
    expect(symbols.map((symbol: { name: string }) => symbol.name)).toContain('Latest');
    expect(symbols.map((symbol: { name: string }) => symbol.name)).not.toContain('Example');
  });

  it('restores the saved schema when unsaved changes are discarded on close', async () => {
    const filename = path.join(directory, 'discard.proto');
    const uri = URI.file(filename).toString();
    fs.writeFileSync(filename, 'syntax = "proto3"; message Saved {}');
    const document = change(uri, 1, 'syntax = "proto3"; message Unsaved {}');
    await flushValidation();
    mockDocuments.delete(uri);
    mockHandlers.get('documentClose')!({ document });
    expect(mockProviders.analyzer.getFile(uri)?.messages.map(message => message.name)).toEqual(['Saved']);
  });

  it('keeps an imported open buffer authoritative while revalidating a watcher event', async () => {
    const filename = path.join(directory, 'import.proto');
    const uri = URI.file(filename).toString();
    fs.writeFileSync(filename, 'syntax = "proto3"; message Saved {}');
    change(firstUri);
    change(uri, 1, 'syntax = "proto3"; message Unsaved {}');
    await flushValidation();
    validate.mockImplementation(async (validatedUri: string) => {
      if (validatedUri === firstUri) {
        expect(mockProviders.analyzer.getFile(uri)?.messages[0]?.name).toBe('Unsaved');
      }
      return [];
    });
    await mockHandlers.get('onDidChangeWatchedFiles')!({ changes: [{ uri, type: 2 }] });
    // validateDocument catches provider errors, so also assert no synthetic parse error was published.
    await Promise.resolve();
    expect(mockSendDiagnostics.mock.calls.flatMap(([params]) => params.diagnostics)).toEqual([]);
  });

  it('merges partial configuration with defaults instead of throwing', async () => {
    mockGetConfiguration.mockResolvedValue({ diagnostics: { enabled: false } });
    await expect(mockHandlers.get('onDidChangeConfiguration')!({ settings: {} })).resolves.toBeUndefined();
    change(firstUri);
    await flushValidation();
    expect(validate).not.toHaveBeenCalled();
  });

  it('does not apply an older configuration response after a newer one', async () => {
    let resolveOlder!: (settings: unknown) => void;
    const oldConfig = JSON.parse(JSON.stringify(defaultSettings.protobuf));
    oldConfig.formatter.enabled = false;
    mockGetConfiguration.mockImplementationOnce(() => new Promise(resolve => (resolveOlder = resolve)));
    const older = mockHandlers.get('onDidChangeConfiguration')!({ settings: {} });
    const update = jest.spyOn(mockProviders.codeActions, 'updateSettings');
    await mockHandlers.get('onDidChangeConfiguration')!({ settings: {} });
    resolveOlder(oldConfig);
    await older;
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ formatterEnabled: true }));
  });

  it('indexes added workspace folders and removes closed files from removed folders', async () => {
    const added = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-added-workspace-'));
    try {
      const filename = path.join(added, 'added.proto');
      const uri = URI.file(filename).toString();
      fs.writeFileSync(filename, 'syntax = "proto3"; message Added {}');
      const folder = { uri: URI.file(added).toString(), name: 'added' };
      await mockHandlers.get('workspaceFoldersChange')!({ added: [folder], removed: [] });
      expect(mockProviders.analyzer.getFile(uri)?.messages[0]?.name).toBe('Added');
      const normalizedAdded = URI.parse(folder.uri).fsPath.replace(/\\/g, '/');
      expect(mockProviders.analyzer.getWorkspaceRoots()).toContain(normalizedAdded);
      await mockHandlers.get('workspaceFoldersChange')!({ added: [], removed: [folder] });
      expect(mockProviders.analyzer.getFile(uri)).toBeUndefined();
      expect(mockProviders.analyzer.getWorkspaceRoots()).not.toContain(normalizedAdded);
    } finally {
      fs.rmSync(added, { recursive: true, force: true });
    }
  });

  it('preserves an unsaved schema across a workspace rescan', async () => {
    const filename = path.join(directory, 'rescan.proto');
    const uri = URI.file(filename).toString();
    fs.writeFileSync(filename, 'syntax = "proto3"; message Saved {}');
    change(uri, 1, 'syntax = "proto3"; message Unsaved {}');
    await flushValidation();
    const observed: string[] = [];
    const update = mockProviders.analyzer.updateFile.bind(mockProviders.analyzer);
    jest.spyOn(mockProviders.analyzer, 'updateFile').mockImplementation((updatedUri, file) => {
      if (updatedUri === uri) {
        observed.push(file.messages[0]!.name);
      }
      update(updatedUri, file);
    });
    await mockHandlers.get('onDidChangeWatchedFiles')!({
      changes: [{ uri: URI.file(path.join(directory, '.gitignore')).toString(), type: 2 }],
    });
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every(name => name === 'Unsaved')).toBe(true);
  });

  it('accepts configuration notifications from clients without configuration request support', async () => {
    mockHandlers.get('onInitialize')!({ capabilities: {}, workspaceFolders: [] });
    await mockHandlers.get('onDidChangeConfiguration')!({
      settings: { protobuf: { diagnostics: { enabled: false } } },
    });
    change(firstUri);
    await flushValidation();
    expect(validate).not.toHaveBeenCalled();
  });

  it('scopes variable-based discovery and relative includes separately for every workspace root', async () => {
    const added = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-scoped-workspace-'));
    try {
      for (const root of [directory, added]) {
        fs.mkdirSync(path.join(root, 'protos'));
        fs.mkdirSync(path.join(root, 'vendor'));
        fs.writeFileSync(path.join(root, 'protos', 'included.proto'), 'syntax = "proto3"; message Included {}');
        fs.writeFileSync(path.join(root, 'outside.proto'), 'syntax = "proto3"; message Outside {}');
        fs.writeFileSync(path.join(root, 'vendor', 'import.proto'), 'syntax = "proto3"; message Import {}');
      }
      mockGetConfiguration.mockResolvedValue({ protoSrcsDir: '${workspaceFolder}/protos', includes: ['vendor'] });
      await mockHandlers.get('workspaceFoldersChange')!({
        added: [{ uri: URI.file(added).toString(), name: 'added' }],
        removed: [],
      });
      for (const root of [directory, added]) {
        expect(
          mockProviders.analyzer.getFile(URI.file(path.join(root, 'protos', 'included.proto')).toString())
        ).toBeDefined();
        expect(
          mockProviders.analyzer.getFile(URI.file(path.join(root, 'vendor', 'import.proto')).toString())
        ).toBeDefined();
        expect(mockProviders.analyzer.getFile(URI.file(path.join(root, 'outside.proto')).toString())).toBeUndefined();
      }
    } finally {
      fs.rmSync(added, { recursive: true, force: true });
    }
  });
});
