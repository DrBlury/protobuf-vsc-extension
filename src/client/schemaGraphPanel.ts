import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SchemaGraph, SchemaGraphRequest, SchemaGraphScope } from '../shared/schemaGraph';

/**
 * Webview panel that renders the protobuf schema graph.
 */
export class SchemaGraphPanel {
  private static currentPanel: SchemaGraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
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
    extensionUri: vscode.Uri,
    client: LanguageClient,
    sourceUri: string | undefined,
    scope: SchemaGraphScope
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.client = client;
    this.sourceUri = sourceUri;
    this.currentScope = scope;

    this.panel.onDidDispose(() => {
      SchemaGraphPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async message => {
      if (message?.type === 'refresh') {
        this.currentScope = message.scope || this.currentScope;
        if (typeof message.uri === 'string') {
          this.sourceUri = message.uri;
        }
        await this.loadGraph(false);
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

  private renderHtml(graph: SchemaGraph): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https:`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src ${webview.cspSource} https://fonts.gstatic.com`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`
    ].join('; ');

    const initialData = JSON.stringify(graph);
    const initialUri = graph.sourceUri || '';

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Protobuf Schema Graph</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap');
      :root {
        --bg-1: #0f172a;
        --bg-2: #111827;
        --panel: #0b1220;
        --border: #1f2937;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --accent: #38bdf8;
        --accent-2: #f59e0b;
        --surface: rgba(255, 255, 255, 0.04);
      }

      body {
        margin: 0;
        padding: 0;
        font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
        color: var(--text);
        background: radial-gradient(circle at 20% 20%, #0b3b5a 0%, transparent 25%),
                    radial-gradient(circle at 80% 0%, #2d1b69 0%, transparent 20%),
                    linear-gradient(135deg, var(--bg-1), var(--bg-2));
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

      button.refresh {
        background: linear-gradient(120deg, rgba(56, 189, 248, 0.12), rgba(245, 158, 11, 0.12));
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
        background: rgba(12, 20, 34, 0.85);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 12px;
        color: var(--muted);
        display: grid;
        gap: 6px;
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
    <div id="status"></div>
    <div id="graph-container">
      <svg id="graph"></svg>
      <div class="legend">
        <div class="legend-row"><span class="swatch message-swatch"></span><span>Message</span></div>
        <div class="legend-row"><span class="swatch enum-swatch"></span><span>Enum</span></div>
      </div>
    </div>

    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      let sourceUri = ${JSON.stringify(graph.sourceUri || '')};
      const scopeSelect = document.getElementById('scope');
      const refreshBtn = document.getElementById('refresh');
      const status = document.getElementById('status');
      let graphData = ${initialData};

      if (typeof d3 === 'undefined') {
        setStatus('Failed to load d3 – check CSP or network.', true);
        throw new Error('d3 failed to load');
      }

      scopeSelect.value = graphData.scope || 'workspace';

      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh', scope: scopeSelect.value, uri: sourceUri });
      });

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
          console.error(err);
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

      function render(data) {
        const nodes = (data.nodes || [])
          .filter(n => n && n.id)
          .map(n => ({ ...n, _w: 0, _h: 0 }));

        const nodeIds = new Set(nodes.map(n => n.id));

        const links = (data.edges || [])
          .filter(e => e && e.from && e.to)
          // Normalize link objects so forceLink always has source/target ids
          .map(e => ({ ...e, source: e.from, target: e.to }))
          .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

        if (!nodes.length) {
          setStatus('No schema nodes found for this scope.', true);
        } else {
          setStatus(nodes.length + ' nodes, ' + links.length + ' links');
        }

        nodes.forEach(n => {
          const lines = [n.label];
          if (Array.isArray(n.fields)) {
            for (const f of n.fields) {
              const flags = [];
              if (f.repeated) flags.push('repeated');
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' [' + flags.join(', ') + ']' : '';
              lines.push(f.name + ': ' + f.type + suffix);
            }
          }
          const longest = lines.reduce((m, line) => Math.max(m, line.length), 8);
          const width = Math.min(Math.max(longest * 7 + 28, 160), 320);
          const fieldRows = n.fields ? n.fields.length : 0;
          const height = 32 + fieldRows * 16 + 12;
          n._w = width;
          n._h = height;
        });

        const simulation = d3.forceSimulation(nodes)
          .force('charge', d3.forceManyBody().strength(-220))
          .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(0.45))
          .force('center', d3.forceCenter(width() / 2, height() / 2))
          .force('collision', d3.forceCollide().radius(d => Math.max(d._w, d._h) / 2 + 18));

        const link = linkGroup.selectAll('line').data(links, d => d.from + '-' + d.to + '-' + d.label);
        link.exit().remove();
        const linkEnter = link.enter().append('line').attr('stroke-width', 1.1).attr('stroke-dasharray', d => d.kind === 'nested' ? '3 3' : '');
        const linkMerged = linkEnter.merge(link);

        const linkLabels = linkLabelGroup.selectAll('text').data(links, d => d.from + '-' + d.to + '-' + d.label);
        linkLabels.exit().remove();
        const linkLabelEnter = linkLabels.enter().append('text').attr('text-anchor', 'middle').attr('dy', -4).text(d => decorateLabel(d));
        const linkLabelMerged = linkLabelEnter.merge(linkLabels);

        const node = nodeGroup.selectAll('g').data(nodes, d => d.id);
        node.exit().remove();
        const nodeEnter = node.enter().append('g').attr('class', 'node').call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

        nodeEnter.append('rect')
          .attr('class', 'node-box')
          .attr('rx', 8)
          .attr('ry', 8)
          .attr('stroke', 'rgba(15, 23, 42, 0.9)')
          .attr('stroke-width', 1.25);

        nodeEnter.append('text')
          .attr('class', 'node-title')
          .attr('text-anchor', 'start')
          .attr('font-size', 12)
          .attr('font-weight', 600)
          .attr('fill', '#0b1220');

        nodeEnter.append('g').attr('class', 'fields');

        const nodeMerged = nodeEnter.merge(node);

        nodeMerged.select('rect')
          .attr('width', d => d._w)
          .attr('height', d => d._h)
          .attr('x', d => -d._w / 2)
          .attr('y', d => -d._h / 2)
          .attr('fill', d => d.kind === 'enum' ? 'rgba(245, 158, 11, 0.22)' : 'rgba(56, 189, 248, 0.18)');

        nodeMerged.select('.node-title')
          .attr('x', d => -d._w / 2 + 10)
          .attr('y', d => -d._h / 2 + 16)
          .text(d => d.label + (d.package ? ' · ' + d.package : ''));

        nodeMerged.select('.fields').each(function(nodeDatum) {
          const group = d3.select(this);
          const rows = group.selectAll('text').data(nodeDatum.fields || []);
          rows.exit().remove();
          const rowsEnter = rows.enter().append('text')
            .attr('text-anchor', 'start')
            .attr('font-size', 11)
            .attr('fill', '#e5e7eb');

          rowsEnter.merge(rows)
            .attr('x', -nodeDatum._w / 2 + 10)
            .attr('y', (_d, i) => -nodeDatum._h / 2 + 32 + i * 16)
            .text(f => {
              const flags = [];
              if (f.repeated) flags.push('repeated');
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' [' + flags.join(', ') + ']' : '';
              return f.name + ': ' + f.type + suffix;
            });
        });

        simulation.on('tick', () => {
          linkMerged
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

          linkLabelMerged
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);

          nodeMerged.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
        });

        simulation.on('end', () => {
          // Auto-zoom to fit contents after layout settles
          const xs = nodes.map(n => n.x || 0);
          const ys = nodes.map(n => n.y || 0);
          if (!xs.length || !ys.length) {
            return;
          }
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const padding = 60;
          const w = width();
          const h = height();
          const bboxWidth = Math.max(1, maxX - minX + padding * 2);
          const bboxHeight = Math.max(1, maxY - minY + padding * 2);
          const scale = Math.min(w / bboxWidth, h / bboxHeight, 2);
          const tx = w / 2 - (minX + maxX) / 2 * scale;
          const ty = h / 2 - (minY + maxY) / 2 * scale;
          const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
          svg.transition().duration(300).call(zoomBehavior.transform, transform);
        });

        function dragstarted(event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        }

        function dragged(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        }

        function dragended(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }
      }

      function decorateLabel(edge) {
        const flags = [];
        if (edge.repeated) flags.push('repeated');
        if (edge.optional) flags.push('optional');
        if (edge.kind === 'map') flags.push('map');
        if (edge.kind === 'nested') return 'nested';
        return flags.length ? edge.label + ' [' + flags.join(', ') + ']' : edge.label;
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
