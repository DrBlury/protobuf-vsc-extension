/**
 * Compilation command handlers
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../server/utils/constants';

interface CompileFileResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface CompileAllResult {
  success: boolean;
  compiledFiles?: number;
  errors?: string[];
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
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.compileFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    try {
      const result = (await client.sendRequest(REQUEST_METHODS.COMPILE_FILE, {
        uri: editor.document.uri.toString()
      })) as CompileFileResult;

      if (result.success) {
        vscode.window.showInformationMessage(SUCCESS_MESSAGES.COMPILED_SUCCESSFULLY);
      } else {
        vscode.window.showErrorMessage(
          `${ERROR_MESSAGES.COMPILATION_FAILED}: ${result.error || ERROR_MESSAGES.UNKNOWN_ERROR}`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.COMPILATION_ERROR}: ${errorMessage}`);
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
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.compileAll', async () => {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_WORKSPACE);
        return;
      }

      const result = (await client.sendRequest(REQUEST_METHODS.COMPILE_ALL, {
        workspaceRoot: workspaceFolders[0].uri.fsPath
      })) as CompileAllResult;

      if (result.success) {
        vscode.window.showInformationMessage(
          SUCCESS_MESSAGES.COMPILED_ALL(result.compiledFiles || 0)
        );
      } else {
        const errorMsg = result.errors?.join('\n') || ERROR_MESSAGES.UNKNOWN_ERROR;
        vscode.window.showErrorMessage(`${ERROR_MESSAGES.COMPILATION_FAILED}:\n${errorMsg}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${ERROR_MESSAGES.COMPILATION_ERROR}: ${errorMessage}`);
    }
  });
}
