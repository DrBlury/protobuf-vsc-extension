import * as fs from 'fs';
import * as path from 'path';
import { Language } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProtoParser } from '../../core/parser';
import { RenumberProvider } from '../renumber';

import type { IProtoParser } from '../../core/parserFactory';
import { TreeSitterProtoParser, initTreeSitterParser } from '../../core/treeSitterParser';

jest.unmock('web-tree-sitter');

const wasmPath = path.resolve(__dirname, '../../../../tree-sitter-proto/tree-sitter-proto.wasm');
let parser: IProtoParser = new ProtoParser();
const parserModes = fs.existsSync(wasmPath) ? ['legacy', 'tree-sitter'] : ['legacy'];

const uri = 'file:///renumber.proto';

function setup(text: string) {
  const provider = new RenumberProvider(parser);
  const document = TextDocument.create(uri, 'proto', 1, text);
  const renumber = () => TextDocument.applyEdits(document, provider.renumberDocument(text, uri));
  return { provider, document, renumber };
}

describe.each(parserModes)('renumber source preservation and reserved tags (%s)', mode => {
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
  it('renumbers each inline field and enum value without overlapping edits', () => {
    const text = `syntax = "proto3";
message Test { string first = 7; int32 second = 9; }
enum State { UNKNOWN = 0; FIRST = 5; SECOND = -8; }`;
    const { renumber } = setup(text);
    expect(renumber()).toBe(`syntax = "proto3";
message Test { string first = 1; int32 second = 2; }
enum State { UNKNOWN = 0; FIRST = 1; SECOND = 2; }`);
  });

  it('renumbers multiline declarations and integer literals while preserving comments and options', () => {
    const text = `syntax = "proto2";
message Test {
  optional string first /* = 99 */ =
    0x10 [default = "= 16"];
  optional int32 second
    = /* tag 77 */ 010;
}
enum State { UNKNOWN = 0; FIRST =
  -0x10; }`;
    const { renumber } = setup(text);
    expect(renumber()).toBe(
      text.replace('0x10 [', '1 [').replace('/* tag 77 */ 010', '/* tag 77 */ 2').replace('-0x10;', '1;')
    );
  });

  it('renumbers from the selected inline field without changing earlier fields', () => {
    const text = 'message Test { string first = 7; int32 second = 20; bool third = 30; }';
    const { provider, document } = setup(text);
    const position = document.positionAt(text.indexOf('second'));
    expect(TextDocument.applyEdits(document, provider.renumberFromField(text, uri, position))).toBe(
      text.replace('second = 20', 'second = 8').replace('third = 30', 'third = 9')
    );
  });

  it('skips the full reserved interval rather than truncating it to 10,000 tags', () => {
    const text = 'message Test { reserved 1 to 50000; string first = 60000; string second = 60001; }';
    const { renumber } = setup(text);
    expect(renumber()).toBe(text.replace('first = 60000', 'first = 50001').replace('second = 60001', 'second = 50002'));
  });

  it('respects overlapping explicit and internal reserved intervals', () => {
    const text = 'message Test { reserved 20000 to 20005; string first = 30000; }';
    const { provider, renumber } = setup(text);
    provider.updateSettings({ startNumber: 19000 });
    expect(renumber()).toBe(text.replace('first = 30000', 'first = 20006'));
  });

  it('preserves explicit reserved tags independently of the internal range setting', () => {
    const text = 'message Test { reserved 1 to 3; string first = 10; }';
    const { provider, renumber } = setup(text);
    provider.updateSettings({ skipReservedRange: false, preserveReserved: true });
    expect(renumber()).toBe(text.replace('first = 10', 'first = 4'));
  });

  it('checks reserved tags when suggesting the first tag in an empty message', () => {
    const text = 'message Test { reserved 1 to 4; }';
    const { provider } = setup(text);
    expect(provider.getNextFieldNumber(text, uri, 'Test')).toBe(5);
  });

  it('does not produce an invalid edit when reservations exhaust the tag space', () => {
    const text = 'message Test { reserved 1 to max; string first = 5; }';
    const { renumber, provider } = setup(text);
    expect(renumber).toThrow('No available field number');
    expect(() => provider.getNextFieldNumber(text, uri, 'Test')).toThrow('No available field number');
  });
});
