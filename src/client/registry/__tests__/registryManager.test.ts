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
        if (key === 'buf.path') {
          return 'buf';
        }
        if (key === 'externalLinter.bufPath') {
          return undefined;
        }
        return undefined;
      }),
    })),
  },
};

jest.mock('vscode', () => mockVscode, { virtual: true });

// Mock fsUtils - use jest.fn() inside the factory to avoid hoisting issues
const mockFileExists = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('../../utils/fsUtils', () => ({
  fileExists: mockFileExists,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

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

/**
 * Helper to flush promises and advance fake timers
 */
async function flushPromisesAndTimers(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(20);
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('RegistryManager', () => {
  let registryManager: RegistryManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    mockFileExists.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockSpawn.mockClear();

    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
    mockFileExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('version: v1\nname: test\n\ndeps:\n  - existing-module');
    mockWriteFile.mockResolvedValue(undefined);
    mockVscode.window.showInputBox.mockResolvedValue(undefined);
    mockVscode.window.showInformationMessage.mockResolvedValue(undefined);
    (mockVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string) => {
        if (key === 'buf.path') {
          return 'buf';
        }
        if (key === 'externalLinter.bufPath') {
          return undefined;
        }
        return undefined;
      }),
    });

    mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 0);
      }
      return mockProc;
    });
    mockStdout.on.mockImplementation(() => mockStdout);
    mockStderr.on.mockImplementation(() => mockStderr);

    mockSpawn.mockReturnValue(mockProc);

    registryManager = new RegistryManager(mockOutputChannel as unknown as vscode.OutputChannel);
  });

  afterEach(() => {
    jest.useRealTimers();
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
        placeHolder: 'buf.build/owner/repository',
      });
      expect(mockFileExists).not.toHaveBeenCalled();
    });

    it('should show error when no workspace is open', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockVscode.workspace.workspaceFolders = undefined;

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace open');
    });

    it('should prompt to create buf.yaml when it does not exist', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockFileExists.mockResolvedValue(false);
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
      mockFileExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      mockVscode.window.showInformationMessage.mockResolvedValue('Yes');
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockSpawn).toHaveBeenCalledWith('buf', ['mod', 'init'], { cwd: '/test/workspace' });
    });

    it('should return early when user declines to create buf.yaml', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/test/module');
      mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
      mockFileExists.mockReset();
      mockFileExists.mockResolvedValue(false);
      mockVscode.window.showInformationMessage.mockReset();
      mockVscode.window.showInformationMessage.mockResolvedValue('No');
      mockWriteFile.mockReset();
      mockSpawn.mockClear();

      await registryManager.addDependency();

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'buf.yaml not found. Create one?',
        'Yes',
        'No'
      );
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should add dependency to existing deps section', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n\ndeps:\n  - buf.build/existing/module');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/buf.yaml',
        expect.stringContaining('buf.build/new/module')
      );
    });

    it('should add deps section when it does not exist', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/buf.yaml',
        expect.stringContaining('deps:\n  - buf.build/new/module')
      );
    });

    it('should not duplicate existing dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/existing/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n\ndeps:\n  - buf.build/existing/module');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      const writeCall = mockWriteFile.mock.calls[0];
      if (writeCall) {
        const content = writeCall[1] as string;
        const matches = content.match(/buf\.build\/existing\/module/g);
        expect(matches?.length).toBe(1);
      }
    });

    it('should run buf dep update after adding dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockSpawn).toHaveBeenCalledWith('buf', ['dep', 'update'], { cwd: '/test/workspace' });
    });

    it('should show success message after adding dependency', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith('Added dependency buf.build/new/module');
    });

    it('should log to output channel', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Added buf.build/new/module to buf.yaml');
    });

    it('should show error message when file operation fails', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockRejectedValue(new Error('File read error'));

      await registryManager.addDependency();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should handle buf command failure', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 0);
        }
        return mockProc;
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should handle spawn error event', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      mockProc.on.mockImplementation((event: string, callback: (code?: number | Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn error')), 0);
        }
        return mockProc;
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add dependency')
      );
    });

    it('should use custom buf path from configuration', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');
      (mockVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => {
          if (key === 'buf.path') {
            return '/custom/path/buf';
          }
          return undefined;
        }),
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockSpawn).toHaveBeenCalledWith('/custom/path/buf', expect.any(Array), expect.any(Object));
    });

    it('should fallback to externalLinter.bufPath if buf.path is not set', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');
      (mockVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => {
          if (key === 'buf.path') {
            return undefined;
          }
          if (key === 'externalLinter.bufPath') {
            return '/fallback/buf';
          }
          return undefined;
        }),
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockSpawn).toHaveBeenCalledWith('/fallback/buf', expect.any(Array), expect.any(Object));
    });
  });

  describe('runBufCommand (private)', () => {
    it('should capture stdout output', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      mockStdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('stdout output')), 0);
        }
        return mockStdout;
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockOutputChannel.append).toHaveBeenCalledWith('stdout output');
    });

    it('should capture stderr output', async () => {
      mockVscode.window.showInputBox.mockResolvedValue('buf.build/new/module');
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('version: v1\nname: test\n');

      mockStderr.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('stderr output')), 0);
        }
        return mockStderr;
      });

      const addPromise = registryManager.addDependency();
      await flushPromisesAndTimers();
      await addPromise;

      expect(mockOutputChannel.append).toHaveBeenCalledWith('stderr output');
    });
  });
});
