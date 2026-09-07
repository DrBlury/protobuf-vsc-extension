import * as fs from 'fs';
import * as path from 'path';
import { Language } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProtoParser } from '../parser';
import { SemanticAnalyzer } from '../analyzer';

import type { IProtoParser } from '../parserFactory';
import { TreeSitterProtoParser, initTreeSitterParser } from '../treeSitterParser';

jest.unmock('web-tree-sitter');

const wasmPath = path.resolve(__dirname, '../../../../tree-sitter-proto/tree-sitter-proto.wasm');
let parser: IProtoParser = new ProtoParser();
const parserModes = fs.existsSync(wasmPath) ? ['legacy', 'tree-sitter'] : ['legacy'];

const uri = 'file:///symbols.proto';

describe.each(parserModes)('resolved symbol locations (%s)', mode => {
  beforeAll(async () => {
    if (mode === 'tree-sitter') {
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
    } else {
      parser = new ProtoParser();
    }
  });
  it.each([
    ['Value', 'message Value { string name = 1; }'],
    ['Status', 'enum Status { UNKNOWN = 0; }'],
    ['Inner', 'message Outer { message Inner { string name = 1; } }'],
    ['State', 'message Outer { enum State { UNKNOWN = 0; } }'],
    ['Result', 'message Outer { optional group Result = 1 { optional string name = 2; } }'],
  ])('returns only the identifier for %s', (name, declaration) => {
    const text = `syntax = "proto2";\n${declaration}`;
    const analyzer = new SemanticAnalyzer();
    analyzer.updateFile(uri, parser.parse(text, uri));
    const symbol = analyzer.resolveType(name, uri, 'Outer');
    expect(symbol).toBeDefined();
    const document = TextDocument.create(uri, 'proto', 1, text);
    expect(document.getText(symbol!.location.range)).toBe(name);
  });

  it('resolves absolute root types without a package', () => {
    const text = 'syntax = "proto3"; message Value {} message Holder { .Value value = 1; }';
    const analyzer = new SemanticAnalyzer();
    analyzer.updateFile(uri, parser.parse(text, uri));
    expect(analyzer.resolveType('.Value', uri, 'Holder')?.fullName).toBe('Value');
    expect(analyzer.findReferences('Value', 'Value')).toHaveLength(1);
  });
});
