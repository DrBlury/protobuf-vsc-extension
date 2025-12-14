/**
 * Tests for AutoDetector
 *
 * Tests cover:
 * - Tool detection from common paths
 * - Shell PATH fallback detection
 * - Version parsing
 * - Configuration file detection
 */

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

jest.mock('vscode', () => ({
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
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
  },
}), { virtual: true });

// Mock fs
const mockFsExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
}));

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
    mockFsExistsSync.mockReturnValue(false);
    // Always set up a default mock spawn
    mockSpawn.mockReturnValue(createMockProcess('', '', 1, new Error('ENOENT')));

    mockContext = {
      globalStorageUri: { fsPath: '/test/global-storage' },
      subscriptions: { push: jest.fn() },
    };
  });

  describe('detectTools', () => {
    it('should detect tools when file exists at common path', async () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === '/opt/homebrew/bin/protoc') {
          return true;
        }
        if (p === '/opt/homebrew/bin/buf') {
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
      expect(result.protoc?.path).toBe('/opt/homebrew/bin/protoc');
    });

    it('should detect buf.yaml configuration file', async () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === '/test/workspace/buf.yaml') {
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
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === '/test/workspace/buf.work.yaml') {
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
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === '/test/workspace/.protolint.yaml') {
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
      mockFsExistsSync.mockImplementation((p: string) => {
        if (p === '/test/workspace/.clang-format') {
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
      mockFsExistsSync.mockReturnValue(false);

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
      mockFsExistsSync.mockImplementation((p: string) => p === '/opt/homebrew/bin/protoc');

      // Protoc outputs "libprotoc X.Y.Z"
      mockSpawn.mockReturnValue(createMockProcess('libprotoc 33.0\n', '', 0));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.protoc?.version).toBe('libprotoc 33.0');
    });

    it('should parse version from buf output', async () => {
      mockFsExistsSync.mockImplementation((p: string) => p === '/opt/homebrew/bin/buf');

      // Buf outputs just the version
      mockSpawn.mockReturnValue(createMockProcess('1.28.1\n', '', 0));

      const { AutoDetector } = await import('../autoDetector');
      const detector = new AutoDetector(mockContext as any, mockOutputChannel as any);

      const result = await detector.detectTools();

      expect(result.buf?.version).toBe('1.28.1');
    });
  });

  describe('detectAndPrompt', () => {
    it('should only prompt once per session', async () => {
      const vscode = await import('vscode');

      mockFsExistsSync.mockReturnValue(false);
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
