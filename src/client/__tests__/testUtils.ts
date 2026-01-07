import type { LanguageClient } from 'vscode-languageclient/node';

export function createMockVscode() {
  const mockOutputChannel = {
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    clear: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    name: 'Mock Output Channel',
    replace: jest.fn(),
  };

  const mockWebviewPanel = {
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
      postMessage: jest.fn().mockResolvedValue(true),
      cspSource: 'test-csp-source',
      asWebviewUri: jest.fn((uri: unknown) => uri),
    },
    onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
    reveal: jest.fn(),
    dispose: jest.fn(),
    visible: true,
    viewColumn: 1,
    active: true,
    title: 'Mock Panel',
  };

  const mockTreeView = {
    onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCollapseElement: jest.fn(() => ({ dispose: jest.fn() })),
    onDidExpandElement: jest.fn(() => ({ dispose: jest.fn() })),
    reveal: jest.fn(),
    dispose: jest.fn(),
    visible: true,
    selection: [],
  };

  return {
    commands: {
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
      executeCommand: jest.fn(),
    },
    window: {
      activeTextEditor: undefined as unknown,
      showWarningMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showQuickPick: jest.fn(),
      showInputBox: jest.fn(),
      createOutputChannel: jest.fn(() => mockOutputChannel),
      createWebviewPanel: jest.fn(() => mockWebviewPanel),
      createTreeView: jest.fn(() => mockTreeView),
      showTextDocument: jest.fn(),
      onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    },
    workspace: {
      workspaceFolders: undefined as unknown,
      getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        has: jest.fn(() => false),
        inspect: jest.fn(),
      })),
      applyEdit: jest.fn().mockResolvedValue(true),
      openTextDocument: jest.fn(),
      onDidSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
      onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
      getWorkspaceFolder: jest.fn(),
      findFiles: jest.fn().mockResolvedValue([]),
      createFileSystemWatcher: jest.fn(() => ({
        onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
        onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      })),
      fs: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        stat: jest.fn(),
      },
    },
    env: {
      openExternal: jest.fn().mockResolvedValue(true),
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockResolvedValue(''),
      },
    },
    Uri: {
      file: (path: string) => ({
        fsPath: path,
        toString: () => `file://${path}`,
        scheme: 'file',
        path,
      }),
      parse: (uri: string) => ({
        fsPath: uri.replace('file://', ''),
        toString: () => uri,
        scheme: uri.startsWith('file://') ? 'file' : 'unknown',
        path: uri.replace('file://', ''),
      }),
      joinPath: jest.fn((base: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join('/'),
        toString: () => `file://${[base.fsPath, ...segments].join('/')}`,
      })),
    },
    Range: class MockRange {
      start: { line: number; character: number };
      end: { line: number; character: number };
      constructor(
        startLine: number | { line: number; character: number },
        startChar?: number | { line: number; character: number },
        endLine?: number,
        endChar?: number
      ) {
        if (typeof startLine === 'object') {
          this.start = startLine;
          this.end = (startChar as { line: number; character: number }) || startLine;
        } else {
          this.start = { line: startLine, character: startChar as number };
          this.end = { line: endLine!, character: endChar! };
        }
      }
    },
    Position: class MockPosition {
      line: number;
      character: number;
      constructor(line: number, character: number) {
        this.line = line;
        this.character = character;
      }
    },
    Selection: class MockSelection {
      anchor: { line: number; character: number };
      active: { line: number; character: number };
      start: { line: number; character: number };
      end: { line: number; character: number };
      constructor(
        anchorLine: number | { line: number; character: number },
        anchorChar?: number | { line: number; character: number },
        activeLine?: number,
        activeChar?: number
      ) {
        if (typeof anchorLine === 'object') {
          this.anchor = anchorLine;
          this.active = (anchorChar as { line: number; character: number }) || anchorLine;
        } else {
          this.anchor = { line: anchorLine, character: anchorChar as number };
          this.active = { line: activeLine!, character: activeChar! };
        }
        this.start = this.anchor;
        this.end = this.active;
      }
    },
    WorkspaceEdit: class MockWorkspaceEdit {
      _edits: Map<string, unknown[]> = new Map();
      replace(uri: { toString: () => string }, range: unknown, newText: string) {
        const key = uri.toString();
        if (!this._edits.has(key)) {
          this._edits.set(key, []);
        }
        this._edits.get(key)!.push({ range, newText });
      }
      set(uri: { toString: () => string }, edits: unknown[]) {
        this._edits.set(uri.toString(), edits);
      }
      entries() {
        return Array.from(this._edits.entries());
      }
    },
    TextEdit: class MockTextEdit {
      range: unknown;
      newText: string;
      constructor(range: unknown, newText: string) {
        this.range = range;
        this.newText = newText;
      }
      static replace(range: unknown, newText: string) {
        return new MockTextEdit(range, newText);
      }
    },
    Disposable: class MockDisposable {
      dispose() {}
    },
    TreeItem: class MockTreeItem {
      label: string;
      collapsibleState: number;
      description?: string;
      tooltip?: string;
      command?: unknown;
      constructor(label: string, collapsibleState: number = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ViewColumn: {
      Active: -1,
      Beside: -2,
      One: 1,
      Two: 2,
      Three: 3,
    },
    EventEmitter: class MockEventEmitter<T> {
      _listeners: ((e: T) => void)[] = [];
      event = (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => this._listeners.splice(this._listeners.indexOf(listener), 1) };
      };
      fire(data: T) {
        this._listeners.forEach(l => l(data));
      }
      dispose() {
        this._listeners = [];
      }
    },
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ThemeColor: class MockThemeColor {
      id: string;
      constructor(id: string) {
        this.id = id;
      }
    },
    ProgressLocation: {
      SourceControl: 1,
      Window: 10,
      Notification: 15,
    },
    QuickPickItemKind: {
      Separator: -1,
      Default: 0,
    },
    _mockOutputChannel: mockOutputChannel,
    _mockWebviewPanel: mockWebviewPanel,
    _mockTreeView: mockTreeView,
  };
}

export function createMockLanguageClient(): jest.Mocked<LanguageClient> {
  return {
    sendRequest: jest.fn(),
    onRequest: jest.fn(),
    sendNotification: jest.fn(),
    onNotification: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    onReady: jest.fn().mockResolvedValue(undefined),
    onDidChangeState: jest.fn(() => ({ dispose: jest.fn() })),
    dispose: jest.fn(),
    outputChannel: undefined,
    clientOptions: {} as never,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    state: 2 as never,
  } as unknown as jest.Mocked<LanguageClient>;
}

export function createMockExtensionContext() {
  return {
    subscriptions: [] as { dispose: () => void }[],
    workspaceState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn(() => []),
    },
    globalState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn(() => []),
      setKeysForSync: jest.fn(),
    },
    extensionUri: { fsPath: '/test/extension', toString: () => 'file:///test/extension' },
    extensionPath: '/test/extension',
    storagePath: '/test/storage',
    globalStoragePath: '/test/global-storage',
    globalStorageUri: { fsPath: '/test/global-storage' },
    logPath: '/test/log',
    logUri: { fsPath: '/test/log' },
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
    secrets: {
      get: jest.fn(),
      store: jest.fn(),
      delete: jest.fn(),
      onDidChange: jest.fn(),
    },
    storageUri: { fsPath: '/test/storage' },
    asAbsolutePath: jest.fn((relativePath: string) => `/test/extension/${relativePath}`),
    extension: {
      id: 'test.extension',
      extensionUri: { fsPath: '/test/extension' },
      extensionPath: '/test/extension',
      isActive: true,
      packageJSON: {},
      exports: undefined,
      activate: jest.fn(),
      extensionKind: 1,
    },
    languageModelAccessInformation: {
      onDidChange: jest.fn(),
      canSendRequest: jest.fn(),
    },
  };
}

export function createMockTextEditor(
  options: {
    languageId?: string;
    uri?: string;
    text?: string;
    line?: number;
    character?: number;
  } = {}
) {
  const { languageId = 'proto', uri = 'file:///test/test.proto', text = '', line = 0, character = 0 } = options;

  return {
    document: {
      languageId,
      uri: {
        fsPath: uri.replace('file://', ''),
        toString: () => uri,
        scheme: 'file',
      },
      getText: jest.fn(() => text),
      lineAt: jest.fn((lineNum: number) => ({
        text: text.split('\n')[lineNum] || '',
        lineNumber: lineNum,
        range: { start: { line: lineNum, character: 0 }, end: { line: lineNum, character: 100 } },
        rangeIncludingLineBreak: { start: { line: lineNum, character: 0 }, end: { line: lineNum + 1, character: 0 } },
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: false,
      })),
      lineCount: text.split('\n').length,
      fileName: uri.replace('file://', ''),
      isUntitled: false,
      isDirty: false,
      isClosed: false,
      save: jest.fn().mockResolvedValue(true),
      eol: 1,
      version: 1,
      positionAt: jest.fn(),
      offsetAt: jest.fn(),
      validateRange: jest.fn(),
      validatePosition: jest.fn(),
      getWordRangeAtPosition: jest.fn(),
    },
    selection: {
      active: { line, character },
      anchor: { line, character },
      start: { line, character },
      end: { line, character },
      isEmpty: true,
      isReversed: false,
      isSingleLine: true,
    },
    selections: [
      {
        active: { line, character },
        anchor: { line, character },
        start: { line, character },
        end: { line, character },
      },
    ],
    visibleRanges: [],
    options: {},
    viewColumn: 1,
    edit: jest.fn().mockResolvedValue(true),
    insertSnippet: jest.fn(),
    setDecorations: jest.fn(),
    revealRange: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
  };
}

export function createMockChildProcess(stdout: string = '', stderr: string = '', exitCode: number = 0, error?: Error) {
  const stdoutHandlers: Record<string, ((data: Buffer) => void)[]> = {};
  const stderrHandlers: Record<string, ((data: Buffer) => void)[]> = {};
  const procHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  return {
    stdout: {
      on: jest.fn((event: string, callback: (data: Buffer) => void) => {
        if (!stdoutHandlers[event]) {
          stdoutHandlers[event] = [];
        }
        stdoutHandlers[event].push(callback);
        if (event === 'data' && stdout) {
          setTimeout(() => callback(Buffer.from(stdout)), 5);
        }
      }),
    },
    stderr: {
      on: jest.fn((event: string, callback: (data: Buffer) => void) => {
        if (!stderrHandlers[event]) {
          stderrHandlers[event] = [];
        }
        stderrHandlers[event].push(callback);
        if (event === 'data' && stderr) {
          setTimeout(() => callback(Buffer.from(stderr)), 5);
        }
      }),
    },
    on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!procHandlers[event]) {
        procHandlers[event] = [];
      }
      procHandlers[event].push(callback);
      if (event === 'close') {
        setTimeout(() => callback(exitCode), 10);
      }
      if (event === 'error' && error) {
        setTimeout(() => callback(error), 5);
      }
    }),
    kill: jest.fn(),
    pid: 12345,
    stdin: {
      write: jest.fn(),
      end: jest.fn(),
    },
  };
}

export function getVscodeMockFactory() {
  return () => createMockVscode();
}

export type MockVscode = ReturnType<typeof createMockVscode>;
export type MockLanguageClient = ReturnType<typeof createMockLanguageClient>;
export type MockExtensionContext = ReturnType<typeof createMockExtensionContext>;
export type MockTextEditor = ReturnType<typeof createMockTextEditor>;
export type MockChildProcess = ReturnType<typeof createMockChildProcess>;
