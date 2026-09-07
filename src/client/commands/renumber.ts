/**
 * Renumber command handlers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { REQUEST_METHODS, VALIDATION_MESSAGES, SUCCESS_MESSAGES } from '../../server/utils/constants';
import {
  createWorkspaceEditFromTextEdits,
  applyWorkspaceEditWithMessage,
  isDocumentUnchanged,
} from '../utils/textEditHelpers';

async function getTargetDocument(uri?: string): Promise<vscode.TextDocument | undefined> {
  const activeDocument = vscode.window.activeTextEditor?.document;
  const document =
    !uri || activeDocument?.uri.toString() === uri
      ? activeDocument
      : await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  if (!document || document.languageId !== 'proto') {
    vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
    return undefined;
  }
  return document;
}

/**
 * Registers all renumber-related commands
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns Array of disposables for registered commands
 */
export function registerRenumberCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable[] {
  return [
    registerRenumberDocumentCommand(context, client),
    registerRenumberMessageCommand(context, client),
    registerRenumberFromCursorCommand(context, client),
    registerRenumberEnumCommand(context, client),
  ];
}

/**
 * Registers the renumber document command
 * Renumbers all field numbers in the current proto file sequentially
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRenumberDocumentCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.renumberDocument', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'proto') {
      vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_PROTO_FILE);
      return;
    }

    const version = editor.document.version;
    const result = await client.sendRequest(REQUEST_METHODS.RENUMBER_DOCUMENT, {
      uri: editor.document.uri.toString(),
    });

    if (!isDocumentUnchanged(editor.document, version)) {
      return;
    }
    if (result && Array.isArray(result) && result.length > 0) {
      const edit = createWorkspaceEditFromTextEdits(editor.document.uri, result);
      await applyWorkspaceEditWithMessage(edit, SUCCESS_MESSAGES.RENUMBERED_FIELDS(result.length));
    } else {
      vscode.window.showInformationMessage(VALIDATION_MESSAGES.NO_FIELDS_TO_RENUMBER);
    }
  });
}

/**
 * Registers the renumber message command
 * Renumbers field numbers within a specific message
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRenumberMessageCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.renumberMessage', async (uri?: string, messageName?: string) => {
    const document = await getTargetDocument(uri);
    if (!document) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const version = document.version;
    const docUri = document.uri.toString();
    const documentText = document.getText();

    // If no message name provided, get it from current cursor position
    if (!messageName && editor?.document.uri.toString() === docUri) {
      const result = await client.sendRequest(REQUEST_METHODS.GET_MESSAGE_AT_POSITION, {
        uri: docUri,
        position: {
          line: editor.selection.active.line,
          character: editor.selection.active.character,
        },
        text: documentText,
      });
      messageName = result as string | undefined;
    }

    if (!messageName) {
      // Ask user to select a message
      const messages = (await client.sendRequest(REQUEST_METHODS.GET_MESSAGES, {
        uri: docUri,
        text: documentText,
      })) as string[];
      if (!messages || messages.length === 0) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_MESSAGES_FOUND);
        return;
      }
      messageName = await vscode.window.showQuickPick(messages, {
        placeHolder: 'Select a message to renumber',
      });
    }

    if (!messageName) {
      return;
    }

    if (!isDocumentUnchanged(document, version)) {
      return;
    }
    const edits = await client.sendRequest(REQUEST_METHODS.RENUMBER_MESSAGE, {
      uri: docUri,
      messageName,
    });

    if (!isDocumentUnchanged(document, version)) {
      return;
    }
    if (edits && Array.isArray(edits) && edits.length > 0) {
      const edit = createWorkspaceEditFromTextEdits(document.uri, edits);
      await applyWorkspaceEditWithMessage(edit, SUCCESS_MESSAGES.RENUMBERED_MESSAGE_FIELDS(edits.length, messageName));
    } else {
      vscode.window.showInformationMessage(VALIDATION_MESSAGES.NO_FIELDS_TO_RENUMBER);
    }
  });
}

/**
 * Registers the renumber from cursor command
 * Renumbers fields starting from the cursor position
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRenumberFromCursorCommand(
  _context: vscode.ExtensionContext,
  client: LanguageClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'protobuf.renumberFromCursor',
    async (uri?: string, position?: { line: number; character: number }) => {
      const document = await getTargetDocument(uri);
      if (!document) {
        return;
      }

      const version = document.version;
      const docUri = document.uri.toString();
      let cursorPosition = position;
      if (!cursorPosition) {
        const activeEditor = vscode.window.activeTextEditor;
        const editor =
          activeEditor?.document.uri.toString() === docUri
            ? activeEditor
            : await vscode.window.showTextDocument(document);
        cursorPosition = {
          line: editor.selection.active.line,
          character: editor.selection.active.character,
        };
      }

      const edits = await client.sendRequest(REQUEST_METHODS.RENUMBER_FROM_POSITION, {
        uri: docUri,
        position: cursorPosition,
      });

      if (!isDocumentUnchanged(document, version)) {
        return;
      }
      if (edits && Array.isArray(edits) && edits.length > 0) {
        const edit = createWorkspaceEditFromTextEdits(document.uri, edits);
        await applyWorkspaceEditWithMessage(edit, SUCCESS_MESSAGES.RENUMBERED_FIELDS(edits.length));
      } else {
        vscode.window.showInformationMessage(VALIDATION_MESSAGES.NO_FIELDS_FROM_POSITION);
      }
    }
  );
}

/**
 * Registers the renumber enum command
 * Renumbers enum value numbers sequentially
 * @param context - The VS Code extension context
 * @param client - The language client instance
 * @returns A disposable for the registered command
 */
function registerRenumberEnumCommand(_context: vscode.ExtensionContext, client: LanguageClient): vscode.Disposable {
  return vscode.commands.registerCommand('protobuf.renumberEnum', async (uri?: string, enumName?: string) => {
    const document = await getTargetDocument(uri);
    if (!document) {
      return;
    }

    const version = document.version;
    const docUri = document.uri.toString();

    if (!enumName) {
      // Ask user to select an enum
      const enums = (await client.sendRequest(REQUEST_METHODS.GET_ENUMS, {
        uri: docUri,
      })) as string[];
      if (!enums || enums.length === 0) {
        vscode.window.showWarningMessage(VALIDATION_MESSAGES.NO_ENUMS_FOUND);
        return;
      }
      enumName = await vscode.window.showQuickPick(enums, {
        placeHolder: 'Select an enum to renumber',
      });
    }

    if (!enumName) {
      return;
    }

    if (!isDocumentUnchanged(document, version)) {
      return;
    }
    const edits = await client.sendRequest(REQUEST_METHODS.RENUMBER_ENUM, {
      uri: docUri,
      enumName,
    });

    if (!isDocumentUnchanged(document, version)) {
      return;
    }
    if (edits && Array.isArray(edits) && edits.length > 0) {
      const edit = createWorkspaceEditFromTextEdits(document.uri, edits);
      await applyWorkspaceEditWithMessage(edit, SUCCESS_MESSAGES.RENUMBERED_ENUM_VALUES(edits.length, enumName));
    } else {
      vscode.window.showInformationMessage(VALIDATION_MESSAGES.NO_VALUES_TO_RENUMBER);
    }
  });
}
