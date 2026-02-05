/**
 * Documentation preview command registration
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { DocumentationPanel } from '../panels/documentationPanel';

/**
 * Registers the documentation preview command
 */
export function registerDocumentationCommand(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.showDocumentation', () => {
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.languageId === 'proto' ? editor.document.uri.toString() : undefined;

    DocumentationPanel.createOrShow(context.extensionUri, client, uri);
  });
}
