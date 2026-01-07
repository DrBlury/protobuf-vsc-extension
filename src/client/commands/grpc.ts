/**
 * gRPC command handlers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS } from '../../server/utils/constants';

interface GrpcService {
  name: string;
  fullName: string;
  package: string;
  rpcs: GrpcRpc[];
  uri: string;
}

interface GrpcRpc {
  name: string;
  fullName: string;
  inputType: string;
  outputType: string;
  streamingType: 'unary' | 'server-streaming' | 'client-streaming' | 'bidirectional-streaming';
}

/**
 * Registers all gRPC-related commands
 */
export function registerGrpcCommands(context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable[] {
  return [
    registerListGrpcServicesCommand(context, client),
    registerShowGrpcServiceCommand(context, client),
    registerGenerateClientStubCommand(context, client),
    registerGenerateServerTemplateCommand(context, client),
    registerShowGrpcServiceStatsCommand(context, client),
  ];
}

/**
 * List all gRPC services in workspace
 */
function registerListGrpcServicesCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.listGrpcServices', async () => {
    try {
      const services = await client.sendRequest<GrpcService[]>(REQUEST_METHODS.GET_GRPC_SERVICES);

      if (services.length === 0) {
        vscode.window.showInformationMessage('No gRPC services found in workspace');
        return;
      }

      // Show quick pick with services
      const items = services.map(service => ({
        label: service.fullName,
        description: `${service.rpcs.length} RPC${service.rpcs.length !== 1 ? 's' : ''}`,
        detail: service.uri,
        service,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a gRPC service to view details',
      });

      if (selected) {
        // Open the file and show service
        const uri = vscode.Uri.parse(selected.service.uri);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);

        // Show service details
        showServiceDetails(selected.service);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list gRPC services: ${error}`);
    }
  });
}

/**
 * Show gRPC service details
 */
function registerShowGrpcServiceCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.showGrpcService', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage('Please open a .proto file');
      return;
    }

    // Get service at cursor position (simplified - would need position analysis)
    const services = await client.sendRequest<GrpcService[]>(REQUEST_METHODS.GET_GRPC_SERVICES);
    const uri = editor.document.uri.toString();
    const servicesInFile = services.filter(s => s.uri === uri);

    if (servicesInFile.length === 0) {
      vscode.window.showInformationMessage('No gRPC services found in this file');
      return;
    }

    if (servicesInFile.length === 1) {
      showServiceDetails(servicesInFile[0]!);
    } else {
      const selected = await vscode.window.showQuickPick(
        servicesInFile.map(s => ({
          label: s.name,
          description: `${s.rpcs.length} RPCs`,
          service: s,
        })),
        { placeHolder: 'Select a service' }
      );
      if (selected) {
        showServiceDetails(selected.service);
      }
    }
  });
}

/**
 * Generate client stub code
 */
function registerGenerateClientStubCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.generateGrpcClientStub', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage('Please open a .proto file');
      return;
    }

    const services = await client.sendRequest<GrpcService[]>(REQUEST_METHODS.GET_GRPC_SERVICES);
    const uri = editor.document.uri.toString();
    const servicesInFile = services.filter(s => s.uri === uri);

    if (servicesInFile.length === 0) {
      vscode.window.showInformationMessage('No gRPC services found in this file');
      return;
    }

    // Select service
    const serviceItem = await vscode.window.showQuickPick(
      servicesInFile.map(s => ({
        label: s.name,
        description: s.fullName,
        service: s,
      })),
      { placeHolder: 'Select a service' }
    );

    if (!serviceItem) {
      return;
    }

    // Select language
    const language = await vscode.window.showQuickPick(
      [
        { label: 'Go', value: 'go' as const },
        { label: 'Java', value: 'java' as const },
        { label: 'Python', value: 'python' as const },
        { label: 'TypeScript', value: 'typescript' as const },
      ],
      { placeHolder: 'Select target language' }
    );

    if (!language) {
      return;
    }

    try {
      const result = await client.sendRequest<{ code: string; error?: string }>(
        REQUEST_METHODS.GENERATE_GRPC_CLIENT_STUB,
        {
          serviceName: serviceItem.service.name,
          language: language.value,
          uri,
        }
      );

      if (result.error) {
        vscode.window.showErrorMessage(result.error);
        return;
      }

      // Create new document with generated code
      const doc = await vscode.workspace.openTextDocument({
        content: result.code,
        language: language.value,
      });
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate client stub: ${error}`);
    }
  });
}

/**
 * Generate server template code
 */
function registerGenerateServerTemplateCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.generateGrpcServerTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage('Please open a .proto file');
      return;
    }

    const services = await client.sendRequest<GrpcService[]>(REQUEST_METHODS.GET_GRPC_SERVICES);
    const uri = editor.document.uri.toString();
    const servicesInFile = services.filter(s => s.uri === uri);

    if (servicesInFile.length === 0) {
      vscode.window.showInformationMessage('No gRPC services found in this file');
      return;
    }

    // Select service
    const serviceItem = await vscode.window.showQuickPick(
      servicesInFile.map(s => ({
        label: s.name,
        description: s.fullName,
        service: s,
      })),
      { placeHolder: 'Select a service' }
    );

    if (!serviceItem) {
      return;
    }

    // Select language
    const language = await vscode.window.showQuickPick(
      [
        { label: 'Go', value: 'go' as const },
        { label: 'Java', value: 'java' as const },
        { label: 'Python', value: 'python' as const },
        { label: 'TypeScript', value: 'typescript' as const },
      ],
      { placeHolder: 'Select target language' }
    );

    if (!language) {
      return;
    }

    try {
      const result = await client.sendRequest<{ code: string; error?: string }>(
        REQUEST_METHODS.GENERATE_GRPC_SERVER_TEMPLATE,
        {
          serviceName: serviceItem.service.name,
          language: language.value,
          uri,
        }
      );

      if (result.error) {
        vscode.window.showErrorMessage(result.error);
        return;
      }

      // Create new document with generated code
      const doc = await vscode.workspace.openTextDocument({
        content: result.code,
        language: language.value,
      });
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate server template: ${error}`);
    }
  });
}

/**
 * Show gRPC service statistics
 */
function registerShowGrpcServiceStatsCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.showGrpcServiceStats', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage('Please open a .proto file');
      return;
    }

    const services = await client.sendRequest<GrpcService[]>(REQUEST_METHODS.GET_GRPC_SERVICES);
    const uri = editor.document.uri.toString();
    const servicesInFile = services.filter(s => s.uri === uri);

    if (servicesInFile.length === 0) {
      vscode.window.showInformationMessage('No gRPC services found in this file');
      return;
    }

    const serviceItem = await vscode.window.showQuickPick(
      servicesInFile.map(s => ({
        label: s.name,
        description: s.fullName,
        service: s,
      })),
      { placeHolder: 'Select a service' }
    );

    if (!serviceItem) {
      return;
    }

    try {
      const stats = (await client.sendRequest(REQUEST_METHODS.GET_GRPC_SERVICE_STATS, {
        serviceName: serviceItem.service.name,
        uri,
      })) as {
        totalRpcs: number;
        unaryRpcs: number;
        streamingRpcs: number;
        serverStreamingRpcs: number;
        clientStreamingRpcs: number;
        bidirectionalStreamingRpcs: number;
      };

      const message = [
        `**${serviceItem.service.name}** Statistics`,
        '',
        `Total RPCs: ${stats.totalRpcs}`,
        `Unary RPCs: ${stats.unaryRpcs}`,
        `Streaming RPCs: ${stats.streamingRpcs}`,
        `  - Server Streaming: ${stats.serverStreamingRpcs}`,
        `  - Client Streaming: ${stats.clientStreamingRpcs}`,
        `  - Bidirectional: ${stats.bidirectionalStreamingRpcs}`,
      ].join('\n');

      vscode.window.showInformationMessage(message, { modal: true });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get service stats: ${error}`);
    }
  });
}

/**
 * Show service details in a message
 */
function showServiceDetails(service: GrpcService): void {
  const rpcList = service.rpcs
    .map(rpc => {
      const streamIcon =
        rpc.streamingType === 'unary'
          ? '→'
          : rpc.streamingType === 'server-streaming'
            ? '→→'
            : rpc.streamingType === 'client-streaming'
              ? '→→'
              : '⇄';
      return `  ${streamIcon} ${rpc.name}(${rpc.inputType}) → ${rpc.outputType}`;
    })
    .join('\n');

  const message = [
    `**${service.fullName}**`,
    '',
    `Package: ${service.package || '<none>'}`,
    `RPCs (${service.rpcs.length}):`,
    rpcList,
  ].join('\n');

  vscode.window.showInformationMessage(message, { modal: true });
}
