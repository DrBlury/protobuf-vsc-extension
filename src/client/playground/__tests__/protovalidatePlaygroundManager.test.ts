import { createMockVscode, createMockExtensionContext } from '../../__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

import { ProtovalidatePlaygroundManager, type ProtovalidateRule } from '../protovalidatePlaygroundManager';

describe('ProtovalidatePlaygroundManager', () => {
  let manager: ProtovalidatePlaygroundManager;
  let mockContext: ReturnType<typeof createMockExtensionContext>;
  let mockOutputChannel: ReturnType<typeof mockVscode.window.createOutputChannel>;
  let mockWebviewPanel: ReturnType<typeof mockVscode.window.createWebviewPanel>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = createMockExtensionContext();
    mockOutputChannel = mockVscode.window.createOutputChannel();
    mockWebviewPanel = mockVscode.window.createWebviewPanel();
    manager = new ProtovalidatePlaygroundManager(mockContext as never, mockOutputChannel);
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(manager).toBeInstanceOf(ProtovalidatePlaygroundManager);
    });
  });

  describe('openPlayground', () => {
    it('should create a webview panel', () => {
      manager.openPlayground();

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'protovalidatePlayground',
        'Protovalidate Playground',
        mockVscode.ViewColumn.Two,
        expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true })
      );
    });

    it('should set HTML content on the webview', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('Protovalidate Playground');
      expect(mockWebviewPanel.webview.html).toContain('Validation Rule');
      expect(mockWebviewPanel.webview.html).toContain('Test Value');
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

    it('should send rule to webview if provided', () => {
      jest.useFakeTimers();
      const rule: ProtovalidateRule = {
        fieldName: 'email',
        messageName: 'User',
        ruleType: 'string',
        ruleText: '(buf.validate.field).string.email = true',
        lineNumber: 5,
        filePath: 'file:///test/user.proto',
      };

      manager.openPlayground(rule);
      jest.advanceTimersByTime(150);

      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
        command: 'setRule',
        rule,
      });
      jest.useRealTimers();
    });

    it('should send rule when opening existing panel', () => {
      manager.openPlayground();
      jest.clearAllMocks();

      const rule: ProtovalidateRule = {
        fieldName: 'name',
        messageName: 'Person',
        ruleType: 'string',
        ruleText: '(buf.validate.field).string.min_len = 1',
        lineNumber: 3,
        filePath: 'file:///test/person.proto',
      };

      manager.openPlayground(rule);

      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
        command: 'setRule',
        rule,
      });
    });
  });

  describe('message handling', () => {
    let messageHandler: ((message: unknown) => Promise<void>) | undefined;

    beforeEach(() => {
      manager.openPlayground();
      const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
      messageHandler = calls[0]?.[0];
    });

    describe('openDocs command', () => {
      it('should open protovalidate documentation', async () => {
        await messageHandler?.({ command: 'openDocs' });

        expect(mockVscode.env.openExternal).toHaveBeenCalledWith(
          expect.objectContaining({
            fsPath: expect.stringContaining('buf.build/docs/protovalidate'),
          })
        );
      });
    });

    describe('openCelPlayground command', () => {
      it('should open CEL playground', async () => {
        await messageHandler?.({ command: 'openCelPlayground' });

        expect(mockVscode.env.openExternal).toHaveBeenCalledWith(
          expect.objectContaining({
            fsPath: expect.stringContaining('playcel.undistro.io'),
          })
        );
      });
    });

    describe('copyExpression command', () => {
      it('should copy expression to clipboard', async () => {
        await messageHandler?.({ command: 'copyExpression', expression: 'this.size() > 0' });

        expect(mockVscode.env.clipboard.writeText).toHaveBeenCalledWith('this.size() > 0');
        expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith('CEL expression copied to clipboard');
      });
    });

    describe('validateData command', () => {
      it('should validate string min_len constraint', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'name',
          messageName: 'User',
          ruleType: 'string',
          ruleText: '(buf.validate.field).string.min_len = 3',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        // First set up rule by opening with it
        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: '"ab"' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({ valid: false }),
        });
      });

      it('should pass valid string min_len constraint', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'name',
          messageName: 'User',
          ruleType: 'string',
          ruleText: '(buf.validate.field).string.min_len = 3',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: '"hello"' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({ valid: true }),
        });
      });

      it('should handle invalid JSON', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'name',
          messageName: 'User',
          ruleType: 'string',
          ruleText: '(buf.validate.field).string.min_len = 1',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: 'not valid json' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({
            valid: false,
            error: expect.stringContaining('Invalid JSON'),
          }),
        });
      });

      it('should validate numeric gt constraint', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'age',
          messageName: 'User',
          ruleType: 'numeric',
          ruleText: '(buf.validate.field).int32.gt = 0',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: '-1' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({ valid: false }),
        });
      });

      it('should validate array min_items constraint', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'tags',
          messageName: 'Post',
          ruleType: 'repeated',
          ruleText: '(buf.validate.field).repeated.min_items = 1',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: '[]' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({ valid: false }),
        });
      });

      it('should provide info for CEL expressions', async () => {
        const rule: ProtovalidateRule = {
          fieldName: 'data',
          messageName: 'Request',
          ruleType: 'cel',
          ruleText: '(buf.validate.field).cel.expression = "this.size() > 0"',
          lineNumber: 1,
          filePath: 'test.proto',
        };

        manager.openPlayground(rule);
        const calls = (mockWebviewPanel.webview.onDidReceiveMessage as jest.Mock).mock.calls;
        messageHandler = calls[0]?.[0];
        jest.clearAllMocks();

        await messageHandler?.({
          command: 'validateData',
          data: { rule, jsonValue: '"test"' },
        });

        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
          command: 'validationResult',
          result: expect.objectContaining({
            valid: true,
            info: expect.stringContaining('CEL'),
          }),
        });
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
    it('should include validation rule section', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('Validation Rule');
      expect(mockWebviewPanel.webview.html).toContain('ruleContent');
    });

    it('should include test value input', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('jsonInput');
      expect(mockWebviewPanel.webview.html).toContain('Test Value');
    });

    it('should include validate button', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('validateBtn');
      expect(mockWebviewPanel.webview.html).toContain('Validate');
    });

    it('should include result output area', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('resultOutput');
      expect(mockWebviewPanel.webview.html).toContain('Result');
    });

    it('should include documentation links', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('docsLink');
      expect(mockWebviewPanel.webview.html).toContain('celLink');
      expect(mockWebviewPanel.webview.html).toContain('Documentation');
      expect(mockWebviewPanel.webview.html).toContain('CEL Playground');
    });

    it('should include example chips', () => {
      manager.openPlayground();

      expect(mockWebviewPanel.webview.html).toContain('example-chip');
      expect(mockWebviewPanel.webview.html).toContain('Email');
      expect(mockWebviewPanel.webview.html).toContain('UUID');
      expect(mockWebviewPanel.webview.html).toContain('Number');
    });
  });
});
