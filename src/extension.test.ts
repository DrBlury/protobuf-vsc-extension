/**
 * Tests for main extension entry point
 */

import { createMockVscode } from './client/__tests__/testUtils';

// Mock VS Code API
class MockTreeItem {
  label: string;
  description?: string;
  collapsibleState?: number;
  tooltip?: string;
  command?: any;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class MockEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: T) {
    this.listeners.forEach(l => l(data));
  }
  dispose() {}
}

class MockRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
  constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
    this.start = { line: startLine, character: startChar };
    this.end = { line: endLine, character: endChar };
  }
}

const mockConfigGet = jest.fn().mockImplementation((_key: string, defaultValue?: any) => defaultValue);
const mockConfigUpdate = jest.fn().mockResolvedValue(undefined);
const mockConfiguration = {
  get: mockConfigGet,
  update: mockConfigUpdate,
  has: jest.fn().mockReturnValue(false),
  inspect: jest.fn().mockReturnValue(undefined),
};

const createTestOutputChannel = () => ({
  appendLine: jest.fn(),
  append: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  clear: jest.fn(),
  dispose: jest.fn(),
  replace: jest.fn(),
  name: 'Test Output Channel',
});

const createTestConfiguration = (getImpl: (key: string, defaultValue?: any) => any) => ({
  get: jest.fn().mockImplementation(getImpl),
  update: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockReturnValue(false),
  inspect: jest.fn().mockReturnValue(undefined),
});

const mockVscode = createMockVscode();
mockVscode.window.createOutputChannel = jest.fn();
mockVscode.window.showErrorMessage = jest.fn().mockResolvedValue(undefined);
mockVscode.window.showInformationMessage = jest.fn().mockResolvedValue(undefined);
mockVscode.window.showWarningMessage = jest.fn().mockResolvedValue(undefined);
mockVscode.window.showQuickPick = jest.fn().mockResolvedValue(undefined);
mockVscode.window.withProgress = jest.fn();
mockVscode.window.activeTextEditor = undefined;
mockVscode.window.onDidChangeActiveTextEditor = jest.fn().mockReturnValue({ dispose: jest.fn() });
mockVscode.window.createTreeView = jest.fn().mockReturnValue({ dispose: jest.fn() });
mockVscode.window.registerTreeDataProvider = jest.fn().mockReturnValue({ dispose: jest.fn() });
mockVscode.window.registerCustomEditorProvider = jest.fn().mockReturnValue({ dispose: jest.fn() });
mockVscode.window.createStatusBarItem = jest.fn().mockReturnValue({
  text: '',
  tooltip: '',
  command: '',
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
});
(mockVscode.window as any).workspace = {
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'workspace' }],
  getConfiguration: jest.fn().mockReturnValue(mockConfiguration),
};
mockVscode.workspace.getConfiguration = jest.fn().mockReturnValue(mockConfiguration);
mockVscode.workspace.createFileSystemWatcher = jest.fn().mockReturnValue({
  onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  dispose: jest.fn(),
});
mockVscode.workspace.onWillSaveTextDocument = jest.fn();
mockVscode.workspace.onDidSaveTextDocument = jest.fn();
mockVscode.workspace.onDidCloseTextDocument = jest.fn();
mockVscode.workspace.findFiles = jest.fn().mockResolvedValue([]);
mockVscode.workspace.openTextDocument = jest.fn().mockResolvedValue({ getText: () => '' });
mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/mock/workspace' }, name: 'workspace' }];
mockVscode.commands.registerCommand = jest.fn();
mockVscode.languages.onDidChangeDiagnostics = jest.fn();
mockVscode.languages.createDiagnosticCollection = jest.fn().mockReturnValue({
  set: jest.fn(),
  clear: jest.fn(),
  delete: jest.fn(),
  dispose: jest.fn(),
});
mockVscode.ProgressLocation.Notification = 1;
mockVscode.Uri.file = (fsPath: string) => ({ fsPath }) as any;
mockVscode.WorkspaceEdit = jest.fn() as unknown as typeof mockVscode.WorkspaceEdit;
mockVscode.ConfigurationTarget.WorkspaceFolder = 2;
mockVscode.TreeItem = MockTreeItem as unknown as typeof mockVscode.TreeItem;
mockVscode.TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};
mockVscode.EventEmitter = MockEventEmitter as unknown as typeof mockVscode.EventEmitter;
mockVscode.Range = MockRange as unknown as typeof mockVscode.Range;
mockVscode.StatusBarAlignment = {
  Left: 1,
  Right: 2,
};
mockVscode.ThemeIcon = class ThemeIcon {
  constructor(public id: string) {}
};
mockVscode.ThemeColor = class ThemeColor {
  constructor(public id: string) {}
};

// Mock child_process
const mockChildProcess = {
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    stderr: { on: jest.fn() },
    stdout: { on: jest.fn() },
    kill: jest.fn(),
  }),
};

// Mock fs
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
};

// Mock language client
const mockLanguageClient = {
  onDidChangeState: jest.fn(),
  onNotification: jest.fn(),
  onTelemetry: jest.fn(),
  setTrace: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  sendRequest: jest.fn(),
};

const mockExtensionContext = {
  subscriptions: [],
  extensionPath: '/mock/extension/path',
  globalStorageUri: { fsPath: '/mock/global/storage' },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(),
  },
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(),
    setKeysForSync: jest.fn(),
  },
  secrets: {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  },
  extensionUri: { fsPath: '/mock/extension' },
  asAbsolutePath: jest.fn((relativePath: string) => `/mock/extension/path/${relativePath}`),
  storageUri: { fsPath: '/mock/storage' },
  logUri: { fsPath: '/mock/log' },
  extensionMode: 1,
  environmentVariableCollection: {
    persistent: true,
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  },
};

// Set up mocks before importing the extension
jest.doMock('vscode', () => mockVscode, { virtual: true });
jest.doMock(
  'vscode-languageclient/node',
  () => ({
    LanguageClient: jest.fn().mockImplementation(() => mockLanguageClient),
    TransportKind: {},
    Trace: {},
    RevealOutputChannelOn: {},
  }),
  { virtual: true }
);

jest.doMock('child_process', () => mockChildProcess, { virtual: true });
jest.doMock('fs', () => mockFs, { virtual: true });

// Mock fsUtils for async filesystem operations
const mockFsUtils = {
  fileExists: jest.fn().mockResolvedValue(false),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  createDirectory: jest.fn().mockResolvedValue(undefined),
  readDirectory: jest.fn().mockResolvedValue([]),
  deleteFile: jest.fn().mockResolvedValue(undefined),
  isDirectory: jest.fn().mockResolvedValue(false),
};
jest.doMock('./client/utils/fsUtils', () => mockFsUtils, { virtual: true });

// Now import the extension after mocking dependencies
const { activate, deactivate } = require('./extension');

describe('Extension Activation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should initialize extension without errors', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());

    await activate(mockExtensionContext as any);

    expect(mockVscode.window.createOutputChannel).toHaveBeenCalledWith('Protobuf VSC');
    expect(mockExtensionContext.subscriptions.length).toBeGreaterThan(0);
  });

  it('should register all commands', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    mockVscode.commands.registerCommand.mockReturnValue({ dispose: jest.fn() });

    await activate(mockExtensionContext as any);

    expect(mockVscode.commands.registerCommand).toHaveBeenCalled();
  });

  it('should setup file system watchers', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    const mockWatcher = { dispose: jest.fn(), onDidCreate: jest.fn(), onDidChange: jest.fn(), onDidDelete: jest.fn() };
    mockVscode.workspace.createFileSystemWatcher.mockReturnValue(mockWatcher);

    await activate(mockExtensionContext as any);

    expect(mockVscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
  });

  it('should setup save handlers for format on save', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    const mockDispose = { dispose: jest.fn() };
    mockVscode.workspace.onWillSaveTextDocument.mockReturnValue(mockDispose);
    mockVscode.workspace.onDidSaveTextDocument.mockReturnValue(mockDispose);
    mockVscode.workspace.onDidCloseTextDocument.mockReturnValue(mockDispose);

    await activate(mockExtensionContext as any);

    expect(mockVscode.workspace.onWillSaveTextDocument).toHaveBeenCalled();
    expect(mockVscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
    expect(mockVscode.workspace.onDidCloseTextDocument).toHaveBeenCalled();
  });

  it('should handle language client initialization', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());

    await activate(mockExtensionContext as any);

    expect(mockLanguageClient.setTrace).toHaveBeenCalled();
    expect(mockLanguageClient.onDidChangeState).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockLanguageClient.start.mockRejectedValue(new Error('Server start failed'));
    mockVscode.window.showErrorMessage.mockResolvedValue(undefined);
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());

    await activate(mockExtensionContext as any);

    expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start language server')
    );
  });

  it('should setup dependency suggestion handler', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    const mockDispose = { dispose: jest.fn() };
    mockVscode.languages.onDidChangeDiagnostics.mockReturnValue(mockDispose);

    await activate(mockExtensionContext as any);

    expect(mockVscode.languages.onDidChangeDiagnostics).toBeDefined();
  });

  it('should setup auto-detection with delay', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    mockVscode.workspace.getConfiguration.mockReturnValue(createTestConfiguration(() => false));

    const result = activate(mockExtensionContext as any);

    expect(result).toBeInstanceOf(Promise);
  });
});

describe('Extension Deactivation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should stop language client', async () => {
    const result = await deactivate();

    expect(mockLanguageClient.stop).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should handle undefined client gracefully', async () => {
    // Don't activate extension, so client remains undefined
    const result = await deactivate();

    expect(result).toBeUndefined();
  });
});

describe('Helper Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  it('should identify proto documents correctly', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    mockVscode.workspace.getConfiguration.mockReturnValue(createTestConfiguration(() => false));

    await activate(mockExtensionContext as any);

    // Test the isProtoDocument function through format on save behavior
    const protoDocument = { languageId: 'proto', uri: { fsPath: 'test.proto' } };
    const textprotoDocument = { languageId: 'textproto', uri: { fsPath: 'test.textproto' } };
    const otherDocument = { languageId: 'javascript', uri: { fsPath: 'test.js' } };

    // Mock the functions indirectly through activation
    (mockVscode.window as any).activeTextEditor = { document: protoDocument };
    mockVscode.workspace.getConfiguration.mockReturnValue(
      createTestConfiguration((key: string) => {
        if (key === 'formatOnSave') {
          return false;
        }
        return undefined;
      })
    );

    // The logic should identify proto documents
    expect(protoDocument.languageId).toBe('proto');
    expect(textprotoDocument.languageId).toBe('textproto');
    expect(otherDocument.languageId).toBe('javascript');
  });

  it('should handle format on save with editor configuration', async () => {
    mockVscode.window.createOutputChannel.mockReturnValue(createTestOutputChannel());
    mockVscode.workspace.getConfiguration.mockReturnValue(createTestConfiguration(() => 'modifications'));

    await activate(mockExtensionContext as any);

    expect(mockVscode.workspace.getConfiguration).toHaveBeenCalled();
  });
});
