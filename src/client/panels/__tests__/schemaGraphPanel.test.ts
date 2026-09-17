import { createMockVscode, createMockLanguageClient } from '../../__tests__/testUtils';
import type { SchemaGraph, SchemaGraphScope } from '../../../shared/schemaGraph';
import { runInNewContext } from 'vm';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

jest.mock(
  'vscode-languageclient/node',
  () => ({
    LanguageClient: jest.fn(),
    TransportKind: { ipc: 1, stdio: 2 },
  }),
  { virtual: true }
);

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
        expect.objectContaining({
          enableScripts: true,
          localResourceRoots: [expect.objectContaining({ fsPath: '/test/extension/dist/webview' })],
        })
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
    it('ignores an old graph response after a new source is selected', async () => {
      let first!: (graph: SchemaGraph) => void;
      const latest: SchemaGraph = { nodes: [], edges: [], scope: 'file', sourceUri: 'file:///second.proto' };
      mockClient.sendRequest
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              first = resolve;
            })
        )
        .mockResolvedValueOnce(latest);
      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, {
        uri: 'file:///first.proto',
        scope: 'file',
      });
      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, { uri: latest.sourceUri, scope: 'file' });
      await Promise.resolve();
      first({ ...latest, sourceUri: 'file:///first.proto' });
      await Promise.resolve();

      expect(mockWebviewPanel.webview.html).toContain('file:///second.proto');
      expect(mockWebviewPanel.webview.html).not.toContain('file:///first.proto');
      expect(mockWebviewPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('does not update a disposed graph panel when its request finishes', async () => {
      let finish!: (graph: SchemaGraph) => void;
      mockClient.sendRequest.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, {
        uri: 'file:///first.proto',
        scope: 'file',
      });
      (mockWebviewPanel.onDidDispose as jest.Mock).mock.calls[0][0]();
      const html = mockWebviewPanel.webview.html;
      finish({ nodes: [], edges: [], scope: 'file' });
      await Promise.resolve();
      expect(mockWebviewPanel.webview.html).toBe(html);
      expect(mockWebviewPanel.webview.postMessage).not.toHaveBeenCalled();
    });
    it('preserves HTML-like schema text without terminating the webview script or injecting filter markup', async () => {
      const specialFile = 'schema"<img onerror=alert(1)>.proto';
      const sourceUri = 'file:///test/</script>/schema.proto';
      const graph: SchemaGraph = {
        nodes: [{ id: 'Request', label: 'Request', kind: 'message', fields: [], file: specialFile }],
        edges: [],
        scope: 'workspace',
        sourceUri,
      };
      mockClient.sendRequest.mockResolvedValue(graph);
      SchemaGraphPanel.createOrShow(mockExtensionUri as never, mockClient, { uri: sourceUri, scope: 'workspace' });
      await new Promise(resolve => setTimeout(resolve, 20));

      const html = mockWebviewPanel.webview.html;
      expect(html).not.toContain(sourceUri);
      expect(html).not.toContain(specialFile);
      const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
      expect(() => new Function(script)).not.toThrow();
      const graphJson = script.match(/let graphData = (.*);/)![1];
      expect(JSON.parse(graphJson)).toEqual(graph);

      const populateFilters = script.slice(
        script.indexOf('function populateFilters('),
        script.indexOf('function getOrphanIds(')
      );
      const filterFile = { value: '', replaceChildren: jest.fn() };
      const filterPackage = { value: '', replaceChildren: jest.fn() };
      class Option {
        constructor(
          public text: string,
          public value: string
        ) {}
      }
      runInNewContext(`${populateFilters}; populateFilters(data);`, {
        data: graph,
        filterFile,
        filterPackage,
        Option,
        selectedPackage: '',
        selectedFile: '',
      });
      expect(filterFile.replaceChildren).toHaveBeenCalledWith(
        new Option('All Files', ''),
        new Option(specialFile, specialFile)
      );
    });

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

      expect(mockClient.sendRequest).toHaveBeenCalledWith('protobuf/getSchemaGraph', {
        uri: 'file://test.proto',
        scope: 'workspace',
      });
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

    it('loads graph libraries only from packaged webview assets', async () => {
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

      expect(mockWebviewPanel.webview.html).toContain('/dist/webview/d3.min.js');
      expect(mockWebviewPanel.webview.html).toContain('/dist/webview/elk.bundled.js');
      expect(mockWebviewPanel.webview.html).toContain('/dist/webview/jspdf.umd.min.js');
      expect(mockWebviewPanel.webview.html).not.toMatch(/<script[^>]+src="https:/);
      expect(mockWebviewPanel.webview.html).not.toContain('cdn.jsdelivr.net');
      expect(mockWebviewPanel.webview.html).not.toContain('cdnjs.cloudflare.com');
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
