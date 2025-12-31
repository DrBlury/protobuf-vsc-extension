import { createMockVscode, createMockTextEditor, createMockChildProcess } from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { CodegenManager } from '../codegenManager';

describe('CodegenManager', () => {
  let manager: CodegenManager;
  let mockOutputChannel: ReturnType<typeof mockVscode.window.createOutputChannel>;

  function setupConfig(profiles: Record<string, unknown>, protocPath = 'protoc') {
    const configGet = jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'codegen.profiles') {return profiles;}
      if (key === 'protoc.path') {return protocPath;}
      return defaultValue;
    });
    mockVscode.workspace.getConfiguration = jest.fn(() => ({
      get: configGet,
      update: jest.fn().mockResolvedValue(undefined),
      has: jest.fn(() => false),
      inspect: jest.fn(),
    }));
    return configGet;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockOutputChannel = mockVscode.window.createOutputChannel();
    mockVscode.window.activeTextEditor = undefined;
    mockVscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/test/workspace' } },
    ];
    manager = new CodegenManager(mockOutputChannel);
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(manager).toBeInstanceOf(CodegenManager);
    });
  });

  describe('generateCode', () => {
    describe('when no profiles are configured', () => {
      beforeEach(() => {
        setupConfig({});
      });

      it('should show warning message', async () => {
        mockVscode.window.showWarningMessage.mockResolvedValue(undefined);

        await manager.generateCode();

        expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
          'No codegen profiles defined. Please configure "protobuf.codegen.profiles" in settings.',
          'Open Settings'
        );
      });

      it('should open settings when user clicks Open Settings', async () => {
        mockVscode.window.showWarningMessage.mockResolvedValue('Open Settings');

        await manager.generateCode();

        expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.openSettings',
          'protobuf.codegen.profiles'
        );
      });

      it('should not open settings when user dismisses warning', async () => {
        mockVscode.window.showWarningMessage.mockResolvedValue(undefined);

        await manager.generateCode();

        expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
      });
    });

    describe('when profiles are configured', () => {
      beforeEach(() => {
        setupConfig({
          'go': ['--go_out=${workspaceFolder}/gen/go', '${file}'],
          'typescript': ['--ts_out=${workspaceFolder}/gen/ts', '${file}'],
        });
      });

      it('should show quick pick with profile names', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue(undefined);

        await manager.generateCode();

        expect(mockVscode.window.showQuickPick).toHaveBeenCalledWith(
          ['go', 'typescript'],
          { placeHolder: 'Select a codegen profile to run' }
        );
      });

      it('should return early when user cancels quick pick', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue(undefined);

        await manager.generateCode();

        expect(mockSpawn).not.toHaveBeenCalled();
      });

      it('should show error for invalid profile (not an array)', async () => {
        setupConfig({ 'invalid': 'not-an-array' });
        mockVscode.window.showQuickPick.mockResolvedValue('invalid');

        await manager.generateCode();

        expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
          'Profile "invalid" is invalid. It must be an array of string arguments.'
        );
        expect(mockSpawn).not.toHaveBeenCalled();
      });

      it('should run protoc with substituted variables', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({
          uri: 'file:///test/workspace/protos/user.proto',
        });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          'protoc',
          ['--go_out=/test/workspace/gen/go', '/test/workspace/protos/user.proto'],
          expect.objectContaining({ shell: true })
        );
      });

      it('should use provided URI over active editor', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const providedUri = mockVscode.Uri.file('/test/workspace/other/service.proto');

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode(providedUri as never);

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          'protoc',
          ['--go_out=/test/workspace/gen/go', '/test/workspace/other/service.proto'],
          expect.any(Object)
        );
      });

      it('should show output channel when running', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.show).toHaveBeenCalledWith(true);
      });

      it('should log command to output channel', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
          expect.stringContaining('Running: protoc')
        );
      });

      it('should show success message when codegen completes successfully', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('Generated successfully', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
          'Codegen completed successfully.'
        );
        expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
          'Codegen completed successfully.'
        );
      });

      it('should show error message when codegen fails', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', 'Error: missing import', 1);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
          'Codegen failed with exit code 1.'
        );
        expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
          'Codegen failed with exit code 1. Check output for details.'
        );
      });

      it('should handle process spawn error', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0, new Error('spawn ENOENT'));
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start process')
        );
        expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start protoc')
        );
      });

      it('should capture stdout to output channel', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('stdout output', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.append).toHaveBeenCalledWith('stdout output');
      });

      it('should capture stderr to output channel', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', 'stderr output', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockOutputChannel.append).toHaveBeenCalledWith('stderr output');
      });

      it('should use custom protoc path from config', async () => {
        setupConfig({ 'go': ['--go_out=gen', '${file}'] }, '/custom/path/to/protoc');
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          '/custom/path/to/protoc',
          expect.any(Array),
          expect.any(Object)
        );
      });

      it('should use workspace folder as cwd', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('go');
        const mockEditor = createMockTextEditor({ uri: 'file:///test/file.proto' });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cwd: '/test/workspace' })
        );
      });
    });

    describe('variable substitution', () => {
      beforeEach(() => {
        setupConfig({
          'all-vars': [
            '${workspaceFolder}',
            '${file}',
            '${fileDirname}',
            '${fileBasename}',
            '${fileBasenameNoExtension}',
          ],
        });
      });

      it('should substitute all variables correctly', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('all-vars');
        const mockEditor = createMockTextEditor({
          uri: 'file:///test/workspace/protos/api/user.proto',
        });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          'protoc',
          [
            '/test/workspace',
            '/test/workspace/protos/api/user.proto',
            '/test/workspace/protos/api',
            'user.proto',
            'user',
          ],
          expect.any(Object)
        );
      });

      it('should handle missing file URI gracefully', async () => {
        mockVscode.window.showQuickPick.mockResolvedValue('all-vars');
        mockVscode.window.activeTextEditor = undefined;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          'protoc',
          [
            '/test/workspace',
            '${file}',
            '${fileDirname}',
            '${fileBasename}',
            '${fileBasenameNoExtension}',
          ],
          expect.any(Object)
        );
      });

      it('should handle missing workspace folder', async () => {
        mockVscode.workspace.workspaceFolders = undefined;
        mockVscode.window.showQuickPick.mockResolvedValue('all-vars');
        const mockEditor = createMockTextEditor({
          uri: 'file:///standalone/file.proto',
        });
        mockVscode.window.activeTextEditor = mockEditor;

        const mockProc = createMockChildProcess('', '', 0);
        mockSpawn.mockReturnValue(mockProc);

        await manager.generateCode();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(mockSpawn).toHaveBeenCalledWith(
          'protoc',
          expect.arrayContaining([
            '',
            '/standalone/file.proto',
          ]),
          expect.any(Object)
        );
      });
    });
  });
});
