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
  return [
    getLinterDiagnostics(),
    registerRunExternalLinterCommand(context, client),
    registerShowAvailableLintRulesCommand(context, client),
  ];
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

let linterDiagnostics: vscode.DiagnosticCollection | undefined;
let linterOutputChannel: vscode.OutputChannel | undefined;

function getLinterDiagnostics(): vscode.DiagnosticCollection {
  if (!linterDiagnostics) {
    linterDiagnostics = vscode.languages.createDiagnosticCollection('protobuf-linter');
  }
  return linterDiagnostics;
}

function getLinterOutputChannel(): vscode.OutputChannel {
  if (!linterOutputChannel) {
    linterOutputChannel = vscode.window.createOutputChannel('Protobuf Linter');
  }
  return linterOutputChannel;
}

function mapSeverity(severity?: number): vscode.DiagnosticSeverity {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
    case 1:
      return vscode.DiagnosticSeverity.Error;
    case vscode.DiagnosticSeverity.Information:
    case 3:
      return vscode.DiagnosticSeverity.Information;
    case vscode.DiagnosticSeverity.Hint:
    case 4:
      return vscode.DiagnosticSeverity.Hint;
    case vscode.DiagnosticSeverity.Warning:
    case 2:
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

function convertDiagnostics(diagnostics: unknown[] | undefined): vscode.Diagnostic[] {
  if (!Array.isArray(diagnostics)) {
    return [];
  }

  return diagnostics
    .map(diag => {
      const range = (diag as { range?: unknown }).range as {
        start?: { line?: number; character?: number };
        end?: { line?: number; character?: number };
      };

      if (!range?.start || !range?.end) {
        return null;
      }

      const start = new vscode.Position(range.start.line ?? 0, range.start.character ?? 0);
      const end = new vscode.Position(range.end.line ?? start.line, range.end.character ?? start.character);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(start, end),
        (diag as { message?: string }).message || '',
        mapSeverity((diag as { severity?: number }).severity)
      );

      diagnostic.source = (diag as { source?: string }).source || 'external-linter';
      diagnostic.code = (diag as { code?: string | number }).code;

      return diagnostic;
    })
    .filter((d): d is vscode.Diagnostic => d !== null);
}

function logLintDiagnostics(fileUri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
  const channel = getLinterOutputChannel();
  const timestamp = new Date().toISOString();

  channel.appendLine(`\n[${timestamp}] Lint results for ${fileUri.fsPath}`);

  if (diagnostics.length === 0) {
    channel.appendLine('No issues found.');
    return;
  }

  diagnostics.forEach((diag, index) => {
    const location = `${diag.range.start.line + 1}:${diag.range.start.character + 1}`;
    const severityLabel = vscode.DiagnosticSeverity[diag.severity] ?? 'Warning';
    const codeLabel = diag.code ? ` [${diag.code}]` : '';
    channel.appendLine(`${index + 1}. (${severityLabel}) ${location}${codeLabel} - ${diag.message}`);
  });
}

async function revealFirstDiagnostic(fileUri: vscode.Uri, diagnostic: vscode.Diagnostic): Promise<void> {
  const document = await vscode.workspace.openTextDocument(fileUri);
  const editor = await vscode.window.showTextDocument(document, { selection: diagnostic.range });
  editor.revealRange(diagnostic.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
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
        const diagnostics = convertDiagnostics(result.diagnostics);
        const count = Math.max(result.issueCount ?? 0, diagnostics.length);
        const diagnosticsCollection = getLinterDiagnostics();

        if (count === 0) {
          diagnosticsCollection.delete(editor.document.uri);
          vscode.window.showInformationMessage(SUCCESS_MESSAGES.LINTER_PASSED);
        } else {
          diagnosticsCollection.set(editor.document.uri, diagnostics);
          logLintDiagnostics(editor.document.uri, diagnostics);

          const selection = await vscode.window.showInformationMessage(
            SUCCESS_MESSAGES.LINTER_FOUND_ISSUES(count),
            'Show Problems',
            'Go to first issue',
            'View Lint Output'
          );

          if (selection === 'Show Problems') {
            vscode.commands.executeCommand('workbench.action.problems.focus');
          } else if (selection === 'Go to first issue' && diagnostics.length > 0) {
            await revealFirstDiagnostic(editor.document.uri, diagnostics[0]!);
          } else if (selection === 'View Lint Output') {
            getLinterOutputChannel().show(true);
          }
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
