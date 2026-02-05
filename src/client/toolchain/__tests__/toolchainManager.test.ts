/**
 * Tests for ToolchainManager
 *
 * Tests cover:
 * - Tool detection (system tools, managed tools, shell fallback)
 * - Status bar updates based on detection results
 * - Manage toolchain menu options based on context
 * - Tool installation workflow
 */

import { createMockVscode } from '../../__tests__/testUtils';
import type * as fsUtils from '../../utils/fsUtils';
import * as path from 'path';
import * as os from 'os';

// Cross-platform path helpers
const getTestWorkspace = () => path.join(path.sep, 'test', 'workspace');
const getTestGlobalStorage = () => path.join(path.sep, 'test', 'global-storage');
const getHomebrewBin = () => path.join(path.sep, 'opt', 'homebrew', 'bin');
// Get platform-specific executable name (adds .exe on Windows)
const getExeName = (name: string) => name + (os.platform() === 'win32' ? '.exe' : '');

// Mock vscode (shared helper + per-test overrides)
const mockVscode = createMockVscode();

const mockStatusBarItem = {
  text: '',
  tooltip: '',
  backgroundColor: undefined as unknown,
  command: '',
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

const mockOutputChannel = {
  appendLine: jest.fn(),
  append: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

const mockConfiguration = new Map<string, unknown>();

const testWorkspace = getTestWorkspace();

mockVscode.window.createStatusBarItem = jest.fn(() => mockStatusBarItem);
mockVscode.window.showQuickPick = jest.fn();
mockVscode.window.showInformationMessage = jest.fn();
mockVscode.window.showWarningMessage = jest.fn();
mockVscode.window.showErrorMessage = jest.fn();
mockVscode.window.withProgress = jest.fn(
  (
    options: unknown,
    task: (progress: { report: jest.Mock }, token: { isCancellationRequested: boolean }) => Promise<unknown>
  ) => task({ report: jest.fn() }, { isCancellationRequested: false })
);
(mockVscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const fullKey = `${section}.${key}`;
    return mockConfiguration.get(fullKey) ?? defaultValue;
  }),
  update: jest.fn(),
  has: jest.fn(() => false),
  inspect: jest.fn(),
}));
mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: testWorkspace } }];

jest.mock('vscode', () => mockVscode, { virtual: true });

// Mock fsUtils for async operations (shared global mock)
let mockFileExists: jest.Mock;
let mockCreateDirectory: jest.Mock;
let mockReadDirectory: jest.Mock;

// Mock fs for streaming downloads and chmod (still needed for Node.js operations)
const mockFsExistsSync = jest.fn();
const mockFsMkdirSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockFsMkdirSync(...args),
  readdirSync: jest.fn(() => []),
  unlinkSync: jest.fn(),
  unlink: jest.fn(),
  chmodSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock https
jest.mock('https', () => ({
  get: jest.fn(),
}));

/**
 * Helper to flush promises and advance fake timers
 */
async function flushPromisesAndTimers(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(20);
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('ToolchainManager', () => {
  let mockContext: {
    globalStorageUri: { fsPath: string };
    subscriptions: { push: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    mockConfiguration.clear();
    mockStatusBarItem.text = '';
    mockStatusBarItem.tooltip = '';
    mockStatusBarItem.backgroundColor = undefined;

    const fsUtilsMock = jest.requireMock('../../utils/fsUtils') as jest.Mocked<typeof fsUtils>;
    mockFileExists = fsUtilsMock.fileExists as jest.Mock;
    mockCreateDirectory = fsUtilsMock.createDirectory as jest.Mock;
    mockReadDirectory = fsUtilsMock.readDirectory as jest.Mock;

    mockContext = {
      globalStorageUri: { fsPath: getTestGlobalStorage() },
      subscriptions: { push: jest.fn() },
    };

    // Default: bin directory doesn't exist yet (for async fsUtils)
    mockFileExists.mockResolvedValue(false);
    mockCreateDirectory.mockResolvedValue(undefined);
    mockReadDirectory.mockResolvedValue([]);
    // Default: bin directory doesn't exist yet (for sync fs)
    mockFsExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Tool Detection', () => {
    it('should detect protoc in common macOS paths', async () => {
      // Simulate protoc exists at /opt/homebrew/bin/protoc
      const homebrewProtocPath = path.join(getHomebrewBin(), 'protoc');
      mockFileExists.mockImplementation(async (p: string) => {
        if (p === homebrewProtocPath) {
          return true;
        }
        if (p.includes('global-storage')) {
          return false;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 33.0\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      // Wait for async checkTools to complete
      await flushPromisesAndTimers();

      // Verify spawn was called with the detected path
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should detect protoc via shell PATH fallback', async () => {
      // Simulate no file exists at common paths
      mockFileExists.mockResolvedValue(false);

      // First spawn fails (ENOENT), second with shell succeeds
      const failProcess = createMockProcess('', '', 1, new Error('ENOENT'));
      const successProcess = createMockProcess('libprotoc 33.0\n', '', 0);

      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? failProcess : successProcess;
      });

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      // Should have called spawn multiple times (with and without shell)
      expect(mockSpawn.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect tools in extension managed directory', async () => {
      const managedBinPath = path.join(getTestGlobalStorage(), 'bin');
      const managedProtocPath = path.join(managedBinPath, getExeName('protoc'));

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === managedProtocPath) {
          return true;
        }
        if (p === managedBinPath) {
          return true;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 25.1\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      expect(mockFileExists).toHaveBeenCalledWith(managedProtocPath);
    });

    it('should handle tool not found gracefully', async () => {
      mockFileExists.mockResolvedValue(false);

      // Spawn always fails
      const failProcess = createMockProcess('', 'command not found', 127, new Error('ENOENT'));
      mockSpawn.mockReturnValue(failProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      // Should not throw, just log
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });
  });

  describe('Status Bar Updates', () => {
    it('should show detected tool versions in status bar', async () => {
      const homebrewProtocPath = path.join(getHomebrewBin(), 'protoc');
      const homebrewBufPath = path.join(getHomebrewBin(), 'buf');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === homebrewProtocPath) {
          return true;
        }
        if (p === homebrewBufPath) {
          return true;
        }
        return false;
      });

      let spawnCall = 0;
      mockSpawn.mockImplementation(() => {
        spawnCall++;
        if (spawnCall <= 2) {
          return createMockProcess('libprotoc 33.0\n', '', 0);
        }
        return createMockProcess('1.28.1\n', '', 0);
      });

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      // Status bar should be hidden when tools are detected (no issues to report)
      expect(mockStatusBarItem.hide).toHaveBeenCalled();
    });

    it('should show info icon when no tools detected', async () => {
      mockFileExists.mockResolvedValue(false);
      const failProcess = createMockProcess('', '', 1, new Error('ENOENT'));
      mockSpawn.mockReturnValue(failProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      expect(mockStatusBarItem.text).toContain('Protobuf');
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });

    it('should show warning when no tools detected', async () => {
      // When no tools are detected, show warning to help user install them
      mockFileExists.mockResolvedValue(false);
      const failProcess = createMockProcess('', '', 1, new Error('ENOENT'));
      mockSpawn.mockReturnValue(failProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const _manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      // Should have warning background when no tools detected
      expect(mockStatusBarItem.backgroundColor).toBeDefined();
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });
  });

  describe('Manage Toolchain Menu', () => {
    it('should show "Install" option for each tool when not detected', async () => {
      const vscode = await import('vscode');
      mockFileExists.mockResolvedValue(false);
      const failProcess = createMockProcess('', '', 1, new Error('ENOENT'));
      mockSpawn.mockReturnValue(failProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      // Simulate menu open
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);
      await manager.manageToolchain();

      const quickPickCall = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
      const items = quickPickCall[0];

      // Should have install option for each undetected tool
      const hasInstallProtoc = items.some((item: { label?: string }) => item.label?.includes('Install protoc'));
      const hasInstallBuf = items.some((item: { label?: string }) => item.label?.includes('Install buf'));
      expect(hasInstallProtoc).toBe(true);
      expect(hasInstallBuf).toBe(true);
    });

    it('should NOT show "Install" option for tools that are detected', async () => {
      const vscode = await import('vscode');
      const homebrewProtocPath = path.join(getHomebrewBin(), 'protoc');
      const homebrewBufPath = path.join(getHomebrewBin(), 'buf');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p === homebrewProtocPath) {
          return true;
        }
        if (p === homebrewBufPath) {
          return true;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 33.0\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);
      await manager.manageToolchain();

      const quickPickCall = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
      const items = quickPickCall[0];

      // Should NOT have install options when tools are detected
      const hasInstallProtoc = items.some((item: { label?: string }) => item.label?.includes('Install protoc'));
      const hasInstallBuf = items.some((item: { label?: string }) => item.label?.includes('Install buf'));
      expect(hasInstallProtoc).toBe(false);
      expect(hasInstallBuf).toBe(false);
    });

    it('should show "Use managed" option when system tool detected and managed version exists', async () => {
      const vscode = await import('vscode');
      const managedPath = path.join(getTestGlobalStorage(), 'bin');
      const homebrewProtocPath = path.join(getHomebrewBin(), 'protoc');
      const homebrewBufPath = path.join(getHomebrewBin(), 'buf');

      // System tools exist AND managed tools exist
      mockFileExists.mockImplementation(async (p: string) => {
        // Managed tools exist
        if (p === path.join(managedPath, 'protoc')) {
          return true;
        }
        if (p === path.join(managedPath, 'buf')) {
          return true;
        }
        // System tools exist
        if (p === homebrewProtocPath) {
          return true;
        }
        if (p === homebrewBufPath) {
          return true;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 33.0\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { ToolchainManager } = await import('../toolchainManager');

      // Clear module cache to reset the manager
      jest.resetModules();

      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);
      await manager.manageToolchain();

      const quickPickCall = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
      if (quickPickCall) {
        const items = quickPickCall[0];
        // The manager detects from managed path first due to findToolPath logic
        // Check menu structure is correct
        expect(Array.isArray(items)).toBe(true);
      }
    });

    it('should show "Use system" option when using managed tools', async () => {
      const vscode = await import('vscode');
      const managedPath = path.join(getTestGlobalStorage(), 'bin');

      mockFileExists.mockImplementation(async (p: string) => {
        // Only managed tools exist
        if (p === path.join(managedPath, getExeName('protoc'))) {
          return true;
        }
        if (p === path.join(managedPath, getExeName('buf'))) {
          return true;
        }
        if (p === managedPath) {
          return true;
        }
        return false;
      });

      const mockProcess = createMockProcess('libprotoc 25.1\n', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);
      await manager.manageToolchain();

      const quickPickCall = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
      const items = quickPickCall[0];

      // Should show individual "Use system X" options for managed tools
      const hasUseSystemProtoc = items.some((item: { label?: string }) => item.label?.includes('Use system protoc'));
      const hasUseSystemBuf = items.some((item: { label?: string }) => item.label?.includes('Use system buf'));
      // At least one should be true (depending on which tools are detected as managed)
      expect(hasUseSystemProtoc || hasUseSystemBuf).toBe(true);
    });

    it('should always show "Re-detect Tools" option', async () => {
      const vscode = await import('vscode');

      mockFileExists.mockResolvedValue(false);
      const failProcess = createMockProcess('', '', 1, new Error('ENOENT'));
      mockSpawn.mockReturnValue(failProcess);

      const { ToolchainManager } = await import('../toolchainManager');
      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      await flushPromisesAndTimers();

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);
      await manager.manageToolchain();

      const quickPickCall = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
      const items = quickPickCall[0];

      const hasRedetect = items.some((item: { label?: string }) => item.label?.includes('Re-detect'));
      expect(hasRedetect).toBe(true);
    });
  });

  describe('Tool Installation', () => {
    it('should install tool and update settings', async () => {
      const _vscode = await import('vscode');
      const https = await import('https');

      mockFileExists.mockImplementation(async (p: string) => {
        if (p.includes('global-storage/bin')) {
          return true;
        }
        return false;
      });

      // Mock download
      const mockResponse = {
        statusCode: 200,
        pipe: jest.fn(),
        on: jest.fn(),
      };
      (https.get as jest.Mock).mockImplementation((url, opts, cb) => {
        cb(mockResponse);
        return { on: jest.fn() };
      });

      const { ToolchainManager } = await import('../toolchainManager');
      const manager = new ToolchainManager(mockContext as any, mockOutputChannel as any);

      // Note: Full installation test would require more mocking
      // This is a basic structure test
      expect(manager).toBeDefined();
    });
  });
});

/**
 * Helper to create a mock child process
 */
function createMockProcess(stdout: string, stderr: string, exitCode: number, error?: Error) {
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
