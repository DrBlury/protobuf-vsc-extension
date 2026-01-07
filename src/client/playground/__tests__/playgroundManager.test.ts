import {
  createMockVscode,
  createMockTextEditor,
  createMockExtensionContext,
  createMockChildProcess,
} from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock os module to always return non-Windows platform for consistent test behavior
jest.mock('os', () => ({
  platform: () => 'darwin',
  homedir: () => '/home/user',
}));

// Mock path module to always use posix (forward slashes) for consistent test behavior
jest.mock('path', () => {
  const posix = jest.requireActual('path').posix;
  return {
    ...posix,
    join: (...args: string[]) => posix.join(...args),
    dirname: (p: string) => posix.dirname(p),
  };
});

import { PlaygroundManager } from '../playgroundManager';

/**
 * Helper to flush promises and setImmediate callbacks.
 * Since mock child process uses setImmediate (not faked), we just need to flush the queue.
 * Uses 20 iterations to handle triple-nested setImmediate in mock child process.
 */
async function flushPromisesAndTimers(): Promise<void> {
  // Flush multiple times to handle nested setImmediate calls
  // The mock child process uses triple-nested setImmediate for close event
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('PlaygroundManager', () => {
  let manager: PlaygroundManager;
  let mockContext: ReturnType<typeof createMockExtensionContext>;
  let mockOutputChannel: ReturnType<typeof mockVscode.window.createOutputChannel>;
  let mockWebviewPanel: ReturnType<typeof mockVscode.window.createWebviewPanel>;

  function setupConfig(includes: string[] = []) {
    mockVscode.workspace.getConfiguration = jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'includes') {
          return includes;
        }
        return undefined;
      }),
      update: jest.fn().mockResolvedValue(undefined),
      has: jest.fn(() => false),
      inspect: jest.fn(),
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    mockContext = createMockExtensionContext();
    mockOutputChannel = mockVscode.window.createOutputChannel();
    mockWebviewPanel = mockVscode.window.createWebviewPanel();
    mockVscode.window.activeTextEditor = undefined;
    setupConfig();
    manager = new PlaygroundManager(mockContext as never, mockOutputChannel);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(manager).toBeInstanceOf(PlaygroundManager);
    });
  });

  describe('openPlayground', () => {
    it('should create a webview panel', () => {
      manager.openPlayground();

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'protobufPlayground',
        'Protobuf Playground',
        mockVscode.ViewColumn.Two,
        expect.objectContaining({ enableScripts: true })
      );
    });

    it('should set HTML content on the webview', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('Protobuf Playground');
      expect(mockWebviewPanel.webview.html).toContain('Request Body (JSON)');
    });

    it('should register dispose handler', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.onDidDispose).toHaveBeenCalled();
    });

    it('should register message handler', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should reveal existing panel if already open', () => {
      manager.openPlayground();
      jest.clearAllMocks();

      manager.openPlayground();

      expect(mockVscode.window.createWebviewPanel).not.toHaveBeenCalled();
      expect(mockWebviewPanel.reveal).toHaveBeenCalledWith(mockVscode.ViewColumn.Two);
    });

    it('should send file to webview if active editor has proto file', () => {
      const mockEditor = createMockTextEditor({
        languageId: 'proto',
        uri: 'file:///test/project/api.proto',
      });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockProc = createMockChildProcess('service.MyService\n', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      manager.openPlayground();

      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'setFile' })
      );
    });

    it('should not send file if active editor is not proto', () => {
      const mockEditor = createMockTextEditor({
        languageId: 'typescript',
        uri: 'file:///test/project/api.ts',
      });
      mockVscode.window.activeTextEditor = mockEditor;

      manager.openPlayground();

      expect(mockWebviewPanel.webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ command: 'setFile' })
      );
    });

    it('should list services when proto file is active', async () => {
      const mockEditor = createMockTextEditor({
        languageId: 'proto',
        uri: 'file:///test/project/api.proto',
      });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockProc = createMockChildProcess('mypackage.UserService\nmypackage.OrderService', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      manager.openPlayground();

      await flushPromisesAndTimers();

      // Should use managed grpcurl path (full path without shell: true to handle spaces)
      expect(mockSpawn).toHaveBeenCalledWith(
        '/test/global-storage/bin/grpcurl',
        expect.arrayContaining(['-proto', '/test/project/api.proto', 'list']),
        expect.objectContaining({ cwd: '/test/project' })
      );
    });
  });

  describe('message handling', () => {
    let messageHandler: ((message: unknown) => Promise<void>) | undefined;

    beforeEach(() => {
      manager.openPlayground();
      const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
      messageHandler = calls[0]?.[0];
    });

    describe('listServices command', () => {
      it('should run grpcurl to list services', async () => {
        const mockProc = createMockChildProcess('mypackage.Service1\nmypackage.Service2', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'listServices', file: '/test/api.proto' });
        await flushPromisesAndTimers();
        await handlerPromise;

        // Uses managed grpcurl path (full path to handle spaces in path)
        expect(mockSpawn).toHaveBeenCalledWith(
          '/test/global-storage/bin/grpcurl',
          expect.arrayContaining(['-proto', '/test/api.proto', 'list']),
          expect.any(Object)
        );
      });

      it('should include configured import paths', async () => {
        setupConfig(['/imports/common', '/imports/shared']);
        manager = new PlaygroundManager(mockContext as never, mockOutputChannel);
        manager.openPlayground();
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];

        const mockProc = createMockChildProcess('Service1', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'listServices', file: '/test/api.proto' });
        await flushPromisesAndTimers();
        await handlerPromise;

        // Uses managed grpcurl path and includes configured import paths
        expect(mockSpawn).toHaveBeenCalledWith(
          '/test/global-storage/bin/grpcurl',
          expect.arrayContaining(['-import-path', '/imports/common', '-import-path', '/imports/shared']),
          expect.any(Object)
        );
      });

      it('should post services to webview', async () => {
        const mockProc = createMockChildProcess('pkg.Service1\npkg.Service2\n', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'listServices', file: '/test/api.proto' });
        await flushPromisesAndTimers();
        await handlerPromise;

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'servicesLoaded',
          services: ['pkg.Service1', 'pkg.Service2'],
        });
      });

      it('should handle grpcurl error', async () => {
        const mockProc = createMockChildProcess('', 'Failed to parse proto', 1);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'listServices', file: '/test/api.proto' });
        await flushPromisesAndTimers();
        await handlerPromise;

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Failed to list services'));
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ command: 'error' })
        );
      });
    });

    describe('runRequest command', () => {
      const requestData = {
        service: 'mypackage.UserService',
        method: 'GetUser',
        address: 'localhost:50051',
        jsonBody: '{"id": 1}',
        filePath: '/test/user.proto',
      };

      it('should run grpcurl with request data', async () => {
        const mockProc = createMockChildProcess('{"name": "John"}', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'runRequest', data: requestData });
        await flushPromisesAndTimers();
        await handlerPromise;

        // Uses managed grpcurl path (full path to handle spaces in path)
        expect(mockSpawn).toHaveBeenCalledWith(
          '/test/global-storage/bin/grpcurl',
          expect.arrayContaining([
            '-proto',
            '/test/user.proto',
            '-d',
            '{"id": 1}',
            '-plaintext',
            'localhost:50051',
            'mypackage.UserService/GetUser',
          ]),
          expect.any(Object)
        );
      });

      it('should log command to output channel', async () => {
        const mockProc = createMockChildProcess('{}', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'runRequest', data: requestData });
        await flushPromisesAndTimers();
        await handlerPromise;

        // Logs the full managed path
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
          expect.stringContaining('Running: /test/global-storage/bin/grpcurl')
        );
      });

      it('should post response to webview on success', async () => {
        const mockProc = createMockChildProcess('{"result": "success"}', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'runRequest', data: requestData });
        await flushPromisesAndTimers();
        await handlerPromise;

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'response',
          output: '{"result": "success"}',
        });
      });

      it('should post error to webview on failure', async () => {
        const mockProc = createMockChildProcess('', 'Connection refused', 1);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'runRequest', data: requestData });
        await flushPromisesAndTimers();
        await handlerPromise;

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'responseError',
          error: 'Connection refused',
        });
      });

      it('should include import paths from config', async () => {
        setupConfig(['/common/protos']);
        manager = new PlaygroundManager(mockContext as never, mockOutputChannel);
        manager.openPlayground();
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];

        const mockProc = createMockChildProcess('{}', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        const handlerPromise = messageHandler?.({ command: 'runRequest', data: requestData });
        await flushPromisesAndTimers();
        await handlerPromise;

        // Uses managed grpcurl path and includes configured import paths
        expect(mockSpawn).toHaveBeenCalledWith(
          '/test/global-storage/bin/grpcurl',
          expect.arrayContaining(['-import-path', '/common/protos']),
          expect.any(Object)
        );
      });
    });
  });

  describe('panel disposal', () => {
    it('should clear panel reference when disposed', () => {
      jest.clearAllMocks();
      manager.openPlayground();
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

      const disposeHandler = (mockWebviewPanel.onDidDispose as jest.Mock).mock.calls[0]?.[0];
      disposeHandler?.();

      manager.openPlayground();
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('HTML content', () => {
    it('should include service selector', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('serviceSelect');
    });

    it('should include method input', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('methodInput');
    });

    it('should include address input with default value', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('localhost:50051');
    });

    it('should include send button', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('sendBtn');
      expect(mockWebviewPanel.webview.html).toContain('Send Request');
    });

    it('should include response output area', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('responseOutput');
    });
  });
});
