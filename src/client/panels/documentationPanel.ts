/**
 * Webview panel for live documentation preview of proto files
 * Renders markdown-style HTML documentation in real-time
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type {
  DocumentationData,
  DocumentationElement,
  DocumentationField,
  DocumentationEnumValue,
  DocumentationRpc,
} from '../../shared/documentation';

/**
 * Documentation panel that provides live HTML preview of proto file documentation
 */
export class DocumentationPanel {
  private static currentPanel: DocumentationPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly client: LanguageClient;
  private currentUri?: string;
  private disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private lastDocumentationData?: DocumentationData;

  static createOrShow(extensionUri: vscode.Uri, client: LanguageClient, uri?: string): void {
    if (DocumentationPanel.currentPanel) {
      DocumentationPanel.currentPanel.reveal(uri);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'protobufDocumentation',
      'Proto Documentation',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DocumentationPanel.currentPanel = new DocumentationPanel(panel, extensionUri, client, uri);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    client: LanguageClient,
    uri: string | undefined
  ) {
    this.panel = panel;
    this.client = client;
    this.currentUri = uri;

    this.panel.onDidDispose(() => {
      this.isDisposed = true;
      DocumentationPanel.currentPanel = undefined;
      this.dispose();
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async message => {
      if (this.isDisposed) {
        return;
      }
      if (message?.type === 'refresh') {
        await this.loadDocumentation();
      } else if (message?.type === 'navigate') {
        await this.handleNavigate(message.symbol);
      } else if (message?.type === 'exportPdf') {
        await this.exportToPdf();
      }
    });

    // Listen for editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (this.isDisposed) {
          return;
        }
        if (editor && editor.document.languageId === 'proto') {
          this.currentUri = editor.document.uri.toString();
          void this.loadDocumentation();
        }
      })
    );

    // Listen for document changes (live update)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isDisposed) {
          return;
        }
        if (event.document.languageId === 'proto' && event.document.uri.toString() === this.currentUri) {
          void this.loadDocumentation();
        }
      })
    );

    // Initial load
    void this.loadDocumentation();
  }

  private reveal(uri: string | undefined): void {
    this.panel.reveal();
    if (uri) {
      this.currentUri = uri;
      void this.loadDocumentation();
    }
  }

  private async loadDocumentation(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (!this.currentUri) {
      // Try to get from active editor
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'proto') {
        this.currentUri = editor.document.uri.toString();
      } else {
        if (!this.isDisposed) {
          this.panel.webview.html = this.renderNoFile();
        }
        return;
      }
    }

    try {
      const data = await this.client.sendRequest<DocumentationData | null>('protobuf/getDocumentation', {
        uri: this.currentUri,
      });

      // Check again after async operation
      if (this.isDisposed) {
        return;
      }

      if (data) {
        this.lastDocumentationData = data;
        this.panel.title = `Docs: ${data.fileName}`;
        this.panel.webview.html = this.renderHtml(data);
      } else {
        this.panel.webview.html = this.renderNoFile();
      }
    } catch (error) {
      // Don't show error if panel was disposed during the request
      if (this.isDisposed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to load documentation: ${message}`);
    }
  }

  private async handleNavigate(symbol: string): Promise<void> {
    if (!this.currentUri) {
      return;
    }

    try {
      // Use the definition provider to navigate
      const uri = vscode.Uri.parse(this.currentUri);
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();

      // Find the symbol definition in the file
      const patterns = [
        new RegExp(`message\\s+${symbol}\\s*\\{`),
        new RegExp(`enum\\s+${symbol}\\s*\\{`),
        new RegExp(`service\\s+${symbol}\\s*\\{`),
        new RegExp(`rpc\\s+${symbol}\\s*\\(`),
      ];

      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
          const pos = doc.positionAt(match.index);
          const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          return;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to navigate: ${msg}`);
    }
  }

  private async exportToPdf(): Promise<void> {
    if (!this.lastDocumentationData) {
      void vscode.window.showWarningMessage('No documentation to export. Please open a proto file first.');
      return;
    }

    const data = this.lastDocumentationData;
    const defaultFileName = data.fileName.replace(/\.proto$/, '') + '-documentation.html';

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultFileName),
      filters: {
        'HTML Files': ['html'],
        'All Files': ['*'],
      },
      saveLabel: 'Export Documentation',
    });

    if (!saveUri) {
      return;
    }

    try {
      const htmlContent = this.renderExportHtml(data);
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf-8'));

      const openFile = await vscode.window.showInformationMessage(
        `Documentation exported to ${saveUri.fsPath}`,
        'Open File',
        'Open in Browser'
      );

      if (openFile === 'Open File') {
        const doc = await vscode.workspace.openTextDocument(saveUri);
        await vscode.window.showTextDocument(doc);
      } else if (openFile === 'Open in Browser') {
        await vscode.env.openExternal(saveUri);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to export documentation: ${msg}`);
    }
  }

  private dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private renderNoFile(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proto Documentation</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="empty-state">
    <h2>No Proto File Open</h2>
    <p>Open a <code>.proto</code> file to see its documentation.</p>
  </div>
</body>
</html>`;
  }

  private renderHtml(data: DocumentationData): string {
    const nonce = getNonce();
    const csp = ["default-src 'none'", `style-src 'unsafe-inline'`, `script-src 'nonce-${nonce}'`].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proto Documentation - ${data.fileName}</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>${this.escapeHtml(data.fileName)}</h1>
      <button class="export-btn" id="exportBtn" title="Export as HTML">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 1v10.793l3.146-3.147.708.708-4.354 4.353-4.354-4.353.708-.708L7.5 11.793V1h1z"/>
          <path d="M1 13h14v1H1v-1z"/>
        </svg>
        Export
      </button>
    </div>
    <div class="meta">
      ${data.syntax ? `<span class="badge syntax">syntax: ${data.syntax}</span>` : ''}
      ${data.edition ? `<span class="badge edition">edition: ${data.edition}</span>` : ''}
      ${data.package ? `<span class="badge package">package: ${data.package}</span>` : ''}
    </div>
  </header>

  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      ${data.messages.length > 0 ? `<li><a href="#messages">Messages (${data.messages.length})</a></li>` : ''}
      ${data.enums.length > 0 ? `<li><a href="#enums">Enums (${data.enums.length})</a></li>` : ''}
      ${data.services.length > 0 ? `<li><a href="#services">Services (${data.services.length})</a></li>` : ''}
      ${data.imports.length > 0 ? `<li><a href="#imports">Imports (${data.imports.length})</a></li>` : ''}
    </ul>
  </nav>

  <main>
    ${data.fileComments ? `<section class="file-comments"><p>${this.formatComment(data.fileComments)}</p></section>` : ''}

    ${data.messages.length > 0 ? this.renderMessagesSection(data.messages) : ''}
    ${data.enums.length > 0 ? this.renderEnumsSection(data.enums) : ''}
    ${data.services.length > 0 ? this.renderServicesSection(data.services) : ''}
    ${data.imports.length > 0 ? this.renderImportsSection(data.imports) : ''}
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.symbol-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const symbol = el.dataset.symbol;
        vscode.postMessage({ type: 'navigate', symbol });
      });
    });

    document.querySelectorAll('a[href^="#"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const id = el.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    document.getElementById('exportBtn')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportPdf' });
    });
  </script>
</body>
</html>`;
  }

  private renderMessagesSection(messages: DocumentationElement[]): string {
    return /* html */ `
    <section id="messages">
      <h2>Messages</h2>
      ${messages.map(msg => this.renderMessage(msg)).join('')}
    </section>`;
  }

  private renderMessage(msg: DocumentationElement, depth: number = 0): string {
    const deprecatedClass = msg.deprecated ? 'deprecated' : '';
    const indent = depth > 0 ? 'nested' : '';

    return /* html */ `
    <article class="definition message ${deprecatedClass} ${indent}" id="msg-${msg.fullName}">
      <h3>
        <a href="#" class="symbol-link" data-symbol="${this.escapeHtml(msg.name)}">
          ${msg.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
          <span class="keyword">message</span> ${this.escapeHtml(msg.name)}
        </a>
      </h3>
      ${msg.comments ? `<div class="doc-comment">${this.formatComment(msg.comments)}</div>` : ''}

      ${
        msg.fields && msg.fields.length > 0
          ? `
        <h4>Fields</h4>
        <table class="fields-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${msg.fields.map(f => this.renderFieldRow(f)).join('')}
          </tbody>
        </table>
      `
          : '<p class="no-fields">No fields</p>'
      }

      ${
        msg.nestedEnums && msg.nestedEnums.length > 0
          ? `
        <div class="nested-section">
          <h4>Nested Enums</h4>
          ${msg.nestedEnums.map(e => this.renderEnum(e, depth + 1)).join('')}
        </div>
      `
          : ''
      }

      ${
        msg.nestedMessages && msg.nestedMessages.length > 0
          ? `
        <div class="nested-section">
          <h4>Nested Messages</h4>
          ${msg.nestedMessages.map(m => this.renderMessage(m, depth + 1)).join('')}
        </div>
      `
          : ''
      }
    </article>`;
  }

  private renderFieldRow(field: DocumentationField): string {
    const deprecatedClass = field.deprecated ? 'deprecated' : '';
    const modifier = field.modifier ? `<span class="modifier">${field.modifier}</span> ` : '';
    const options =
      field.options && field.options.length > 0
        ? `<span class="field-options">[${field.options.join(', ')}]</span>`
        : '';

    return /* html */ `
    <tr class="${deprecatedClass}">
      <td class="field-number">${field.number}</td>
      <td class="field-name">
        ${field.deprecated ? '<span class="deprecated-badge small">DEP</span>' : ''}
        ${modifier}${this.escapeHtml(field.name)}
        ${options}
      </td>
      <td class="field-type"><code>${this.escapeHtml(field.type)}</code></td>
      <td class="field-desc">${field.comments ? this.formatComment(field.comments) : '<span class="no-doc">-</span>'}</td>
    </tr>`;
  }

  private renderEnumsSection(enums: DocumentationElement[]): string {
    return /* html */ `
    <section id="enums">
      <h2>Enums</h2>
      ${enums.map(e => this.renderEnum(e)).join('')}
    </section>`;
  }

  private renderEnum(enumDef: DocumentationElement, depth: number = 0): string {
    const deprecatedClass = enumDef.deprecated ? 'deprecated' : '';
    const indent = depth > 0 ? 'nested' : '';

    return /* html */ `
    <article class="definition enum ${deprecatedClass} ${indent}" id="enum-${enumDef.fullName}">
      <h3>
        <a href="#" class="symbol-link" data-symbol="${this.escapeHtml(enumDef.name)}">
          ${enumDef.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
          <span class="keyword">enum</span> ${this.escapeHtml(enumDef.name)}
        </a>
      </h3>
      ${enumDef.comments ? `<div class="doc-comment">${this.formatComment(enumDef.comments)}</div>` : ''}

      ${
        enumDef.values && enumDef.values.length > 0
          ? `
        <table class="enum-values-table">
          <thead>
            <tr>
              <th>Value</th>
              <th>Number</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${enumDef.values.map(v => this.renderEnumValueRow(v)).join('')}
          </tbody>
        </table>
      `
          : '<p class="no-values">No values</p>'
      }
    </article>`;
  }

  private renderEnumValueRow(value: DocumentationEnumValue): string {
    const deprecatedClass = value.deprecated ? 'deprecated' : '';

    return /* html */ `
    <tr class="${deprecatedClass}">
      <td class="enum-value-name">
        ${value.deprecated ? '<span class="deprecated-badge small">DEP</span>' : ''}
        ${this.escapeHtml(value.name)}
      </td>
      <td class="enum-value-number">${value.number}</td>
      <td class="enum-value-desc">${value.comments ? this.formatComment(value.comments) : '<span class="no-doc">-</span>'}</td>
    </tr>`;
  }

  private renderServicesSection(services: DocumentationElement[]): string {
    return /* html */ `
    <section id="services">
      <h2>Services</h2>
      ${services.map(s => this.renderService(s)).join('')}
    </section>`;
  }

  private renderService(service: DocumentationElement): string {
    const deprecatedClass = service.deprecated ? 'deprecated' : '';

    return /* html */ `
    <article class="definition service ${deprecatedClass}" id="svc-${service.fullName}">
      <h3>
        <a href="#" class="symbol-link" data-symbol="${this.escapeHtml(service.name)}">
          ${service.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
          <span class="keyword">service</span> ${this.escapeHtml(service.name)}
        </a>
      </h3>
      ${service.comments ? `<div class="doc-comment">${this.formatComment(service.comments)}</div>` : ''}

      ${
        service.rpcs && service.rpcs.length > 0
          ? `
        <h4>Methods</h4>
        <div class="rpc-list">
          ${service.rpcs.map(r => this.renderRpc(r)).join('')}
        </div>
      `
          : '<p class="no-rpcs">No methods</p>'
      }
    </article>`;
  }

  private renderRpc(rpc: DocumentationRpc): string {
    const deprecatedClass = rpc.deprecated ? 'deprecated' : '';
    const requestStream = rpc.requestStreaming ? '<span class="stream-badge">stream</span> ' : '';
    const responseStream = rpc.responseStreaming ? '<span class="stream-badge">stream</span> ' : '';

    return /* html */ `
    <div class="rpc ${deprecatedClass}">
      <div class="rpc-signature">
        ${rpc.deprecated ? '<span class="deprecated-badge small">DEP</span>' : ''}
        <span class="keyword">rpc</span>
        <span class="rpc-name">${this.escapeHtml(rpc.name)}</span>
        (${requestStream}<code>${this.escapeHtml(rpc.requestType)}</code>)
        <span class="returns">returns</span>
        (${responseStream}<code>${this.escapeHtml(rpc.responseType)}</code>)
      </div>
      ${rpc.comments ? `<div class="doc-comment">${this.formatComment(rpc.comments)}</div>` : ''}
    </div>`;
  }

  private renderImportsSection(imports: string[]): string {
    return /* html */ `
    <section id="imports">
      <h2>Imports</h2>
      <ul class="imports-list">
        ${imports.map(imp => `<li><code>${this.escapeHtml(imp)}</code></li>`).join('')}
      </ul>
    </section>`;
  }

  private formatComment(comment: string): string {
    // Basic markdown-like formatting
    let formatted = this.escapeHtml(comment);

    // Convert `code` to <code>
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert *italic* to <em>
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getStyles(): string {
    return /* css */ `
      :root {
        --bg-primary: #1e1e1e;
        --bg-secondary: #252526;
        --bg-tertiary: #2d2d30;
        --text-primary: #d4d4d4;
        --text-secondary: #858585;
        --text-muted: #6a6a6a;
        --accent: #569cd6;
        --accent-secondary: #4ec9b0;
        --keyword: #c586c0;
        --type: #4ec9b0;
        --string: #ce9178;
        --number: #b5cea8;
        --deprecated: #6a6a6a;
        --border: #3c3c3c;
        --link: #569cd6;
        --link-hover: #9cdcfe;
        --warning: #cca700;
        --badge-bg: #3c3c3c;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
        background: var(--bg-primary);
        padding: 20px;
      }

      header {
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border);
      }

      .header-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 8px;
      }

      header h1 {
        font-size: 1.8em;
        font-weight: 600;
        color: var(--text-primary);
        flex: 1;
        min-width: 0;
        overflow-wrap: break-word;
      }

      .export-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--accent);
        color: var(--bg-primary);
        border: none;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s;
      }

      .export-btn:hover {
        background: var(--link-hover);
      }

      .export-btn svg {
        flex-shrink: 0;
      }

      .meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        background: var(--badge-bg);
        color: var(--text-secondary);
      }

      .badge.syntax { color: var(--accent); }
      .badge.edition { color: var(--accent-secondary); }
      .badge.package { color: var(--string); }

      nav.toc {
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 24px;
      }

      nav.toc h2 {
        font-size: 1em;
        margin-bottom: 8px;
        color: var(--text-secondary);
      }

      nav.toc ul {
        list-style: none;
      }

      nav.toc li {
        margin: 4px 0;
      }

      nav.toc a {
        color: var(--link);
        text-decoration: none;
      }

      nav.toc a:hover {
        color: var(--link-hover);
        text-decoration: underline;
      }

      main section {
        margin-bottom: 32px;
      }

      section > h2 {
        font-size: 1.4em;
        font-weight: 600;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border);
        color: var(--accent);
      }

      article.definition {
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
      }

      article.definition.nested {
        background: var(--bg-tertiary);
        margin-left: 16px;
        border-left: 3px solid var(--border);
      }

      article.definition.deprecated {
        opacity: 0.7;
        border-left: 3px solid var(--warning);
      }

      article h3 {
        font-size: 1.2em;
        margin-bottom: 8px;
      }

      article h3 a {
        color: var(--text-primary);
        text-decoration: none;
      }

      article h3 a:hover {
        color: var(--link-hover);
      }

      article h4 {
        font-size: 1em;
        margin: 16px 0 8px;
        color: var(--text-secondary);
      }

      .keyword {
        color: var(--keyword);
        font-weight: 500;
      }

      .doc-comment {
        margin: 8px 0;
        padding: 8px 12px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        border-left: 3px solid var(--accent);
        color: var(--text-secondary);
      }

      .deprecated-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: var(--warning);
        color: var(--bg-primary);
        margin-right: 6px;
        vertical-align: middle;
      }

      .deprecated-badge.small {
        font-size: 9px;
        padding: 1px 4px;
      }

      .stream-badge {
        display: inline-block;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 10px;
        background: var(--accent);
        color: var(--bg-primary);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
        font-size: 13px;
        table-layout: fixed;
      }

      .fields-table th:nth-child(1),
      .fields-table td:nth-child(1) { width: 40px; }
      .fields-table th:nth-child(2),
      .fields-table td:nth-child(2) { width: 25%; }
      .fields-table th:nth-child(3),
      .fields-table td:nth-child(3) { width: 25%; }
      .fields-table th:nth-child(4),
      .fields-table td:nth-child(4) { width: auto; }

      .enum-values-table th:nth-child(1),
      .enum-values-table td:nth-child(1) { width: 35%; }
      .enum-values-table th:nth-child(2),
      .enum-values-table td:nth-child(2) { width: 60px; }
      .enum-values-table th:nth-child(3),
      .enum-values-table td:nth-child(3) { width: auto; }

      th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
        hyphens: auto;
      }

      th {
        background: var(--bg-tertiary);
        font-weight: 600;
        color: var(--text-secondary);
      }

      tr:hover {
        background: var(--bg-tertiary);
      }

      tr.deprecated {
        opacity: 0.6;
      }

      tr.deprecated td {
        text-decoration: line-through;
        text-decoration-color: var(--text-muted);
      }

      tr.deprecated .field-desc,
      tr.deprecated .enum-value-desc {
        text-decoration: none;
      }

      .field-number, .enum-value-number {
        color: var(--number);
        font-family: 'SFMono-Regular', Consolas, monospace;
      }

      .field-name, .enum-value-name {
        font-weight: 500;
        overflow-wrap: break-word;
        word-break: break-all;
      }

      .field-type {
        overflow-wrap: break-word;
        word-break: break-all;
      }

      .field-type code, .rpc-signature code {
        color: var(--type);
        background: var(--bg-tertiary);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        display: inline-block;
        max-width: 100%;
        overflow-wrap: break-word;
        word-break: break-all;
      }

      .modifier {
        color: var(--keyword);
        font-size: 11px;
      }

      .field-options {
        display: inline-block;
        font-size: 11px;
        color: var(--text-muted);
        margin-left: 8px;
      }

      .no-doc {
        color: var(--text-muted);
        font-style: italic;
      }

      .no-fields, .no-values, .no-rpcs {
        color: var(--text-muted);
        font-style: italic;
        padding: 8px 0;
      }

      .rpc-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .rpc {
        padding: 12px;
        background: var(--bg-tertiary);
        border-radius: 4px;
      }

      .rpc.deprecated {
        opacity: 0.6;
      }

      .rpc-signature {
        font-family: 'SFMono-Regular', Consolas, monospace;
        font-size: 13px;
        overflow-wrap: break-word;
        word-break: break-word;
      }

      .rpc-name {
        color: var(--accent-secondary);
        font-weight: 600;
      }

      .returns {
        color: var(--keyword);
      }

      .imports-list {
        list-style: none;
      }

      .imports-list li {
        padding: 4px 0;
      }

      .imports-list code {
        color: var(--string);
        background: var(--bg-secondary);
        padding: 4px 8px;
        border-radius: 4px;
      }

      .nested-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px dashed var(--border);
      }

      .file-comments {
        margin-bottom: 24px;
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 6px;
        border-left: 4px solid var(--accent);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 60vh;
        text-align: center;
        color: var(--text-secondary);
      }

      .empty-state h2 {
        margin-bottom: 12px;
        color: var(--text-muted);
      }

      .empty-state code {
        color: var(--accent);
        background: var(--bg-secondary);
        padding: 2px 6px;
        border-radius: 3px;
      }

      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      }
    `;
  }

  private renderExportHtml(data: DocumentationData): string {
    // Generate a standalone HTML file with print-friendly styles
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proto Documentation - ${this.escapeHtml(data.fileName)}</title>
  <style>
    ${this.getExportStyles()}
  </style>
</head>
<body>
  <header>
    <h1>${this.escapeHtml(data.fileName)}</h1>
    <div class="meta">
      ${data.syntax ? `<span class="badge">syntax: ${data.syntax}</span>` : ''}
      ${data.edition ? `<span class="badge">edition: ${data.edition}</span>` : ''}
      ${data.package ? `<span class="badge">package: ${data.package}</span>` : ''}
    </div>
    <p class="generated">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
  </header>

  <nav class="toc">
    <h2>Table of Contents</h2>
    <ul>
      ${data.messages.length > 0 ? `<li><a href="#messages">Messages (${data.messages.length})</a></li>` : ''}
      ${data.enums.length > 0 ? `<li><a href="#enums">Enums (${data.enums.length})</a></li>` : ''}
      ${data.services.length > 0 ? `<li><a href="#services">Services (${data.services.length})</a></li>` : ''}
      ${data.imports.length > 0 ? `<li><a href="#imports">Imports (${data.imports.length})</a></li>` : ''}
    </ul>
  </nav>

  <main>
    ${data.fileComments ? `<section class="file-comments"><p>${this.formatComment(data.fileComments)}</p></section>` : ''}
    ${data.messages.length > 0 ? this.renderExportMessagesSection(data.messages) : ''}
    ${data.enums.length > 0 ? this.renderExportEnumsSection(data.enums) : ''}
    ${data.services.length > 0 ? this.renderExportServicesSection(data.services) : ''}
    ${data.imports.length > 0 ? this.renderExportImportsSection(data.imports) : ''}
  </main>

  <footer>
    <p>Protocol Buffer Documentation - ${this.escapeHtml(data.fileName)}</p>
  </footer>
</body>
</html>`;
  }

  private renderExportMessagesSection(messages: DocumentationElement[]): string {
    return /* html */ `
    <section id="messages">
      <h2>Messages</h2>
      ${messages.map(msg => this.renderExportMessage(msg)).join('')}
    </section>`;
  }

  private renderExportMessage(msg: DocumentationElement, depth: number = 0): string {
    const deprecatedClass = msg.deprecated ? 'deprecated' : '';
    const indent = depth > 0 ? 'nested' : '';

    return /* html */ `
    <article class="definition ${deprecatedClass} ${indent}">
      <h3>
        ${msg.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
        <span class="keyword">message</span> ${this.escapeHtml(msg.name)}
      </h3>
      ${msg.comments ? `<div class="doc-comment">${this.formatComment(msg.comments)}</div>` : ''}

      ${
        msg.fields && msg.fields.length > 0
          ? `
        <h4>Fields</h4>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${msg.fields.map(f => this.renderExportFieldRow(f)).join('')}
          </tbody>
        </table>
      `
          : '<p class="no-content">No fields</p>'
      }

      ${
        msg.nestedEnums && msg.nestedEnums.length > 0
          ? `
        <div class="nested-section">
          <h4>Nested Enums</h4>
          ${msg.nestedEnums.map(e => this.renderExportEnum(e, depth + 1)).join('')}
        </div>
      `
          : ''
      }

      ${
        msg.nestedMessages && msg.nestedMessages.length > 0
          ? `
        <div class="nested-section">
          <h4>Nested Messages</h4>
          ${msg.nestedMessages.map(m => this.renderExportMessage(m, depth + 1)).join('')}
        </div>
      `
          : ''
      }
    </article>`;
  }

  private renderExportFieldRow(field: DocumentationField): string {
    const deprecatedClass = field.deprecated ? 'deprecated' : '';
    const modifier = field.modifier ? `<span class="modifier">${field.modifier}</span> ` : '';

    return /* html */ `
    <tr class="${deprecatedClass}">
      <td>${field.number}</td>
      <td>${modifier}${this.escapeHtml(field.name)}</td>
      <td><code>${this.escapeHtml(field.type)}</code></td>
      <td>${field.comments ? this.formatComment(field.comments) : '-'}</td>
    </tr>`;
  }

  private renderExportEnumsSection(enums: DocumentationElement[]): string {
    return /* html */ `
    <section id="enums">
      <h2>Enums</h2>
      ${enums.map(e => this.renderExportEnum(e)).join('')}
    </section>`;
  }

  private renderExportEnum(enumDef: DocumentationElement, depth: number = 0): string {
    const deprecatedClass = enumDef.deprecated ? 'deprecated' : '';
    const indent = depth > 0 ? 'nested' : '';

    return /* html */ `
    <article class="definition ${deprecatedClass} ${indent}">
      <h3>
        ${enumDef.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
        <span class="keyword">enum</span> ${this.escapeHtml(enumDef.name)}
      </h3>
      ${enumDef.comments ? `<div class="doc-comment">${this.formatComment(enumDef.comments)}</div>` : ''}

      ${
        enumDef.values && enumDef.values.length > 0
          ? `
        <table>
          <thead>
            <tr>
              <th>Value</th>
              <th>Number</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${enumDef.values
              .map(
                v => `
              <tr class="${v.deprecated ? 'deprecated' : ''}">
                <td>${this.escapeHtml(v.name)}</td>
                <td>${v.number}</td>
                <td>${v.comments ? this.formatComment(v.comments) : '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
          : '<p class="no-content">No values</p>'
      }
    </article>`;
  }

  private renderExportServicesSection(services: DocumentationElement[]): string {
    return /* html */ `
    <section id="services">
      <h2>Services</h2>
      ${services.map(s => this.renderExportService(s)).join('')}
    </section>`;
  }

  private renderExportService(service: DocumentationElement): string {
    const deprecatedClass = service.deprecated ? 'deprecated' : '';

    return /* html */ `
    <article class="definition ${deprecatedClass}">
      <h3>
        ${service.deprecated ? '<span class="deprecated-badge">DEPRECATED</span>' : ''}
        <span class="keyword">service</span> ${this.escapeHtml(service.name)}
      </h3>
      ${service.comments ? `<div class="doc-comment">${this.formatComment(service.comments)}</div>` : ''}

      ${
        service.rpcs && service.rpcs.length > 0
          ? `
        <h4>Methods</h4>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Request</th>
              <th>Response</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${service.rpcs
              .map(
                r => `
              <tr class="${r.deprecated ? 'deprecated' : ''}">
                <td>${this.escapeHtml(r.name)}</td>
                <td>${r.requestStreaming ? 'stream ' : ''}<code>${this.escapeHtml(r.requestType)}</code></td>
                <td>${r.responseStreaming ? 'stream ' : ''}<code>${this.escapeHtml(r.responseType)}</code></td>
                <td>${r.comments ? this.formatComment(r.comments) : '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
          : '<p class="no-content">No methods</p>'
      }
    </article>`;
  }

  private renderExportImportsSection(imports: string[]): string {
    return /* html */ `
    <section id="imports">
      <h2>Imports</h2>
      <ul class="imports-list">
        ${imports.map(imp => `<li><code>${this.escapeHtml(imp)}</code></li>`).join('')}
      </ul>
    </section>`;
  }

  private getExportStyles(): string {
    return /* css */ `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #333;
        background: #fff;
        padding: 40px;
        max-width: 1000px;
        margin: 0 auto;
      }

      header {
        margin-bottom: 32px;
        padding-bottom: 16px;
        border-bottom: 2px solid #333;
      }

      header h1 {
        font-size: 2em;
        font-weight: 700;
        margin-bottom: 8px;
        color: #1a1a1a;
      }

      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        background: #f0f0f0;
        color: #555;
        border: 1px solid #ddd;
      }

      .generated {
        font-size: 12px;
        color: #888;
        margin-top: 8px;
      }

      nav.toc {
        background: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 20px;
        margin-bottom: 32px;
      }

      nav.toc h2 {
        font-size: 1.1em;
        margin-bottom: 12px;
        color: #555;
      }

      nav.toc ul {
        list-style: none;
        padding-left: 0;
      }

      nav.toc li {
        margin: 6px 0;
      }

      nav.toc a {
        color: #0066cc;
        text-decoration: none;
      }

      nav.toc a:hover {
        text-decoration: underline;
      }

      main section {
        margin-bottom: 40px;
        page-break-inside: avoid;
      }

      section > h2 {
        font-size: 1.5em;
        font-weight: 600;
        margin-bottom: 20px;
        padding-bottom: 8px;
        border-bottom: 2px solid #0066cc;
        color: #0066cc;
      }

      article.definition {
        background: #fafafa;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 20px;
        margin-bottom: 20px;
        page-break-inside: avoid;
      }

      article.definition.nested {
        background: #f5f5f5;
        margin-left: 20px;
        border-left: 3px solid #ccc;
      }

      article.definition.deprecated {
        opacity: 0.7;
        border-left: 3px solid #cc9900;
      }

      article h3 {
        font-size: 1.2em;
        margin-bottom: 12px;
        color: #1a1a1a;
      }

      article h4 {
        font-size: 1em;
        margin: 16px 0 8px;
        color: #555;
      }

      .keyword {
        color: #9c27b0;
        font-weight: 600;
      }

      .modifier {
        color: #9c27b0;
        font-size: 11px;
      }

      .doc-comment {
        margin: 12px 0;
        padding: 12px 16px;
        background: #fff;
        border-radius: 4px;
        border-left: 3px solid #0066cc;
        color: #555;
        font-style: italic;
      }

      .deprecated-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: #cc9900;
        color: #fff;
        margin-right: 8px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
        font-size: 13px;
      }

      th, td {
        padding: 10px 12px;
        text-align: left;
        border: 1px solid #ddd;
        overflow-wrap: break-word;
        word-break: break-word;
      }

      th {
        background: #f0f0f0;
        font-weight: 600;
        color: #333;
      }

      tr:nth-child(even) {
        background: #fafafa;
      }

      tr.deprecated td {
        text-decoration: line-through;
        color: #888;
      }

      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        background: #f0f0f0;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        color: #0066cc;
      }

      .imports-list {
        list-style: none;
        padding: 0;
      }

      .imports-list li {
        padding: 8px 0;
        border-bottom: 1px solid #eee;
      }

      .imports-list li:last-child {
        border-bottom: none;
      }

      .no-content {
        color: #888;
        font-style: italic;
        padding: 8px 0;
      }

      .nested-section {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px dashed #ddd;
      }

      .file-comments {
        margin-bottom: 32px;
        padding: 20px;
        background: #f8f8f8;
        border-radius: 6px;
        border-left: 4px solid #0066cc;
      }

      footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #ddd;
        text-align: center;
        color: #888;
        font-size: 12px;
      }

      @media print {
        body {
          padding: 20px;
          font-size: 12px;
        }

        header, nav.toc, article.definition {
          page-break-inside: avoid;
        }

        section {
          page-break-before: auto;
        }

        a {
          color: #333;
          text-decoration: none;
        }

        .badge {
          border: 1px solid #999;
        }
      }
    `;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
