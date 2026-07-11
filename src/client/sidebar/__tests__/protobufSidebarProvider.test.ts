import * as vscode from 'vscode';
import { discoverWorkspaceFiles } from '../../../shared/workspaceFileDiscovery';
import { ProtobufSidebarProvider } from '../protobufSidebarProvider';

jest.mock('../../../shared/workspaceFileDiscovery', () => ({
  ...jest.requireActual('../../../shared/workspaceFileDiscovery'),
  discoverWorkspaceFiles: jest.fn(),
}));

const mockedDiscoverWorkspaceFiles = discoverWorkspaceFiles as jest.MockedFunction<typeof discoverWorkspaceFiles>;
const mockedVscode = vscode as jest.Mocked<typeof vscode>;

describe('ProtobufSidebarProvider workspace scans', () => {
  let extensionContext: { subscriptions: vscode.Disposable[] };
  let createHandlers: Array<(uri: vscode.Uri) => void>;
  let changeHandlers: Array<(uri: vscode.Uri) => void>;
  let deleteHandlers: Array<(uri: vscode.Uri) => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    extensionContext = { subscriptions: [] };
    createHandlers = [];
    changeHandlers = [];
    deleteHandlers = [];

    (mockedVscode.workspace as unknown as { workspaceFolders: vscode.WorkspaceFolder[] }).workspaceFolders = [
      {
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      },
    ];
    (mockedVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
    });
    (mockedVscode.workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidCreate: jest.fn((handler: (uri: vscode.Uri) => void) => {
        createHandlers.push(handler);
        return { dispose: jest.fn() };
      }),
      onDidChange: jest.fn((handler: (uri: vscode.Uri) => void) => {
        changeHandlers.push(handler);
        return { dispose: jest.fn() };
      }),
      onDidDelete: jest.fn((handler: (uri: vscode.Uri) => void) => {
        deleteHandlers.push(handler);
        return { dispose: jest.fn() };
      }),
      dispose: jest.fn(),
    }));
    (mockedVscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
      getText: () => 'service Example {}',
    });
    mockedDiscoverWorkspaceFiles.mockImplementation(async (_root, options) => {
      return options?.fileExtensions?.length === 0 ? [] : ['/workspace/example.proto'];
    });
  });

  afterEach(() => {
    for (const disposable of extensionContext.subscriptions) {
      disposable.dispose();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses ignore-aware discovery instead of VS Code findFiles', async () => {
    const provider = new ProtobufSidebarProvider(extensionContext as vscode.ExtensionContext, false);

    await jest.advanceTimersByTimeAsync(0);

    expect(mockedDiscoverWorkspaceFiles).toHaveBeenCalledTimes(1);
    expect(mockedVscode.workspace.findFiles).not.toHaveBeenCalled();
    const workspaceSection = provider.getChildren().find(item => 'sectionId' in item && item.sectionId === 'workspace');
    expect(workspaceSection?.description).toBe('1 files');
  });

  it('debounces watcher bursts into one scan', async () => {
    new ProtobufSidebarProvider(extensionContext as vscode.ExtensionContext, false);
    await jest.advanceTimersByTimeAsync(0);
    mockedDiscoverWorkspaceFiles.mockClear();

    for (const handler of [...createHandlers, ...changeHandlers, ...deleteHandlers]) {
      handler(vscode.Uri.file('/workspace/example.proto'));
    }

    await jest.advanceTimersByTimeAsync(299);
    expect(mockedDiscoverWorkspaceFiles).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockedDiscoverWorkspaceFiles).toHaveBeenCalledTimes(1);
  });

  it('does not schedule scans for ignored watcher events', async () => {
    const folder = mockedVscode.workspace.workspaceFolders?.[0];
    (mockedVscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(folder);
    (mockedVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'workspace.ignorePatterns') {
          return ['generated'];
        }
        return defaultValue;
      }),
    });
    new ProtobufSidebarProvider(extensionContext as vscode.ExtensionContext, false);
    await jest.advanceTimersByTimeAsync(0);
    mockedDiscoverWorkspaceFiles.mockClear();

    createHandlers[0]?.(vscode.Uri.file('/workspace/generated/example.proto'));
    await jest.advanceTimersByTimeAsync(300);

    expect(mockedDiscoverWorkspaceFiles).not.toHaveBeenCalled();
  });
});
