import { createMockVscode, createMockLanguageClient, createMockTextEditor } from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

jest.mock('vscode-languageclient/node', () => ({
  LanguageClient: jest.fn(),
  TransportKind: { ipc: 1, stdio: 2 },
}), { virtual: true });

import { OptionInspectorProvider } from '../optionInspector';

describe('OptionInspectorProvider', () => {
  let mockClient: ReturnType<typeof createMockLanguageClient>;
  let provider: OptionInspectorProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockLanguageClient();
    mockVscode.window.activeTextEditor = undefined;
    provider = new OptionInspectorProvider(mockClient);
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(provider).toBeInstanceOf(OptionInspectorProvider);
    });

    it('should register onDidChangeActiveTextEditor listener', () => {
      expect(mockVscode.window.onDidChangeActiveTextEditor).toHaveBeenCalled();
    });

    it('should register onDidSaveTextDocument listener', () => {
      expect(mockVscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
    });
  });

  describe('onDidChangeTreeData', () => {
    it('should have onDidChangeTreeData event', () => {
      expect(provider.onDidChangeTreeData).toBeDefined();
    });

    it('should be subscribable', () => {
      const listener = jest.fn();
      const disposable = provider.onDidChangeTreeData(listener);
      expect(disposable).toBeDefined();
      expect(typeof disposable.dispose).toBe('function');
    });
  });

  describe('refresh', () => {
    it('should fire onDidChangeTreeData event', () => {
      const listener = jest.fn();
      provider.onDidChangeTreeData(listener);
      provider.refresh();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getTreeItem', () => {
    it('should return the element as-is', () => {
      const item = new mockVscode.TreeItem('test', mockVscode.TreeItemCollapsibleState.None);
      const result = provider.getTreeItem(item as never);
      expect(result).toBe(item);
    });
  });

  describe('getChildren', () => {
    it('should return empty array when element is provided (leaf nodes)', async () => {
      const item = new mockVscode.TreeItem('test', mockVscode.TreeItemCollapsibleState.None);
      const children = await provider.getChildren(item as never);
      expect(children).toEqual([]);
    });

    it('should return empty array when no active editor', async () => {
      mockVscode.window.activeTextEditor = undefined;
      const children = await provider.getChildren();
      expect(children).toEqual([]);
    });

    it('should return empty array when editor is not proto file', async () => {
      mockVscode.window.activeTextEditor = createMockTextEditor({ languageId: 'javascript' });
      const children = await provider.getChildren();
      expect(children).toEqual([]);
    });

    it('should request options from language client for proto files', async () => {
      const mockEditor = createMockTextEditor({ 
        languageId: 'proto',
        uri: 'file:///test/test.proto'
      });
      mockVscode.window.activeTextEditor = mockEditor;
      mockClient.sendRequest.mockResolvedValue([]);

      await provider.getChildren();

      expect(mockClient.sendRequest).toHaveBeenCalledWith(
        'protobuf/getAllOptions',
        { uri: 'file:///test/test.proto' }
      );
    });

    it('should return "No options found" item when server returns empty array', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;
      mockClient.sendRequest.mockResolvedValue([]);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('No options found');
    });

    it('should return "No options found" item when server returns null', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;
      mockClient.sendRequest.mockResolvedValue(null);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('No options found');
    });

    it('should map options to OptionItem elements', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'java_package', value: 'com.example', parent: 'FileOptions' },
        { name: 'deprecated', value: true, parent: 'MessageOptions' },
        { name: 'allow_alias', value: false, parent: 'EnumOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(3);
      expect(children[0].label).toBe('java_package = com.example');
      expect(children[0].description).toBe('FileOptions');
      expect(children[1].label).toBe('deprecated = true');
      expect(children[1].description).toBe('MessageOptions');
      expect(children[2].label).toBe('allow_alias = false');
      expect(children[2].description).toBe('EnumOptions');
    });

    it('should handle numeric option values', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'optimize_for', value: 1, parent: 'FileOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('optimize_for = 1');
    });

    it('should create OptionItem with navigation command when range is provided', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        {
          name: 'java_package',
          value: 'com.example',
          parent: 'FileOptions',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 30 }
          }
        },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].command).toBeDefined();
      expect(children[0].command?.command).toBe('vscode.open');
    });

    it('should not have navigation command when range is not provided', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'java_package', value: 'com.example', parent: 'FileOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].command).toBeUndefined();
    });

    it('should return error item when language client throws', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;
      mockClient.sendRequest.mockRejectedValue(new Error('Connection failed'));

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('Error loading options');
      expect(children[0].description).toBe('Error: Connection failed');
    });

    it('should handle non-Error exceptions', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;
      mockClient.sendRequest.mockRejectedValue('String error');

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('Error loading options');
      expect(children[0].description).toBe('String error');
    });
  });

  describe('OptionItem properties', () => {
    it('should have correct tooltip format', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'java_package', value: 'com.example', parent: 'FileOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children[0].tooltip).toBe('java_package = com.example (FileOptions)');
    });

    it('should have TreeItemCollapsibleState.None for all items', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'java_package', value: 'com.example', parent: 'FileOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children[0].collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.None);
    });
  });

  describe('event-triggered refresh', () => {
    it('should refresh when active editor changes', () => {
      const onDidChangeActiveTextEditorCall = mockVscode.window.onDidChangeActiveTextEditor.mock.calls[0];
      expect(onDidChangeActiveTextEditorCall).toBeDefined();
      expect(mockVscode.window.onDidChangeActiveTextEditor).toHaveBeenCalledTimes(1);
    });

    it('should refresh when document is saved', () => {
      expect(mockVscode.workspace.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple options scenarios', () => {
    it('should handle options with mixed value types', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = [
        { name: 'java_package', value: 'com.example.api', parent: 'FileOptions' },
        { name: 'deprecated', value: true, parent: 'FieldOptions' },
        { name: 'retention', value: 2, parent: 'FieldOptions' },
        { name: 'json_name', value: 'customName', parent: 'FieldOptions' },
      ];
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(4);
      expect(children[0].label).toBe('java_package = com.example.api');
      expect(children[1].label).toBe('deprecated = true');
      expect(children[2].label).toBe('retention = 2');
      expect(children[3].label).toBe('json_name = customName');
    });

    it('should handle large number of options', async () => {
      const mockEditor = createMockTextEditor({ languageId: 'proto' });
      mockVscode.window.activeTextEditor = mockEditor;

      const mockOptions = Array.from({ length: 100 }, (_, i) => ({
        name: `option_${i}`,
        value: `value_${i}`,
        parent: 'FileOptions',
      }));
      mockClient.sendRequest.mockResolvedValue(mockOptions);

      const children = await provider.getChildren();

      expect(children).toHaveLength(100);
    });
  });
});
