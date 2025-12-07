/**
 * Command registration module
 * Centralizes all command handler registrations
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { registerFormatCommand } from './format';
import { registerGoToDefinitionCommand } from './definition';
import { registerRenumberCommands } from './renumber';
import { registerCompileCommands } from './compile';
import { registerDebugCommand } from './debug';
import { registerSchemaGraphCommand } from './schemaGraph';
import { registerImportCommands } from './imports';
import { registerReferenceCommands } from './references';
import { registerBreakingCommands } from './breaking';
import { registerLinterCommands } from './linter';

/**
 * Registers all commands for the Protobuf extension
 * This function centralizes command registration and should be called during extension activation
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for all registered commands, which should be added to context.subscriptions
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Core commands
  disposables.push(registerFormatCommand(context, client));
  disposables.push(registerGoToDefinitionCommand(context, client));
  disposables.push(registerDebugCommand(context, client));
  disposables.push(registerSchemaGraphCommand(context, client));

  // Feature command groups
  disposables.push(...registerRenumberCommands(context, client));
  disposables.push(...registerCompileCommands(context, client));
  disposables.push(...registerImportCommands(context, client));
  disposables.push(...registerReferenceCommands(context, client));
  disposables.push(...registerBreakingCommands(context, client));
  disposables.push(...registerLinterCommands(context, client));

  return disposables;
}
