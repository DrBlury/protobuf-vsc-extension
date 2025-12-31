import type * as vscode from 'vscode';

const mockOutputChannel = {
  appendLine: jest.fn(),
  append: jest.fn(),
  show: jest.fn(),
  clear: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
  name: 'Buf Registry',
  replace: jest.fn(),
};

const mockVscode = {
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => mockOutputChannel),
  },
  workspace: {
    workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
    getConfiguration: jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'buf.path') {return 'buf';}
        if (key === 'externalLinter.bufPath') {return undefined;}
        return undefined;
      }),
    })),
  },
};

jest.mock('vscode', () => mockVscode, { virtual: true });

const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
};

jest.mock('fs', () => mockFs);

jest.mock('path', () => ({
  join: (...args: string[]) => args.join('/'),
}));

const mockStdout = {
  on: jest.fn(),
};
const mockStderr = {
  on: jest.fn(),
};
const mockProc = {
  stdout: mockStdout,
  stderr: mockStderr,
  on: jest.fn(),
  kill: jest.fn(),
};

const mockSpawn = jest.fn(() => mockProc);
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { RegistryManager } from '../registryManager';

describe('RegistryManager', () => {
  let registryManager: RegistryManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockVscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/test/workspace' } }
    ];
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n\ndeps:\n  - existing-module');
    mockVscode.window.showInputBox.mockResolvedValue(undefined);
    mockVscode.window.showInformationMessage.mockResolvedValue(undefined);

    mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 0);
      }
      return mockProc;
    });
    mockStdout.on.mockImplementation(() => mockStdout);
    mockStderr.on.mockImplementation(() => mockStderr);

    registryManager = new RegistryManager(mockOutputChannel as unknown as vscode.OutputChannel);
  });

  describe('constructor', () => {
    it('should store the output channel', () => {
      expect(registryManager['outputChannel']).toBe(mockOutputChannel);
    });
  });

  describe('addDependency', () => {
    it('should return early when user cancels input box', async () => {
      mockVscode.window.showInputBox.mockResolvedValue(undefined);

      await registryManager.addDependency();

      expect(mockVscode.window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Enter Buf module name (e.g., buf.build/acme/weather)',
        placeHolder: 'buf.build/owner/repository'
      });
      expect(mockFs.existsSync).not.toHaveBeenCalled();
    });

    it('should show error when no workspace is open', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockVscode.workspace.workspaceFolders = undefined;

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace open');
    });

    it('should prompt to create buf.yaml when it does not exist', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockFs.existsSync.mockReturnValue(false);
      mockVscode.window.showInformationMessage.mockResolvedValue('No');

      await registryManager.addDependency();

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'buf.yaml not found. Create one?',
        'Yes',
        'No'
      );
    });

    it('should run buf mod init when user chooses to create buf.yaml', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockVscode.window.showInformationMessage.mockResolvedValue('Yes');
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      await registryManager.addDependency();

      expect(mockSpawn).toHaveBeenCalledWith(
        'buf',
        ['mod', 'init'],
        { cwd: '/test/workspace', shell: true }
      );
    });

    it('should return early when user declines to create buf.yaml', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      mockFs.existsSync.mockReset();
      mockFs.existsSync.mockReturnValue(false);
      mockVscode.window.showInformationMessage.mockReset();
      mockVscode.window.showInformationMessage.mockResolvedValue('No');
      mockFs.writeFileSync.mockReset();
      mockSpawn.mockClear();

      await registryManager.addDependency();

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'buf.yaml not found. Create one?',
        'Yes',
        'No'
      );
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should add dependency to existing deps section', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n\ndeps:\n  - buf.build/existing/module');

      await registryManager.addDependency();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/buf.yaml',
        expect.stringContaining('buf.build/new/module')
      );
    });

    it('should add deps section when it does not exist', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      await registryManager.addDependency();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/buf.yaml',
        expect.stringContaining('deps:\n  - buf.build/new/module')
      );
    });

    it('should not duplicate existing dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/existing/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n\ndeps:\n  - buf.build/existing/module');

      await registryManager.addDependency();

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      if (writeCall) {
        const content = writeCall[1] as string;
        const matches = content.match(/buf\.build\/existing\/module/g);
        expect(matches?.length).toBe(1);
      }
    });

    it('should run buf dep update after adding dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      await registryManager.addDependency();

      expect(mockSpawn).toHaveBeenCalledWith(
        'buf',
        ['dep', 'update'],
        { cwd: '/test/workspace', shell: true }
      );
    });

    it('should show success message after adding dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      await registryManager.addDependency();

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Added dependency buf.build/new/module'
      );
    });

    it('should log to output channel', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      await registryManager.addDependency();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Added buf.build/new/module to buf.yaml'
      );
    });

    it('should show error message when file operation fails', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should handle buf command failure', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 0);
        }
        return mockProc;
      });

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should handle spawn error event', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn error')), 0);
        }
        return mockProc;
      });

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should use custom buf path from configuration', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');
      (mockVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => {
          if (key === 'buf.path') {return '/custom/path/buf';}
          return undefined;
        }),
      });

      await registryManager.addDependency();

      expect(mockSpawn).toHaveBeenCalledWith(
        '/custom/path/buf',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should fallback to externalLinter.bufPath if buf.path is not set', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');
      (mockVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => {
          if (key === 'buf.path') {return undefined;}
          if (key === 'externalLinter.bufPath') {return '/fallback/buf';}
          return undefined;
        }),
      });

      await registryManager.addDependency();

      expect(mockSpawn).toHaveBeenCalledWith(
        '/fallback/buf',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('runBufCommand (private)', () => {
    it('should capture stdout output', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      mockStdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('stdout output')), 0);
        }
        return mockStdout;
      });

      await registryManager.addDependency();

      expect(mockOutputChannel.append).toHaveBeenCalledWith('stdout output');
    });

    it('should capture stderr output', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('version: v1\nname: test\n');

      mockStderr.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('stderr output')), 0);
        }
        return mockStderr;
      });

      await registryManager.addDependency();

      expect(mockOutputChannel.append).toHaveBeenCalledWith('stderr output');
    });
  });
});
