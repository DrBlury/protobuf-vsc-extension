import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { SchemaGraph, SchemaGraphRequest, SchemaGraphScope } from '../../shared/schemaGraph';

/**
 * Webview panel that renders the protobuf schema graph with enhanced features:
 * - Export to PNG, SVG, PDF
 * - Search and filter nodes
 * - Path highlighting between nodes
 * - Layout options (horizontal, vertical, compact)
 * - Package grouping
 * - Double-click navigation
 * - Context menu
 * - Orphan node detection
 */
export class SchemaGraphPanel {
  private static currentPanel: SchemaGraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly client: LanguageClient;
  private currentScope: SchemaGraphScope;
  private sourceUri?: string;
  private initialized = false;

  static createOrShow(
    extensionUri: vscode.Uri,
    client: LanguageClient,
    options: SchemaGraphRequest
  ): void {
    const scope = options.scope || 'workspace';

    if (SchemaGraphPanel.currentPanel) {
      SchemaGraphPanel.currentPanel.reveal(options.uri, scope);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'protobufSchemaGraph',
      'Protobuf Schema Graph',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    SchemaGraphPanel.currentPanel = new SchemaGraphPanel(panel, extensionUri, client, options.uri, scope);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    client: LanguageClient,
    sourceUri: string | undefined,
    scope: SchemaGraphScope
  ) {
    this.panel = panel;
    this.client = client;
    this.sourceUri = sourceUri;
    this.currentScope = scope;

    this.panel.onDidDispose(() => {
      SchemaGraphPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async message => {
      if (message?.type === 'refresh') {
        const scopeChanged = message.scope && message.scope !== this.currentScope;
        this.currentScope = message.scope || this.currentScope;
        if (typeof message.uri === 'string') {
          this.sourceUri = message.uri;
        }
        await this.loadGraph(scopeChanged);
      } else if (message?.type === 'export') {
        await this.handleExport(message.format, message.data);
      } else if (message?.type === 'navigate') {
        await this.handleNavigate(message.file, message.symbolName);
      }
    });

    void this.loadGraph(true);
  }

  private reveal(uri: string | undefined, scope: SchemaGraphScope): void {
    this.panel.reveal();
    this.sourceUri = uri || this.sourceUri;
    this.currentScope = scope;
    void this.loadGraph(!this.initialized);
  }

  private async loadGraph(initial: boolean): Promise<void> {
    try {
      const graph = await this.client.sendRequest<SchemaGraph>('protobuf/getSchemaGraph', {
        uri: this.sourceUri,
        scope: this.currentScope
      });

      if (!this.initialized || initial) {
        this.panel.webview.html = this.renderHtml(graph);
        this.initialized = true;
      } else {
        void this.panel.webview.postMessage({ type: 'graph-data', payload: graph });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void this.panel.webview.postMessage({ type: 'graph-error', message });
      void vscode.window.showErrorMessage(`Failed to load protobuf schema graph: ${message}`);
    }
  }

  private async handleExport(format: 'svg' | 'png' | 'pdf', data: string): Promise<void> {
    const filterNames: Record<string, string> = {
      svg: 'SVG Files',
      png: 'PNG Files',
      pdf: 'PDF Files'
    };
    const extensions: Record<string, string[]> = {
      svg: ['svg'],
      png: ['png'],
      pdf: ['pdf']
    };

    const filterName: string = filterNames[format] || 'Files';
    const filterExtensions: string[] = extensions[format] || [format];
    const saveFilters: { [key: string]: string[] } = {};
    saveFilters[filterName] = filterExtensions;

    const uri = await vscode.window.showSaveDialog({
      filters: saveFilters,
      defaultUri: vscode.Uri.file(`schema-graph.${format}`)
    });

    if (!uri) {return;}

    try {
      const buffer = Buffer.from(data, format === 'svg' ? 'utf8' : 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      void vscode.window.showInformationMessage(`Schema graph exported to ${uri.fsPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to export: ${msg}`);
    }
  }

  private async handleNavigate(file: string, symbolName: string): Promise<void> {
    if (!file) {return;}

    try {
      const doc = await vscode.workspace.openTextDocument(file);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });

      const text = doc.getText();
      const regex = new RegExp(`(message|enum)\\s+${symbolName}\\s*\\{`);
      const match = regex.exec(text);

      if (match) {
        const pos = doc.positionAt(match.index);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to navigate: ${msg}`);
    }
  }

  private renderHtml(graph: SchemaGraph): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src ${webview.cspSource} https://fonts.gstatic.com`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`
    ].join('; ');

    const initialData = JSON.stringify(graph);

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Protobuf Schema Graph</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600&display=swap');
      :root {
        --bg-1: #0c1021;
        --bg-2: #0f172a;
        --panel: #0d1324;
        --border: #1e293b;
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #7dd3fc;
        --accent-2: #fbbf24;
        --surface: rgba(255, 255, 255, 0.08);
        --row-odd: rgba(255, 255, 255, 0.10);
        --row-even: rgba(255, 255, 255, 0.07);
      }

      body {
        margin: 0;
        padding: 0;
        font-family: 'Sora', 'Segoe UI', sans-serif;
        color: var(--text);
        background: linear-gradient(135deg, var(--bg-1), var(--bg-2));
        height: 100vh;
        display: flex;
        flex-direction: column;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(120deg, rgba(56, 189, 248, 0.08), rgba(245, 158, 11, 0.08));
        backdrop-filter: blur(8px);
      }

      .title {
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0.2px;
      }

      .controls {
        display: inline-flex;
        gap: 8px;
        align-items: center;
      }

      select, button {
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 120ms ease, transform 120ms ease;
      }

      button:hover, select:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
      }

      button.refresh { background: linear-gradient(120deg, rgba(125, 211, 252, 0.18), rgba(251, 191, 36, 0.18)); }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--border);
        background: rgba(13, 19, 36, 0.5);
      }

      .toolbar-group {
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .toolbar-group label {
        font-size: 11px;
        color: var(--muted);
        margin-right: 4px;
      }

      #search-box {
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        width: 180px;
      }

      #search-box:focus {
        outline: none;
        border-color: var(--accent);
      }

      .toggle-btn {
        min-width: 70px;
      }

      .toggle-btn.active {
        background: rgba(125, 211, 252, 0.25);
        border-color: var(--accent);
      }

      .export-btn { background: rgba(34, 197, 94, 0.15); }
      .export-btn:hover { border-color: #22c55e; }

      .node-dimmed { opacity: 0.25; }
      .node-highlighted { opacity: 1; }
      .node-search-match .node-box { stroke: var(--accent) !important; stroke-width: 2.5px !important; }

      .node-path-source .node-box { stroke: #22c55e !important; stroke-width: 3px !important; }
      .node-path-target .node-box { stroke: #ef4444 !important; stroke-width: 3px !important; }
      .node-path-intermediate .node-box { stroke: #f97316 !important; stroke-width: 2.5px !important; }

      .edge-path-highlight { stroke: #f97316 !important; stroke-width: 2.5px !important; }

      .node-orphan .node-box {
        stroke: #f97316 !important;
        stroke-width: 2px !important;
        stroke-dasharray: 5 3 !important;
      }

      .package-group rect.package-bg {
        fill: rgba(125, 211, 252, 0.05);
        stroke: rgba(125, 211, 252, 0.2);
        stroke-dasharray: 4 2;
        rx: 8;
        ry: 8;
      }

      .package-group text.package-label {
        fill: var(--muted);
        font-size: 11px;
        font-weight: 600;
      }

      #context-menu {
        position: fixed;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 0;
        min-width: 160px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 1000;
        display: none;
      }

      #context-menu.visible { display: block; }

      .context-menu-item {
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
        color: var(--text);
      }

      .context-menu-item:hover {
        background: var(--surface);
      }

      .context-menu-divider {
        height: 1px;
        background: var(--border);
        margin: 4px 0;
      }

      #graph-container {
        position: relative;
        flex: 1;
      }

      #graph {
        width: 100%;
        height: 100%;
      }

      .legend {
        position: absolute;
        bottom: 12px;
        right: 12px;
        background: rgba(13, 19, 36, 0.9);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 12px;
        color: var(--muted);
        display: grid;
        gap: 6px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }

      .legend-row {
        display: grid;
        grid-template-columns: 16px 1fr;
        gap: 8px;
        align-items: center;
      }

      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 999px;
      }

      .message-swatch { background: var(--accent); }
      .enum-swatch { background: var(--accent-2); }

      #status {
        padding: 6px 16px 10px;
        font-size: 12px;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <header>
      <div class="title">Protobuf Schema Graph</div>
      <div class="controls">
        <select id="scope">
          <option value="workspace">Workspace</option>
          <option value="file">Current file + imports</option>
        </select>
        <button class="refresh" id="refresh">Refresh</button>
      </div>
    </header>
    <div class="toolbar">
      <div class="toolbar-group">
        <input type="text" id="search-box" placeholder="Search types... (Ctrl+F)" />
      </div>
      <div class="toolbar-group">
        <label>Package:</label>
        <select id="filter-package"><option value="">All</option></select>
      </div>
      <div class="toolbar-group">
        <label>File:</label>
        <select id="filter-file"><option value="">All</option></select>
      </div>
      <div class="toolbar-group">
        <label>Layout:</label>
        <select id="layout-select">
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
          <option value="compact">Compact</option>
        </select>
      </div>
      <div class="toolbar-group">
        <button id="toggle-enums" class="toggle-btn active">Enums</button>
        <button id="toggle-orphans" class="toggle-btn">Orphans</button>
        <button id="toggle-group" class="toggle-btn">Group</button>
      </div>
      <div class="toolbar-group">
        <button id="path-mode" class="toggle-btn">Path</button>
        <button id="clear-path">Clear</button>
      </div>
      <div class="toolbar-group">
        <button id="export-svg" class="export-btn">SVG</button>
        <button id="export-png" class="export-btn">PNG</button>
        <button id="export-pdf" class="export-btn">PDF</button>
      </div>
    </div>
    <div id="status"></div>
    <div id="graph-container">
      <svg id="graph"></svg>
      <div class="legend">
        <div class="legend-row"><span class="swatch message-swatch"></span><span>Message</span></div>
        <div class="legend-row"><span class="swatch enum-swatch"></span><span>Enum</span></div>
        <div class="legend-row"><span class="swatch" style="background:#22c55e"></span><span>Path Source</span></div>
        <div class="legend-row"><span class="swatch" style="background:#ef4444"></span><span>Path Target</span></div>
        <div class="legend-row"><span class="swatch" style="background:#f97316"></span><span>Path / Orphan</span></div>
      </div>
    </div>
    <div id="context-menu">
      <div class="context-menu-item" data-action="goto">Go to Definition</div>
      <div class="context-menu-item" data-action="copy-name">Copy Name</div>
      <div class="context-menu-item" data-action="copy-full">Copy Full Name</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="path-from">Find Paths From Here</div>
      <div class="context-menu-item" data-action="path-to">Find Paths To Here</div>
    </div>

    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/elkjs@0.9.0/lib/elk.bundled.js"></script>
    <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      let sourceUri = ${JSON.stringify(graph.sourceUri || '')};
      const scopeSelect = document.getElementById('scope');
      const refreshBtn = document.getElementById('refresh');
      const status = document.getElementById('status');
      let graphData = ${initialData};

      const searchBox = document.getElementById('search-box');
      const filterPackage = document.getElementById('filter-package');
      const filterFile = document.getElementById('filter-file');
      const layoutSelect = document.getElementById('layout-select');
      const toggleEnums = document.getElementById('toggle-enums');
      const toggleOrphans = document.getElementById('toggle-orphans');
      const toggleGroup = document.getElementById('toggle-group');
      const pathModeBtn = document.getElementById('path-mode');
      const clearPathBtn = document.getElementById('clear-path');
      const exportSvgBtn = document.getElementById('export-svg');
      const exportPngBtn = document.getElementById('export-png');
      const exportPdfBtn = document.getElementById('export-pdf');
      const contextMenu = document.getElementById('context-menu');

      let showEnums = true;
      let showOrphansOnly = false;
      let groupByPackage = false;
      let pathMode = false;
      let pathSource = null;
      let pathTarget = null;
      let pathNodes = new Set();
      let currentLayout = 'horizontal';
      let searchTerm = '';
      let selectedPackage = '';
      let selectedFile = '';
      let contextNode = null;

      if (typeof d3 === 'undefined') {
        setStatus('Failed to load d3 – check CSP or network.', true);
        throw new Error('d3 failed to load');
      }
      if (typeof ELK === 'undefined') {
        setStatus('Failed to load ELK – check CSP or network.', true);
        throw new Error('elk failed to load');
      }

      scopeSelect.value = graphData.scope || 'workspace';

      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh', scope: scopeSelect.value, uri: sourceUri });
      });

      let searchTimeout;
      searchBox.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchTerm = searchBox.value.toLowerCase();
          applyFiltersAndRender();
        }, 150);
      });

      filterPackage.addEventListener('change', () => {
        selectedPackage = filterPackage.value;
        applyFiltersAndRender();
      });

      filterFile.addEventListener('change', () => {
        selectedFile = filterFile.value;
        applyFiltersAndRender();
      });

      layoutSelect.addEventListener('change', () => {
        currentLayout = layoutSelect.value;
        applyFiltersAndRender();
      });

      toggleEnums.addEventListener('click', () => {
        showEnums = !showEnums;
        toggleEnums.classList.toggle('active', showEnums);
        applyFiltersAndRender();
      });

      toggleOrphans.addEventListener('click', () => {
        showOrphansOnly = !showOrphansOnly;
        toggleOrphans.classList.toggle('active', showOrphansOnly);
        applyFiltersAndRender();
      });

      toggleGroup.addEventListener('click', () => {
        groupByPackage = !groupByPackage;
        toggleGroup.classList.toggle('active', groupByPackage);
        applyFiltersAndRender();
      });

      pathModeBtn.addEventListener('click', () => {
        pathMode = !pathMode;
        pathModeBtn.classList.toggle('active', pathMode);
        if (!pathMode) {
          clearPath();
        }
        setStatus(pathMode ? 'Path mode: click source node, then target node' : 'Path mode disabled');
      });

      clearPathBtn.addEventListener('click', clearPath);

      function clearPath() {
        pathSource = null;
        pathTarget = null;
        pathNodes.clear();
        d3.selectAll('.node').classed('node-path-source node-path-target node-path-intermediate', false);
        d3.selectAll('path').classed('edge-path-highlight', false);
      }

      exportSvgBtn.addEventListener('click', () => exportGraph('svg'));
      exportPngBtn.addEventListener('click', () => exportGraph('png'));
      exportPdfBtn.addEventListener('click', () => exportGraph('pdf'));

      function exportGraph(format) {
        const svgEl = document.getElementById('graph');
        const svgClone = svgEl.cloneNode(true);
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        
        const styles = document.createElement('style');
        styles.textContent = \`
          .node-box { fill: #0d1628; stroke: rgba(226, 232, 240, 0.22); }
          .node-header { fill: rgba(125, 211, 252, 0.25); }
          text { font-family: 'Sora', sans-serif; fill: #e2e8f0; }
        \`;
        svgClone.insertBefore(styles, svgClone.firstChild);
        
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgClone);

        if (format === 'svg') {
          vscode.postMessage({ type: 'export', format: 'svg', data: svgString });
        } else if (format === 'png') {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          
          img.onload = () => {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.scale(2, 2);
            ctx.fillStyle = '#0c1021';
            ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const dataUrl = canvas.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            vscode.postMessage({ type: 'export', format: 'png', data: base64 });
          };
          img.src = url;
        } else if (format === 'pdf') {
          if (typeof jspdf === 'undefined') {
            setStatus('jsPDF not loaded', true);
            return;
          }
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          
          img.onload = () => {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.scale(2, 2);
            ctx.fillStyle = '#0c1021';
            ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            
            const { jsPDF } = jspdf;
            const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
            const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width / 2, canvas.height / 2] });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            vscode.postMessage({ type: 'export', format: 'pdf', data: pdfBase64 });
          };
          img.src = url;
        }
      }

      document.addEventListener('click', () => {
        contextMenu.classList.remove('visible');
      });

      contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action || !contextNode) return;

        if (action === 'goto') {
          vscode.postMessage({ type: 'navigate', file: contextNode.file, symbolName: contextNode.label });
        } else if (action === 'copy-name') {
          navigator.clipboard.writeText(contextNode.label);
        } else if (action === 'copy-full') {
          const fullName = contextNode.package ? contextNode.package + '.' + contextNode.label : contextNode.label;
          navigator.clipboard.writeText(fullName);
        } else if (action === 'path-from') {
          pathMode = true;
          pathModeBtn.classList.add('active');
          pathSource = contextNode.id;
          setStatus('Path mode: now click the target node');
        } else if (action === 'path-to') {
          if (pathSource) {
            pathTarget = contextNode.id;
            highlightPath();
          } else {
            pathMode = true;
            pathModeBtn.classList.add('active');
            pathTarget = contextNode.id;
            setStatus('Path mode: now click the source node');
          }
        }
        contextMenu.classList.remove('visible');
      });

      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          searchBox.focus();
        } else if (e.key === 'Escape') {
          searchBox.value = '';
          searchTerm = '';
          clearPath();
          applyFiltersAndRender();
        }
      });

      function populateFilters(data) {
        const packages = [...new Set((data.nodes || []).map(n => n.package).filter(Boolean))].sort();
        const files = [...new Set((data.nodes || []).map(n => {
          if (!n.file) return null;
          const parts = n.file.split(/[\\/]/);
          return parts[parts.length - 1];
        }).filter(Boolean))].sort();

        filterPackage.innerHTML = '<option value="">All Packages</option>' + 
          packages.map(p => '<option value="' + p + '">' + p + '</option>').join('');
        filterFile.innerHTML = '<option value="">All Files</option>' + 
          files.map(f => '<option value="' + f + '">' + f + '</option>').join('');
      }

      function getOrphanIds(nodes, edges) {
        const hasIncoming = new Set();
        edges.forEach(e => {
          if (e.kind !== 'nested') hasIncoming.add(e.to);
        });
        return new Set(nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id));
      }

      function bfs(start, end, adjacency) {
        if (start === end) return [start];
        const queue = [[start]];
        const visited = new Set([start]);
        
        while (queue.length > 0) {
          const path = queue.shift();
          const node = path[path.length - 1];
          
          for (const neighbor of (adjacency.get(node) || [])) {
            if (visited.has(neighbor)) continue;
            const newPath = [...path, neighbor];
            if (neighbor === end) return newPath;
            visited.add(neighbor);
            queue.push(newPath);
          }
        }
        return [];
      }

      function highlightPath() {
        if (!pathSource || !pathTarget) return;
        
        const adjacency = new Map();
        graphData.edges.forEach(e => {
          if (!adjacency.has(e.from)) adjacency.set(e.from, []);
          adjacency.get(e.from).push(e.to);
        });

        const path = bfs(pathSource, pathTarget, adjacency);
        
        if (path.length === 0) {
          setStatus('No path found between selected nodes');
          return;
        }

        pathNodes = new Set(path);
        
        d3.selectAll('.node').each(function(d) {
          const nodeId = d.id;
          const el = d3.select(this);
          el.classed('node-path-source', nodeId === pathSource);
          el.classed('node-path-target', nodeId === pathTarget);
          el.classed('node-path-intermediate', pathNodes.has(nodeId) && nodeId !== pathSource && nodeId !== pathTarget);
        });

        const pathEdges = new Set();
        for (let i = 0; i < path.length - 1; i++) {
          pathEdges.add(path[i] + '->' + path[i + 1]);
        }

        d3.selectAll('path').classed('edge-path-highlight', function(d) {
          return d && pathEdges.has(d.from + '->' + d.to);
        });

        setStatus('Path: ' + path.length + ' nodes');
      }

      function applyFiltersAndRender() {
        render(graphData);
      }

      window.addEventListener('message', event => {
        const { type, payload, message } = event.data || {};
        try {
          if (type === 'graph-data' && payload) {
            graphData = payload;
            scopeSelect.value = graphData.scope || 'workspace';
            sourceUri = payload.sourceUri || sourceUri;
            render(graphData);
            setStatus(graphData.nodes.length + ' nodes, ' + graphData.edges.length + ' links');
          }
          if (type === 'graph-error' && message) {
            setStatus(message, true);
          }
        } catch (err) {
          setStatus('Render error: ' + (err && err.message ? err.message : String(err)), true);
          // Error handling - could use vscode.window.showErrorMessage for user-facing errors
        }
      });

      function setStatus(text, isError = false) {
        status.textContent = text;
        status.style.color = isError ? '#f87171' : 'var(--muted)';
      }

      const svg = d3.select('#graph');
      const width = () => svg.node().clientWidth || 800;
      const height = () => svg.node().clientHeight || 600;

      const zoomLayer = svg.append('g');
      const linkGroup = zoomLayer.append('g').attr('stroke', 'rgba(148, 163, 184, 0.6)');
      const linkLabelGroup = zoomLayer.append('g').attr('font-size', 10).attr('fill', '#cbd5e1');
      const nodeGroup = zoomLayer.append('g');

      let zoomBehavior = d3.zoom().on('zoom', event => {
        zoomLayer.attr('transform', event.transform);
      });

      svg.call(zoomBehavior);

      const elk = new ELK();

      function buildNodeChild(n, rowHeight) {
        const ports = [];
        const fields = Array.isArray(n.fields) ? n.fields : [];
        fields.forEach((f, i) => {
          ports.push({
            id: n.id + ':field:' + i,
            x: n._w,
            y: 32 + i * rowHeight + rowHeight / 2,
            properties: { 'elk.port.side': 'E', fieldName: f.name, fieldIndex: String(i) }
          });
        });
        ports.push({
          id: n.id + ':in',
          x: 0,
          y: n._h / 2,
          properties: { 'elk.port.side': 'W' }
        });
        return {
          id: n.id,
          width: n._w,
          height: n._h,
          ports,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS' }
        };
      }

      function buildGroupedChildren(nodes, rowHeight) {
        const groups = new Map();
        nodes.forEach(n => {
          const pkg = n.package || '(default)';
          if (!groups.has(pkg)) groups.set(pkg, []);
          groups.get(pkg).push(n);
        });

        return Array.from(groups.entries()).map(([pkg, pkgNodes]) => ({
          id: 'pkg:' + pkg,
          layoutOptions: {
            'elk.padding': '[top=30,left=10,bottom=10,right=10]'
          },
          labels: [{ text: pkg }],
          children: pkgNodes.map(n => buildNodeChild(n, rowHeight))
        }));
      }

      async function render(data) {
        populateFilters(data);
        
        const orphanIds = getOrphanIds(data.nodes || [], data.edges || []);
        
        let filteredNodes = (data.nodes || [])
          .filter(n => n && n.id)
          .filter(n => showEnums || n.kind !== 'enum')
          .filter(n => !selectedPackage || n.package === selectedPackage)
          .filter(n => {
            if (!selectedFile) return true;
            if (!n.file) return false;
            const parts = n.file.split(/[\\/]/);
            return parts[parts.length - 1] === selectedFile;
          })
          .filter(n => !showOrphansOnly || orphanIds.has(n.id));

        const nodes = filteredNodes.map(n => ({ ...n, _w: 0, _h: 0, _isOrphan: orphanIds.has(n.id) }));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        const nodeIds = new Set(nodes.map(n => n.id));

        const links = (data.edges || [])
          .filter(e => e && e.from && e.to)
          .map(e => ({ ...e, source: e.from, target: e.to }))
          .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

        if (!nodes.length) {
          setStatus('No schema nodes found for this scope.', true);
        } else {
          setStatus(nodes.length + ' nodes, ' + links.length + ' links');
        }

        const rowHeight = 18;
        const fieldIndex = new Map();

        nodes.forEach(n => {
          const lines = [n.label];
          if (Array.isArray(n.fields)) {
            const map = new Map();
            for (const [i, f] of n.fields.entries()) {
              const typeText = f.repeated ? (f.type + '[]') : f.type;
              const flags = [];
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' · ' + flags.join(', ') : '';
              lines.push(f.name + ' · ' + typeText + suffix);
              map.set(f.name, i);
              const tail = f.name.split('.').pop();
              if (tail) map.set(tail, i);
            }
            fieldIndex.set(n.id, map);
          }
          const longest = lines.reduce((m, line) => Math.max(m, line.length), 10);
          const width = Math.min(Math.max(longest * 7 + 36, 200), 360);
          const fieldRows = n.fields ? n.fields.length : 0;
          const height = 38 + fieldRows * rowHeight + 14;
          n._w = width;
          n._h = height;
        });

        const layoutDirection = currentLayout === 'vertical' ? 'DOWN' : 'RIGHT';
        const layoutAlgorithm = currentLayout === 'compact' ? 'box' : 'layered';

        const elkGraph = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': layoutAlgorithm,
            'elk.direction': layoutDirection,
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.spacing.nodeNodeBetweenLayers': '80',
            'elk.spacing.nodeNode': '40',
            'elk.spacing.edgeEdge': '18',
            'elk.portConstraints': 'FIXED_POS',
            'elk.hierarchyHandling': groupByPackage ? 'INCLUDE_CHILDREN' : 'SEPARATE_CHILDREN'
          },
          children: groupByPackage ? buildGroupedChildren(nodes, rowHeight) : nodes.map(n => buildNodeChild(n, rowHeight)),
          edges: links.map((e, idx) => {
            const srcMap = fieldIndex.get(e.from);
            const srcIdx = srcMap && (srcMap.get(e.label) ?? srcMap.get((e.label || '').split('.').pop()));
            const sourcePort = srcIdx != null ? (e.from + ':field:' + srcIdx) : (e.from + ':in');
            const targetPort = e.to + ':in';
            return {
              id: e.label + '-' + idx,
              sources: [sourcePort],
              targets: [targetPort],
              from: e.from,
              to: e.to,
              label: e.label,
              kind: e.kind,
              repeated: e.repeated,
              optional: e.optional
            };
          })
        };

        let layout;
        try {
          layout = await elk.layout(elkGraph);
        } catch (err) {
          // ELK layout failed - could use vscode.window.showErrorMessage for user-facing errors
          setStatus('Layout failed: ' + (err?.message || err), true);
          return;
        }

        // Prepare lookup tables for positioned nodes/ports
        const nodePos = new Map();
        const portPos = new Map();
        const geometry = new Map();
        (layout.children || []).forEach(child => {
          nodePos.set(child.id, child);
          const original = nodeMap.get(child.id);
          const width = child.width || original?._w || 0;
          const height = child.height || original?._h || 0;
          const cx = (child.x || 0) + width / 2;
          const cy = (child.y || 0) + height / 2;
          geometry.set(child.id, {
            x: cx,
            y: cy,
            w: width,
            h: height,
            fields: original?.fields || []
          });
          (child.ports || []).forEach(p => {
            portPos.set(child.id + ':' + p.id.split(':').slice(1).join(':'), {
              x: (child.x || 0) + (p.x || 0),
              y: (child.y || 0) + (p.y || 0)
            });
          });
        });

        const simulation = d3.forceSimulation(nodes)
          .force('charge', d3.forceManyBody().strength(-220))
          .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(0.45))
          .force('center', d3.forceCenter(width() / 2, height() / 2))
          .force('collision', d3.forceCollide().radius(d => Math.max(d._w, d._h) / 2 + 18));

        const link = linkGroup.selectAll('path').data(layout.edges || [], d => d.id);
        link.exit().remove();
        const linkEnter = link.enter().append('path')
          .attr('fill', 'none')
          .attr('stroke-width', 1.15)
          .attr('stroke-dasharray', d => d.kind === 'nested' ? '3 3' : '')
          .attr('stroke-linecap', 'round');
        const linkMerged = linkEnter.merge(link);

        const linkLabels = linkLabelGroup.selectAll('text').data(layout.edges || [], d => d.id);
        linkLabels.exit().remove();
        const linkLabelEnter = linkLabels.enter().append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', -4)
          .attr('fill', '#cbd5e1')
          .attr('font-size', 10)
          .attr('opacity', 0.9)
          .text(d => decorateFlags(d));
        const linkLabelMerged = linkLabelEnter.merge(linkLabels);

        const node = nodeGroup.selectAll('g').data(layout.children || [], d => d.id);
        node.exit().remove();
        const nodeEnter = node.enter().append('g').attr('class', 'node')
          .on('dblclick', function(event, d) {
            const original = nodeMap.get(d.id);
            if (original && original.file) {
              vscode.postMessage({ type: 'navigate', file: original.file, symbolName: original.label });
            }
          })
          .on('contextmenu', function(event, d) {
            event.preventDefault();
            const original = nodeMap.get(d.id);
            if (original) {
              contextNode = original;
              contextMenu.style.left = event.clientX + 'px';
              contextMenu.style.top = event.clientY + 'px';
              contextMenu.classList.add('visible');
            }
          })
          .on('click', function(event, d) {
            if (!pathMode) return;
            if (!pathSource) {
              pathSource = d.id;
              d3.select(this).classed('node-path-source', true);
              setStatus('Path mode: now click the target node');
            } else if (!pathTarget) {
              pathTarget = d.id;
              d3.select(this).classed('node-path-target', true);
              highlightPath();
            }
          });

        nodeEnter.append('rect')
          .attr('class', 'node-box')
          .attr('rx', 6)
          .attr('ry', 6)
          .attr('stroke', 'rgba(226, 232, 240, 0.22)')
          .attr('stroke-width', 1.1)
          .attr('fill', '#0d1628')
          .attr('filter', 'drop-shadow(0 10px 25px rgba(0,0,0,0.35))');

        nodeEnter.append('rect')
          .attr('class', 'node-header')
          .attr('rx', 6)
          .attr('ry', 6);

        nodeEnter.append('text')
          .attr('class', 'node-title')
          .attr('text-anchor', 'start')
          .attr('font-size', 12)
          .attr('font-weight', 600)
          .attr('fill', '#e2e8f0');

        nodeEnter.append('text')
          .attr('class', 'node-package')
          .attr('text-anchor', 'start')
          .attr('font-size', 10)
          .attr('fill', '#cbd5e1');

        nodeEnter.append('g').attr('class', 'fields');

        const nodeMerged = nodeEnter.merge(node);

        nodeMerged.each(function(d) {
          const original = nodeMap.get(d.id);
          const el = d3.select(this);
          const isOrphan = original && original._isOrphan;
          const matchesSearch = searchTerm && original && original.label.toLowerCase().includes(searchTerm);
          const dimmed = searchTerm && !matchesSearch;
          
          el.classed('node-orphan', isOrphan);
          el.classed('node-search-match', matchesSearch);
          el.classed('node-dimmed', dimmed);
          el.classed('node-highlighted', !dimmed);
        });

        nodeMerged.select('rect')
          .attr('width', d => d.width)
          .attr('height', d => d.height)
          .attr('x', d => -d.width / 2)
          .attr('y', d => -d.height / 2)
          .attr('fill', d => {
            const original = nodeMap.get(d.id);
            return original?.kind === 'enum' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(125, 211, 252, 0.09)';
          });

        nodeMerged.select('.node-header')
          .attr('width', d => d.width)
          .attr('height', 28)
          .attr('x', d => -d.width / 2)
          .attr('y', d => -d.height / 2)
          .attr('fill', d => {
            const original = nodeMap.get(d.id);
            return original?.kind === 'enum' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(125, 211, 252, 0.25)';
          });

        nodeMerged.select('.node-title')
          .attr('x', d => -d.width / 2 + 10)
          .attr('y', d => -d.height / 2 + 17)
          .text(d => nodeMap.get(d.id)?.label || d.id);

        nodeMerged.select('.node-package')
          .attr('x', d => -d.width / 2 + 10)
          .attr('y', d => -d.height / 2 + 28)
          .text(d => nodeMap.get(d.id)?.package || '');

        nodeMerged.select('.fields').each(function(nodeDatum) {
          const original = nodeMap.get(nodeDatum.id) || { fields: [] };
          const group = d3.select(this);
          const rows = group.selectAll('g.field-row').data(original.fields || []);
          rows.exit().remove();

          const rowsEnter = rows.enter().append('g').attr('class', 'field-row');
          rowsEnter.append('rect').attr('class', 'field-bg');
          rowsEnter.append('text').attr('class', 'field-name').attr('font-weight', 500);
          rowsEnter.append('text').attr('class', 'field-type').attr('text-anchor', 'end');

          const merged = rowsEnter.merge(rows);

          merged.select('.field-bg')
            .attr('x', -nodeDatum.width / 2)
            .attr('y', (_d, i) => -nodeDatum.height / 2 + 32 + i * rowHeight)
            .attr('width', nodeDatum.width)
            .attr('height', rowHeight)
            .attr('fill', (_d, i) => i % 2 === 0 ? 'var(--row-odd)' : 'var(--row-even)');

          merged.select('.field-name')
            .attr('x', -nodeDatum.width / 2 + 12)
            .attr('y', (_d, i) => -nodeDatum.height / 2 + 32 + i * rowHeight + 12)
            .attr('font-size', 12)
            .attr('fill', '#e7ecf4')
            .text(f => {
              const flags = [];
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' · ' + flags.join(', ') : '';
              return f.name + suffix;
            });

          merged.select('.field-type')
            .attr('x', nodeDatum.width / 2 - 12)
            .attr('y', (_d, i) => -nodeDatum.height / 2 + 32 + i * rowHeight + 12)
            .attr('font-size', 11)
            .attr('fill', '#cfd6e4')
            .text(f => f.repeated ? (f.type + '[]') : f.type);
        });

        function fieldAnchor(nodeId, edgeLabel, isSource) {
          const geom = geometry.get(nodeId);
          const original = nodeMap.get(nodeId);
          if (!geom || !original) {
            return { x: geom?.x || 0, y: geom?.y || 0 };
          }
          const fields = Array.isArray(original.fields) ? original.fields : [];
          const labelTail = (edgeLabel || '').split('.').pop() || edgeLabel;
          const map = fieldIndex.get(nodeId);
          const matchIdx = map && map.has(edgeLabel)
            ? map.get(edgeLabel)
            : map && map.has(labelTail)
              ? map.get(labelTail)
              : fields.findIndex(f => f.name === edgeLabel || edgeLabel.endsWith('.' + f.name) || labelTail === f.name.split('.').pop());

          const yBase = matchIdx != null && matchIdx >= 0
            ? (geom.y - geom.h / 2 + 32 + matchIdx * rowHeight + rowHeight / 2)
            : geom.y;
          const x = geom.x + (isSource ? geom.w / 2 : -geom.w / 2);
          return { x, y: yBase };
        }

        function edgePoints(edge) {
          const sourceId = (edge.sources && edge.sources[0]) || (edge.from ? edge.from + ':in' : '');
          const targetId = (edge.targets && edge.targets[0]) || (edge.to ? edge.to + ':in' : '');
          const start = (sourceId && portPos.get(sourceId)) || fieldAnchor(edge.from || edge.source || '', edge.label || '', true);
          const end = (targetId && portPos.get(targetId)) || fieldAnchor(edge.to || edge.target || '', edge.label || '', false);
          if (!start || !end) return [];
          const midX = (start.x + end.x) / 2;
          return [
            start,
            { x: midX, y: start.y },
            { x: midX, y: end.y },
            end
          ];
        }

        linkMerged.attr('d', d => {
          const customPoints = edgePoints(d);
          const points = customPoints.length
            ? customPoints
            : (d.sections && d.sections.length
              ? [d.sections[0].startPoint, ...(d.sections[0].bendPoints || []), d.sections[0].endPoint]
              : []);
          if (!points.length) return '';
          return points.reduce((path, p, i) => path + (i === 0 ? 'M' : ' L') + p.x + ' ' + p.y, '');
        });

        linkLabelMerged
          .attr('x', d => {
            const pts = edgePoints(d);
            if (!pts.length && (!d.sections || !d.sections.length)) return 0;
            const points = pts.length ? pts : [d.sections[0].startPoint, ...(d.sections[0].bendPoints || []), d.sections[0].endPoint];
            const mid = Math.floor(points.length / 2);
            const a = points[mid - 1] || points[0];
            const b = points[mid] || points[points.length - 1];
            return (a.x + b.x) / 2;
          })
          .attr('y', d => {
            const pts = edgePoints(d);
            if (!pts.length && (!d.sections || !d.sections.length)) return 0;
            const points = pts.length ? pts : [d.sections[0].startPoint, ...(d.sections[0].bendPoints || []), d.sections[0].endPoint];
            const mid = Math.floor(points.length / 2);
            const a = points[mid - 1] || points[0];
            const b = points[mid] || points[points.length - 1];
            return (a.y + b.y) / 2 - 4;
          })
          .text(d => decorateFlags(d))
          .attr('opacity', d => decorateFlags(d) ? 0.9 : 0);

        nodeMerged.attr('transform', d => {
          const cx = (d.x || 0) + d.width / 2;
          const cy = (d.y || 0) + d.height / 2;
          return 'translate(' + cx + ',' + cy + ')';
        });

        // Fit viewBox to content
        const xs = (layout.children || []).map(n => (n.x || 0)).concat((layout.children || []).map(n => (n.x || 0) + n.width));
        const ys = (layout.children || []).map(n => (n.y || 0)).concat((layout.children || []).map(n => (n.y || 0) + n.height));
        if (xs.length && ys.length) {
          const minX = Math.min(...xs) - 40;
          const maxX = Math.max(...xs) + 40;
          const minY = Math.min(...ys) - 40;
          const maxY = Math.max(...ys) + 40;
          svg.attr('viewBox', [minX, minY, (maxX - minX), (maxY - minY)].join(' '));
        }
      }

      function decorateFlags(edge) {
        const flags = [];
        if (edge.kind === 'map') flags.push('map');
        if (edge.optional) flags.push('optional');
        return flags.join(' · ');
      }

      render(graphData);
      setStatus(graphData.nodes.length + ' nodes, ' + graphData.edges.length + ' links');
    </script>
  </body>
</html>`;
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
