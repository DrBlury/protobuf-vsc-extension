#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const protoWasmSource = path.join(root, 'out', 'tree-sitter', 'tree-sitter-proto.wasm');
const protoWasmTarget = path.join(distDir, 'tree-sitter', 'tree-sitter-proto.wasm');
const webTreeSitterWasmSource = path.join(root, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
const webTreeSitterWasmTarget = path.join(distDir, 'server', 'web-tree-sitter.wasm');
const webviewAssets = [
  ['d3', 'dist', 'd3.min.js'],
  ['elkjs', 'lib', 'elk.bundled.js'],
  ['jspdf', 'dist', 'jspdf.umd.min.js'],
];

const sharedOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  sourcesContent: false,
  legalComments: 'none',
  logLevel: 'info',
};

async function bundle() {
  await fs.promises.rm(distDir, { recursive: true, force: true });

  await esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    outfile: path.join(distDir, 'extension.js'),
    external: ['vscode', 'web-tree-sitter'],
  });

  await esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(root, 'src', 'server', 'server.ts')],
    outfile: path.join(distDir, 'server', 'server.js'),
  });

  await fs.promises.mkdir(path.dirname(protoWasmTarget), { recursive: true });
  await fs.promises.copyFile(protoWasmSource, protoWasmTarget);
  await fs.promises.copyFile(webTreeSitterWasmSource, webTreeSitterWasmTarget);

  const webviewDir = path.join(distDir, 'webview');
  await fs.promises.mkdir(webviewDir, { recursive: true });
  await Promise.all(
    webviewAssets.map(async segments => {
      const source = path.join(root, 'node_modules', ...segments);
      const target = path.join(webviewDir, segments[segments.length - 1]);
      await fs.promises.copyFile(source, target);
    })
  );
}

bundle().catch(error => {
  console.error(error);
  process.exit(1);
});
