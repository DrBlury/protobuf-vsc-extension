/**
 * Runs the real Tree-sitter grammar over string literals that contain comment
 * markers (issue #208).
 *
 * Needs the WASM from `npm run build:tree-sitter`. Without an up-to-date build
 * the suite is skipped, unless REQUIRE_TREE_SITTER is set (as in CI), where a
 * missing build fails instead of silently leaving the default parser untested.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Language } from 'web-tree-sitter';
import { TreeSitterProtoParser, initTreeSitterParser } from '../treeSitterParser';

jest.unmock('web-tree-sitter');

const grammarDir = path.resolve(__dirname, '../../../../tree-sitter-proto');
const wasmPath = path.join(grammarDir, 'tree-sitter-proto.wasm');
const required = Boolean(process.env.REQUIRE_TREE_SITTER);
const hasWasm = fs.existsSync(wasmPath);

if (!hasWasm && required) {
  throw new Error(`Tree-sitter WASM not found at ${wasmPath}. Build it with: npm run build:tree-sitter`);
}

// A WASM older than the generated parser was built from another grammar, so
// its failures would say nothing about the current sources.
const isStale =
  hasWasm && !required && fs.statSync(wasmPath).mtimeMs < fs.statSync(path.join(grammarDir, 'src/parser.c')).mtimeMs;

if (isStale) {
  console.warn(`Skipping: ${wasmPath} is older than the grammar. Rebuild it with: npm run build:tree-sitter`);
}

const describeWithWasm = hasWasm && !isStale ? describe : describe.skip;

describeWithWasm('Tree-sitter string literals containing comment markers (issue #208)', () => {
  let parser: TreeSitterProtoParser;

  beforeAll(async () => {
    // Supplying actual WASM bytes avoids the module's dynamic fs import,
    // which otherwise requires experimental VM modules inside Jest.
    const loadLanguage = Language.load.bind(Language);
    const load = jest
      .spyOn(Language, 'load')
      .mockImplementationOnce(input => loadLanguage(typeof input === 'string' ? fs.readFileSync(input) : input));
    try {
      await initTreeSitterParser(wasmPath);
    } finally {
      load.mockRestore();
    }
    parser = new TreeSitterProtoParser();
  });

  it.each([
    ['a double slash', '"some//description"', 'some//description'],
    ['a URL', '"https://example.com/path"', 'https://example.com/path'],
    ['a block comment marker', '"a /* not a comment */ b"', 'a /* not a comment */ b'],
    ['a double slash in single quotes', "'it//is'", 'it//is'],
  ])('keeps %s inside an option string', (_label, literal, value) => {
    const text = `syntax = "proto3";
message Foo {
  string foo = 1 [(annotation) = ${literal}];
  string bar = 2;
}`;

    const file = parser.parse(text, 'file:///issue208.proto');
    const fields = file.messages[0]?.fields ?? [];

    expect(file.syntaxErrors ?? []).toEqual([]);
    expect(fields.map(field => `${field.name}=${field.number}`)).toEqual(['foo=1', 'bar=2']);
    expect(fields[0]?.options?.map(option => [option.name, option.value])).toEqual([['(annotation)', value]]);
  });

  it('still treats a marker after the string as a comment', () => {
    const text = `syntax = "proto3";
option go_package = "example.com/a//b";
message Foo {
  string url = 1 [(annotation) = "https://example.com"]; // string bar = 2;
  string baz = 3; /* string qux = 4; */
}`;

    const file = parser.parse(text, 'file:///issue208.proto');

    expect(file.syntaxErrors ?? []).toEqual([]);
    expect(file.messages[0]?.fields.map(field => `${field.name}=${field.number}`)).toEqual(['url=1', 'baz=3']);
  });

  it('keeps a comment marker after an escaped quote inside the string', () => {
    const text = `syntax = "proto3";
message Foo {
  string quote = 1 [(annotation) = "say \\"hi\\" // still a string"];
  string bar = 2;
}`;

    const file = parser.parse(text, 'file:///issue208.proto');

    expect(file.syntaxErrors ?? []).toEqual([]);
    expect(file.messages[0]?.fields.map(field => `${field.name}=${field.number}`)).toEqual(['quote=1', 'bar=2']);
  });
});
