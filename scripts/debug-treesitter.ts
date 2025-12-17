import * as fs from 'fs';
import * as path from 'path';
import { initTreeSitterParser, getTreeSitterParser } from '../src/server/core/treeSitterParser';

async function test() {
  const wasmPath = path.join(process.cwd(), 'tree-sitter-proto/tree-sitter-proto.wasm');
  await initTreeSitterParser(wasmPath);

  const parser = getTreeSitterParser();
  if (!parser) {
    console.error('Failed to get parser');
    return;
  }

  const content = fs.readFileSync('examples/regressions/textmate-grammar/grpc_gateway_style.proto', 'utf-8');

  const tree = parser.parse(content);

  console.log('=== Raw Tree-sitter CST ===');
  const root = tree.rootNode;

  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child?.type === 'option') {
      console.log('Option node:');
      console.log('  Text:', child.text.slice(0, 300) + '...');
      console.log('  Children:');
      for (let j = 0; j < child.childCount; j++) {
        const subchild = child.child(j);
        const txt = subchild?.text || '';
        console.log(\`    [\${j}] type=\${subchild?.type}, text="\${txt.slice(0, 100)}\${txt.length > 100 ? '...' : ''}"\`);
      }
      break;
    }
  }
}

test().catch(console.error);
