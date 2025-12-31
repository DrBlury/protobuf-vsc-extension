import { createMockVscode, createMockLanguageClient } from '../../__tests__/testUtils';
import type { SchemaGraph, SchemaGraphScope } from '../../../shared/schemaGraph';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

jest.mock('vscode-languageclient/node', () => ({
  LanguageClient: jest.fn(),
  TransportKind: { ipc: 1, stdio: 2 },
}), { virtual: true });

import { SchemaGraphPanel } from '../schemaGraphPanel';

describe('SchemaGraphPanel', () => {
  let mockClient: ReturnType<typeof createMockLanguageClient>;
  let mockExtensionUri: { fsPath: string };
  let mockWebviewPanel: ReturnType<typeof mockVscode.window.createWebviewPanel>;

  beforeEach(() => {
    jest.clearAllMocks();
    (SchemaGraphPanel as unknown as { currentPanel: undefined }).currentPanel = undefined;
    
    mockClient = createMockLanguageClient();
    mockExtensionUri = { fsPath: '/test/extension' };
    mockWebviewPanel = mockVscode.window.createWebviewPanel();
  });

  describe('createOrShow', () => {
    it('should create new panel when none exists', () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'protobufSchemaGraph',
        'Protobuf Schema Graph',
        expect.objectContaining({ viewColumn: mockVscode.ViewColumn.Beside }),
        expect.objectContaining({ enableScripts: true })
      );
    });

    it('should reuse existing panel and call reveal', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'file' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      jest.clearAllMocks();

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, {
        uri: 'file://other.proto',
        scope: 'file',
      });

      expect(mockVscode.window.createWebviewPanel).not.toHaveBeenCalled();
      expect(mockWebviewPanel.reveal).toHaveBeenCalled();
    });
  });

  describe('graph loading', () => {
    it('should load graph data from client', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [
          {
            id: 'test.TestMessage',
            label: 'TestMessage',
            kind: 'message',
            fields: [],
            file: 'test.proto',
          },
        ],
        edges: [],
        scope: 'workspace' as SchemaGraphScope,
        sourceUri: 'file://test.proto',
      };

      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockClient.sendRequest).toHaveBeenCalledWith(
        'protobuf/getSchemaGraph',
        {
          uri: 'file://test.proto',
          scope: 'workspace',
        }
      );
    });

    it('should set HTML on webview with graph data', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockWebviewPanel.webview.html).toContain('<!DOCTYPE html>');
      expect(mockWebviewPanel.webview.html).toContain('Protobuf Schema Graph');
    });

    it('should handle graph loading errors', async () => {
      const errorMessage = 'Failed to load schema';
      mockClient.sendRequest.mockRejectedValue(new Error(errorMessage));

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Failed to load protobuf schema graph: ${errorMessage}`
      );
    });
  });

  describe('panel disposal', () => {
    it('should register dispose handler', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockWebviewPanel.onDidDispose).toHaveBeenCalled();
    });

    it('should clear current panel on dispose', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      jest.clearAllMocks();
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      
      await new Promise(resolve => setTimeout(resolve, 10));

      const disposeHandler = (mockWebviewPanel.onDidDispose as jest.Mock).mock.calls[0]?.[0];
      disposeHandler?.();

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('HTML generation', () => {
    it('should generate valid HTML structure', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockWebviewPanel.webview.html).toContain('<!DOCTYPE html>');
      expect(mockWebviewPanel.webview.html).toContain('<html lang="en">');
      expect(mockWebviewPanel.webview.html).toContain('Protobuf Schema Graph');
    });

    it('should include D3 and ELK script references', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockWebviewPanel.webview.html).toContain('d3@7.9.0/dist/d3.min.js');
      expect(mockWebviewPanel.webview.html).toContain('elkjs@0.9.0/lib/elk.bundled.js');
    });
  });

  describe('message handling', () => {
    it('should register message handler', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockWebviewPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should handle refresh message', async () => {
      const mockGraphData: SchemaGraph = {
        nodes: [],
        edges: [],
        scope: 'workspace',
        sourceUri: 'file://test.proto',
      };
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      const options = {
        uri: 'file://test.proto',
        scope: 'workspace' as SchemaGraphScope,
      };

      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, options);
      await new Promise(resolve => setTimeout(resolve, 10));

      const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0]?.[0];
      
      jest.clearAllMocks();
      mockClient.sendRequest.mockResolvedValue(mockGraphData);

      await messageHandler?.({ type: 'refresh', scope: 'file', uri: 'file://other.proto' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.sendRequest).toHaveBeenCalledWith(
        'protobuf/getSchemaGraph',
        expect.objectContaining({ scope: 'file', uri: 'file://other.proto' })
      );
    });
  });
});
