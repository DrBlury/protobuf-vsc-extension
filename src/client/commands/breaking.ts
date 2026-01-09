/**
 * Breaking change detection command handlers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

interface BreakingChange {
  code: string;
  message: string;
  location?: { line: number; character: number };
}

interface BreakingChangesResult {
  changes: BreakingChange[];
}

/**
 * Registers all breaking change-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerBreakingCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  return [registerCheckBreakingChangesCommand(context, client)];
}

/**
 * Registers the check breaking changes command
 * Compares the current proto file against a baseline to detect breaking changes
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerCheckBreakingChangesCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.checkBreakingChanges', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      const result = (await client.sendRequest<BreakingChangesResult>(
        REQUEST_METHODS.CHECK_BREAKING_CHANGES,
        {
          uri: editor.document.uri.toString()
        }
      )) as BreakingChangesResult;

      if (!result.changes || !result.changes.length) {
        vscode.window.showInformationMessage(SUCCESS_MESSAGES.NO_BREAKING_CHANGES);
      } else {
        const panel = vscode.window.createOutputChannel('Protobuf Breaking Changes');
        panel.clear();
        panel.appendLine('Breaking Changes Detected:');
        panel.appendLine('');
        for (const change of result.changes) {
          panel.appendLine(`[${change.code}] ${change.message}`);
          if (change.location) {
            panel.appendLine(
              `  Line ${change.location.line + 1}, Character ${change.location.character + 1}`
            );
          }
        }
        panel.show();
        vscode.window.showWarningMessage(
          `${result.changes.length} breaking change(s) detected. See output for details.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.ERROR_CHECKING_BREAKING_CHANGES}: ${errorMessage}`);
    }
  });
}
