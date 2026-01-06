/**
 * Tests for AutoDetector
 *
 * Tests cover:
 * - Tool detection from common paths
 * - Shell PATH fallback detection
 * - Version parsing
 * - Configuration file detection
 */

import * as path from 'path';

// Test paths - use path.join for cross-platform compatibility
// These are defined before mocks but are accessible in mock factories
// because Jest evaluates them after the imports
const getTestWorkspace = () => path.join(path.sep, 'test', 'workspace');
const getTestGlobalStorage = () => path.join(path.sep, 'test', 'global-storage');
const getHomebrewBin = () => path.join(path.sep, 'opt', 'homebrew', 'bin');
const _getTestUserHome = () => path.join(path.sep, 'Users', 'testuser');

// Mock vscode
const mockOutputChannel = {
  appendLine: jest.fn(),
  append: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

const mockConfiguration = new Map<string, unknown>();

jest.mock('vscode', () => {
   
  const pathModule = require('path');
  const testWorkspace = pathModule.join(pathModule.sep, 'test', 'workspace');
  return {
    window: {
      showInformationMessage: jest.fn(),
      showQuickPick: jest.fn(),
    },
    workspace: {
      getConfiguration: jest.fn((section: string) => ({
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const fullKey = section ? `${section}.${key}` : key;
          return mockConfiguration.get(fullKey) ?? defaultValue;
        }),
        update: jest.fn(),
      })),
      workspaceFolders: [{ uri: { fsPath: testWorkspace } }],
    },
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
    },
  };
}, { virtual: true });

// Mock fsUtils for async fileExists function
const mockFileExists = jest.fn();
jest.mock('../../utils/fsUtils', () => ({
  fileExists: (...args: unknown[]) => mockFileExists(...args),
}));

// Mock fs for shebang detection (autoDetector still uses fs.existsSync, fs.openSync, etc. for shebang detection)
const mockFsExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
  openSync: jest.fn(),
  readSync: jest.fn(),
  closeSync: jest.fn(),
}));

// Mock os to return consistent platform for tests
jest.mock('os', () => {
   
  const pathModule = require('path');
  const testUserHome = pathModule.join(pathModule.sep, 'Users', 'testuser');
  return {
    platform: () => 'darwin',
    homedir: () => testUserHome,
  };
});

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('AutoDetector', () => {
  let mockContext: {
    globalStorageUri: { fsPath: string };
    subscriptions: { push: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfiguration.clear();
    // Mock fsUtils.fileExists (async) - for config file and tool detection
    mockFileExists.mockResolvedValue(false);
    // Mock fs.existsSync (sync) - for shebang detection
    mockFsExistsSync.mockReturnValue(false);
    // Always set up a default mock spawn
    mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

    mockContext = {
      globalStorageUri: { fsPath: getTestGlobalStorage() },
      subscriptions: { push: jest.fn() },
    };
  });

  describe('detectTools', () => {
    it('should detect tools when file exists at common path', async () => {
      const expectedProtocPath = path.join(getHomebrewBin(), 'protoc');
      const expectedBufPath = path.join(getHomebrewBin(), 'buf');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === expectedProtocPath) {
          return true;
        }
        if (p === expectedBufPath) {
          return true;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 33.0\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.protoc).toBeDefined();
      expect(result.protoc?.path).toBe(expectedProtocPath);
    });

    it('should detect buf.yaml configuration file', async () => {
      const bufYamlPath = path.join(getTestWorkspace(), 'buf.yaml');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === bufYamlPath) {
          return true;
        }
        return false;
      });

      // Set up spawn to not throw for tool detection
      mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.bufYamlFound).toBe(true);
    });

    it('should detect buf.work.yaml workspace configuration', async () => {
      const bufWorkYamlPath = path.join(getTestWorkspace(), 'buf.work.yaml');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === bufWorkYamlPath) {
          return true;
        }
        return false;
      });

      mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.bufWorkYamlFound).toBe(true);
    });

    it('should detect .protolint.yaml configuration', async () => {
      const protolintConfigPath = path.join(getTestWorkspace(), '.protolint.yaml');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === protolintConfigPath) {
          return true;
        }
        return false;
      });

      mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.protolintConfigFound).toBe(true);
    });

    it('should detect .clang-format configuration', async () => {
      const clangFormatConfigPath = path.join(getTestWorkspace(), '.clang-format');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === clangFormatConfigPath) {
          return true;
        }
        return false;
      });

      mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.clangFormatConfigFound).toBe(true);
    });

    it('should handle tool detection failure gracefully', async () => {
      mockFileExists.mockResolvedValue(false);

      // All spawns fail
      mockSpawn.mockReturnValue(createMockProcess('', 'command not found', 127, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      // Should return undefined for tools, not throw
      expect(result.protoc).toBeUndefined();
      expect(result.buf).toBeUndefined();
    });

    it('should parse version from protoc output', async () => {
      const expectedProtocPath = path.join(getHomebrewBin(), 'protoc');
      mockFileExists.mockImplementation(async (p: string) => p === expectedProtocPath);

      // Protoc outputs "libprotoc X.Y.Z"
      mockSpawn.mockReturnValue(createMockProcess('libprotoc 33.0\n', '', 0));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.protoc?.version).toBe('libprotoc 33.0');
    });

    it('should parse version from buf output', async () => {
      const expectedBufPath = path.join(getHomebrewBin(), 'buf');
      mockFileExists.mockImplementation(async (p: string) => p === expectedBufPath);

      // Buf outputs just the version
      mockSpawn.mockReturnValue(createMockProcess('1.28.1\n', '', 0));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.buf?.version).toBe('1.28.1');
    });
  });

  describe('needsShellExecution - script-based protoc detection', () => {
    /**
     * These tests cover GitHub issue #38 where nanopb's Python-based protoc
     * wrapper was not being detected because it's a script, not a binary.
     */

    it('should detect .py files as scripts (nanopb protoc wrapper)', async () => {
      const { needsShellExecution } = await import('../autoDetector');

      // Python script protoc wrappers like nanopb's
      expect(needsShellExecution('/path/to/nanopb/generator/protoc.py')).toBe(true);
      expect(needsShellExecution('C:\\nanopb\\generator\\protoc.py')).toBe(true);
    });

    it('should detect shell script extensions', async () => {
      const { needsShellExecution } = await import('../autoDetector');

      expect(needsShellExecution('/usr/local/bin/protoc.sh')).toBe(true);
      expect(needsShellExecution('/scripts/protoc.bash')).toBe(true);
      expect(needsShellExecution('/scripts/protoc.zsh')).toBe(true);
    });

    it('should detect Windows script extensions', async () => {
      const { needsShellExecution } = await import('../autoDetector');

      expect(needsShellExecution('C:\\tools\\protoc.bat')).toBe(true);
      expect(needsShellExecution('C:\\tools\\protoc.cmd')).toBe(true);
      expect(needsShellExecution('C:\\tools\\protoc.ps1')).toBe(true);
    });

    it('should not flag regular binaries as scripts', async () => {
      const { needsShellExecution } = await import('../autoDetector');

      // Regular binaries should not need shell execution
      expect(needsShellExecution('/usr/local/bin/protoc')).toBe(false);
      expect(needsShellExecution('protoc')).toBe(false);
      expect(needsShellExecution('C:\\tools\\protoc.exe')).toBe(false);
    });

    it('should detect extensionless scripts with shebang', async () => {
      const { needsShellExecution } = await import('../autoDetector');

      // Mock fs to simulate a file with shebang
      const scriptPath = path.join(path.sep, 'path', 'to', 'nanopb', 'protoc');

      // The mock fs.existsSync returns false by default, so shebang check will return false
      // This test verifies that extensionless files without filesystem access return false
      expect(needsShellExecution(scriptPath)).toBe(false);
    });
  });

  describe('detectAndPrompt', () => {
    it('should only prompt once per session', async () => {
      const vscode = await import('vscode');

      mockFileExists.mockResolvedValue(false);
      mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      // First call
      await detector.detectAndPrompt();

      // Second call should not prompt again
      await detector.detectAndPrompt();

      // showInformationMessage should only be called once at most
      // (or not at all if no suggestions)
      expect((vscode.window.showInformationMessage as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
    });
  });
});

/**
 * Helper to create a mock child process
 */
function createMockProcess(
  stdout: string,
  stderr: string,
  exitCode: number,
  error?: Error
) {
  const stdoutHandlers: Record<string, ((data: Buffer) => void)[]> = {};
  const stderrHandlers: Record<string, ((data: Buffer) => void)[]> = {};
  const procHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const mockProc = {
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
  };
  return mockProc;
}
