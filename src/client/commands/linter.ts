/**
 * Linter command handlers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

/**
 * Response from external linter requests
 */
interface LinterResult {
  success: boolean;
  diagnostics?: unknown[];
  issueCount?: number;
  error?: string;
  errorInfo?: {
    message: string;
    details?: string;
    suggestion?: string;
    settingKey?: string;
  };
}

interface LintRulesResult {
  rules: string[];
}

interface LinterAvailabilityResult {
  available: boolean;
  linter: string;
}

/**
 * Registers all linter-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerLinterCommands(context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable[] {
  return [registerRunExternalLinterCommand(context, client), registerShowAvailableLintRulesCommand(context, client)];
}

/**
 * Show error message with optional action buttons
 */
async function showLinterError(message: string, errorInfo?: LinterResult['errorInfo']): Promise<void> {
  const actions: string[] = [];

  if (errorInfo?.settingKey) {
    actions.push('Open Settings');
  }
  actions.push('Show Output');

  const fullMessage = errorInfo?.suggestion ? `${message}\n\n💡 ${errorInfo.suggestion}` : message;

  const selection = await vscode.window.showErrorMessage(fullMessage, ...actions);

  if (selection === 'Open Settings' && errorInfo?.settingKey) {
    vscode.commands.executeCommand('workbench.action.openSettings', errorInfo.settingKey);
  } else if (selection === 'Show Output') {
    vscode.commands.executeCommand('workbench.action.output.toggleOutput');
  }
}

/**
 * Registers the run external linter command
 * Runs buf, protolint, or api-linter on the current proto file
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRunExternalLinterCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.runExternalLinter', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      // First check if linter is available
      const availability = (await client.sendRequest<LinterAvailabilityResult>(
        REQUEST_METHODS.IS_EXTERNAL_LINTER_AVAILABLE,
        {}
      )) as LinterAvailabilityResult;

      if (!availability.available) {
        const configureAction = 'Configure Linter';
        const selection = await vscode.window.showWarningMessage(
          `No external linter is configured or available. Configure buf, protolint, or api-linter to enable linting.`,
          configureAction,
          'Learn More'
        );

        if (selection === configureAction) {
          vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.externalLinter');
        } else if (selection === 'Learn More') {
          vscode.env.openExternal(vscode.Uri.parse('https://buf.build/docs/lint/overview'));
        }
        return;
      }

      const result = (await client.sendRequest<LinterResult>(REQUEST_METHODS.RUN_EXTERNAL_LINTER, {
        uri: editor.document.uri.toString(),
      })) as LinterResult;

      if (result.success) {
        const count = result.issueCount ?? result.diagnostics?.length ?? 0;
        if (count === 0) {
          vscode.window.showInformationMessage(SUCCESS_MESSAGES.LINTER_PASSED);
        } else {
          vscode.window.showInformationMessage(SUCCESS_MESSAGES.LINTER_FOUND_ISSUES(count));
        }
      } else {
        // Build detailed error message
        const errorMessage = result.errorInfo?.message || result.error || ERROR_MESSAGES.UNKNOWN_ERROR;
        await showLinterError(`${ERROR_MESSAGES.LINTER_ERROR}: ${errorMessage}`, result.errorInfo);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await showLinterError(`${ERROR_MESSAGES.LINTER_ERROR}: ${errorMessage}`, {
        message: errorMessage,
        suggestion: 'Make sure the language server is running and the linter is properly configured.',
        settingKey: 'protobuf.externalLinter',
      });
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
  _context: vscode.ExtensionContext,
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
