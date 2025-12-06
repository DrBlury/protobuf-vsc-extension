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
        const scopeChanged = message.scope && message.scope !== this.currentScope;
        this.currentScope = message.scope || this.currentScope;
        if (typeof message.uri === 'string') {
          this.sourceUri = message.uri;
        }
        // Force full re-render when scope changes to ensure fields are properly displayed
        await this.loadGraph(scopeChanged);
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
    <div id="status"></div>
    <div id="graph-container">
      <svg id="graph"></svg>
      <div class="legend">
        <div class="legend-row"><span class="swatch message-swatch"></span><span>Message</span></div>
        <div class="legend-row"><span class="swatch enum-swatch"></span><span>Enum</span></div>
      </div>
    </div>

    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/elkjs@0.9.0/lib/elk.bundled.js"></script>
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
      if (typeof ELK === 'undefined') {
        setStatus('Failed to load ELK – check CSP or network.', true);
        throw new Error('elk failed to load');
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

      const elk = new ELK();

      async function render(data) {
        const nodes = (data.nodes || [])
          .filter(n => n && n.id)
          .map(n => ({ ...n, _w: 0, _h: 0 }));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

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

        const rowHeight = 18;
        const fieldIndex = new Map();

        nodes.forEach(n => {
          const lines = [n.label];
          if (Array.isArray(n.fields)) {
            const map = new Map();
            for (const [i, f] of n.fields.entries()) {
              const flags = [];
              if (f.repeated) flags.push('repeated');
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' · ' + flags.join(', ') : '';
              lines.push(f.name + ' · ' + f.type + suffix);
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

        const elkGraph = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.spacing.nodeNodeBetweenLayers': '80',
            'elk.spacing.nodeNode': '40',
            'elk.spacing.edgeEdge': '18',
            'elk.portConstraints': 'FIXED_POS'
          },
          children: nodes.map(n => {
            const ports = [];
            const fields = Array.isArray(n.fields) ? n.fields : [];
            fields.forEach((f, i) => {
              ports.push({
                id: n.id + ':field:' + i,
                x: n._w,
                y: 32 + i * rowHeight + rowHeight / 2,
                properties: {
                  'elk.port.side': 'E',
                  fieldName: f.name,
                  fieldIndex: String(i)
                }
              });
            });
            // default inbound port on the left
            ports.push({
              id: n.id + ':in',
              x: 0,
              y: n._h / 2,
              properties: { 'elk.port.side': 'W' }
            });
            return { id: n.id, width: n._w, height: n._h, ports };
          }),
          edges: links.map((e, idx) => {
            const srcMap = fieldIndex.get(e.from);
            const srcIdx = srcMap && (srcMap.get(e.label) ?? srcMap.get((e.label || '').split('.').pop()));
            const sourcePort = srcIdx != null ? (e.from + ':field:' + srcIdx) : (e.from + ':in');
            const targetPort = e.to + ':in';
            return {
              id: e.label + '-' + idx,
              sources: [sourcePort],
              targets: [targetPort]
            };
          })
        };

        let layout;
        try {
          layout = await elk.layout(elkGraph);
        } catch (err) {
          console.error('ELK layout failed', err);
          setStatus('Layout failed: ' + (err?.message || err), true);
          return;
        }

        // Prepare lookup tables for positioned nodes/ports
        const nodePos = new Map();
        const portPos = new Map();
        (layout.children || []).forEach(child => {
          nodePos.set(child.id, child);
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
        const nodeEnter = node.enter().append('g').attr('class', 'node');

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
              if (f.repeated) flags.push('repeated');
              if (f.optional) flags.push('optional');
              const suffix = flags.length ? ' · ' + flags.join(', ') : '';
              return f.name + suffix;
            });

          merged.select('.field-type')
            .attr('x', nodeDatum.width / 2 - 12)
            .attr('y', (_d, i) => -nodeDatum.height / 2 + 32 + i * rowHeight + 12)
            .attr('font-size', 11)
            .attr('fill', '#cfd6e4')
            .text(f => f.type);
        });

        function fieldAnchor(node, edgeLabel, isSource) {
          if (!node || !node._w || !node._h) {
            return { x: node?.x || 0, y: node?.y || 0 };
          }
          const fields = Array.isArray(node.fields) ? node.fields : [];
          const labelTail = edgeLabel.split('.').pop() || edgeLabel;
          const map = fieldIndex.get(node.id);
          const matchIdx = map && map.has(edgeLabel)
            ? map.get(edgeLabel)
            : map && map.has(labelTail)
              ? map.get(labelTail)
              : fields.findIndex(f => f.name === edgeLabel || edgeLabel.endsWith('.' + f.name) || labelTail === f.name.split('.').pop());
          if (matchIdx === -1) {
            return { x: node.x || 0, y: node.y || 0 };
          }
          const baseY = (node.y || 0) - node._h / 2 + 32 + matchIdx * rowHeight + rowHeight / 2;
          const x = (node.x || 0) + (isSource ? -node._w / 2 : node._w / 2);
          return { x, y: baseY };
        }

        linkMerged.attr('d', d => {
          if (!d.sections || !d.sections.length) return '';
          const sec = d.sections[0];
          const points = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
          return points.reduce((path, p, i) => path + (i === 0 ? 'M' : ' L') + p.x + ' ' + p.y, '');
        });

        linkLabelMerged
          .attr('x', d => {
            if (!d.sections || !d.sections.length) return 0;
            const sec = d.sections[0];
            const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
            const mid = Math.floor(pts.length / 2);
            const a = pts[mid - 1] || pts[0];
            const b = pts[mid] || pts[pts.length - 1];
            return (a.x + b.x) / 2;
          })
          .attr('y', d => {
            if (!d.sections || !d.sections.length) return 0;
            const sec = d.sections[0];
            const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
            const mid = Math.floor(pts.length / 2);
            const a = pts[mid - 1] || pts[0];
            const b = pts[mid] || pts[pts.length - 1];
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
        if (edge.repeated) flags.push('repeated');
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
