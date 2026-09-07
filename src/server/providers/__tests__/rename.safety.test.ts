import * as fs from 'fs';
import * as path from 'path';
import { Language } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProtoParser } from '../../core/parser';
import { SemanticAnalyzer } from '../../core/analyzer';
import { RenameProvider } from '../rename';

import type { IProtoParser } from '../../core/parserFactory';
import { TreeSitterProtoParser, initTreeSitterParser } from '../../core/treeSitterParser';

jest.unmock('web-tree-sitter');

const wasmPath = path.resolve(__dirname, '../../../../tree-sitter-proto/tree-sitter-proto.wasm');
let parser: IProtoParser = new ProtoParser();
const parserModes = fs.existsSync(wasmPath) ? ['legacy', 'tree-sitter'] : ['legacy'];

const uri = 'file:///rename.proto';

function setup(text: string) {
  const analyzer = new SemanticAnalyzer();
  analyzer.updateFile(uri, parser.parse(text, uri));
  const provider = new RenameProvider(analyzer);
  const document = TextDocument.create(uri, 'proto', 1, text);
  const at = (needle: string, within = 0) => document.positionAt(text.indexOf(needle) + within);
  const rename = (needle: string, newName: string, within = 0) => {
    const position = at(needle, within);
    const edits = provider.rename(uri, position, text.split('\n')[position.line]!, newName);
    return TextDocument.applyEdits(document, edits.changes.get(uri) || []);
  };
  return { analyzer, provider, document, at, rename };
}

describe.each(parserModes)('rename preserves unrelated source (%s)', mode => {
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
  it('renames only the selected field when other messages use the same field name', () => {
    const text = `syntax = "proto3";
message First { string name = 1; }
message Second { string name = 1; }
message Third {
  message Nested { string name = 1; }
}`;
    const { rename } = setup(text);
    expect(rename('Second { string name', 'display_name', 'Second { string '.length)).toBe(
      text.replace('Second { string name', 'Second { string display_name')
    );
  });

  it('renames a field instead of an identically named message type', () => {
    const text = `syntax = "proto3";
message Value {}
message Holder { Value Value = 1; }`;
    const { rename } = setup(text);
    expect(rename('Value =', 'value')).toBe(text.replace('Value =', 'value ='));
  });

  it('prepares and renames a map name without changing another map', () => {
    const text = `syntax = "proto3";
message First { map<string, string> labels = 1; }
message Second { map<string, string> labels = 1; }`;
    const { rename, provider, at } = setup(text);
    const position = at('labels');
    expect(provider.prepareRename(uri, position, text.split('\n')[position.line]!)).toMatchObject({
      placeholder: 'labels',
    });
    expect(rename('labels', 'tags')).toBe(text.replace('labels', 'tags'));
  });

  it('preserves a message body and package prefixes when renaming from an absolute reference', () => {
    const text = `syntax = "proto3";
package example;
message Value { string name = 1; }
message Holder {
  .example.Value first = 1;
  example.Value second = 2;
  Value third = 3;
}`;
    const { rename } = setup(text);
    expect(rename('.example.Value', 'Result', '.example.'.length)).toBe(text.replace(/\bValue\b/g, 'Result'));
  });

  it('renames a relative nested type in fields, maps, oneofs, and RPC signatures', () => {
    const text = `syntax = "proto3";
package example;
message Outer { message Inner {} }
message Holder {
  Outer.Inner value = 1;
  map<string, Outer.Inner> values = 2;
  oneof choice { Outer.Inner selected = 3; }
}
service API { rpc Get(Outer.Inner) returns (.example.Outer.Inner); }`;
    const { rename } = setup(text);
    expect(rename('Inner {}', 'Nested')).toBe(text.replace(/\bInner\b/g, 'Nested'));
  });

  it('updates enclosing type identifiers without changing implicit nested references', () => {
    const text = `syntax = "proto3";
package example;
message Outer {
  message Inner {}
  Inner local = 1;
}
message Holder {
  Outer.Inner value = 1;
  .example.Outer.Inner absolute = 2;
}`;
    const { rename } = setup(text);
    expect(rename('Outer.Inner value', 'Container')).toBe(text.replace(/\bOuter\b/g, 'Container'));
  });

  it.each(['// Value name', 'option java_package = "Value name";'])(
    'does not offer a rename from unrelated text: %s',
    unrelated => {
      const text = `syntax = "proto3";\n${unrelated}\nmessage Value { string name = 1; }`;
      const { provider, rename, at } = setup(text);
      for (const word of ['Value', 'name']) {
        const position = at(word);
        expect(provider.prepareRename(uri, position, text.split('\n')[position.line]!)).toBeNull();
        expect(rename(word, 'Renamed')).toBe(text);
      }
    }
  );

  it('renames only the selected RPC among identically named methods', () => {
    const text = `syntax = "proto3";
message Request {}
service First { rpc Get(Request) returns (Request); }
service Second { rpc Get(Request) returns (Request); }`;
    const { rename } = setup(text);
    expect(rename('Get(Request)', 'Fetch')).toBe(text.replace('Get(Request)', 'Fetch(Request)'));
  });
});
