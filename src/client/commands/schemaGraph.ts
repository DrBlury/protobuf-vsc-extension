/**
 * Schema Graph command handler
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SchemaGraphPanel } from '../schemaGraphPanel';
import { VALIDATION_MESSAGES } from '../../server/utils/constants';

/**
 * Registers the schema graph command
 * Opens an interactive graph view of message and enum relationships
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
export function registerSchemaGraphCommand(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.showSchemaGraph', () => {
    if (!client) {
      vscode.window.showErrorMessage(VALIDATION_MESSAGES.CLIENT_NOT_READY);
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const uri =
      editor?.document.languageId === 'proto' ? editor.document.uri.toString() : undefined;

    SchemaGraphPanel.createOrShow(context.extensionUri, client, {
      uri,
      scope: 'workspace'
    });
  });
}
