import * as path from 'path';
import * as fsUtils from '../../utils/fsUtils';
import { createMockVscode, createMockTextEditor, createMockChildProcess } from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

// Define mocks using shared fsUtils mock
const mockFsUtils = fsUtils as jest.Mocked<typeof fsUtils>;
const mockWriteFile = mockFsUtils.writeFile;
const mockFileExists = mockFsUtils.fileExists;
const mockReadFile = mockFsUtils.readFile;

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

type GitMockOptions = {
  root?: string;
  rootExitCode?: number;
  rootStderr?: string;
  showStdout?: string;
  showStderr?: string;
  showExitCode?: number;
};

function setupGitMock({
  root = '/test/project',
  rootExitCode = 0,
  rootStderr = '',
  showStdout = 'content',
  showStderr = '',
  showExitCode = 0,
}: GitMockOptions = {}): void {
  mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === 'rev-parse') {
      return createMockChildProcess(root, rootStderr, rootExitCode) as never;
    }
    return createMockChildProcess(showStdout, showStderr, showExitCode) as never;
  });
}

describe('SchemaDiffManager', () => {
  let manager: SchemaDiffManager;
  let mockOutputChannel: ReturnType<typeof mockVscode.window.createOutputChannel>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Note: Don't use jest.resetModules() here as it can cause issues with mock references
    mockWriteFile.mockClear();
    mockWriteFile.mockResolvedValue(undefined);
    mockFileExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('');
    mockSpawn.mockClear();
    mockOutputChannel = mockVscode.window.createOutputChannel();
    mockVscode.window.activeTextEditor = undefined;
    mockVscode.workspace.getWorkspaceFolder = jest.fn();
    mockVscode.commands.executeCommand.mockClear();
    mockVscode.window.showErrorMessage.mockClear();
    mockVscode.window.showInputBox.mockClear();
    manager = new SchemaDiffManager(mockOutputChannel);
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

      setupGitMock({ showStdout: 'syntax = "proto3";' });

      await manager.diffSchema(uri);

      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: '/test/project' });
      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:schema.proto'], { cwd: '/test/project' });
    });

    it('should write temp file and open diff view on success', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('main');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      const oldContent = 'syntax = "proto2";';
      setupGitMock({ showStdout: oldContent });
      const getFileContentAtRefSpy = jest.spyOn(
        manager as unknown as { getFileContentAtRef: (filePath: string, ref: string) => Promise<string> },
        'getFileContentAtRef'
      );
      getFileContentAtRefSpy.mockResolvedValue(oldContent);

      await manager.diffSchema(uri);

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

      setupGitMock({ showStdout: 'content' });
      const getFileContentAtRefSpy = jest.spyOn(
        manager as unknown as { getFileContentAtRef: (filePath: string, ref: string) => Promise<string> },
        'getFileContentAtRef'
      );
      getFileContentAtRefSpy.mockResolvedValue('content');

      await manager.diffSchema(uri);

      const expectedTmpPath = path.join('/tmp', 'schema.proto.origin_main.proto');
      expect(mockWriteFile).toHaveBeenCalledWith(expectedTmpPath, 'content');
    });

    it('should show error when git returns no content', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      setupGitMock({ showStdout: '' });

      await manager.diffSchema(uri);

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Could not find file at HEAD~1');
    });

    it('should show error when git command fails', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('nonexistent-ref');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      setupGitMock({ showStdout: '', showStderr: 'fatal: bad revision', showExitCode: 128 });

      await manager.diffSchema(uri);

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

      setupGitMock({ showStdout: 'content' });

      await manager.diffSchema();

      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: '/test/project' });
      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD:active.proto'], { cwd: '/test/project' });
    });

    it('should use file directory when no workspace folder', async () => {
      const uri = mockVscode.Uri.file('/standalone/dir/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue(undefined);

      setupGitMock({ rootExitCode: 128, showStdout: 'content' });

      await manager.diffSchema(uri);

      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: '/standalone/dir' });
      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:schema.proto'], { cwd: '/standalone/dir' });
    });

    it('should handle nested file paths relative to workspace', async () => {
      const uri = mockVscode.Uri.file('/test/project/protos/api/v1/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD~1');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      setupGitMock({ showStdout: 'content' });

      await manager.diffSchema(uri);

      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: '/test/project' });
      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD~1:protos/api/v1/schema.proto'], {
        cwd: '/test/project',
      });
    });

    it('should resolve git root when workspace folder is a subdirectory', async () => {
      const uri = mockVscode.Uri.file('/test/monorepo/packages/service/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/monorepo/packages/service' },
      });

      setupGitMock({ root: '/test/monorepo', showStdout: 'content' });

      await manager.diffSchema(uri);

      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], {
        cwd: '/test/monorepo/packages/service',
      });
      expect(mockSpawn).toHaveBeenCalledWith('git', ['show', 'HEAD:packages/service/schema.proto'], {
        cwd: '/test/monorepo',
      });
    });

    it('should handle git command failure with non-zero exit code', async () => {
      const uri = mockVscode.Uri.file('/test/project/schema.proto') as never;
      mockVscode.window.showInputBox.mockResolvedValue('HEAD');
      mockVscode.workspace.getWorkspaceFolder.mockReturnValue({
        uri: { fsPath: '/test/project' },
      });

      setupGitMock({ showStdout: '', showStderr: 'fatal: not a git repository', showExitCode: 128 });

      await manager.diffSchema(uri);

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Git exited with code 128')
      );
    });
  });
});
