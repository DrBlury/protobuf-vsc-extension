/**
 * Linter command handlers
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

interface LinterResult {
  success: boolean;
  diagnostics?: unknown[];
  error?: string;
}

interface LintRulesResult {
  rules: string[];
}

/**
 * Registers all linter-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerLinterCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  return [
    registerRunExternalLinterCommand(context, client),
    registerShowAvailableLintRulesCommand(context, client)
  ];
}

/**
 * Registers the run external linter command
 * Runs buf or protolint on the current proto file
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRunExternalLinterCommand(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.runExternalLinter', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      const result = (await client.sendRequest<LinterResult>(REQUEST_METHODS.RUN_EXTERNAL_LINTER, {
        uri: editor.document.uri.toString()
      })) as LinterResult;

      if (result.success) {
        const count = result.diagnostics?.length || 0;
        if (count === 0) {
          vscode.window.showInformationMessage(SUCCESS_MESSAGES.LINTER_PASSED);
        } else {
          vscode.window.showInformationMessage(SUCCESS_MESSAGES.LINTER_FOUND_ISSUES(count));
        }
      } else {
        vscode.window.showErrorMessage(`${ERROR_MESSAGES.LINTER_ERROR}: ${result.error || ERROR_MESSAGES.UNKNOWN_ERROR}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.LINTER_ERROR}: ${errorMessage}`);
    }
  });
}

/**
 * Registers the show available lint rules command
 * Displays all available lint rules from the configured linter
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerShowAvailableLintRulesCommand(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.showAvailableLintRules', async () => {
    try {
      const result = (await client.sendRequest<LintRulesResult>(
        REQUEST_METHODS.GET_AVAILABLE_LINT_RULES,
        {}
      )) as LintRulesResult;

      if (result.rules && result.rules.length > 0) {
        const panel = vscode.window.createOutputChannel('Protobuf Lint Rules');
        panel.clear();
        panel.appendLine('Available Lint Rules:');
        panel.appendLine('');
        for (const rule of result.rules) {
          panel.appendLine(`  • ${rule}`);
        }
        panel.show();
      } else {
        vscode.window.showInformationMessage(VALIDATION_MESSAGES.LINTER_NOT_CONFIGURED);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.ERROR_GETTING_LINT_RULES}: ${errorMessage}`);
    }
  });
}
