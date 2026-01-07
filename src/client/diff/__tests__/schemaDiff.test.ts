import * as path from 'path';
import { createMockVscode, createMockTextEditor, createMockChildProcess } from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

// Define mocks before jest.mock to ensure they're properly captured
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockFileExists = jest.fn().mockResolvedValue(true);
const mockReadFile = jest.fn().mockResolvedValue('');

jest.mock('../../utils/fsUtils', () => ({
  writeFile: mockWriteFile,
  fileExists: mockFileExists,
  readFile: mockReadFile,
}));

// Mock os.tmpdir to return a consistent path
const mockTmpdir = jest.fn(() => '/tmp');
jest.mock('os', () => ({
  tmpdir: mockTmpdir,
}));

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { SchemaDiffManager } from '../schemaDiff';

/**
 * Helper to flush all pending promises and timers.
 * This ensures async operations complete deterministically.
 * Uses multiple iterations to handle nested async operations.
 * Uses higher values for CI reliability where timing may be less predictable.
 */
async function flushPromisesAndTimers(): Promise<void> {
  // Multiple rounds to handle nested async operations
  // Each round runs timers and flushes the promise queue
  // Use 50 iterations with 50ms each for CI robustness
  for (let i = 0; i < 50; i++) {
    // Advance timers first to trigger setTimeout callbacks
    jest.advanceTimersByTime(50);
    // Use setImmediate (not faked) to properly flush the promise queue
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('SchemaDiffManager', () => {
  let manager: SchemaDiffManager;
  let mockOutputChannel: ReturnType<typeof mockVscode.window.createOutputChannel>;

  beforeEach(() => {
    // Use fake timers but don't fake setImmediate so we can use it to flush promises
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.clearAllMocks();
    jest.resetModules();
    mockWriteFile.mockClear();
    mockWriteFile.mockResolvedValue(undefined);
    mockOutputChannel = mockVscode.window.createOutputChannel();
    mockVscode.window.activeTextEditor = undefined;
    mockVscode.workspace.getWorkspaceFolder = jest.fn();
    mockVscode.commands.executeCommand.mockClear();
    mockVscode.window.showErrorMessage.mockClear();
    manager = new SchemaDiffManager(mockOutputChannel);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(manager).toBeInstanceOf(SchemaDiffManager);
    });
  });

  describe('diffSchema', () => {
    it('should show error when no proto file is open and no URI provided', async () => {
      mockVscode.window.activeTextEditor = undefined;

      await manager.diffSchema();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Please open a .proto file to diff.');
    });

    it('should show error when URI is not a proto file', async () => {
      const uri = mockVscode.Uri.file('/test/file.ts') as never;

      await manager.diffSchema(uri);

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Please open a .proto file to diff.');
    });

    it('should show error when active editor file is not proto', async () => {
      mockVscode.window.activeTextEditor = createMockTextEditor({
        languageId: 'typescript',
        uri: 'file:///test/file.ts',
      });

      await manager.diffSchema();

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Please open a .proto file to diff.');
    });

    it('should prompt for git reference', async () => {
      const uri = mockVscode.Uri.file('/test/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue(undefined);

      await manager.diffSchema(uri);

      expect(mockVscode.window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Enter Git reference to compare against (e.g., HEAD~1, main, origin/main)',
        placeHolder: 'HEAD~1',
        value: 'HEAD~1',
      });
    });

    it('should return early when user cancels git reference input', async () => {
      const uri = mockVscode.Uri.file('/test/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue(undefined);

      await manager.diffSchema(uri);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should get file content from git at specified reference', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('syntax = "proto3";', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:schema.proto'], { cwd: '/test/project' });
    });

    it('should write temp file and open diff view on success', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('main');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const oldContent = 'syntax = "proto2";';
      const mockProc = createMockChildProcess(oldContent, '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      const expectedTmpPath = path.join('/tmp', 'schema.proto.main.proto');
      expect(mockWriteFile).toHaveBeenCalledWith(expectedTmpPath, oldContent);

      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({ fsPath: expectedTmpPath }),
        uri,
        'schema.proto (main) ↔ Current'
      );
    });

    it('should sanitize git ref with slashes in temp filename', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('origin/main');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('content', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      const expectedTmpPath = path.join('/tmp', 'schema.proto.origin_main.proto');
      expect(mockWriteFile).toHaveBeenCalledWith(expectedTmpPath, 'content');
    });

    it('should show error when git returns no content', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Could not find file at HEAD~1');
    });

    it('should show error when git command fails', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('nonexistent-ref');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('', 'fatal: bad revision', 128);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to diff schema:')
      );
    });

    it('should use active editor URI when no URI provided', async () => {
      const mockEditor = createMockTextEditor({
        languageId: 'proto',
        uri: 'file:///test/project/active.proto',
      });
      mockVscode.window.activeTextEditor = mockEditor;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('content', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema();
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD:active.proto'], { cwd: '/test/project' });
    });

    it('should use file directory when no workspace folder', async () => {
      const uri = mockVscode.Uri.file('/standalone/dir/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue(undefined);

      const mockProc = createMockChildProcess('content', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:schema.proto'], { cwd: '/standalone/dir' });
    });

    it('should handle nested file paths relative to workspace', async () => {
      const uri = mockVscode.Uri.file('/test/project/protos/api/v1/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('content', '', 0);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:protos/api/v1/schema.proto'], {
        cwd: '/test/project',
      });
    });

    it('should handle git command failure with non-zero exit code', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const mockProc = createMockChildProcess('', 'fatal: not a git repository', 128);
      mockSpawn.mockReturnValue(mockProc);

      const diffPromise = manager.diffSchema(uri);
      await flushPromisesAndTimers();
      await diffPromise;

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Git exited with code 128')
      );
    });
  });
});
