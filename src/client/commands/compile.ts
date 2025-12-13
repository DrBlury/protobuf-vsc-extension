/**
 * Compilation command handlers
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

interface CompileError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

interface CompileFileResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors?: CompileError[];
}

interface CompileAllResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors?: CompileError[];
}

/**
 * Output channel for verbose protoc logs
 */
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Protobuf Compiler');
  }
  return outputChannel;
}

/**
 * Log compilation details to output channel
 */
function logCompilationDetails(
  action: string,
  result: CompileFileResult | CompileAllResult,
  filePath?: string
): void {
  const channel = getOutputChannel();
  const timestamp = new Date().toISOString();

  channel.appendLine(`\n[${ timestamp }] ${action}`);
  if (filePath) {
    channel.appendLine(`File: ${filePath}`);
  }
  channel.appendLine(`Success: ${result.success}`);

  if (result.stdout) {
    channel.appendLine(`\n--- stdout ---`);
    channel.appendLine(result.stdout);
  }

  if (result.stderr) {
    channel.appendLine(`\n--- stderr ---`);
    channel.appendLine(result.stderr);
  }

  if (result.errors && result.errors.length > 0) {
    channel.appendLine(`\n--- Parsed Errors (${result.errors.length}) ---`);
    for (const err of result.errors) {
      const severity = err.severity === 'error' ? '❌' : '⚠️';
      const location = err.file ? `${err.file}:${err.line}:${err.column}` : `line ${err.line}`;
      channel.appendLine(`${severity} ${location}: ${err.message}`);
    }
  }
}

/**
 * Format errors for display to the user
 */
function formatErrorsForDisplay(result: CompileFileResult | CompileAllResult): string {
  if (result.errors && result.errors.length > 0) {
    return result.errors.map(e =>
      e.file ? `${e.file}:${e.line}:${e.column}: ${e.message}` : e.message
    ).join('\n');
  }
  if (result.stderr) {
    return result.stderr.trim();
  }
  return '';
}

/**
 * Detect if errors are related to missing Google types
 */
function detectMissingGoogleTypes(errorDetail: string): 'googleapis' | 'wellknown' | null {
  if (errorDetail.includes('google/api/') || errorDetail.includes('google/type/')) {
    return 'googleapis';
  }
  if (errorDetail.includes('google/protobuf/') && errorDetail.includes('not found')) {
    return 'wellknown';
  }
  return null;
}

/**
 * Show compilation error with actionable buttons
 */
async function showCompilationError(
  title: string,
  errorDetail: string,
  showProtocSettings: boolean = true
): Promise<void> {
  const actions: string[] = ['Show Output'];

  // Detect specific error types for better actions
  const missingGoogleTypes = detectMissingGoogleTypes(errorDetail);

  if (missingGoogleTypes === 'googleapis') {
    actions.unshift('Get googleapis');
  } else if (missingGoogleTypes === 'wellknown') {
    actions.unshift('Configure proto_path');
  }

  if (showProtocSettings) {
    actions.unshift('Configure protoc');
  }

  // Truncate very long error messages for the notification
  const displayError = errorDetail.length > 500
    ? errorDetail.substring(0, 500) + '...\n\n(See Output for full details)'
    : errorDetail;

  const selection = await vscode.window.showErrorMessage(
    `${title}:\n${displayError || ERROR_MESSAGES.UNKNOWN_ERROR}`,
    ...actions
  );

  if (selection === 'Configure protoc') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.protoc');
  } else if (selection === 'Configure proto_path') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.protoc.options');
  } else if (selection === 'Get googleapis') {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/googleapis/googleapis'));
  } else if (selection === 'Show Output') {
    getOutputChannel().show(true);
  }
}

/**
 * Registers all compilation-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerCompileCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  return [
    registerCompileFileCommand(context, client),
    registerCompileAllCommand(context, client)
  ];
}

/**
 * Registers the compile file command
 * Compiles the current proto file using protoc with configured options
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerCompileFileCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.compileFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    const filePath = editor.document.uri.fsPath;

    try {
      // First check if protoc is available
      const isAvailable = await client.sendRequest(REQUEST_METHODS.IS_PROTOC_AVAILABLE, {});

      if (!isAvailable) {
        const selection = await vscode.window.showErrorMessage(
          'protoc is not available. Please install protoc or configure the path in settings.',
          'Configure Path',
          'Install protoc'
        );

        if (selection === 'Configure Path') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.protoc.path');
        } else if (selection === 'Install protoc') {
          vscode.env.openExternal(vscode.Uri.parse('https://grpc.io/docs/protoc-installation/'));
        }
        return;
      }

      const result = (await client.sendRequest(REQUEST_METHODS.COMPILE_FILE, {
        uri: editor.document.uri.toString()
      })) as CompileFileResult;

      // Always log details for debugging
      logCompilationDetails('Compile File', result, filePath);

      if (result.success) {
        vscode.window.showInformationMessage(SUCCESS_MESSAGES.COMPILED_SUCCESSFULLY);
      } else {
        const errorDetail = formatErrorsForDisplay(result);
        await showCompilationError(ERROR_MESSAGES.COMPILATION_FAILED, errorDetail);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log the error
      const channel = getOutputChannel();
      channel.appendLine(`\n[${new Date().toISOString()}] Compilation Error`);
      channel.appendLine(`File: ${filePath}`);
      channel.appendLine(`Error: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        channel.appendLine(`Stack: ${error.stack}`);
      }

      await showCompilationError(ERROR_MESSAGES.COMPILATION_ERROR, errorMessage);
    }
  });
}

/**
 * Registers the compile all command
 * Compiles all proto files in the workspace
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerCompileAllCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.compileAll', async () => {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_WORKSPACE);
        return;
      }

      // First check if protoc is available
      const isAvailable = await client.sendRequest(REQUEST_METHODS.IS_PROTOC_AVAILABLE, {});

      if (!isAvailable) {
        const selection = await vscode.window.showErrorMessage(
          'protoc is not available. Please install protoc or configure the path in settings.',
          'Configure Path',
          'Install protoc'
        );

        if (selection === 'Configure Path') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.protoc.path');
        } else if (selection === 'Install protoc') {
          vscode.env.openExternal(vscode.Uri.parse('https://grpc.io/docs/protoc-installation/'));
        }
        return;
      }

      const result = (await client.sendRequest(REQUEST_METHODS.COMPILE_ALL, {
        workspaceRoot: workspaceFolders[0]!.uri.fsPath
      })) as CompileAllResult;

      // Always log details for debugging
      logCompilationDetails('Compile All', result, workspaceFolders[0]!.uri.fsPath);

      if (result.success) {
        vscode.window.showInformationMessage(
          SUCCESS_MESSAGES.COMPILED_ALL(result.errors?.length === 0 ? 0 : 1)
        );
      } else {
        const errorDetail = formatErrorsForDisplay(result);
        await showCompilationError(ERROR_MESSAGES.COMPILATION_FAILED, errorDetail);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log the error
      const channel = getOutputChannel();
      channel.appendLine(`\n[${new Date().toISOString()}] Compile All Error`);
      channel.appendLine(`Error: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        channel.appendLine(`Stack: ${error.stack}`);
      }

      await showCompilationError(ERROR_MESSAGES.COMPILATION_ERROR, errorMessage);
    }
  });
}
