import * as path from 'path';
import { createMockVscode } from './__tests__/testUtils';

const mockVscode = createMockVscode();

jest.mock('vscode', () => mockVscode, { virtual: true });

const mockLanguageClient = jest.fn().mockImplementation(() => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
}));

jest.mock(
  'vscode-languageclient/node',
  () => ({
    LanguageClient: mockLanguageClient,
    TransportKind: { ipc: 1, stdio: 2 },
  }),
  { virtual: true }
);

import { createLanguageClient, getClient } from './client';

describe('client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLanguageClient', () => {
    it('should create a language client with correct parameters', () => {
      const context = { extensionPath: '/test/extension' };

      createLanguageClient(context);

      expect(mockLanguageClient).toHaveBeenCalledWith(
        'protobufLanguageServer',
        'Protobuf Language Server',
        expect.objectContaining({
          run: expect.objectContaining({
            module: expect.stringContaining('server.js'),
            transport: 1,
          }),
          debug: expect.objectContaining({
            module: expect.stringContaining('server.js'),
            transport: 1,
          }),
        }),
        expect.objectContaining({
          documentSelector: [{ scheme: 'file', language: 'proto' }],
          synchronize: { configurationSection: 'protobuf' },
        })
      );
    });

    it('should return the created client', () => {
      const context = { extensionPath: '/test/extension' };

      const result = createLanguageClient(context);

      expect(result).toBeDefined();
    });

    it('should use correct server module path', () => {
      const context = { extensionPath: '/my/extension/path' };

      createLanguageClient(context);

      const serverOptions = mockLanguageClient.mock.calls[0][2];
      const expectedPath = path.join('/my/extension/path', 'out', 'server', 'server.js');
      expect(serverOptions.run.module).toBe(expectedPath);
      expect(serverOptions.debug.module).toBe(expectedPath);
    });

    it('should configure debug options with inspect port', () => {
      const context = { extensionPath: '/test/extension' };

      createLanguageClient(context);

      const serverOptions = mockLanguageClient.mock.calls[0][2];
      expect(serverOptions.debug.options.execArgv).toContain('--nolazy');
      expect(serverOptions.debug.options.execArgv[1]).toMatch(/--inspect=\d+/);
    });
  });

  describe('getClient', () => {
    it('should return undefined before client is created', () => {
      jest.resetModules();
      jest.doMock(
        'vscode-languageclient/node',
        () => ({
          LanguageClient: mockLanguageClient,
          TransportKind: { ipc: 1 },
        }),
        { virtual: true }
      );

      const { getClient: freshGetClient } = require('./client');
      expect(freshGetClient()).toBeUndefined();
    });

    it('should return the client after creation', () => {
      const context = { extensionPath: '/test/extension' };

      const createdClient = createLanguageClient(context);
      const retrievedClient = getClient();

      expect(retrievedClient).toBe(createdClient);
    });
  });
});
