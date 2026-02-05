/* eslint-disable no-useless-escape */
// Note: Regex escapes in template literals are intentional - they're for embedded JavaScript
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Result of binary decoding operation
 */
interface DecodeResult {
  /** The decoded text output */
  rawDecode: string;
  /** Hex dump of the binary data */
  hexDump: string;
  /** Whether schema-aware (named) decoding was successful */
  isNamed: boolean;
  /** Error message if decoding failed or fell back */
  error?: string;
  /** The message type that was used for successful decode */
  decodedAs?: string;
  /** Suggested message types based on auto-detection */
  suggestedTypes?: string[];
}

interface MessageTypeInfo {
  /** Fully qualified message name */
  name: string;
  /** Location of the schema definition */
  uri: vscode.Uri;
}

export class BinaryDecoderProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'protobuf.binaryInspector';
  private readonly messageTypeIndex: Map<string, vscode.Uri> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  public static register(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): vscode.Disposable {
    const provider = new BinaryDecoderProvider(context, outputChannel);
    return vscode.window.registerCustomEditorProvider(BinaryDecoderProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    if (!this.isInspectorEnabled()) {
      webviewPanel.webview.html = this.getDisabledHtml(webviewPanel.webview, document.uri.fsPath);
      webviewPanel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'protobuf.binaryInspector.enabled');
        }
      });
      return;
    }

    let messageTypeInfos = await this.getMessageTypes();
    let messageTypes = messageTypeInfos.map(info => info.name);
    let schemaLookup = this.getSchemaLookup();

    // Try to auto-detect the best message type based on file context
    const suggestedType = this.autoDetectMessageType(document.uri, messageTypes);

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      { rawDecode: 'Loading...', hexDump: '', isNamed: false },
      document.uri.fsPath,
      messageTypes,
      suggestedType,
      schemaLookup
    );

    webviewPanel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'decode':
          try {
            const data = await this.decodeBinary(document.uri, message.messageType);
            if (message.messageType && data.isNamed && !data.decodedAs) {
              data.decodedAs = message.messageType;
            }
            webviewPanel.webview.postMessage({
              command: 'updateContent',
              data,
              schemaPath: this.getSchemaPath(data.decodedAs),
              schemaMap: schemaLookup,
            });
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            webviewPanel.webview.postMessage({ command: 'error', message: errorMessage });
          }
          break;
        case 'autoDetect':
          try {
            const data = await this.decodeBinaryWithAutoDetect(document.uri, messageTypes);
            webviewPanel.webview.postMessage({
              command: 'updateContent',
              data,
              schemaPath: this.getSchemaPath(data.decodedAs),
              schemaMap: schemaLookup,
            });
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            webviewPanel.webview.postMessage({ command: 'error', message: errorMessage });
          }
          break;
        case 'refreshTypes':
          messageTypeInfos = await this.getMessageTypes();
          messageTypes = messageTypeInfos.map(info => info.name);
          schemaLookup = this.getSchemaLookup();
          webviewPanel.webview.postMessage({
            command: 'updateTypes',
            types: messageTypes,
            schemaMap: schemaLookup,
          });
          break;
        case 'openSchema':
          await this.openSchema(message.messageType, message.schemaPath);
          break;
      }
    });

    // Initial decode - try auto-detection first
    try {
      const data = await this.decodeBinaryWithAutoDetect(document.uri, messageTypes);
      webviewPanel.webview.html = this.getHtmlForWebview(
        webviewPanel.webview,
        data,
        document.uri.fsPath,
        messageTypes,
        data.decodedAs || suggestedType,
        schemaLookup
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      webviewPanel.webview.html = this.getHtmlForWebview(
        webviewPanel.webview,
        { rawDecode: `Error decoding file:\n${errorMessage}`, hexDump: '', isNamed: false },
        document.uri.fsPath,
        messageTypes,
        suggestedType,
        schemaLookup
      );
    }
  }

  /**
   * Auto-detect the best message type based on file name and context
   */
  private autoDetectMessageType(uri: vscode.Uri, messageTypes: string[]): string | undefined {
    const fileName = path.basename(uri.fsPath, path.extname(uri.fsPath));
    const normalizedFileName = fileName.toLowerCase().replace(/[-_]/g, '');

    // Try exact match on simple name
    for (const type of messageTypes) {
      const simpleName = type.split('.').pop() || type;
      if (simpleName.toLowerCase() === normalizedFileName) {
        this.outputChannel.appendLine(`Binary Inspector: Auto-detected type '${type}' based on filename match`);
        return type;
      }
    }

    // Try fuzzy match
    for (const type of messageTypes) {
      const simpleName = type.split('.').pop() || type;
      const normalizedType = simpleName.toLowerCase();
      if (normalizedFileName.includes(normalizedType) || normalizedType.includes(normalizedFileName)) {
        this.outputChannel.appendLine(`Binary Inspector: Auto-detected type '${type}' based on fuzzy name match`);
        return type;
      }
    }

    return undefined;
  }

  /**
   * Decode binary with auto-detection: tries suggested types then falls back to raw
   */
  private async decodeBinaryWithAutoDetect(uri: vscode.Uri, messageTypes: string[]): Promise<DecodeResult> {
    const suggestedType = this.autoDetectMessageType(uri, messageTypes);

    // If we have a suggested type, try it first
    if (suggestedType) {
      try {
        const result = await this.decodeBinary(uri, suggestedType);
        if (result.isNamed) {
          return {
            ...result,
            decodedAs: suggestedType,
            suggestedTypes: [suggestedType],
          };
        }
      } catch (e) {
        this.outputChannel.appendLine(`Binary Inspector: Auto-detected type '${suggestedType}' failed: ${e}`);
      }
    }

    // Fall back to raw decode
    const rawResult = await this.decodeBinary(uri);
    return {
      ...rawResult,
      suggestedTypes: suggestedType ? [suggestedType] : undefined,
      error: suggestedType
        ? `Auto-detection tried '${suggestedType}' but decode failed. Showing raw field data.\nTry selecting a message type manually from the dropdown.`
        : undefined,
    };
  }

  private async getMessageTypes(): Promise<MessageTypeInfo[]> {
    const types: Map<string, vscode.Uri> = new Map();
    try {
      const files = await vscode.workspace.findFiles('**/*.proto', '**/node_modules/**');
      for (const file of files) {
        try {
          const content = await vscode.workspace.fs.readFile(file);
          const text = new globalThis.TextDecoder().decode(content);

          const packageMatch = text.match(/package\s+([\w.]+);/);
          const pkg = packageMatch ? packageMatch[1] + '.' : '';

          const matches = text.matchAll(/message\s+(\w+)/g);
          for (const match of matches) {
            const name = pkg + match[1];
            if (!types.has(name)) {
              types.set(name, file);
            }
          }
        } catch {
          /* ignore parsing errors */
        }
      }
    } catch (e) {
      this.outputChannel.appendLine(`Error scanning for message types: ${e}`);
    }
    const results = Array.from(types.entries())
      .map(([name, uri]) => ({ name, uri }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.messageTypeIndex.clear();
    for (const info of results) {
      this.messageTypeIndex.set(info.name, info.uri);
    }
    return results;
  }

  private getSchemaPath(typeName?: string): string | undefined {
    if (!typeName) {
      return undefined;
    }
    return this.messageTypeIndex.get(typeName)?.fsPath;
  }

  private getSchemaLookup(): Record<string, string> {
    const lookup: Record<string, string> = {};
    for (const [name, uri] of this.messageTypeIndex) {
      lookup[name] = uri.fsPath;
    }
    return lookup;
  }

  private async openSchema(messageType?: string, schemaPath?: string): Promise<void> {
    const target = messageType?.trim();
    const explicitPath = schemaPath?.trim();
    if (!target && !explicitPath) {
      vscode.window.showInformationMessage('Enter or detect a message type to open its schema.');
      return;
    }

    let resolvedUri: vscode.Uri | undefined;
    if (explicitPath && fs.existsSync(explicitPath)) {
      resolvedUri = vscode.Uri.file(explicitPath);
    }

    if (!resolvedUri && target) {
      const candidate = this.messageTypeIndex.get(target);
      if (candidate && fs.existsSync(candidate.fsPath)) {
        resolvedUri = candidate;
      }
    }

    if (!resolvedUri) {
      const label = target || explicitPath || 'schema';
      vscode.window.showWarningMessage(`Schema for '${label}' not found in workspace.`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument(resolvedUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async decodeBinary(uri: vscode.Uri, messageType?: string): Promise<DecodeResult> {
    const config = vscode.workspace.getConfiguration('protobuf');
    const protocPath = config.get<string>('protoc.path') || 'protoc';
    const includes = config.get<string[]>('includes') || [];
    const cwd = path.dirname(uri.fsPath);

    let hexDump = '';
    try {
      const buffer = fs.readFileSync(uri.fsPath);
      hexDump = this.generateHexDump(buffer);
    } catch (e) {
      hexDump = `Error reading file for hex dump: ${e}`;
    }

    const runProtoc = (args: string[]): Promise<string> => {
      return new Promise((resolve, reject) => {
        this.outputChannel.appendLine(`Exec: ${protocPath} ${args.join(' ')}`);
        const proc = spawn(protocPath, args, { cwd });
        const fileStream = fs.createReadStream(uri.fsPath);
        fileStream.pipe(proc.stdin);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => (stdout += d.toString()));
        proc.stderr.on('data', d => (stderr += d.toString()));

        proc.on('close', code => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(stderr || `Exit code ${code}`));
          }
        });

        proc.on('error', err => reject(err));
      });
    };

    if (messageType && messageType.trim().length > 0) {
      const args = [];
      // Add import paths
      args.push(`-I.`);
      if (vscode.workspace.workspaceFolders) {
        args.push(`-I${vscode.workspace.workspaceFolders[0]!.uri.fsPath}`);
      }
      includes.forEach(inc => {
        const resolved = inc.replace('${workspaceFolder}', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
        if (resolved) {
          args.push(`-I${resolved}`);
        }
      });

      args.push(`--decode=${messageType}`);

      try {
        const protoFiles = fs.readdirSync(cwd).filter(f => f.endsWith('.proto'));
        if (protoFiles.length > 0) {
          args.push(...protoFiles);
        }
      } catch {
        /* ignore directory read errors */
      }

      try {
        const decoded = await runProtoc(args);
        return { rawDecode: decoded, hexDump, isNamed: true, decodedAs: messageType.trim() };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.outputChannel.appendLine(`Named decode failed: ${errorMsg}. Falling back to raw.`);

        try {
          const raw = await runProtoc(['--decode_raw']);
          return {
            rawDecode: raw,
            hexDump,
            isNamed: false,
            error: `Failed to decode as '${messageType}'. Reverted to Raw View.\nReason: ${errorMsg}`,
          };
        } catch (rawErr) {
          return { rawDecode: `Critical Error: ${rawErr}`, hexDump, isNamed: false };
        }
      }
    } else {
      try {
        const raw = await runProtoc(['--decode_raw']);
        return { rawDecode: raw, hexDump, isNamed: false };
      } catch (e) {
        return { rawDecode: `Error: ${e}`, hexDump, isNamed: false };
      }
    }
  }

  private generateHexDump(buffer: Buffer): string {
    let output = '';
    const width = 16;
    for (let i = 0; i < buffer.length; i += width) {
      output += i.toString(16).padStart(8, '0') + '  ';
      const slice = buffer.subarray(i, i + width);
      let hex = '';
      for (let j = 0; j < width; j++) {
        if (j < slice.length) {
          hex += slice[j]!.toString(16).padStart(2, '0') + ' ';
        } else {
          hex += '   ';
        }
        if (j === 7) {
          hex += ' ';
        }
      }
      output += hex + ' ';
      let ascii = '';
      for (const byte of slice) {
        ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
      }
      output += '|' + ascii + '|\n';
    }
    return output;
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    data: DecodeResult,
    filePath: string,
    messageTypes: string[],
    suggestedType?: string,
    schemaLookup: Record<string, string> = {}
  ): string {
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'logo.png'));

    const safeRawDecode = escapeHtml(data.rawDecode);
    const safeHexDump = escapeHtml(data.hexDump);
    const safeError = data.error ? escapeHtml(data.error) : '';
    const safeDecodedAs = data.decodedAs ? escapeHtml(data.decodedAs) : '';
    const safeSuggestedType = suggestedType ? escapeHtml(suggestedType) : '';
    const schemaAvailable = data.decodedAs ? schemaLookup[data.decodedAs] : undefined;
    const safeSchemaPath = schemaAvailable ? escapeHtml(schemaAvailable) : '';
    const schemaJson = JSON.stringify(schemaLookup).replace(/</g, '\\u003c');

    // Group message types: suggested first, then alphabetical
    const dataSuggestedTypes = data.suggestedTypes || [];
    const messageTypesJson = JSON.stringify(messageTypes).replace(/</g, '\\u003c');
    const suggestedTypesJson = JSON.stringify(dataSuggestedTypes).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Protobuf Binary Inspector</title>
            <style>
                :root {
                    --color-key: var(--vscode-variable-name, #9cdcfe);
                    --color-key-strong: var(--vscode-symbolIcon-fieldForeground, var(--color-key));
                    --color-string: var(--vscode-string-foreground, #ce9178);
                    --color-number: var(--vscode-number-foreground, #b5cea8);
                    --color-punctuation: var(--vscode-foreground);
                    --color-comment: var(--vscode-comment-foreground, #6a9955);
                    --color-offset: var(--vscode-textLink-foreground, #3794ff);
                    --color-index: var(--vscode-descriptionForeground);
                    --color-error-bg: var(--vscode-inputValidation-errorBackground, #5a1d1d);
                    --color-error-border: var(--vscode-inputValidation-errorBorder, #be1100);
                    --color-key-hover: var(--vscode-textLink-foreground, #4fc1ff);
                }
                body {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 0;
                    margin: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    user-select: text;
                    -webkit-font-smoothing: antialiased;
                }
                .header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    gap: 12px;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    flex-shrink: 0;
                    user-select: none;
                    flex-wrap: wrap;
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                    flex-wrap: wrap;
                }
                .header img {
                    width: 16px;
                    height: 16px;
                    opacity: 0.9;
                    flex-shrink: 0;
                }
                .input-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 1 1 480px;
                    min-width: 240px;
                    max-width: 640px;
                }
                .input-group input {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 4px 8px;
                    border-radius: 2px;
                    font-size: 0.85rem;
                    flex: 1;
                    min-width: 150px;
                    width: 100%;
                    height: 32px;
                }
                .input-group button {
                    gap: 6px;
                    height: 32px;
                }
                .input-group button svg {
                    margin-right: 0;
                }
                .input-group input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .type-search {
                    position: relative;
                    flex: 1;
                    min-width: 150px;
                }
                .suggestions {
                    position: absolute;
                    top: calc(100% + 4px);
                    left: 0;
                    right: 0;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
                    border-radius: 4px;
                    max-height: 240px;
                    overflow-y: auto;
                    z-index: 20;
                    display: none;
                }
                .suggestions.visible { display: block; }
                .suggestion-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 0.85rem;
                }
                .suggestion-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .suggestion-pill {
                    font-size: 0.7rem;
                    padding: 1px 6px;
                    border-radius: 999px;
                    border: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-editor-lineHighlightBackground);
                    color: var(--vscode-descriptionForeground);
                }
                .suggestion-empty {
                    padding: 8px 10px;
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.85rem;
                }
                .view-selector {
                    display: flex;
                    background-color: var(--vscode-input-background);
                    border-radius: 4px;
                    padding: 2px;
                    border: 1px solid var(--vscode-input-border);
                    align-items: center;
                    height: 32px;
                }
                .view-option {
                    padding: 2px 10px;
                    font-size: 0.75rem;
                    cursor: pointer;
                    border-radius: 3px;
                    color: var(--vscode-descriptionForeground);
                    user-select: none;
                    display: flex;
                    align-items: center;
                }
                .view-option.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .view-option:hover:not(.active) {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                .view-option.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    pointer-events: none;
                }
                .toolbar {
                    display: flex;
                    gap: 8px;
                    flex-shrink: 0;
                    align-items: center;
                }
                .toolbar button {
                    height: 32px;
                }
                button {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    font-family: var(--vscode-font-family);
                    font-size: 0.8rem;
                }
                button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                button.icon-only {
                    background: none;
                    color: var(--vscode-icon-foreground);
                    padding: 4px;
                }
                button.icon-only:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                button svg {
                    width: 14px;
                    height: 14px;
                    margin-right: 4px;
                    fill: currentColor;
                }
                .content-area {
                    flex: 1;
                    overflow: auto;
                    padding: 16px;
                    position: relative;
                    cursor: text;
                }
                pre {
                    margin: 0;
                }
                code {
                    display: block;
                }
                .view-container {
                    display: none;
                }
                .view-container.active {
                    display: block;
                }
                .tree-line {
                    padding: 0 4px;
                    border-radius: 2px;
                    white-space: pre;
                    font-family: var(--vscode-editor-font-family);
                }
                .tree-line:hover {
                    background-color: var(--vscode-editor-lineHighlightBackground);
                }
                .info-banner {
                    display: none;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    background-color: var(--vscode-editorInfo-background, #04395e);
                    border: 1px solid var(--vscode-editorInfo-border, #0e639c);
                    color: var(--vscode-editorInfo-foreground, var(--vscode-foreground));
                    padding: 6px 10px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                }
                .info-banner.visible { display: flex; }
                .inline-link {
                    background: none;
                    border: none;
                    color: var(--vscode-textLink-foreground, #3794ff);
                    cursor: pointer;
                    padding: 0;
                    font-size: 0.85rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .inline-link svg {
                    width: 14px;
                    height: 14px;
                    fill: currentColor;
                }
                .inline-link:disabled {
                    color: var(--vscode-descriptionForeground);
                    cursor: default;
                }
                .inline-link.hidden { display: none; }

                .syntax-key { color: var(--color-key-strong); font-weight: 600; }
                .syntax-key.schema-hint { text-decoration: underline dotted; cursor: help; text-decoration-thickness: 1px; text-underline-offset: 2px; }
                .syntax-key.schema-hint:hover { color: var(--color-key-hover); }
                .syntax-string { color: var(--color-string); }
                .syntax-number { color: var(--color-number); }
                .syntax-punct { color: var(--color-punctuation); }
                .array-index { color: var(--color-index); font-size: 0.9em; margin-right: 2px; }
                .hex-offset { color: var(--color-offset); }
                .hex-ascii { color: var(--color-string); }
                .type-hint {
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                    padding: 0 4px;
                    margin-left: 6px;
                    border-radius: 3px;
                    border: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-editor-lineHighlightBackground);
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .error-banner {
                    background-color: var(--color-error-bg);
                    border: 1px solid var(--color-error-border);
                    color: var(--vscode-foreground);
                    padding: 8px 12px;
                    margin-bottom: 10px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    display: none;
                    white-space: pre-wrap;
                }
                .error-banner.visible {
                    display: block;
                }

                ::-webkit-scrollbar { width: 10px; height: 10px; }
                ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
                ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
                ::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-left">
                    <img src="${logoUri}" alt="Logo" title="${escapeHtml(filePath)}">
                    <div class="input-group">
                        <div class="type-search">
                            <input type="text" id="typeInput" placeholder="Message Type (e.g. package.Msg)" title="Enter Protobuf Message Type to Decode" value="${safeSuggestedType}" autocomplete="off" aria-autocomplete="list" aria-haspopup="listbox">
                            <div id="typeSuggestions" class="suggestions" role="listbox"></div>
                        </div>
                        <button id="refreshTypesBtn" title="Rescan workspace for message types">
                            <svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1-4.358 2.188.5.5 0 1 1 .776.63A4.5 4.5 0 1 0 8 3.5V1.75a.25.25 0 0 1 .41-.192l2.1 1.75a.25.25 0 0 1 0 .384l-2.1 1.75A.25.25 0 0 1 8 5.25V2.5Z"/></svg>
                            Refresh types
                        </button>
                        <button id="decodeBtn" title="Decode with selected schema type">Decode</button>
                    </div>
                    <div class="view-selector">
                        <div class="view-option active" data-view="tree">Tree</div>
                        <div class="view-option ${data.isNamed ? '' : 'disabled'}" data-view="json" title="${data.isNamed ? 'View as JSON' : 'Requires schema decode for proper JSON'}">JSON</div>
                        <div class="view-option" data-view="hex">Hex</div>
                    </div>
                </div>
                <div class="toolbar">
                    <button id="copyBtn" class="icon-only" title="Copy to Clipboard">
                        <svg viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"/><path d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>
                        Copy
                    </button>
                </div>
            </div>

            <div class="content-area">
                <div id="infoBanner" class="info-banner ${data.isNamed && safeDecodedAs ? 'visible' : ''}">
                    <span>Decoded as: <strong id="decodedAsLabel">${safeDecodedAs}</strong></span>
                    <button id="openSchemaLink" class="inline-link ${schemaAvailable ? '' : 'hidden'}" data-type="${safeDecodedAs}" ${schemaAvailable ? '' : 'disabled'} title="${schemaAvailable ? `Open schema file (${safeSchemaPath})` : 'Schema file not found'}">
                        <svg viewBox="0 0 16 16"><path d="M10.5 2a.5.5 0 0 1 .5.5V6a.5.5 0 0 1-1 0V3.707L4.854 8.354a.5.5 0 0 1-.708-.708L9.293 3H6.5a.5.5 0 0 1 0-1h4z"/><path d="M13 10.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2.5a.5.5 0 0 1 0 1H4v9h8v-2.5a.5.5 0 0 1 1 0z"/></svg>
                        Open schema
                    </button>
                </div>
                <div id="errorBanner" class="error-banner ${data.error ? 'visible' : ''}">${safeError}</div>

                <div id="treeView" class="view-container active">
                    <pre><code id="treeOutput">${safeRawDecode}</code></pre>
                </div>
                <div id="jsonView" class="view-container">
                    <pre><code id="jsonOutput">${safeRawDecode}</code></pre>
                </div>
                <div id="hexView" class="view-container">
                    <pre><code id="hexOutput">${safeHexDump}</code></pre>
                </div>
            </div>

            <div id="rawDecode" style="display:none;">${safeRawDecode}</div>
            <div id="rawHex" style="display:none;">${safeHexDump}</div>
            <script type="application/json" id="schema-data">${schemaJson}</script>

            <script>
                (function () {
                    const allMessageTypes = ${messageTypesJson};
                    let suggestedTypeOrder = ${suggestedTypesJson};

                    const vscode = acquireVsCodeApi();
                    const errorBanner = document.getElementById('errorBanner');
                    const infoBanner = document.getElementById('infoBanner');
                    const decodedAsLabel = document.getElementById('decodedAsLabel');
                    const typeInput = document.getElementById('typeInput');
                    const decodeBtn = document.getElementById('decodeBtn');
                    const autoDetectBtn = document.getElementById('autoDetectBtn');
                    const refreshTypesBtn = document.getElementById('refreshTypesBtn');
                    const openSchemaLink = document.getElementById('openSchemaLink');
                    const typeSuggestions = document.getElementById('typeSuggestions');
                    const typeSearch = document.querySelector('.type-search');
                    const outputEl = document.getElementById('treeOutput');
                    const jsonEl = document.getElementById('jsonOutput');
                    const hexEl = document.getElementById('hexOutput');
                    const rawDecodeEl = document.getElementById('rawDecode');
                    const rawHexEl = document.getElementById('rawHex');

                    const showFatal = (err) => {
                        if (!errorBanner) return;
                        const msg = err instanceof Error ? err.message : String(err);
                        errorBanner.textContent = 'Render error: ' + msg;
                        errorBanner.classList.add('visible');
                        console.error(err);
                    };

                    window.addEventListener('error', (event) => showFatal(event.error || event.message));
                    window.addEventListener('unhandledrejection', (event) => showFatal(event.reason));

                    if (!outputEl || !jsonEl || !hexEl || !rawDecodeEl || !rawHexEl || !typeInput || !decodeBtn || !refreshTypesBtn || !infoBanner || !decodedAsLabel) {
                        showFatal('Missing required DOM elements.');
                        return;
                    }

                    const schemaData = document.getElementById('schema-data');
                    let schemaMap = {};
                    if (schemaData) {
                        try { schemaMap = JSON.parse(schemaData.textContent || '{}'); }
                        catch (e) { console.error('Failed to parse schema map', e); }
                    }
                    let messageTypes = Array.isArray(allMessageTypes) ? allMessageTypes : [];

                    const escapeHtml = (unsafe = '') => unsafe
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");

                    const describeRawValue = (rawValue = '') => {
                        const trimmed = rawValue.trim();
                        if (/^".*"$/.test(trimmed)) return { className: 'syntax-string', label: 'string', display: trimmed };
                        if (/^(true|false)$/i.test(trimmed)) return { className: 'syntax-key', label: 'bool', display: trimmed.toLowerCase() };
                        if (/^0x[0-9a-f]+$/i.test(trimmed)) return { className: 'syntax-number', label: 'bytes', display: trimmed };
                        const num = Number(trimmed);
                        if (!Number.isNaN(num)) return { className: 'syntax-number', label: Number.isInteger(num) ? 'int' : 'float', display: trimmed };
                        return { className: 'syntax-comment', label: 'value', display: trimmed };
                    };

                    const indentToHtml = (indent = '') => indent
                        .replace(/\t/g, '    ')
                        .replace(/ /g, '&nbsp;');

                    function highlightTree(text, keyHoverText = '') {
                        const lines = text.split('\\n');
                        let html = '';
                        const scopeStack = [{}];
                        const keyClass = keyHoverText ? 'syntax-key schema-hint' : 'syntax-key';
                        const keyTitle = keyHoverText ? ' title="' + escapeHtml(keyHoverText) + '"' : '';

                        for (const line of lines) {
                            if (!line.trim()) continue;

                            const blockEnd = /^\s*\}\s*$/.test(line);
                            const lineIndent = (line.match(/^(\s*)/) || [])[1] || '';
                            if (blockEnd) {
                                if (scopeStack.length > 1) scopeStack.pop();
                                html += '<div class="tree-line">' + indentToHtml(lineIndent) + '<span class="syntax-punct">}</span></div>';
                                continue;
                            }

                            const valueMatch = line.match(/^(\s*)([\w\d_]+):\s*(.*)$/);
                            if (valueMatch) {
                                const leading = valueMatch[1];
                                const rawKey = valueMatch[2];
                                const rawValue = valueMatch[3];
                                const scope = scopeStack[scopeStack.length - 1];
                                const currentIndex = scope[rawKey] || 0;
                                scope[rawKey] = currentIndex + 1;
                                const indexHtml = currentIndex > 0 ? '<span class="array-index">[' + currentIndex + ']</span>' : '';
                                const descriptor = describeRawValue(rawValue);
                                const typeHint = '<span class="type-hint" title="Detected type">' + descriptor.label + '</span>';
                                const keyHtml = '<span class="' + keyClass + '"' + keyTitle + '>' + escapeHtml(rawKey) + '</span>' + indexHtml;
                                const valueHtml = '<span class="' + descriptor.className + '">' + escapeHtml(descriptor.display) + '</span>';
                                html += '<div class="tree-line">' + indentToHtml(leading) + keyHtml + ': ' + typeHint + ' ' + valueHtml + '</div>';
                                continue;
                            }

                            const blockStart = line.match(/^(\s*)([\w\d_]+)\s*\{\s*$/);
                            if (blockStart) {
                                const leading = blockStart[1];
                                const rawKey = blockStart[2];
                                const scope = scopeStack[scopeStack.length - 1];
                                const currentIndex = scope[rawKey] || 0;
                                scope[rawKey] = currentIndex + 1;
                                const indexHtml = currentIndex > 0 ? '<span class="array-index">[' + currentIndex + ']</span>' : '';
                                const keyHtml = '<span class="' + keyClass + '"' + keyTitle + '>' + escapeHtml(rawKey) + '</span>' + indexHtml;
                                html += '<div class="tree-line">' + indentToHtml(leading) + keyHtml + ' <span class="type-hint">message</span> <span class="syntax-punct">{</span></div>';
                                scopeStack.push({});
                                continue;
                            }

                            html += '<div class="tree-line">' + indentToHtml(lineIndent) + escapeHtml(line.trimEnd()) + '</div>';
                        }
                        return html;
                    }

                    function highlightHex(text) {
                         const lines = text.split('\\n');
                         let html = '';
                         for (const line of lines) {
                             if (line.trim() === '') continue;
                             const parts = line.match(/^([0-9a-fA-F]{8})(.+)(\|.*\|)$/);
                             if (parts) {
                                 const offset = parts[1];
                                 const hex = escapeHtml(parts[2]);
                                 const ascii = parts[3];
                                 const processed = '<span class="hex-offset">' + offset + '</span>' +
                                         hex +
                                         '<span class="hex-ascii">' + escapeHtml(ascii) + '</span>';
                                 html += '<div class="tree-line">' + processed + '</div>';
                             } else {
                                 html += '<div class="tree-line">' + escapeHtml(line) + '</div>';
                             }
                         }
                         return html;
                    }

                    function coerceValue(valueStr) {
                        const trimmed = valueStr.trim();
                        if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
                        if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
                        if (/^0x[0-9a-f]+$/i.test(trimmed)) return trimmed;
                        const num = Number(trimmed);
                        if (!Number.isNaN(num)) return num;
                        return trimmed;
                    }

                    function parseRawToJson(text) {
                        const lines = text.split('\\n');
                        const root = {};
                        const stack = [root];

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            if (trimmed === '}' && stack.length > 1) { stack.pop(); continue; }

                            let match = trimmed.match(/^([\w\d_]+):\s*(.*)$/);
                            if (match) {
                                const key = match[1];
                                const valueStr = match[2];
                                const value = coerceValue(valueStr);
                                const current = stack[stack.length - 1];
                                if (current[key] === undefined) current[key] = value;
                                else {
                                    if (!Array.isArray(current[key])) current[key] = [current[key]];
                                    current[key].push(value);
                                }
                                continue;
                            }

                            match = trimmed.match(/^([\w\d_]+)\s*\{$/);
                            if (match) {
                                const key = match[1];
                                const newObj = {};
                                const current = stack[stack.length - 1];
                                if (current[key] === undefined) current[key] = newObj;
                                else {
                                    if (!Array.isArray(current[key])) current[key] = [current[key]];
                                    current[key].push(newObj);
                                }
                                stack.push(newObj);
                            }
                        }
                        return root;
                    }

                    function describePrimitive(value) {
                        if (typeof value === 'string') return { className: 'syntax-string', label: 'string', display: '"' + value + '"' };
                        if (typeof value === 'number') return { className: 'syntax-number', label: Number.isInteger(value) ? 'int' : 'float', display: String(value) };
                        if (typeof value === 'boolean') return { className: 'syntax-key', label: 'bool', display: value ? 'true' : 'false' };
                        if (value === null) return { className: 'syntax-comment', label: 'null', display: 'null' };
                        return { className: 'syntax-comment', label: typeof value, display: String(value) };
                    }

                    function renderJsonNode(value, indent, keyLabel, keyHoverText = '') {
                        const pad = '&nbsp;'.repeat(indent || 0);
                        const keyClass = keyHoverText ? 'syntax-key schema-hint' : 'syntax-key';
                        const keyTitle = keyHoverText ? ' title="' + escapeHtml(keyHoverText) + '"' : '';
                        const keyHtml = keyLabel ? '<span class="' + keyClass + '"' + keyTitle + '>' + escapeHtml(keyLabel) + '</span>: ' : '';

                        if (Array.isArray(value)) {
                            const lines = [pad + keyHtml + '<span class="syntax-punct">[</span>'];
                            value.forEach((entry, idx) => {
                                const rendered = renderJsonNode(entry, (indent || 0) + 2, undefined, keyHoverText);
                                lines.push(rendered + (idx < value.length - 1 ? '<span class="syntax-punct">,</span>' : ''));
                            });
                            lines.push(pad + '<span class="syntax-punct">]</span>');
                            return lines.join('\n');
                        }

                        if (value && typeof value === 'object' && !Array.isArray(value)) {
                            const lines = [pad + keyHtml + '<span class="syntax-punct">{</span>'];
                            const entries = Object.entries(value);
                            entries.forEach(([k, v], idx) => {
                                const rendered = renderJsonNode(v, (indent || 0) + 2, k, keyHoverText);
                                lines.push(rendered + (idx < entries.length - 1 ? '<span class="syntax-punct">,</span>' : ''));
                            });
                            lines.push(pad + '<span class="syntax-punct">}</span>');
                            return lines.join('\n');
                        }

                        const primitive = describePrimitive(value);
                        const typeHint = '<span class="type-hint" title="Detected type">' + primitive.label + '</span>';
                        const valueHtml = '<span class="' + primitive.className + '">' + escapeHtml(primitive.display) + '</span>';
                        return pad + keyHtml + typeHint + ' ' + valueHtml;
                    }

                    let currentContent = rawDecodeEl.textContent || '';
                    let currentHex = rawHexEl.textContent || '';
                    let lastJsonString = '';
                    let activeSchemaType = '';
                    let hoverSchemaType = '${safeDecodedAs}';
                    let hoverSchemaPath = '${safeSchemaPath}';
                    let lastIsNamed = ${data.isNamed};

                    const getKeyHoverText = () => {
                        if (!lastIsNamed || !hoverSchemaType) return '';
                        const suffix = hoverSchemaPath ? ' (' + hoverSchemaPath + ')' : '';
                        return 'Schema: ' + hoverSchemaType + suffix;
                    };

                    function render() {
                        try {
                            const keyHoverText = getKeyHoverText();
                            outputEl.innerHTML = highlightTree(currentContent, keyHoverText);
                            try {
                                const parsedJson = parseRawToJson(currentContent);
                                lastJsonString = JSON.stringify(parsedJson, null, 2);
                                jsonEl.innerHTML = renderJsonNode(parsedJson, 0, undefined, keyHoverText);
                            } catch (e) {
                                lastJsonString = '';
                                jsonEl.innerHTML = '<span class="syntax-string">Error parsing JSON: ' + escapeHtml(String(e)) + '</span>';
                            }
                            hexEl.innerHTML = highlightHex(currentHex);
                        } catch (err) {
                            showFatal(err);
                        }
                    }

                    function updateInfoBanner(decodedAs, schemaPath, isNamedDecode) {
                        const shouldShow = isNamedDecode && !!decodedAs;
                        if (shouldShow) {
                            decodedAsLabel.textContent = decodedAs;
                            infoBanner.classList.add('visible');
                            activeSchemaType = decodedAs;
                        } else {
                            activeSchemaType = '';
                            infoBanner.classList.remove('visible');
                        }

                        if (openSchemaLink) {
                            const hasSchema = shouldShow && !!schemaPath;
                            openSchemaLink.dataset.path = hasSchema ? schemaPath : '';
                            if (hasSchema) {
                                openSchemaLink.classList.remove('hidden');
                                openSchemaLink.disabled = false;
                                openSchemaLink.dataset.type = decodedAs;
                                openSchemaLink.title = 'Open schema: ' + schemaPath;
                            } else {
                                openSchemaLink.classList.add('hidden');
                                openSchemaLink.disabled = true;
                                openSchemaLink.dataset.type = '';
                                openSchemaLink.title = 'Schema file not found';
                            }
                        }
                    }

                    function updateSchemaContext(decodedAs, schemaPath, isNamedDecode) {
                        lastIsNamed = !!isNamedDecode;
                        const resolvedPath = decodedAs ? (schemaPath || schemaMap[decodedAs]) : '';
                        if (lastIsNamed && decodedAs) {
                            hoverSchemaType = decodedAs;
                            hoverSchemaPath = resolvedPath;
                        } else if (!lastIsNamed) {
                            hoverSchemaType = '';
                            hoverSchemaPath = '';
                        }
                        updateInfoBanner(decodedAs, resolvedPath, lastIsNamed);
                    }

                    function triggerDecode() {
                        vscode.postMessage({
                            command: 'decode',
                            messageType: typeInput.value
                        });
                        outputEl.innerHTML = '<span class="syntax-comment">Decoding...</span>';
                        errorBanner && errorBanner.classList.remove('visible');
                        infoBanner.classList.remove('visible');
                    }

                    function triggerAutoDetect() {
                        vscode.postMessage({ command: 'autoDetect' });
                        outputEl.innerHTML = '<span class="syntax-comment">Auto-detecting message type...</span>';
                        errorBanner && errorBanner.classList.remove('visible');
                        infoBanner.classList.remove('visible');
                    }

                    function triggerRefreshTypes() {
                        vscode.postMessage({ command: 'refreshTypes' });
                        refreshTypesBtn.disabled = true;
                        refreshTypesBtn.title = 'Refreshing...';
                        setTimeout(() => {
                            refreshTypesBtn.disabled = false;
                            refreshTypesBtn.title = 'Refresh message types from workspace';
                        }, 1000);
                    }

                    function requestOpenSchema() {
                        const target = (openSchemaLink && openSchemaLink.dataset.type) || activeSchemaType || hoverSchemaType;
                        const schemaPath = (openSchemaLink && openSchemaLink.dataset.path) || (target ? schemaMap[target] : '');
                        if (!target && !schemaPath) return;
                        vscode.postMessage({ command: 'openSchema', messageType: target, schemaPath });
                    }

                    function getOrderedTypes() {
                        const seen = new Set();
                        const ordered = [];
                        (suggestedTypeOrder || []).forEach(t => {
                            if (messageTypes.includes(t) && !seen.has(t)) {
                                ordered.push(t);
                                seen.add(t);
                            }
                        });
                        messageTypes.forEach(t => {
                            if (!seen.has(t)) ordered.push(t);
                        });
                        return ordered;
                    }

                    function renderSuggestions() {
                        if (!typeSuggestions || !typeInput) return;
                        const query = (typeInput.value || '').trim().toLowerCase();
                        const items = getOrderedTypes().filter(t => !query || t.toLowerCase().includes(query));

                        if (items.length === 0) {
                            typeSuggestions.innerHTML = '<div class="suggestion-empty">No matches</div>';
                        } else {
                            typeSuggestions.innerHTML = items.map(t => {
                                const pill = (suggestedTypeOrder || []).includes(t)
                                    ? '<span class="suggestion-pill">Suggested</span>'
                                    : '';
                                return '<div class="suggestion-item" data-value="' + escapeHtml(t) + '">' + pill + '<span class="suggestion-label">' + escapeHtml(t) + '</span></div>';
                            }).join('');
                        }

                        typeSuggestions.classList.add('visible');
                    }

                    function hideSuggestions() {
                        typeSuggestions?.classList.remove('visible');
                    }

                    typeInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            hideSuggestions();
                            triggerDecode();
                        } else if (e.key === 'Escape') {
                            hideSuggestions();
                        }
                    });
                    typeInput.addEventListener('input', () => {
                        renderSuggestions();
                    });
                    typeInput.addEventListener('focus', () => renderSuggestions());

                    decodeBtn.addEventListener('click', triggerDecode);
                    if (autoDetectBtn) {
                        autoDetectBtn.addEventListener('click', triggerAutoDetect);
                    }
                    refreshTypesBtn.addEventListener('click', triggerRefreshTypes);
                    if (openSchemaLink) {
                        openSchemaLink.addEventListener('click', requestOpenSchema);
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateContent':
                                currentContent = message.data.rawDecode;
                                currentHex = message.data.hexDump || currentHex;
                                if (message.schemaMap) {
                                    schemaMap = message.schemaMap;
                                }
                                if (message.data.suggestedTypes) {
                                    suggestedTypeOrder = message.data.suggestedTypes;
                                }

                                updateSchemaContext(message.data.decodedAs, message.schemaPath, message.data.isNamed);

                                if (message.data.decodedAs && !typeInput.value) {
                                    typeInput.value = message.data.decodedAs;
                                }

                                const jsonTab = document.querySelector('.view-option[data-view="json"]');
                                if (jsonTab) {
                                    if (message.data.isNamed) {
                                        jsonTab.classList.remove('disabled');
                                        jsonTab.title = 'View as JSON';
                                    } else {
                                        jsonTab.classList.add('disabled');
                                        jsonTab.title = 'Requires schema decode for proper JSON';
                                        if (document.getElementById('jsonView')?.classList.contains('active')) {
                                            document.querySelector('.view-option[data-view="tree"]')?.dispatchEvent(new Event('click'));
                                        }
                                    }
                                }

                                if (message.data.error && errorBanner) {
                                    errorBanner.textContent = message.data.error;
                                    errorBanner.classList.add('visible');
                                } else {
                                    errorBanner && errorBanner.classList.remove('visible');
                                }

                                if (document.activeElement === typeInput) {
                                    renderSuggestions();
                                } else {
                                    hideSuggestions();
                                }
                                render();
                                break;
                            case 'updateTypes':
                                messageTypes = Array.isArray(message.types) ? message.types : messageTypes;
                                if (message.schemaMap) {
                                    schemaMap = message.schemaMap;
                                }
                                if (lastIsNamed) {
                                    const schemaPath = hoverSchemaType ? schemaMap[hoverSchemaType] : '';
                                    updateSchemaContext(hoverSchemaType, schemaPath, true);
                                }
                                if (document.activeElement === typeInput) {
                                    renderSuggestions();
                                } else {
                                    hideSuggestions();
                                }
                                break;
                            case 'error':
                                if (errorBanner) {
                                    errorBanner.textContent = message.message;
                                    errorBanner.classList.add('visible');
                                }
                                outputEl.innerHTML = '';
                                break;
                        }
                    });

                    const views = {
                        tree: document.getElementById('treeView'),
                        json: document.getElementById('jsonView'),
                        hex: document.getElementById('hexView')
                    };
                    let currentView = 'tree';

                    document.querySelectorAll('.view-option').forEach(opt => {
                        opt.addEventListener('click', () => {
                            if (opt.classList.contains('disabled')) return;
                            const view = opt.getAttribute('data-view');
                            if (!view || view === currentView) return;

                            document.querySelectorAll('.view-option').forEach(el => el.classList.remove('active'));
                            opt.classList.add('active');

                            Object.values(views).forEach(el => el && el.classList.remove('active'));
                            views[view]?.classList.add('active');

                            currentView = view;
                        });
                    });

                    if (typeSuggestions) {
                        typeSuggestions.addEventListener('mousedown', (event) => event.preventDefault());
                        typeSuggestions.addEventListener('click', (event) => {
                            const target = event.target instanceof HTMLElement
                                ? event.target.closest('.suggestion-item')
                                : null;
                            if (!target) return;
                            const value = target.dataset.value || target.textContent || '';
                            typeInput.value = value;
                            hideSuggestions();
                            typeInput.focus();
                        });
                    }

                    document.addEventListener('click', (event) => {
                        if (!typeSearch || !typeSuggestions) return;
                        const target = event.target;
                        if (!(target instanceof Node)) return;
                        const isInside = typeSearch.contains(target) || typeSuggestions.contains(target);
                        if (!isInside) {
                            hideSuggestions();
                        }
                    });

                    const copyBtn = document.getElementById('copyBtn');
                    if (copyBtn) {
                        copyBtn.addEventListener('click', () => {
                            let content;
                            if (currentView === 'tree') content = currentContent;
                            else if (currentView === 'json') {
                                content = lastJsonString || JSON.stringify(parseRawToJson(currentContent), null, 2);
                            } else content = currentHex;

                            navigator.clipboard.writeText(content).then(() => {
                                const originalHtml = copyBtn.innerHTML;
                                copyBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> Copied!';
                                setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 2000);
                            });
                        });
                    }

                    render();
                    updateSchemaContext(typeInput.value || '${safeDecodedAs}', '${safeSchemaPath}', ${data.isNamed});
                })();
            </script>
        </body>
        </html>`;
  }

  private getDisabledHtml(webview: vscode.Webview, filePath: string): string {
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'logo.png'));
    const safePath = escapeHtml(filePath);
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Protobuf Binary Inspector</title>
            <style>
                body {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 32px 24px;
                }
                .card {
                    max-width: 720px;
                    margin: 0 auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 24px;
                    background: var(--vscode-editor-background);
                }
                .title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin-bottom: 12px;
                }
                .title img {
                    width: 18px;
                    height: 18px;
                    opacity: 0.9;
                }
                .file-path {
                    font-family: var(--vscode-editor-font-family);
                    color: var(--vscode-descriptionForeground);
                    margin: 8px 0 16px;
                    word-break: break-all;
                }
                code {
                    font-family: var(--vscode-editor-font-family);
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    padding: 6px 12px;
                    border-radius: 2px;
                    font-size: 0.9rem;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .hint {
                    margin-top: 12px;
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.9rem;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="title">
                    <img src="${logoUri}" alt="Protobuf">
                    <span>Binary Inspector is disabled</span>
                </div>
                <div class="file-path">${safePath}</div>
                <div>
                    Enable <code>protobuf.binaryInspector.enabled</code> to use the Protobuf Binary Inspector.
                </div>
                <div class="hint">After enabling, reopen this file with "Reopen With" → "Protobuf Binary Inspector".</div>
                <div style="margin-top: 16px;">
                    <button id="openSettings">Open Settings</button>
                </div>
            </div>
            <script>
                (function () {
                    const vscode = acquireVsCodeApi();
                    const openSettings = document.getElementById('openSettings');
                    if (openSettings) {
                        openSettings.addEventListener('click', () => {
                            vscode.postMessage({ command: 'openSettings' });
                        });
                    }
                })();
            </script>
        </body>
        </html>`;
  }

  private isInspectorEnabled(): boolean {
    return vscode.workspace.getConfiguration('protobuf').get<boolean>('binaryInspector.enabled', false);
  }
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
