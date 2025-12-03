/**
 * Protocol Buffers Language Client
 */

import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function createLanguageClient(context: { extensionPath: string }): LanguageClient {
  // Server module path
  const serverModule = path.join(context.extensionPath, 'out', 'server', 'server.js');

  // Server options
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009']
      }
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'proto' }],
    synchronize: {
      configurationSection: 'protobuf'
    }
  };

  // Create and return the client
  client = new LanguageClient(
    'protobufLanguageServer',
    'Protobuf Language Server',
    serverOptions,
    clientOptions
  );

  return client;
}

export function getClient(): LanguageClient | undefined {
  return client;
}
