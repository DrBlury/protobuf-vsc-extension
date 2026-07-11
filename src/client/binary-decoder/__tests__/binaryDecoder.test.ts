import * as vscode from 'vscode';
import { discoverWorkspaceFiles } from '../../../shared/workspaceFileDiscovery';
import { BinaryDecoderProvider } from '../binaryDecoder';

jest.mock('../../../shared/workspaceFileDiscovery', () => ({
  discoverWorkspaceFiles: jest.fn(),
}));

const mockedVscode = vscode as jest.Mocked<typeof vscode>;
const mockedDiscoverWorkspaceFiles = discoverWorkspaceFiles as jest.MockedFunction<typeof discoverWorkspaceFiles>;

describe('BinaryDecoderProvider schema discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedVscode.workspace as unknown as { workspaceFolders: vscode.WorkspaceFolder[] }).workspaceFolders = [
      {
        uri: vscode.Uri.file('/workspace'),
        name: 'workspace',
        index: 0,
      },
    ];
    (mockedVscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'protoSrcsDir') {
          return 'protos';
        }
        if (key === 'workspace.ignorePatterns') {
          return ['generated'];
        }
        return defaultValue;
      }),
    });
    mockedDiscoverWorkspaceFiles.mockResolvedValue(['/workspace/protos/example.proto']);
    (mockedVscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('package example; message Request {}')
    );
  });

  it('uses scoped, ignore-aware discovery instead of VS Code findFiles', async () => {
    const provider = new BinaryDecoderProvider(
      {} as vscode.ExtensionContext,
      {
        appendLine: jest.fn(),
      } as unknown as vscode.OutputChannel
    );

    const types = await (
      provider as unknown as { getMessageTypes(): Promise<Array<{ name: string }>> }
    ).getMessageTypes();

    expect(mockedDiscoverWorkspaceFiles).toHaveBeenCalledWith('/workspace/protos', {
      rootDir: '/workspace',
      ignorePatterns: ['generated'],
      fileExtensions: ['.proto'],
    });
    expect(mockedVscode.workspace.findFiles).not.toHaveBeenCalled();
    expect(types.map(type => type.name)).toEqual(['example.Request']);
  });
});
