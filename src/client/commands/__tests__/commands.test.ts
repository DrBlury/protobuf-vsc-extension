jest.mock('vscode', () => ({
  commands: {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    executeCommand: jest.fn()
  },
  window: {
    activeTextEditor: undefined as unknown,
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      clear: jest.fn()
    }))
  },
  workspace: {
    workspaceFolders: undefined as unknown,
    applyEdit: jest.fn().mockResolvedValue(true)
  },
  env: {
    openExternal: jest.fn(),
    clipboard: {
      writeText: jest.fn()
    }
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    parse: (uri: string) => ({ toString: () => uri })
  },
  Range: class {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  WorkspaceEdit: class {
    _edits: Map<string, unknown[]> = new Map();
    set(uri: unknown, edits: unknown[]) {
      this._edits.set(String(uri), edits);
    }
    replace() {}
  },
  TextEdit: class {
    constructor(public range: unknown, public newText: string) {}
  },
  Disposable: class {},
  ExtensionContext: class {},
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
    Source: 'source',
    SourceOrganizeImports: 'source.organizeImports',
  },
}), { virtual: true });

jest.mock('vscode-languageclient/node', () => ({
  LanguageClient: jest.fn(),
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
    Source: 'source',
    SourceOrganizeImports: 'source.organizeImports',
  },
}), { virtual: true });

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { registerFormatCommand } from '../format';
import { registerCompileCommands } from '../compile';
import { registerGoToDefinitionCommand } from '../definition';
import { registerBreakingCommands } from '../breaking';
import { registerLinterCommands } from '../linter';
import { registerRenumberCommands } from '../renumber';
import { registerAllCommands } from '../index';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES } from '../../../server/utils/constants';

jest.mock('vscode', () => ({
  commands: {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    executeCommand: jest.fn()
  },
  window: {
    activeTextEditor: undefined as unknown,
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      clear: jest.fn()
    }))
  },
  workspace: {
    workspaceFolders: undefined as unknown,
    applyEdit: jest.fn().mockResolvedValue(true)
  },
  env: {
    openExternal: jest.fn(),
    clipboard: {
      writeText: jest.fn()
    }
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    parse: (uri: string) => ({ toString: () => uri })
  },
  Range: class {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  WorkspaceEdit: class {
    _edits: Map<string, unknown[]> = new Map();
    set(uri: unknown, edits: unknown[]) {
      this._edits.set(String(uri), edits);
    }
    replace() {}
  },
  TextEdit: class {
    constructor(public range: unknown, public newText: string) {}
  },
  Disposable: class {},
  ExtensionContext: class {},
}), { virtual: true });

const mockVscode = vscode as unknown as {
  commands: {
    registerCommand: jest.Mock;
    executeCommand: jest.Mock;
  };
  window: {
    activeTextEditor: unknown;
    showWarningMessage: jest.Mock;
    showInformationMessage: jest.Mock;
    showErrorMessage: jest.Mock;
    showQuickPick: jest.Mock;
    createOutputChannel: jest.Mock;
  };
  workspace: {
    workspaceFolders: unknown;
    applyEdit: jest.Mock;
  };
  env: {
    openExternal: jest.Mock;
    clipboard: { writeText: jest.Mock };
  };
};

describe('Client Commands', () => {
  let mockClient: jest.Mocked<LanguageClient>;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      sendRequest: jest.fn(),
      onRequest: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      onReady: jest.fn(),
      onNotification: jest.fn(),
      onDidChangeState: jest.fn(),
      dispose: jest.fn(),
      outputChannel: undefined,
      clientOptions: {} as never,
      info: {} as never,
      state: 1 as never,
    } as unknown as jest.Mocked<LanguageClient>;

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      extensionUri: { fsPath: '/test/extension' } as never,
      extensionPath: '/test/extension',
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      logPath: '/test/log',
      extensionMode: 1 as never,
      environmentVariableCollection: {} as never,
      secrets: {} as never,
    } as unknown as vscode.ExtensionContext;
  });

  describe('Format Command', () => {
    it('should register format document command', () => {
      const disposable = registerFormatCommand(mockContext, mockClient);
      
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.formatDocument',
        expect.any(Function)
      );
      expect(disposable).toBeDefined();
    });

    it('should format active proto document', async () => {
      const mockEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockVscode.window.activeTextEditor = mockEditor;

      registerFormatCommand(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('editor.action.formatDocument');
    });

    it('should not format non-proto documents', async () => {
      const mockEditor = {
        document: {
          languageId: 'javascript',
          uri: { toString: () => 'file://test.js' }
        }
      };
      mockVscode.window.activeTextEditor = mockEditor;

      registerFormatCommand(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle no active editor', async () => {
      mockVscode.window.activeTextEditor = undefined;

      registerFormatCommand(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('Compile Commands', () => {
    it('should register compile file and all commands', () => {
      const disposables = registerCompileCommands(mockContext, mockClient);
      
      expect(disposables).toHaveLength(2);
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.compileFile',
        expect.any(Function)
      );
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.compileAll',
        expect.any(Function)
      );
    });

    it('should compile active proto file successfully', async () => {
      const mockEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' },
          fsPath: '/test/test.proto'
        }
      };
      mockVscode.window.activeTextEditor = mockEditor;
      
      mockClient.sendRequest
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ success: true });

      registerCompileCommands(mockContext, mockClient);
      const compileFileHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.compileFile'
      )![1];

      await compileFileHandler();

      expect(mockClient.sendRequest).toHaveBeenCalledWith(REQUEST_METHODS.IS_PROTOC_AVAILABLE, {});
      expect(mockClient.sendRequest).toHaveBeenCalledWith(REQUEST_METHODS.COMPILE_FILE, {
        uri: 'file://test.proto'
      });
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.COMPILED_SUCCESSFULLY
      );
    });

    it('should show warning for non-proto file', async () => {
      const mockEditor = {
        document: {
          languageId: 'javascript',
          uri: { toString: () => 'file://test.js' },
          fsPath: '/test/test.js'
        }
      };
      mockVscode.window.activeTextEditor = mockEditor;

      registerCompileCommands(mockContext, mockClient);
      const compileFileHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.compileFile'
      )![1];

      await compileFileHandler();

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        VALIDATION_MESSAGES.NO_PROTO_FILE
      );
    });

    it('should handle protoc not available', async () => {
      const mockEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' },
          fsPath: '/test/test.proto'
        }
      };
      mockVscode.window.activeTextEditor = mockEditor;
      
      mockClient.sendRequest.mockResolvedValueOnce(false);
      mockVscode.window.showErrorMessage.mockResolvedValueOnce('Configure Path');

      registerCompileCommands(mockContext, mockClient);
      const compileFileHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.compileFile'
      )![1];

      await compileFileHandler();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('protoc is not available'),
        'Configure Path',
        'Install protoc'
      );
      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'protobuf.protoc.path'
      );
    });

    it('should compile all files successfully', async () => {
      mockVscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/test/workspace' } }
      ];
      
      mockClient.sendRequest
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ success: true, fileCount: 5 });

      registerCompileCommands(mockContext, mockClient);
      const compileAllHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.compileAll'
      )![1];

      await compileAllHandler();

      expect(mockClient.sendRequest).toHaveBeenCalledWith(REQUEST_METHODS.IS_PROTOC_AVAILABLE, {});
      expect(mockClient.sendRequest).toHaveBeenCalledWith(REQUEST_METHODS.COMPILE_ALL, {
        workspaceRoot: '/test/workspace'
      });
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.COMPILED_ALL(5)
      );
    });

    it('should handle no workspace folders for compile all', async () => {
      mockVscode.workspace.workspaceFolders = undefined;

      registerCompileCommands(mockContext, mockClient);
      const compileAllHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.compileAll'
      )![1];

      await compileAllHandler();

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('No workspace folder')
      );
    });
  });

  describe('Go To Definition Command', () => {
    it('should register go to definition command', () => {
      const disposable = registerGoToDefinitionCommand(mockContext, mockClient);
      
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.goToDefinition',
        expect.any(Function)
      );
      expect(disposable).toBeDefined();
    });

    it('should execute reveal definition for proto files', () => {
      const mockEditor = {
        document: { languageId: 'proto' }
      };
      mockVscode.window.activeTextEditor = mockEditor;

      registerGoToDefinitionCommand(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      commandHandler();
      
      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('editor.action.revealDefinition');
    });

    it('should not execute for non-proto files', () => {
      const mockEditor = {
        document: { languageId: 'javascript' }
      };
      mockVscode.window.activeTextEditor = mockEditor;

      registerGoToDefinitionCommand(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      commandHandler();
      
      expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('Breaking Changes Commands', () => {
    it('should register breaking changes command', () => {
      const disposables = registerBreakingCommands(mockContext, mockClient);
      
      expect(disposables).toHaveLength(1);
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.checkBreakingChanges',
        expect.any(Function)
      );
    });

    it('should show warning for non-proto file', async () => {
      mockVscode.window.activeTextEditor = {
        document: { languageId: 'javascript' }
      };

      registerBreakingCommands(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        VALIDATION_MESSAGES.NO_PROTO_FILE
      );
    });

    it('should show success when no breaking changes', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockResolvedValue({
        changes: []
      });

      registerBreakingCommands(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.NO_BREAKING_CHANGES
      );
    });

    it('should show output panel when breaking changes detected', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockResolvedValue({
        changes: [
          { rule: 'FIELD_NO_DELETE', message: 'Field deleted', location: { line: 5, character: 0 } }
        ]
      });

      registerBreakingCommands(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.window.createOutputChannel).toHaveBeenCalledWith('Protobuf Breaking Changes');
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('1 breaking change(s) detected')
      );
    });

    it('should handle errors gracefully', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockRejectedValue(new Error('Connection failed'));

      registerBreakingCommands(mockContext, mockClient);
      const commandHandler = mockVscode.commands.registerCommand.mock.calls[0][1];
      
      await commandHandler();
      
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed')
      );
    });
  });

  describe('Linter Commands', () => {
    it('should register linter commands', () => {
      const disposables = registerLinterCommands(mockContext, mockClient);
      
      expect(disposables).toHaveLength(2);
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.runExternalLinter',
        expect.any(Function)
      );
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.showAvailableLintRules',
        expect.any(Function)
      );
    });

    it('should show warning for non-proto file when running linter', async () => {
      mockVscode.window.activeTextEditor = {
        document: { languageId: 'javascript' }
      };

      registerLinterCommands(mockContext, mockClient);
      const runLinterHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.runExternalLinter'
      )![1];
      
      await runLinterHandler();
      
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        VALIDATION_MESSAGES.NO_PROTO_FILE
      );
    });

    it('should show warning when linter not available', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockResolvedValue({ available: false, linter: 'none' });
      mockVscode.window.showWarningMessage.mockResolvedValue(undefined);

      registerLinterCommands(mockContext, mockClient);
      const runLinterHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.runExternalLinter'
      )![1];
      
      await runLinterHandler();
      
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('No external linter is configured'),
        'Configure Linter',
        'Learn More'
      );
    });

    it('should run linter and show success', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest
        .mockResolvedValueOnce({ available: true, linter: 'buf' })
        .mockResolvedValueOnce({ success: true, issueCount: 0 });

      registerLinterCommands(mockContext, mockClient);
      const runLinterHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.runExternalLinter'
      )![1];
      
      await runLinterHandler();
      
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.LINTER_PASSED
      );
    });

    it('should show lint rules in output panel', async () => {
      mockClient.sendRequest.mockResolvedValue({
        rules: ['FIELD_NAMES_LOWER_SNAKE_CASE', 'MESSAGE_NAMES_CAMEL_CASE']
      });

      registerLinterCommands(mockContext, mockClient);
      const showRulesHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.showAvailableLintRules'
      )![1];
      
      await showRulesHandler();
      
      expect(mockVscode.window.createOutputChannel).toHaveBeenCalledWith('Protobuf Lint Rules');
    });
  });

  describe('Renumber Commands', () => {
    it('should register all renumber commands', () => {
      const disposables = registerRenumberCommands(mockContext, mockClient);
      
      expect(disposables).toHaveLength(4);
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.renumberDocument',
        expect.any(Function)
      );
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.renumberMessage',
        expect.any(Function)
      );
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.renumberFromCursor',
        expect.any(Function)
      );
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.renumberEnum',
        expect.any(Function)
      );
    });

    it('should show warning for non-proto file when renumbering document', async () => {
      mockVscode.window.activeTextEditor = {
        document: { languageId: 'javascript' }
      };

      registerRenumberCommands(mockContext, mockClient);
      const renumberDocHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.renumberDocument'
      )![1];
      
      await renumberDocHandler();
      
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        VALIDATION_MESSAGES.NO_PROTO_FILE
      );
    });

    it('should renumber document fields successfully', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockResolvedValue([
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: '1' }
      ]);
      mockVscode.workspace.applyEdit.mockResolvedValue(true);

      registerRenumberCommands(mockContext, mockClient);
      const renumberDocHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.renumberDocument'
      )![1];
      
      await renumberDocHandler();
      
      expect(mockClient.sendRequest).toHaveBeenCalledWith(
        REQUEST_METHODS.RENUMBER_DOCUMENT,
        { uri: 'file://test.proto' }
      );
      expect(mockVscode.workspace.applyEdit).toHaveBeenCalled();
    });

    it('should show message when no fields to renumber', async () => {
      mockVscode.window.activeTextEditor = {
        document: {
          languageId: 'proto',
          uri: { toString: () => 'file://test.proto' }
        }
      };
      mockClient.sendRequest.mockResolvedValue([]);

      registerRenumberCommands(mockContext, mockClient);
      const renumberDocHandler = mockVscode.commands.registerCommand.mock.calls.find(
        ([command]: [string]) => command === 'protobuf.renumberDocument'
      )![1];
      
      await renumberDocHandler();
      
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        VALIDATION_MESSAGES.NO_FIELDS_TO_RENUMBER
      );
    });
  });

  describe('registerAllCommands', () => {
    it('should register all command groups', () => {
      const disposables = registerAllCommands(mockContext, mockClient);
      
      expect(Array.isArray(disposables)).toBe(true);
      expect(disposables.length).toBeGreaterThan(10);
    });

    it('should register migrateToProto3 command', () => {
      registerAllCommands(mockContext, mockClient);
      
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.migrateToProto3',
        expect.any(Function)
      );
    });

    it('should register copyToClipboard command', () => {
      registerAllCommands(mockContext, mockClient);
      
      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'protobuf.copyToClipboard',
        expect.any(Function)
      );
    });
  });
});